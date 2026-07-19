"""Tests for MemoryGraph."""
from __future__ import annotations

import pytest

from llm_importer.graph.memory_graph import MemoryGraph
from llm_importer.graph.models import EdgeKind, GraphEdge, GraphNode, NodeKind


def _svc(node_id: str, name: str) -> GraphNode:
    return GraphNode(id=node_id, kind=NodeKind.SERVICE, name=name)


def _edge(edge_id: str, src: str, tgt: str, kind: EdgeKind = EdgeKind.REST) -> GraphEdge:
    return GraphEdge(id=edge_id, source_id=src, target_id=tgt, kind=kind, confidence=0.9)


class TestMemoryGraph:
    def test_add_and_retrieve_node(self) -> None:
        g = MemoryGraph()
        node = _svc("svc_a", "Service A")
        g.add_node(node)
        assert g.get_node("svc_a") is node

    def test_add_and_retrieve_edge(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("svc_a", "A"))
        g.add_node(_svc("svc_b", "B"))
        e = _edge("e1", "svc_a", "svc_b")
        g.add_edge(e)
        edges = g.edges_from("svc_a")
        assert len(edges) == 1
        assert edges[0].target_id == "svc_b"

    def test_get_node_returns_none_for_missing(self) -> None:
        g = MemoryGraph()
        assert g.get_node("nonexistent") is None

    def test_nodes_of_kind(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("s1", "A"))
        g.add_node(_svc("s2", "B"))
        g.add_node(GraphNode(id="db1", kind=NodeKind.DATABASE, name="Postgres"))
        services = g.nodes_of_kind(NodeKind.SERVICE)
        assert len(services) == 2
        dbs = g.nodes_of_kind(NodeKind.DATABASE)
        assert len(dbs) == 1

    def test_parallel_edges_merged_keep_highest_confidence(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("a", "A"))
        g.add_node(_svc("b", "B"))
        g.add_edge(GraphEdge(id="e1", source_id="a", target_id="b", kind=EdgeKind.REST, confidence=0.7))
        g.add_edge(GraphEdge(id="e2", source_id="a", target_id="b", kind=EdgeKind.REST, confidence=0.9))
        edges = g.edges_from("a")
        assert len(edges) == 1
        assert edges[0].confidence == 0.9

    def test_to_dict_contains_nodes_and_edges(self) -> None:
        g = MemoryGraph()
        g.add_node(_svc("s1", "S1"))
        g.add_node(GraphNode(id="db1", kind=NodeKind.DATABASE, name="Postgres"))
        g.add_edge(_edge("e1", "s1", "db1", EdgeKind.DB_READ_WRITE))
        d = g.to_dict()
        assert len(d["nodes"]) == 2
        assert len(d["edges"]) == 1

    def test_populate_from_metadata_list(self) -> None:
        metadata_list = [
            {
                "schemaVersion": "1.0.0",
                "repository": {"name": "order-service", "path": "/repos/order"},
                "connections": [
                    {
                        "type": "database",
                        "targetService": "PostgreSQL",
                        "targetAddresses": [],
                        "confidence": 0.99,
                        "evidence": ["docker-compose.yml:1: postgres image"],
                    }
                ],
            }
        ]
        g = MemoryGraph()
        g.populate_from_metadata_list(metadata_list)
        nodes = list(g.nodes())
        assert len(nodes) == 2  # service + database
        kinds = {n.kind for n in nodes}
        assert NodeKind.SERVICE in kinds
        assert NodeKind.DATABASE in kinds

    def test_add_or_merge_node_deduplicates_by_name_and_kind(self) -> None:
        g = MemoryGraph()
        n1 = GraphNode(id="db_postgres_1", kind=NodeKind.DATABASE, name="PostgreSQL")
        n2 = GraphNode(id="db_postgres_2", kind=NodeKind.DATABASE, name="PostgreSQL")
        id1 = g.add_or_merge_node(n1)
        id2 = g.add_or_merge_node(n2)
        assert id1 == id2
        assert len(list(g.nodes())) == 1
