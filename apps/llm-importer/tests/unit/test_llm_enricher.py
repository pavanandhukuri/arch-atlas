"""Tests for llm_enricher."""
from __future__ import annotations

import json
from typing import Optional
from unittest.mock import AsyncMock, patch

import pytest

from llm_importer.enrichment.llm_enricher import (
    _dedup_propose_candidates,
    _split_metadata_batches,
    enrich,
    propose,
)
from llm_importer.enrichment.prompts import build_propose_prompt
from llm_importer.graph.memory_graph import MemoryGraph
from llm_importer.graph.models import GraphNode, NodeKind
from llm_importer.providers.base import CompletionOptions, LLMProvider, ProviderError


_VALID_DIAGRAM = {
    "schemaVersion": "1.0.0",
    "metadata": {"title": "Test"},
    "elements": [
        {"id": "svc_order", "kind": "container", "name": "Order Service"},
        {"id": "db_postgres", "kind": "container", "name": "PostgreSQL", "containerSubtype": "database"},
    ],
    "relationships": [
        {"id": "rel_1", "sourceId": "svc_order", "targetId": "db_postgres", "type": "uses"},
    ],
    "views": [],
}


class OkProvider(LLMProvider):
    name = "mock"
    async def complete(self, prompt: str, options: Optional[CompletionOptions] = None) -> str:
        return json.dumps(_VALID_DIAGRAM)


class BadJsonProvider(LLMProvider):
    name = "mock"
    async def complete(self, prompt: str, options: Optional[CompletionOptions] = None) -> str:
        return "This is not JSON at all."


class ErrorProvider(LLMProvider):
    name = "mock"
    async def complete(self, prompt: str, options: Optional[CompletionOptions] = None) -> str:
        raise ProviderError("Connection timeout", provider="mock")


def _graph_with_nodes() -> MemoryGraph:
    g = MemoryGraph()
    g.add_node(GraphNode(id="svc_order", kind=NodeKind.SERVICE, name="order-service"))
    g.add_node(GraphNode(id="db_postgres", kind=NodeKind.DATABASE, name="PostgreSQL"))
    return g


class TestEnrich:
    @pytest.mark.asyncio
    async def test_returns_llm_diagram_on_success(self) -> None:
        g = _graph_with_nodes()
        result = await enrich(g, OkProvider())
        assert result["schemaVersion"] == "1.0.0"
        assert len(result["elements"]) == 2

    @pytest.mark.asyncio
    async def test_falls_back_on_bad_json(self) -> None:
        g = _graph_with_nodes()
        result = await enrich(g, BadJsonProvider())
        # Fallback: still returns a valid diagram from the graph
        assert result["schemaVersion"] == "1.0.0"
        assert isinstance(result["elements"], list)

    @pytest.mark.asyncio
    async def test_falls_back_on_provider_error(self) -> None:
        g = _graph_with_nodes()
        result = await enrich(g, ErrorProvider())
        assert result["schemaVersion"] == "1.0.0"

    @pytest.mark.asyncio
    async def test_empty_graph_returns_valid_diagram(self) -> None:
        g = MemoryGraph()
        result = await enrich(g, OkProvider())
        assert result["schemaVersion"] == "1.0.0"
        assert result["elements"] == []

    @pytest.mark.asyncio
    async def test_strips_markdown_fences_from_response(self) -> None:
        class FencedProvider(LLMProvider):
            name = "mock"
            async def complete(self, prompt: str, options=None) -> str:
                return f"```json\n{json.dumps(_VALID_DIAGRAM)}\n```"

        g = _graph_with_nodes()
        result = await enrich(g, FencedProvider())
        assert result["schemaVersion"] == "1.0.0"


# ── _split_metadata_batches ───────────────────────────────────────────────────

_TINY_META = {"repository": {"name": "svc"}, "connections": []}


class TestSplitMetadataBatches:
    def test_empty_list_returns_one_empty_batch(self) -> None:
        result = _split_metadata_batches([], 1000)
        assert result == [[]]

    def test_single_item_one_batch(self) -> None:
        result = _split_metadata_batches([_TINY_META], 100_000)
        assert len(result) == 1
        assert result[0] == [_TINY_META]

    def test_items_fit_in_one_batch(self) -> None:
        items = [_TINY_META] * 3
        result = _split_metadata_batches(items, 100_000)
        assert len(result) == 1
        assert len(result[0]) == 3

    def test_oversized_payload_splits(self) -> None:
        meta_chars = len(json.dumps(_TINY_META))
        # max_chars = exactly one item → second goes to new batch
        result = _split_metadata_batches([_TINY_META, _TINY_META], meta_chars)
        assert len(result) == 2
        assert len(result[0]) == 1
        assert len(result[1]) == 1

    def test_very_small_max_splits_each_item(self) -> None:
        items = [_TINY_META] * 5
        result = _split_metadata_batches(items, 1)
        assert len(result) == 5


# ── _dedup_propose_candidates ─────────────────────────────────────────────────

class TestDedupProposeCandidates:
    def _c(self, source: str, target: str, t: str = "http", conf: str = "medium") -> dict:
        return {"source": source, "target": target, "type": t, "confidence": conf, "reasoning": "r"}

    def test_no_duplicates_returns_all(self) -> None:
        c1 = self._c("a", "b")
        c2 = self._c("a", "c")
        result = _dedup_propose_candidates([c1, c2])
        assert len(result) == 2

    def test_exact_duplicate_kept_once(self) -> None:
        c = self._c("a", "b")
        result = _dedup_propose_candidates([c, dict(c)])
        assert len(result) == 1

    def test_higher_confidence_wins(self) -> None:
        low = self._c("a", "b", conf="low")
        high = self._c("a", "b", conf="high")
        result = _dedup_propose_candidates([low, high])
        assert result[0]["confidence"] == "high"

    def test_first_kept_when_same_confidence(self) -> None:
        c1 = {"source": "a", "target": "b", "type": "http", "confidence": "medium", "reasoning": "first"}
        c2 = {"source": "a", "target": "b", "type": "http", "confidence": "medium", "reasoning": "second"}
        result = _dedup_propose_candidates([c1, c2])
        assert result[0]["reasoning"] == "first"

    def test_different_types_not_merged(self) -> None:
        db = self._c("a", "b", t="database", conf="high")
        http = self._c("a", "b", t="http", conf="high")
        result = _dedup_propose_candidates([db, http])
        assert len(result) == 2


# ── propose() — batching and correlated_pairs ─────────────────────────────────

_CANDIDATE_ARRAY = json.dumps([
    {"source": "order-service", "target": "PostgreSQL", "type": "database",
     "reasoning": "psycopg2.connect()", "confidence": "high"},
])


class ProposeProvider(LLMProvider):
    name = "mock"
    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls: list[str] = []

    async def complete(self, prompt: str, options=None) -> str:
        self.calls.append(prompt)
        return self._responses.pop(0)


class TestPropose:
    @pytest.mark.asyncio
    async def test_single_batch_returns_candidates(self) -> None:
        meta = [{"repository": {"name": "order-service"}, "connections": []}]
        provider = ProposeProvider([_CANDIDATE_ARRAY])
        result = await propose(meta, provider)
        assert len(result) == 1
        assert result[0]["target"] == "PostgreSQL"

    @pytest.mark.asyncio
    async def test_batching_merges_results(self) -> None:
        meta_a = {"repository": {"name": "svc-a"}, "connections": []}
        meta_b = {"repository": {"name": "svc-b"}, "connections": []}
        response_a = json.dumps([{"source": "svc-a", "target": "Redis", "type": "database", "reasoning": "r", "confidence": "high"}])
        response_b = json.dumps([{"source": "svc-b", "target": "Kafka", "type": "kafka", "reasoning": "r", "confidence": "high"}])

        provider = ProposeProvider([response_a, response_b])
        meta_a_chars = len(json.dumps(meta_a))

        with patch("llm_importer.enrichment.llm_enricher._MAX_PROPOSE_CHARS", meta_a_chars):
            result = await propose([meta_a, meta_b], provider)

        assert len(result) == 2
        assert len(provider.calls) == 2

    @pytest.mark.asyncio
    async def test_correlated_pairs_added_to_first_batch_prompt(self) -> None:
        meta = [{"repository": {"name": "svc-a"}, "connections": []}]
        provider = ProposeProvider([_CANDIDATE_ARRAY])
        pairs = [{"type": "kafka", "publisher": "svc-a", "topic": "events", "consumer": "svc-b"}]

        await propose(meta, provider, correlated_pairs=pairs)

        assert "svc-b" in provider.calls[0]

    @pytest.mark.asyncio
    async def test_provider_error_returns_empty(self) -> None:
        class FailProvider(LLMProvider):
            name = "mock"
            async def complete(self, prompt: str, options=None) -> str:
                raise RuntimeError("timeout")

        meta = [{"repository": {"name": "svc"}, "connections": []}]
        result = await propose(meta, FailProvider())
        assert result == []

    @pytest.mark.asyncio
    async def test_dedup_across_batches(self) -> None:
        meta_a = {"repository": {"name": "svc-a"}, "connections": []}
        meta_b = {"repository": {"name": "svc-b"}, "connections": []}
        # Both batches return the same candidate
        dupe = json.dumps([{"source": "svc-a", "target": "PostgreSQL", "type": "database",
                            "reasoning": "r", "confidence": "medium"}])
        better = json.dumps([{"source": "svc-a", "target": "PostgreSQL", "type": "database",
                              "reasoning": "r", "confidence": "high"}])

        provider = ProposeProvider([dupe, better])
        meta_a_chars = len(json.dumps(meta_a))

        with patch("llm_importer.enrichment.llm_enricher._MAX_PROPOSE_CHARS", meta_a_chars):
            result = await propose([meta_a, meta_b], provider)

        assert len(result) == 1
        assert result[0]["confidence"] == "high"


# ── build_propose_prompt — correlated section ─────────────────────────────────

class TestBuildProposePromptCorrelated:
    def test_no_correlated_pairs_no_section(self) -> None:
        prompt = build_propose_prompt([_TINY_META])
        assert "Cross-repository event flows" not in prompt

    def test_correlated_pairs_included(self) -> None:
        pairs = [{"type": "kafka", "publisher": "svc-a", "topic": "orders", "consumer": "svc-b"}]
        prompt = build_propose_prompt([_TINY_META], correlated_pairs=pairs)
        assert "Cross-repository event flows" in prompt
        assert "svc-b" in prompt
        assert "orders" in prompt

    def test_empty_correlated_pairs_no_section(self) -> None:
        prompt = build_propose_prompt([_TINY_META], correlated_pairs=[])
        assert "Cross-repository event flows" not in prompt
