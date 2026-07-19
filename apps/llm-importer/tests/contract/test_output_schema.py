"""Contract test — validates aggregated output against architecture-model.schema.json."""
from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

SCHEMA_PATH = (
    Path(__file__).parent.parent.parent.parent.parent
    / "packages" / "model-schema" / "src" / "architecture-model.schema.json"
)


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())


@pytest.fixture(scope="module")
def validator(schema: dict) -> jsonschema.Draft202012Validator:
    return jsonschema.Draft202012Validator(schema)


@pytest.fixture
def minimal_model() -> dict:
    return {
        "schemaVersion": "1.0.0",
        "metadata": {"title": "Test Architecture"},
        "elements": [
            {"id": "svc1", "kind": "container", "name": "Service 1"},
        ],
        "relationships": [],
        "views": [],
    }


class TestOutputSchema:
    def test_schema_file_exists(self) -> None:
        assert SCHEMA_PATH.exists(), f"Schema not found at {SCHEMA_PATH}"

    def test_schema_is_valid_json(self) -> None:
        data = json.loads(SCHEMA_PATH.read_text())
        assert isinstance(data, dict)
        assert "$schema" in data

    def test_minimal_model_validates(self, validator: jsonschema.Draft202012Validator, minimal_model: dict) -> None:
        errors = list(validator.iter_errors(minimal_model))
        assert errors == [], [e.message for e in errors]

    def test_missing_elements_fails(self, validator: jsonschema.Draft202012Validator, minimal_model: dict) -> None:
        del minimal_model["elements"]
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(minimal_model)

    def test_invalid_element_kind_fails(self, validator: jsonschema.Draft202012Validator, minimal_model: dict) -> None:
        minimal_model["elements"][0]["kind"] = "not-a-real-kind"
        with pytest.raises(jsonschema.ValidationError):
            validator.validate(minimal_model)
