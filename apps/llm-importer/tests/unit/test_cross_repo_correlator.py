"""Tests for cross_repo_correlator."""
from __future__ import annotations

from llm_importer.graph.cross_repo_correlator import _names_match, correlate
from llm_importer.graph.memory_graph import MemoryGraph
from llm_importer.graph.models import EdgeKind, GraphEdge, GraphNode, NodeKind


def _svc(node_id: str, name: str, repo: str | None = None) -> GraphNode:
    return GraphNode(id=node_id, kind=NodeKind.SERVICE, name=name, repo_path=repo)


class TestNamesMatch:
    def test_exact_match_after_slug(self) -> None:
        assert _names_match("order-service", "order-service")

    def test_prefix_match(self) -> None:
        assert _names_match("order", "order-service")

    def test_suffix_match(self) -> None:
        assert _names_match("order-service", "order")

    def test_no_match(self) -> None:
        assert not _names_match("inventory", "payment")

    def test_case_insensitive(self) -> None:
        assert _names_match("OrderService", "order-service")


class TestCorrelate:
    def test_rest_edge_re_pointed_to_matched_service(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("svc_order", "order-service"))
        g.add_node(_svc("svc_inventory", "inventory-service"))
        # REST target was classified as EXTERNAL but its name matches a known SERVICE
        target = GraphNode(id="ext_inventory_ref", kind=NodeKind.EXTERNAL, name="inventory")
        g.add_node(target)

        g.add_edge(GraphEdge(
            id="e1",
            source_id="svc_order",
            target_id="ext_inventory_ref",
            kind=EdgeKind.REST,
            confidence=0.85,
        ))

        correlate(g)

        # The edge should now point to svc_inventory (the actual service node)
        edges = g.edges_from("svc_order")
        assert len(edges) == 1
        assert edges[0].target_id == "svc_inventory"

    def test_no_correlation_for_self_loops(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("svc_order", "order-service"))
        g.add_node(GraphNode(id="svc_order_ref", kind=NodeKind.SERVICE, name="order"))

        g.add_edge(GraphEdge(
            id="e1",
            source_id="svc_order",
            target_id="svc_order_ref",
            kind=EdgeKind.REST,
            confidence=0.85,
        ))

        correlate(g)

        # Should NOT re-point to itself
        edges = g.edges_from("svc_order")
        assert len(edges) == 1
        assert edges[0].target_id != "svc_order"

    def test_database_edges_not_correlated(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("svc_order", "order-service"))
        g.add_node(GraphNode(id="db_postgres", kind=NodeKind.DATABASE, name="PostgreSQL"))
        g.add_node(_svc("svc_postgres_svc", "PostgreSQL"))  # same name, different kind

        g.add_edge(GraphEdge(
            id="e1",
            source_id="svc_order",
            target_id="db_postgres",
            kind=EdgeKind.DB_READ_WRITE,
            confidence=0.99,
        ))

        correlate(g)

        # DB edges should not be re-pointed
        edges = g.edges_from("svc_order")
        assert any(e.target_id == "db_postgres" for e in edges)

    def test_empty_graph_does_not_raise(self) -> None:
        g = MemoryGraph()
        correlate(g)  # should not raise
