"""Single LLM call that enriches the architecture graph into a C4 diagram model."""
from __future__ import annotations

import importlib.resources
import json
import logging
import re
from pathlib import Path
from typing import Any

import jsonschema

from ..graph.memory_graph import MemoryGraph
from ..providers.base import LLMProvider
from .prompts import build_enrichment_prompt, build_propose_prompt

_logger = logging.getLogger(__name__)

_SCHEMA_FILENAME = "architecture-model.schema.json"

# Monorepo path — only present when running directly from source checkout.
_MONOREPO_SCHEMA_PATH = (
    Path(__file__).parent.parent.parent.parent.parent
    / "packages" / "model-schema" / "src" / _SCHEMA_FILENAME
)


def _load_schema() -> dict[str, Any] | None:
    # 1. Bundled copy inside the installed package (works after pip/pipx install).
    try:
        ref = importlib.resources.files("llm_importer.schemas").joinpath(_SCHEMA_FILENAME)
        return json.loads(ref.read_text(encoding="utf-8"))  # type: ignore[arg-type]
    except Exception:
        pass
    # 2. Monorepo source tree (development in-place checkout).
    if _MONOREPO_SCHEMA_PATH.exists():
        try:
            return json.loads(_MONOREPO_SCHEMA_PATH.read_text())
        except Exception:
            pass
    return None


_SCHEMA = _load_schema()


async def enrich(graph: MemoryGraph, provider: LLMProvider) -> dict[str, Any]:
    """Call the LLM once with the full graph and return a valid ArchitectureModel dict.

    On any failure (JSON parse error, schema violation, provider error) falls back
    to a structurally valid diagram built directly from the graph nodes/edges without LLM.
    """
    graph_dict = graph.to_dict()

    if not graph_dict["nodes"]:
        return _graph_to_diagram(graph)

    service_names = [n["name"] for n in graph_dict["nodes"] if n.get("kind") == "service"]
    prompt = build_enrichment_prompt(graph_dict, known_service_names=service_names or None)
    try:
        raw = await provider.complete(prompt)
        model = _parse_response(raw)
        if _SCHEMA:
            _validate(model)
        _ensure_layout(model)
        return model
    except Exception as exc:
        _logger.warning("LLM enrichment failed (%s), falling back to direct graph export", exc)
        return _graph_to_diagram(graph)


def _parse_response(raw: str) -> dict[str, Any]:
    """Extract and parse the JSON object from the LLM response."""
    text = raw.strip()
    # Strip any markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    text = text.strip()

    # Find the outermost { … }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(text[start:end + 1])  # type: ignore[no-any-return]


def _validate(model: dict[str, Any]) -> None:
    validator = jsonschema.Draft202012Validator(_SCHEMA)
    errors = list(validator.iter_errors(model))
    if errors:
        raise jsonschema.ValidationError(errors[0].message)


def _graph_to_diagram(graph: MemoryGraph) -> dict[str, Any]:
    """Convert the graph directly to an ArchitectureModel without LLM."""
    # Everything is a top-level system in the landscape view.
    # The studio's landscape filter only shows kind=system|person.
    _KIND_TO_ELEMENT: dict[str, dict[str, Any]] = {
        "service": {"kind": "system"},
        "database": {"kind": "system"},
        "queue": {"kind": "system"},
        "topic": {"kind": "system"},
        "external": {"kind": "system", "isExternal": True},
    }
    _EDGE_TO_REL_TYPE: dict[str, str] = {
        "REST": "calls",
        "gRPC": "calls",
        "kafka-publish": "publishes",
        "kafka-consume": "subscribes",
        "db-read-write": "uses",
        "queue-publish": "publishes",
        "queue-consume": "subscribes",
        "uses": "uses",
    }

    elements: list[dict[str, Any]] = []
    for node in graph.nodes():
        props = dict(_KIND_TO_ELEMENT.get(node.kind.value, {"kind": "container"}))
        props["id"] = node.id
        props["name"] = node.name
        elements.append(props)

    valid_ids = {e["id"] for e in elements}
    relationships: list[dict[str, Any]] = []
    for i, edge in enumerate(graph.edges(), 1):
        if edge.source_id not in valid_ids or edge.target_id not in valid_ids:
            continue
        relationships.append({
            "id": f"rel_{i}",
            "sourceId": edge.source_id,
            "targetId": edge.target_id,
            "type": _EDGE_TO_REL_TYPE.get(edge.kind.value, "uses"),
        })

    model: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "metadata": {"title": "Imported Architecture"},
        "elements": elements,
        "relationships": relationships,
        "views": [],
    }
    _ensure_layout(model)
    return model


_MAX_PROPOSE_CHARS = 80_000  # ~20k tokens at ~4 chars/token; conservative for 32k-ctx models

_CONF_RANK: dict[str, int] = {"high": 2, "medium": 1, "low": 0}


async def propose(
    metadata_list: list[dict[str, Any]],
    provider: LLMProvider,
    correlated_pairs: list[dict[str, Any]] | None = None,
    known_repo_names: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Call the LLM to produce candidate connections with reasoning for human review.

    Splits large payloads into batches and deduplicates across batch results.
    Returns a list of raw candidate dicts (source, target, type, reasoning, confidence).
    Falls back to an empty list on any failure so the caller can still write a review
    file with zero candidates rather than crashing.
    """
    if not metadata_list:
        return []

    batches = _split_metadata_batches(metadata_list, _MAX_PROPOSE_CHARS)
    all_candidates: list[dict[str, Any]] = []

    for i, batch in enumerate(batches):
        # Only attach correlated_pairs and known_repo_names to the first batch to avoid redundancy
        pairs = correlated_pairs if i == 0 else None
        repos = known_repo_names if i == 0 else None
        prompt = build_propose_prompt(batch, correlated_pairs=pairs, known_repo_names=repos)
        try:
            raw = await provider.complete(prompt)
            all_candidates.extend(_parse_candidates(raw))
        except Exception as exc:
            _logger.warning("LLM propose batch %d/%d failed (%s)", i + 1, len(batches), exc)

    return _dedup_propose_candidates(all_candidates)


def _split_metadata_batches(
    metadata_list: list[dict[str, Any]], max_chars: int
) -> list[list[dict[str, Any]]]:
    """Split metadata_list into batches that each fit within max_chars when JSON-serialized."""
    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_chars = 0

    for meta in metadata_list:
        meta_chars = len(json.dumps(meta))
        if current and current_chars + meta_chars > max_chars:
            batches.append(current)
            current = [meta]
            current_chars = meta_chars
        else:
            current.append(meta)
            current_chars += meta_chars

    if current:
        batches.append(current)

    return batches if batches else [[]]


def _dedup_propose_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate: same (source, target, type) → keep the entry with highest confidence."""
    seen: dict[tuple[str, str, str], dict[str, Any]] = {}
    for c in candidates:
        key = (c.get("source", ""), c.get("target", ""), c.get("type", ""))
        existing = seen.get(key)
        if existing is None:
            seen[key] = c
        else:
            new_rank = _CONF_RANK.get(c.get("confidence", "low"), 0)
            old_rank = _CONF_RANK.get(existing.get("confidence", "low"), 0)
            if new_rank > old_rank:
                seen[key] = c
    return list(seen.values())


def _parse_candidates(raw: str) -> list[dict[str, Any]]:
    """Extract a JSON array from the LLM response."""
    import re as _re
    text = raw.strip()
    text = _re.sub(r"^```(?:json)?\s*", "", text, flags=_re.MULTILINE)
    text = _re.sub(r"\s*```$", "", text, flags=_re.MULTILINE)
    text = text.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in LLM propose response")
    result = json.loads(text[start:end + 1])
    if not isinstance(result, list):
        raise ValueError("Expected a JSON array")
    return result  # type: ignore[no-any-return]


# ── Layout helpers ─────────────────────────────────────────────────────────────

_LAYOUT_COLS = 3
_LAYOUT_SPACING = 200
_LAYOUT_PADDING = 60
_NODE_W = 140
_NODE_H = 80


def _compute_grid_layout(elements: list[dict[str, Any]], relationships: list[dict[str, Any]]) -> dict[str, Any]:
    """Return a LayoutState dict with grid-positioned nodes for every element."""
    nodes = []
    for i, el in enumerate(elements):
        col = i % _LAYOUT_COLS
        row = i // _LAYOUT_COLS
        nodes.append({
            "elementId": el["id"],
            "x": _LAYOUT_PADDING + col * _LAYOUT_SPACING,
            "y": _LAYOUT_PADDING + row * _LAYOUT_SPACING,
            "w": _NODE_W,
            "h": _NODE_H,
        })

    element_ids = {el["id"] for el in elements}
    edges = [
        {"relationshipId": rel["id"]}
        for rel in relationships
        if rel.get("sourceId") in element_ids and rel.get("targetId") in element_ids
    ]

    return {"algorithm": "deterministic-v1", "nodes": nodes, "edges": edges}


def _ensure_layout(model: dict[str, Any]) -> None:
    """Guarantee every view has populated layout.nodes; add a landscape view if none exist."""
    elements: list[dict[str, Any]] = model.get("elements", [])
    relationships: list[dict[str, Any]] = model.get("relationships", [])
    views: list[dict[str, Any]] = model.get("views", [])

    if not views:
        views = [{
            "id": "view_landscape",
            "level": "landscape",
            "title": "Landscape",
            "layout": _compute_grid_layout(elements, relationships),
        }]
        model["views"] = views
        return

    for view in views:
        layout = view.get("layout", {})
        if not layout.get("nodes"):
            view["layout"] = _compute_grid_layout(elements, relationships)
