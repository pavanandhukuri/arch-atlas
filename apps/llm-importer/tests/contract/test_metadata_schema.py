"""Contract tests for extraction/repo_metadata.schema.json."""
from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

SCHEMA_PATH = (
    Path(__file__).parent.parent.parent
    / "llm_importer"
    / "extraction"
    / "repo_metadata.schema.json"
)


@pytest.fixture
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())


@pytest.fixture
def validator(schema: dict) -> jsonschema.Draft202012Validator:
    return jsonschema.Draft202012Validator(schema)


def test_schema_file_is_valid_json_schema(schema: dict) -> None:
    jsonschema.Draft202012Validator.check_schema(schema)


def test_valid_full_document(validator: jsonschema.Draft202012Validator) -> None:
    doc = {
        "schemaVersion": "1.0",
        "analyzedAt": "2026-05-14T10:30:00Z",
        "repository": {"name": "order-service", "path": "/repos/order-service"},
        "connections": [
            {
                "type": "database",
                "targetService": "PostgreSQL",
                "targetAddresses": ["postgresql://localhost:5432/orders"],
                "confidence": 0.99,
                "evidence": ["docker-compose.yml:1: service 'postgres' image: postgres"],
            },
            {
                "type": "http",
                "targetService": "inventory-service",
                "targetAddresses": [],
                "confidence": 0.85,
                "evidence": ["src/client.py:12: requests.get(INVENTORY_URL)"],
            },
            {
                "type": "kafka",
                "targetService": "Kafka",
                "targetAddresses": [],
                "confidence": 0.90,
                "evidence": ["src/events.py:8: producer.produce('order-created', ...)"],
                "topics": ["order-created"],
            },
        ],
        "confidence": "high",
        "extractionMethod": "static",
        "filesSampled": 10,
        "filesTotal": 12,
    }
    validator.validate(doc)


def test_accepts_empty_connections(validator: jsonschema.Draft202012Validator) -> None:
    doc = {
        "schemaVersion": "1.0",
        "analyzedAt": "2026-05-14T10:30:00Z",
        "repository": {"name": "svc", "path": "/path"},
        "connections": [],
        "confidence": "low",
        "filesSampled": 5,
        "filesTotal": 5,
    }
    validator.validate(doc)


def test_rejects_missing_required_fields(validator: jsonschema.Draft202012Validator) -> None:
    with pytest.raises(jsonschema.ValidationError):
        validator.validate({"schemaVersion": "1.0"})


def test_rejects_empty_evidence_array(validator: jsonschema.Draft202012Validator) -> None:
    doc = {
        "schemaVersion": "1.0",
        "analyzedAt": "2026-05-14T10:30:00Z",
        "repository": {"name": "svc", "path": "/path"},
        "connections": [
            {
                "type": "http",
                "targetService": "Other",
                "targetAddresses": [],
                "confidence": 0.80,
                "evidence": [],  # minItems: 1
            }
        ],
        "confidence": "low",
        "filesSampled": 1,
        "filesTotal": 1,
    }
    with pytest.raises(jsonschema.ValidationError):
        validator.validate(doc)


def test_rejects_unknown_connection_type(validator: jsonschema.Draft202012Validator) -> None:
    doc = {
        "schemaVersion": "1.0",
        "analyzedAt": "2026-05-14T10:30:00Z",
        "repository": {"name": "svc", "path": "/path"},
        "connections": [
            {
                "type": "websocket",  # not in enum
                "targetService": "Other",
                "targetAddresses": [],
                "confidence": 0.50,
                "evidence": ["file.py:1: something"],
            }
        ],
        "confidence": "low",
        "filesSampled": 1,
        "filesTotal": 1,
    }
    with pytest.raises(jsonschema.ValidationError):
        validator.validate(doc)


def test_rejects_confidence_above_one(validator: jsonschema.Draft202012Validator) -> None:
    doc = {
        "schemaVersion": "1.0",
        "analyzedAt": "2026-05-14T10:30:00Z",
        "repository": {"name": "svc", "path": "/path"},
        "connections": [
            {
                "type": "http",
                "targetService": "Other",
                "targetAddresses": [],
                "confidence": 1.5,  # > 1.0
                "evidence": ["file.py:1: thing"],
            }
        ],
        "confidence": "low",
        "filesSampled": 1,
        "filesTotal": 1,
    }
    with pytest.raises(jsonschema.ValidationError):
        validator.validate(doc)
