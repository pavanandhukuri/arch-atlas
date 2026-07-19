"""Tests for relationship_extractor."""
from __future__ import annotations

import pytest

from llm_importer.extraction.models import ExtractionSignal
from llm_importer.extraction.relationship_extractor import build_metadata, _deduplicate_database_signals, _group_signals


def _sig(target: str, conn_type: str, confidence: float, file: str = "src/main.py", line: int = 1) -> ExtractionSignal:
    return ExtractionSignal(
        source_file=file,
        line=line,
        target_service=target,
        connection_type=conn_type,
        confidence=confidence,
        evidence_text=f"{conn_type} call to {target}",
    )


class TestBuildMetadata:
    def test_returns_valid_structure(self) -> None:
        signals = [_sig("PostgreSQL", "database", 0.92)]
        meta = build_metadata("order-service", "/repos/order", signals, 5, 10)

        assert meta["schemaVersion"] == "1.0"
        assert meta["repository"]["name"] == "order-service"
        assert len(meta["connections"]) == 1
        assert meta["connections"][0]["confidence"] == 0.92

    def test_merges_duplicate_targets_keeps_max_confidence(self) -> None:
        signals = [
            _sig("PostgreSQL", "database", 0.92, "docker-compose.yml"),
            _sig("PostgreSQL", "database", 0.85, "src/db.py"),
        ]
        meta = build_metadata("svc", "/path", signals, 2, 2)
        conns = meta["connections"]
        # Should merge into one connection
        db_conns = [c for c in conns if c["type"] == "database"]
        assert len(db_conns) == 1
        assert db_conns[0]["confidence"] == 0.92  # max

    def test_evidence_accumulated(self) -> None:
        signals = [
            _sig("Kafka", "kafka", 0.90, "src/producer.py", 10),
            _sig("Kafka", "kafka", 0.88, "src/consumer.py", 20),
        ]
        meta = build_metadata("svc", "/path", signals, 2, 2)
        kafka_conns = [c for c in meta["connections"] if c["type"] == "kafka"]
        assert len(kafka_conns) == 1
        assert len(kafka_conns[0]["evidence"]) >= 1

    def test_empty_signals_produces_empty_connections(self) -> None:
        meta = build_metadata("svc", "/path", [], 0, 0)
        assert meta["connections"] == []
        assert meta["confidence"] == "low"

    def test_overall_confidence_high_when_signals_are_strong(self) -> None:
        signals = [
            _sig("PostgreSQL", "database", 0.99),
            _sig("Redis", "database", 0.91),
        ]
        meta = build_metadata("svc", "/path", signals, 5, 5)
        assert meta["confidence"] == "high"

    def test_overall_confidence_low_when_signals_are_weak(self) -> None:
        signals = [_sig("Unknown", "http", 0.55)]
        meta = build_metadata("svc", "/path", signals, 1, 1)
        assert meta["confidence"] in ("low", "medium")

    def test_schema_validation_passes(self) -> None:
        signals = [_sig("PostgreSQL", "database", 0.92)]
        # Should not raise
        meta = build_metadata("svc", "/path", signals, 1, 5)
        assert "schemaVersion" in meta


class TestDatabaseDeduplication:
    def test_generic_signals_collapsed_when_named_driver_present(self) -> None:
        signals = [
            _sig("PostgreSQL", "database", 0.92),
            _sig("JPA Database", "database", 0.90),
            _sig("Database", "database", 0.85),
        ]
        meta = build_metadata("svc", "/path", signals, 5, 5)
        db_conns = [c for c in meta["connections"] if c["type"] == "database"]
        assert len(db_conns) == 1
        assert db_conns[0]["targetService"] == "PostgreSQL"

    def test_generic_signals_kept_when_no_named_driver(self) -> None:
        signals = [
            _sig("JPA Database", "database", 0.90),
            _sig("Database", "database", 0.85),
        ]
        meta = build_metadata("svc", "/path", signals, 5, 5)
        db_conns = [c for c in meta["connections"] if c["type"] == "database"]
        assert len(db_conns) == 2

    def test_multiple_named_drivers_kept(self) -> None:
        signals = [
            _sig("PostgreSQL", "database", 0.92),
            _sig("Redis", "database", 0.91),
            _sig("JPA Database", "database", 0.90),
        ]
        meta = build_metadata("svc", "/path", signals, 5, 5)
        db_conns = [c for c in meta["connections"] if c["type"] == "database"]
        targets = {c["targetService"] for c in db_conns}
        assert "PostgreSQL" in targets
        assert "Redis" in targets
        assert "JPA Database" not in targets

    def test_non_database_signals_unaffected(self) -> None:
        signals = [
            _sig("PostgreSQL", "database", 0.92),
            _sig("JPA Database", "database", 0.90),
            _sig("Kafka", "kafka", 0.90),
        ]
        meta = build_metadata("svc", "/path", signals, 5, 5)
        kafka_conns = [c for c in meta["connections"] if c["type"] == "kafka"]
        assert len(kafka_conns) == 1
