"""Graph node and edge data models."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class NodeKind(str, Enum):
    SERVICE = "service"
    DATABASE = "database"
    QUEUE = "queue"
    TOPIC = "topic"
    EXTERNAL = "external"


class EdgeKind(str, Enum):
    REST = "REST"
    GRPC = "gRPC"
    KAFKA_PUBLISH = "kafka-publish"
    KAFKA_CONSUME = "kafka-consume"
    DB_READ_WRITE = "db-read-write"
    QUEUE_PUBLISH = "queue-publish"
    QUEUE_CONSUME = "queue-consume"
    USES = "uses"


@dataclass
class GraphNode:
    id: str
    kind: NodeKind
    name: str
    repo_path: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphEdge:
    id: str
    source_id: str
    target_id: str
    kind: EdgeKind
    confidence: float
    evidence: list[str] = field(default_factory=list)


def connection_type_to_edge_kind(conn_type: str) -> EdgeKind:
    mapping = {
        "http": EdgeKind.REST,
        "grpc": EdgeKind.GRPC,
        "database": EdgeKind.DB_READ_WRITE,
        "kafka": EdgeKind.KAFKA_PUBLISH,
        "queue": EdgeKind.QUEUE_PUBLISH,
        "unknown": EdgeKind.USES,
    }
    return mapping.get(conn_type, EdgeKind.USES)


def infer_node_kind(conn_type: str, target_service: str) -> NodeKind:
    name_lower = target_service.lower()
    if conn_type == "database":
        return NodeKind.DATABASE
    if conn_type in ("kafka",):
        return NodeKind.TOPIC
    if conn_type == "queue":
        return NodeKind.QUEUE
    if any(k in name_lower for k in ("stripe", "sendgrid", "twilio", "aws", "gcp", "azure", "github", "slack")):
        return NodeKind.EXTERNAL
    if conn_type in ("http", "grpc", "unknown"):
        return NodeKind.SERVICE
    return NodeKind.EXTERNAL
