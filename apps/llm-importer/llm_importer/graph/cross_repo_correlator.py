"""Cross-repository correlation: match Kafka producers to consumers and REST endpoints."""
from __future__ import annotations

import re
from typing import Any

from .memory_graph import MemoryGraph, _slug
from .models import EdgeKind, GraphEdge, GraphNode, NodeKind


def correlate(graph: MemoryGraph) -> MemoryGraph:
    """Mutate the graph to add cross-repo relationships.

    Pass 1: Kafka topic correlation — find producer→topic + topic→consumer edges
            for topics with matching names across repos.
    Pass 2: REST service-name correlation — if a REST edge target name matches
            a known service node name, re-point the edge to that service node.
    """
    _correlate_kafka(graph)
    _correlate_rest(graph)
    return graph


def _correlate_kafka(graph: MemoryGraph) -> None:
    """Match kafka-publish sources with kafka-consume targets via shared topic names."""
    # Collect all topic nodes and their known names
    topic_nodes: dict[str, GraphNode] = {
        n.id: n for n in graph.nodes() if n.kind == NodeKind.TOPIC
    }

    # Build index: topic_name_normalized → topic_node_id
    topic_index: dict[str, str] = {}
    for node in topic_nodes.values():
        for name in node.extra.get("topicNames", [node.name]):
            topic_index[_slug(name)] = node.id

    # Find all service nodes that have kafka publish edges
    # and service nodes that have kafka consume edges but point to same topic
    publish_edges: list[GraphEdge] = []
    consume_edges: list[GraphEdge] = []

    for edge in graph.edges():
        if edge.kind == EdgeKind.KAFKA_PUBLISH:
            publish_edges.append(edge)
        elif edge.kind == EdgeKind.KAFKA_CONSUME:
            consume_edges.append(edge)

    # For each publish edge, check if its target topic is consumed by any other service
    # If consume edge doesn't exist yet, we rely on the populate step to have created it.
    # This pass ensures the topic node is shared (already done via add_or_merge_node).

    # What we do here: if there are KAFKA_PUBLISH edges pointing to a topic and
    # KAFKA_CONSUME edges (already stored as USES or unknown edges) with matching
    # topic names, we add explicit consume edges.
    # For simplicity: any service with a kafka connection whose topic name matches
    # a published topic gets a KAFKA_CONSUME edge from the topic node to that service.
    # (We look at the raw connection topics stored in metadata nodes.)

    edge_counter = [0]

    def _next_edge_id() -> str:
        edge_counter[0] += 1
        return f"corr_edge_{edge_counter[0]}"

    # Build set of (service_id, topic_slug) already covered by publish edges
    covered_publish: set[tuple[str, str]] = set()
    for e in publish_edges:
        target_node = graph.get_node(e.target_id)
        if target_node and target_node.kind == NodeKind.TOPIC:
            for name in target_node.extra.get("topicNames", [target_node.name]):
                covered_publish.add((e.source_id, _slug(name)))

    # For each service node, look at stored raw metadata topics for consume patterns
    for svc_node in graph.nodes_of_kind(NodeKind.SERVICE):
        consume_topics: list[str] = svc_node.extra.get("consumeTopics", [])
        for topic_name in consume_topics:
            topic_id = topic_index.get(_slug(topic_name))
            if topic_id and topic_id != svc_node.id:
                graph.add_edge(GraphEdge(
                    id=_next_edge_id(),
                    source_id=topic_id,
                    target_id=svc_node.id,
                    kind=EdgeKind.KAFKA_CONSUME,
                    confidence=0.90,
                    evidence=[f"@KafkaListener / consumer.subscribe topic: {topic_name}"],
                ))


def _correlate_rest(graph: MemoryGraph) -> None:
    """If a REST edge target name closely matches a known service node, re-point it."""
    service_nodes = {n.name.lower(): n for n in graph.nodes_of_kind(NodeKind.SERVICE)}

    for edge in list(graph.edges()):
        if edge.kind not in (EdgeKind.REST, EdgeKind.GRPC):
            continue
        target_node = graph.get_node(edge.target_id)
        if target_node is None or target_node.kind == NodeKind.SERVICE:
            continue
        # Try to match by name similarity
        target_name_lower = target_node.name.lower()
        for svc_name_lower, svc_node in service_nodes.items():
            if svc_node.id == edge.source_id:
                continue
            if _names_match(target_name_lower, svc_name_lower):
                edge.target_id = svc_node.id
                break


_SERVICE_SUFFIX = re.compile(r"[_-]?(?:service|svc|app|api|server)$")


def _names_match(a: str, b: str) -> bool:
    """Return True if two service names likely refer to the same service."""
    a_slug = _slug(a)
    b_slug = _slug(b)
    if a_slug == b_slug:
        return True
    # Strip common suffixes and compare bases
    a_base = _SERVICE_SUFFIX.sub("", a_slug)
    b_base = _SERVICE_SUFFIX.sub("", b_slug)
    if a_base and b_base and a_base == b_base:
        return True
    # Containment (e.g. "order" in "order_service")
    if a_slug and b_slug and (a_slug in b_slug or b_slug in a_slug):
        return True
    return False
