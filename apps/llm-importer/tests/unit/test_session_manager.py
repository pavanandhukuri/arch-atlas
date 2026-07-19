"""Tests for the new pipeline-based session manager."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from llm_importer.graph.memory_graph import MemoryGraph
from llm_importer.graph.models import EdgeKind, GraphEdge, GraphNode, NodeKind
from llm_importer.providers.base import LLMProvider
from llm_importer.session.session_manager import (
    _extract_correlated_pairs,
    run_pipeline,
    run_propose_pipeline,
)


_EMPTY_DIAGRAM = json.dumps({
    "schemaVersion": "1.0.0",
    "metadata": {"title": "Test"},
    "elements": [],
    "relationships": [],
    "views": [],
})

_EMPTY_CANDIDATES = "[]"

_VALID_META = {
    "schemaVersion": "1.0",
    "analyzedAt": "2026-01-01T00:00:00+00:00",
    "repository": {"name": "cached-svc", "path": "/fake"},
    "connections": [],
    "confidence": "low",
    "extractionMethod": "static",
    "filesSampled": 0,
    "filesTotal": 0,
}


class MockProvider(LLMProvider):
    name = "mock"

    async def complete(self, prompt: str, options=None) -> str:
        return _EMPTY_DIAGRAM


class ProposeProvider(LLMProvider):
    """Provider that captures prompts and returns an empty candidate array."""
    name = "mock"

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def complete(self, prompt: str, options=None) -> str:
        self.prompts.append(prompt)
        return _EMPTY_CANDIDATES


def _make_repo_dir(root: Path, name: str) -> dict[str, Any]:
    d = root / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "main.py").write_text("# empty service\n")
    return {"name": name, "path": str(d)}


class TestRunPipeline:
    @pytest.mark.asyncio
    async def test_produces_diagram_for_simple_repos(self, tmp_path: Path) -> None:
        repos = [_make_repo_dir(tmp_path / "repos", f"svc{i}") for i in range(2)]
        out = tmp_path / "out"

        result = await run_pipeline(repos, MockProvider(), out)

        assert result["diagram_path"] is not None
        assert (out / "architecture.arch.json").exists()

    @pytest.mark.asyncio
    async def test_writes_metadata_per_repo(self, tmp_path: Path) -> None:
        repos = [_make_repo_dir(tmp_path / "repos", f"svc{i}") for i in range(3)]
        out = tmp_path / "out"

        await run_pipeline(repos, MockProvider(), out)

        for repo in repos:
            meta_path = out / f"{repo['name']}.metadata.json"
            assert meta_path.exists(), f"Expected {meta_path}"
            data = json.loads(meta_path.read_text())
            assert data["repository"]["name"] == repo["name"]

    @pytest.mark.asyncio
    async def test_skips_cached_repos_on_second_run(self, tmp_path: Path) -> None:
        repo = _make_repo_dir(tmp_path / "repos", "cached-svc")
        out = tmp_path / "out"
        out.mkdir()

        # Pre-write valid metadata
        cached = {
            "schemaVersion": "1.0.0",
            "analyzedAt": "2026-01-01T00:00:00Z",
            "repository": {"name": "cached-svc", "path": repo["path"]},
            "connections": [],
            "confidence": "low",
            "extractionMethod": "static",
            "filesSampled": 1,
            "filesTotal": 1,
        }
        (out / "cached-svc.metadata.json").write_text(json.dumps(cached))

        extraction_calls: list[str] = []

        with patch("llm_importer.session.session_manager._extract_repo") as mock_extract:
            mock_extract.side_effect = (
                lambda r, _mc, known_repo_names=None: extraction_calls.append(r["name"]) or cached
            )
            await run_pipeline([repo], MockProvider(), out, force_refresh=False)

        assert len(extraction_calls) == 0

    @pytest.mark.asyncio
    async def test_force_refresh_re_extracts(self, tmp_path: Path) -> None:
        repo = _make_repo_dir(tmp_path / "repos", "svc0")
        out = tmp_path / "out"
        out.mkdir()

        cached = {
            "schemaVersion": "1.0.0",
            "analyzedAt": "2026-01-01T00:00:00Z",
            "repository": {"name": "svc0", "path": repo["path"]},
            "connections": [],
            "confidence": "low",
            "extractionMethod": "static",
            "filesSampled": 0,
            "filesTotal": 0,
        }
        (out / "svc0.metadata.json").write_text(json.dumps(cached))

        extraction_calls: list[str] = []

        with patch("llm_importer.session.session_manager._extract_repo") as mock_extract:
            mock_extract.return_value = cached
            mock_extract.side_effect = (
                lambda r, _mc, known_repo_names=None: extraction_calls.append(r["name"]) or cached
            )
            await run_pipeline([repo], MockProvider(), out, force_refresh=True)

        assert "svc0" in extraction_calls

    @pytest.mark.asyncio
    async def test_analyze_only_skips_diagram(self, tmp_path: Path) -> None:
        repos = [_make_repo_dir(tmp_path / "repos", "svc0")]
        out = tmp_path / "out"

        result = await run_pipeline(repos, MockProvider(), out, analyze_only=True)

        assert result["diagram_path"] is None
        assert not (out / "architecture.arch.json").exists()

    @pytest.mark.asyncio
    async def test_aggregate_only_loads_from_disk(self, tmp_path: Path) -> None:
        repos = [{"name": "svc0", "path": str(tmp_path / "repos" / "svc0")}]
        out = tmp_path / "out"
        out.mkdir()

        meta = {
            "schemaVersion": "1.0.0",
            "analyzedAt": "2026-01-01T00:00:00Z",
            "repository": {"name": "svc0", "path": "/fake"},
            "connections": [],
            "confidence": "low",
            "extractionMethod": "static",
            "filesSampled": 0,
            "filesTotal": 0,
        }
        (out / "svc0.metadata.json").write_text(json.dumps(meta))

        result = await run_pipeline(repos, MockProvider(), out, aggregate_only=True)

        assert result["diagram_path"] is not None
        assert len(result["metadata_list"]) == 1


# ── run_propose_pipeline ─────────────────────────────────────────────────────

class TestRunProposePipeline:
    @pytest.mark.asyncio
    async def test_writes_review_file(self, tmp_path: Path) -> None:
        repo = _make_repo_dir(tmp_path / "repos", "svc0")
        out = tmp_path / "out"

        result = await run_propose_pipeline([repo], ProposeProvider(), out)

        assert result["review_path"] is not None
        assert (out / "architecture.review.yaml").exists()

    @pytest.mark.asyncio
    async def test_loads_existing_metadata_for_context(self, tmp_path: Path) -> None:
        """Repos not in the current extraction set should still appear in the propose prompt."""
        # Only extract svc-new, but svc-cached has existing metadata
        repo_new = _make_repo_dir(tmp_path / "repos", "svc-new")
        out = tmp_path / "out"
        out.mkdir()
        (out / "cached-svc.metadata.json").write_text(json.dumps(_VALID_META))

        provider = ProposeProvider()
        await run_propose_pipeline([repo_new], provider, out)

        # The propose prompt should mention cached-svc from the pre-existing metadata
        assert any("cached-svc" in p for p in provider.prompts)

    @pytest.mark.asyncio
    async def test_merges_with_existing_review(self, tmp_path: Path) -> None:
        from llm_importer.review.models import ReviewCandidate, ReviewFile
        from llm_importer.review.review_manager import save_review

        repo = _make_repo_dir(tmp_path / "repos", "svc0")
        out = tmp_path / "out"
        out.mkdir()

        # Pre-existing accepted candidate
        existing = ReviewFile(
            generated_at="2026-01-01T00:00:00+00:00",
            source_repos=["svc0"],
            candidates=[
                ReviewCandidate(
                    id="cand_old",
                    source="svc0",
                    target="PostgreSQL",
                    type="database",
                    reasoning="old",
                    confidence="high",
                    status="accepted",
                )
            ],
        )
        save_review(existing, out / "architecture.review.yaml")

        result = await run_propose_pipeline([repo], ProposeProvider(), out)

        from llm_importer.review.review_manager import load_review
        loaded = load_review(out / "architecture.review.yaml")
        accepted = [c for c in loaded.candidates if c.status == "accepted"]
        assert any(c.id == "cand_old" for c in accepted), "Existing accepted candidate should be preserved"


# ── _extract_correlated_pairs ─────────────────────────────────────────────────

def _meta_node(nid: str, name: str, kind: NodeKind) -> GraphNode:
    return GraphNode(id=nid, kind=kind, name=name)


def _edge(eid: str, src: str, tgt: str, kind: EdgeKind) -> GraphEdge:
    return GraphEdge(id=eid, source_id=src, target_id=tgt, kind=kind, confidence=0.9, evidence=[])


class TestExtractCorrelatedPairs:
    def test_empty_graph_returns_empty(self) -> None:
        g = MemoryGraph()
        assert _extract_correlated_pairs(g) == []

    def test_no_kafka_edges_returns_empty(self) -> None:
        g = MemoryGraph()
        g.add_node(_meta_node("svc_a", "svc-a", NodeKind.SERVICE))
        g.add_node(_meta_node("db", "PostgreSQL", NodeKind.DATABASE))
        g.add_edge(_edge("e1", "svc_a", "db", EdgeKind.DB_READ_WRITE))
        assert _extract_correlated_pairs(g) == []

    def test_publish_without_consume_returns_empty(self) -> None:
        g = MemoryGraph()
        g.add_node(_meta_node("svc_a", "svc-a", NodeKind.SERVICE))
        g.add_node(_meta_node("topic_x", "events", NodeKind.TOPIC))
        g.add_edge(_edge("e1", "svc_a", "topic_x", EdgeKind.KAFKA_PUBLISH))
        assert _extract_correlated_pairs(g) == []

    def test_matched_producer_consumer_pair(self) -> None:
        g = MemoryGraph()
        g.add_node(_meta_node("svc_a", "svc-a", NodeKind.SERVICE))
        g.add_node(_meta_node("svc_b", "svc-b", NodeKind.SERVICE))
        g.add_node(_meta_node("topic_x", "orders", NodeKind.TOPIC))
        g.add_edge(_edge("e1", "svc_a", "topic_x", EdgeKind.KAFKA_PUBLISH))
        g.add_edge(_edge("e2", "topic_x", "svc_b", EdgeKind.KAFKA_CONSUME))

        pairs = _extract_correlated_pairs(g)

        assert len(pairs) == 1
        assert pairs[0]["publisher"] == "svc-a"
        assert pairs[0]["consumer"] == "svc-b"
        assert pairs[0]["topic"] == "orders"
        assert pairs[0]["type"] == "kafka"

    def test_self_loop_excluded(self) -> None:
        g = MemoryGraph()
        g.add_node(_meta_node("svc_a", "svc-a", NodeKind.SERVICE))
        g.add_node(_meta_node("topic_x", "events", NodeKind.TOPIC))
        g.add_edge(_edge("e1", "svc_a", "topic_x", EdgeKind.KAFKA_PUBLISH))
        g.add_edge(_edge("e2", "topic_x", "svc_a", EdgeKind.KAFKA_CONSUME))

        pairs = _extract_correlated_pairs(g)
        assert pairs == []

    def test_multiple_publishers_fan_in(self) -> None:
        g = MemoryGraph()
        g.add_node(_meta_node("svc_a", "svc-a", NodeKind.SERVICE))
        g.add_node(_meta_node("svc_b", "svc-b", NodeKind.SERVICE))
        g.add_node(_meta_node("svc_c", "svc-c", NodeKind.SERVICE))
        g.add_node(_meta_node("topic_x", "orders", NodeKind.TOPIC))
        g.add_edge(_edge("e1", "svc_a", "topic_x", EdgeKind.KAFKA_PUBLISH))
        g.add_edge(_edge("e2", "svc_b", "topic_x", EdgeKind.KAFKA_PUBLISH))
        g.add_edge(_edge("e3", "topic_x", "svc_c", EdgeKind.KAFKA_CONSUME))

        pairs = _extract_correlated_pairs(g)
        assert len(pairs) == 2
        publishers = {p["publisher"] for p in pairs}
        assert publishers == {"svc-a", "svc-b"}

    def test_multiple_consumers_fan_out(self) -> None:
        g = MemoryGraph()
        g.add_node(_meta_node("svc_a", "svc-a", NodeKind.SERVICE))
        g.add_node(_meta_node("svc_b", "svc-b", NodeKind.SERVICE))
        g.add_node(_meta_node("svc_c", "svc-c", NodeKind.SERVICE))
        g.add_node(_meta_node("topic_x", "orders", NodeKind.TOPIC))
        g.add_edge(_edge("e1", "svc_a", "topic_x", EdgeKind.KAFKA_PUBLISH))
        g.add_edge(_edge("e2", "topic_x", "svc_b", EdgeKind.KAFKA_CONSUME))
        g.add_edge(_edge("e3", "topic_x", "svc_c", EdgeKind.KAFKA_CONSUME))

        pairs = _extract_correlated_pairs(g)
        assert len(pairs) == 2
        consumers = {p["consumer"] for p in pairs}
        assert consumers == {"svc-b", "svc-c"}
