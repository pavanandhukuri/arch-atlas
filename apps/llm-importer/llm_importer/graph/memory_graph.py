"""In-memory architecture graph backed by networkx."""
from __future__ import annotations

import re
from typing import Any, Iterator

import networkx as nx

from .models import EdgeKind, GraphEdge, GraphNode, NodeKind, connection_type_to_edge_kind, infer_node_kind

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(text: str) -> str:
    return _SLUG_RE.sub("_", text.lower()).strip("_")


class MemoryGraph:
    """Directed architecture graph using networkx under the hood."""

    def __init__(self) -> None:
        self._g: nx.DiGraph = nx.DiGraph()
        self._edge_counter = 0

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def add_node(self, node: GraphNode) -> None:
        if node.id not in self._g:
            self._g.add_node(node.id, data=node)

    def add_or_merge_node(self, node: GraphNode) -> str:
        """Add node; if a node with the same name+kind exists, return its id."""
        existing_id = self._find_node_by_name(node.name, node.kind)
        if existing_id:
            return existing_id
        self.add_node(node)
        return node.id

    def add_edge(self, edge: GraphEdge) -> None:
        # Merge parallel edges (same source/target/kind): keep highest confidence
        existing = self._find_edge(edge.source_id, edge.target_id, edge.kind)
        if existing:
            existing.evidence = list(dict.fromkeys(existing.evidence + edge.evidence))[:10]
            existing.confidence = max(existing.confidence, edge.confidence)
            return
        self._g.add_edge(edge.source_id, edge.target_id, data=edge)

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def get_node(self, node_id: str) -> GraphNode | None:
        data = self._g.nodes.get(node_id)
        return data["data"] if data else None

    def nodes(self) -> Iterator[GraphNode]:
        for _, attrs in self._g.nodes(data=True):
            yield attrs["data"]

    def edges(self) -> Iterator[GraphEdge]:
        for _, _, attrs in self._g.edges(data=True):
            yield attrs["data"]

    def edges_from(self, node_id: str) -> list[GraphEdge]:
        return [attrs["data"] for _, _, attrs in self._g.out_edges(node_id, data=True)]

    def edges_to(self, node_id: str) -> list[GraphEdge]:
        return [attrs["data"] for _, _, attrs in self._g.in_edges(node_id, data=True)]

    def nodes_of_kind(self, kind: NodeKind) -> list[GraphNode]:
        return [n for n in self.nodes() if n.kind == kind]

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": [
                {
                    "id": n.id,
                    "kind": n.kind.value,
                    "name": n.name,
                    **({"repoPath": n.repo_path} if n.repo_path else {}),
                    **n.extra,
                }
                for n in self.nodes()
            ],
            "edges": [
                {
                    "id": e.id,
                    "sourceId": e.source_id,
                    "targetId": e.target_id,
                    "kind": e.kind.value,
                    "confidence": e.confidence,
                    "evidence": e.evidence,
                }
                for e in self.edges()
            ],
        }

    # ------------------------------------------------------------------
    # Population helpers
    # ------------------------------------------------------------------

    def populate_from_metadata_list(self, metadata_list: list[dict[str, Any]]) -> None:
        """Load all metadata files into the graph."""
        for meta in metadata_list:
            repo = meta.get("repository", {})
            repo_name: str = repo.get("name", "unknown")
            repo_path: str = repo.get("path", "")

            svc_id = f"svc_{_slug(repo_name)}"
            self.add_or_merge_node(GraphNode(
                id=svc_id,
                kind=NodeKind.SERVICE,
                name=repo_name,
                repo_path=repo_path,
            ))

            for i, conn in enumerate(meta.get("connections", [])):
                target_name: str = conn.get("targetService", "unknown")
                conn_type: str = conn.get("type", "unknown")
                confidence: float = float(conn.get("confidence", 0.5))
                evidence: list[str] = conn.get("evidence", [])
                topics: list[str] = conn.get("topics", [])

                target_kind = infer_node_kind(conn_type, target_name)
                target_id = f"{target_kind.value[:3]}_{_slug(target_name)}"

                self.add_or_merge_node(GraphNode(
                    id=target_id,
                    kind=target_kind,
                    name=target_name,
                ))

                edge_kind = connection_type_to_edge_kind(conn_type)
                self._edge_counter += 1
                edge_id = f"edge_{self._edge_counter}"

                self.add_edge(GraphEdge(
                    id=edge_id,
                    source_id=svc_id,
                    target_id=target_id,
                    kind=edge_kind,
                    confidence=confidence,
                    evidence=evidence[:5],
                ))

                # For Kafka connections, record topic names as extra data
                if topics and target_kind == NodeKind.TOPIC:
                    node = self.get_node(target_id)
                    if node:
                        node.extra["topicNames"] = list(dict.fromkeys(
                            node.extra.get("topicNames", []) + topics
                        ))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _find_node_by_name(self, name: str, kind: NodeKind) -> str | None:
        name_lower = name.lower()
        for n in self.nodes():
            if n.kind == kind and n.name.lower() == name_lower:
                return n.id
        return None

    def _find_edge(self, source_id: str, target_id: str, kind: EdgeKind) -> GraphEdge | None:
        for _, _, attrs in self._g.out_edges(source_id, data=True):
            e: GraphEdge = attrs["data"]
            if e.target_id == target_id and e.kind == kind:
                return e
        return None
