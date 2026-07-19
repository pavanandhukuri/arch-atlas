"""Combine extraction signals into a validated RepositoryMetadata dict."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import jsonschema

from .models import ExtractionSignal

_SCHEMA_PATH = Path(__file__).parent / "repo_metadata.schema.json"
_SCHEMA: dict[str, Any] = json.loads(_SCHEMA_PATH.read_text())
_VALIDATOR = jsonschema.Draft202012Validator(_SCHEMA)

# Service name normalization: collapse to lowercase alphanum + hyphen
_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")

# Named database drivers — when any of these exist among database signals, generic ones are suppressed
_NAMED_DB_NORMALIZED = frozenset({
    "postgresql", "mysql", "mariadb", "mongodb", "redis",
    "elasticsearch", "cassandra", "influxdb", "oracle", "sqlserver", "sqlite",
})
# Generic/inferred database names that should be collapsed when a named driver is present
_GENERIC_DB_NORMALIZED = frozenset({
    "database", "jpa-database", "jpa", "h2", "datasource",
})


class ExtractionError(Exception):
    pass


def build_metadata(
    repo_name: str,
    repo_path: str,
    signals: list[ExtractionSignal],
    files_scanned: int,
    files_total: int,
) -> dict[str, Any]:
    """Combine all signals for one repo into a validated RepositoryMetadata dict."""
    grouped = _group_signals(signals)
    grouped = _deduplicate_database_signals(grouped)
    connections = _merge_groups(grouped)
    overall_confidence = _overall_confidence(connections)

    metadata: dict[str, Any] = {
        "schemaVersion": "1.0",
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
        "repository": {"name": repo_name, "path": repo_path},
        "connections": connections,
        "confidence": overall_confidence,
        "extractionMethod": "static",
        "filesSampled": files_scanned,
        "filesTotal": files_total,
    }

    errors = list(_VALIDATOR.iter_errors(metadata))
    if errors:
        msgs = "; ".join(e.message for e in errors[:3])
        raise ExtractionError(f"Metadata schema validation failed: {msgs}")

    return metadata


def _normalize_service_name(name: str) -> str:
    return _NORMALIZE_RE.sub("-", name.lower()).strip("-")


def _group_signals(
    signals: list[ExtractionSignal],
) -> dict[tuple[str, str], list[ExtractionSignal]]:
    """Group signals by (normalized_target, connection_type)."""
    groups: dict[tuple[str, str], list[ExtractionSignal]] = {}
    for sig in signals:
        key = (_normalize_service_name(sig.target_service), sig.connection_type)
        groups.setdefault(key, []).append(sig)
    return groups


def _deduplicate_database_signals(
    grouped: dict[tuple[str, str], list[ExtractionSignal]],
) -> dict[tuple[str, str], list[ExtractionSignal]]:
    """When named database drivers exist, drop generic database signals (JPA, @Entity, etc.)."""
    db_keys = {k for k in grouped if k[1] == "database"}
    named_keys = {k for k in db_keys if k[0] in _NAMED_DB_NORMALIZED}
    if not named_keys:
        return grouped  # no authoritative driver found — keep everything as-is
    generic_keys = {k for k in db_keys if k[0] in _GENERIC_DB_NORMALIZED}
    if not generic_keys:
        return grouped
    result = dict(grouped)
    for k in generic_keys:
        del result[k]
    return result


def _merge_groups(
    grouped: dict[tuple[str, str], list[ExtractionSignal]],
) -> list[dict[str, Any]]:
    connections: list[dict[str, Any]] = []
    for (_, conn_type), sigs in grouped.items():
        best = max(sigs, key=lambda s: s.confidence)
        addresses = sorted({s.target_address for s in sigs if s.target_address})
        topics = sorted({s.topic for s in sigs if s.topic})
        evidence = list({f"{s.source_file}:{s.line}: {s.evidence_text}" for s in sigs})[:10]

        conn: dict[str, Any] = {
            "type": conn_type,
            "targetService": best.target_service,
            "targetAddresses": addresses,
            "confidence": round(best.confidence, 3),
            "evidence": evidence,
        }
        if topics:
            conn["topics"] = topics
        connections.append(conn)

    return sorted(connections, key=lambda c: -c["confidence"])


def _overall_confidence(connections: list[dict[str, Any]]) -> str:
    if not connections:
        return "low"
    avg = sum(c["confidence"] for c in connections) / len(connections)
    if avg >= 0.85:
        return "high"
    if avg >= 0.65:
        return "medium"
    return "low"
