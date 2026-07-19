"""Load, save, merge, and finalise the human-review file."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .models import ReviewCandidate, ReviewFile

_REVIEW_FILENAME = "architecture.review.yaml"

# Map connection type → C4 relationship type
_CONN_TO_REL: dict[str, str] = {
    "http":     "calls",
    "grpc":     "calls",
    "database": "uses",
    "kafka":    "publishes",
    "queue":    "publishes",
}

# Infer node kind from connection type
_CONN_TO_KIND: dict[str, str] = {
    "database": "system",
    "kafka":    "system",
    "queue":    "system",
    "http":     "system",
    "grpc":     "system",
}


def default_review_path(output_dir: Path) -> Path:
    return output_dir / _REVIEW_FILENAME


def load_review(path: Path) -> ReviewFile:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return ReviewFile.model_validate(data)


def save_review(review: ReviewFile, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = review.model_dump(mode="json")
    path.write_text(
        yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def merge_candidates(
    existing: ReviewFile,
    new_candidates: list[ReviewCandidate],
) -> ReviewFile:
    """Add newly-proposed candidates while preserving human decisions on existing ones."""
    decided: set[tuple[str, str, str]] = {
        (c.source, c.target, c.type)
        for c in existing.candidates
        if c.status != "pending"
    }
    merged = list(existing.candidates)
    # new_candidates arrive pre-numbered cand_1..cand_N, which collides with
    # existing's own cand_1..cand_M once concatenated — renumber only the
    # ones actually being appended so existing candidates (and any human
    # decisions or external references keyed by their id) stay stable.
    next_id = len(merged) + 1
    for cand in new_candidates:
        key = (cand.source, cand.target, cand.type)
        if key not in decided and not any(
            c.source == cand.source and c.target == cand.target and c.type == cand.type
            for c in merged
        ):
            cand.id = f"cand_{next_id}"
            next_id += 1
            merged.append(cand)
    existing.candidates = merged
    return existing


def build_diagram_from_review(review: ReviewFile) -> dict[str, Any]:
    """Build an architecture.arch.json from accepted candidates only."""
    accepted = [c for c in review.candidates if c.status == "accepted"]

    # Collect unique node names (source repos + resolved targets)
    node_names: dict[str, dict[str, Any]] = {}

    for cand in accepted:
        if cand.source not in node_names:
            node_names[cand.source] = {"kind": "system", "name": _pretty(cand.source)}

        target_name = cand.override_name or cand.target
        if target_name not in node_names:
            is_external = cand.type == "http" and not _looks_internal(cand.source, target_name)
            node_names[target_name] = {
                "kind": "system",
                "name": _pretty(target_name),
                **({"isExternal": True} if is_external else {}),
            }

    elements: list[dict[str, Any]] = []
    for node_id, props in node_names.items():
        elements.append({"id": _slug(node_id), **props})

    slug_map = {name: _slug(name) for name in node_names}

    relationships: list[dict[str, Any]] = []
    for i, cand in enumerate(accepted, 1):
        target_name = cand.override_name or cand.target
        rel_type = cand.override_type or _CONN_TO_REL.get(cand.type, "uses")
        relationships.append({
            "id": f"rel_{i}",
            "sourceId": slug_map[cand.source],
            "targetId": slug_map[target_name],
            "type": rel_type,
        })

    from ..enrichment.llm_enricher import _ensure_layout  # avoid circular at module level
    model: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "metadata": {"title": "Imported Architecture"},
        "elements": elements,
        "relationships": relationships,
        "views": [],
    }
    _ensure_layout(model)
    return model


def _slug(name: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _pretty(name: str) -> str:
    """Turn snake-case / kebab-case into Title Case words."""
    import re
    parts = re.split(r"[-_.]", name)
    return " ".join(p.capitalize() for p in parts if p)


def _looks_internal(source: str, target: str) -> bool:
    """Heuristic: target looks like a sibling service rather than an external endpoint."""
    source_parts = set(source.lower().replace("-", " ").split())
    target_lower = target.lower()
    return any(p in target_lower for p in source_parts if len(p) > 3)
