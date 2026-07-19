"""Post-processes LLM-generated diagrams: dedup elements, remove orphans, inject default view."""
from __future__ import annotations

from typing import Any


def build_diagram(model: dict[str, Any]) -> dict[str, Any]:
    """Clean up and enrich the raw LLM diagram model."""
    elements = _deduplicate_elements(list(model.get("elements", [])))
    valid_ids = {e["id"] for e in elements}
    relationships = _remove_orphans(list(model.get("relationships", [])), valid_ids)
    views = _ensure_default_view(list(model.get("views", [])))
    return {**model, "elements": elements, "relationships": relationships, "views": views}


def _deduplicate_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for el in elements:
        key = el.get("name", "").lower()
        if key not in seen:
            seen.add(key)
            result.append(el)
    return result


def _remove_orphans(
    relationships: list[dict[str, Any]],
    valid_ids: set[str],
) -> list[dict[str, Any]]:
    return [
        r for r in relationships
        if r.get("sourceId") in valid_ids and r.get("targetId") in valid_ids
    ]


def _ensure_default_view(views: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if views:
        return views
    return [
        {
            "id": "view_landscape",
            "level": "landscape",
            "title": "Landscape",
            "layout": {"algorithm": "auto", "nodes": [], "edges": []},
        }
    ]
