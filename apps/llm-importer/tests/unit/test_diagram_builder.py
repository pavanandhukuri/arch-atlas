"""Tests for diagram_builder — written before implementation (TDD)."""
from __future__ import annotations

from typing import Any

import pytest

from llm_importer.output.diagram_builder import build_diagram


def _model(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "metadata": {"title": "Test"},
        "elements": [
            {"id": "svc1", "kind": "container", "name": "User Service"},
            {"id": "db1", "kind": "container", "name": "postgresql"},
        ],
        "relationships": [
            {"id": "rel1", "sourceId": "svc1", "targetId": "db1", "type": "uses"},
        ],
        "views": [],
    }
    base.update(overrides)
    return base


class TestServiceDeduplication:
    def test_deduplicates_elements_case_insensitively(self) -> None:
        model = _model(elements=[
            {"id": "svc1", "kind": "system", "name": "PostgreSQL"},
            {"id": "svc2", "kind": "system", "name": "postgresql"},
            {"id": "svc3", "kind": "container", "name": "API Service"},
        ], relationships=[])
        result = build_diagram(model)
        names = [e["name"] for e in result["elements"]]
        # Only one PostgreSQL variant should survive
        pg_count = sum(1 for n in names if n.lower() == "postgresql")
        assert pg_count == 1

    def test_preserves_unique_elements(self) -> None:
        model = _model(elements=[
            {"id": "s1", "kind": "container", "name": "Service A"},
            {"id": "s2", "kind": "container", "name": "Service B"},
        ], relationships=[])
        result = build_diagram(model)
        assert len(result["elements"]) == 2


class TestRelationshipIntegrity:
    def test_removes_orphaned_relationships(self) -> None:
        model = _model(relationships=[
            {"id": "rel1", "sourceId": "svc1", "targetId": "db1", "type": "uses"},
            {"id": "rel2", "sourceId": "svc1", "targetId": "nonexistent", "type": "calls"},
        ])
        result = build_diagram(model)
        rel_ids = [r["id"] for r in result["relationships"]]
        assert "rel1" in rel_ids
        assert "rel2" not in rel_ids

    def test_keeps_valid_relationships(self) -> None:
        model = _model()
        result = build_diagram(model)
        assert len(result["relationships"]) == 1
        assert result["relationships"][0]["id"] == "rel1"


class TestDefaultView:
    def test_injects_default_landscape_view_when_missing(self) -> None:
        model = _model(views=[])
        result = build_diagram(model)
        assert len(result["views"]) >= 1
        assert result["views"][0]["level"] == "landscape"

    def test_preserves_existing_views(self) -> None:
        existing_view = {
            "id": "v1",
            "level": "landscape",
            "title": "My View",
            "layout": {"algorithm": "auto", "nodes": [], "edges": []},
        }
        model = _model(views=[existing_view])
        result = build_diagram(model)
        assert any(v["id"] == "v1" for v in result["views"])
