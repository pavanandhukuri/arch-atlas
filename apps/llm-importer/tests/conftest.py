"""Shared pytest fixtures for llm-importer tests."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable
from unittest.mock import AsyncMock

import pytest

from llm_importer.providers.base import LLMProvider


FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_SERVICE_PATH = FIXTURES_DIR / "repos" / "sample_service"
ORDER_SERVICE_PATH = FIXTURES_DIR / "repos" / "order_service"
NOTIFICATION_SERVICE_PATH = FIXTURES_DIR / "repos" / "notification_service"
METADATA_DIR = FIXTURES_DIR / "metadata"


def make_mock_provider(response: str = "") -> LLMProvider:
    """Return a mock LLMProvider that always returns the given string."""

    class MockProvider(LLMProvider):
        name = "mock"
        call_count = 0

        async def complete(self, prompt: str, options: Any = None) -> str:
            self.call_count += 1
            return response

    return MockProvider()


def make_valid_metadata(
    name: str = "sample-service",
    path: str | None = None,
) -> dict[str, Any]:
    """Return a minimal valid RepositoryMetadata dict."""
    return {
        "schemaVersion": "1.0",
        "analyzedAt": "2026-05-14T10:00:00Z",
        "repository": {
            "name": name,
            "path": path or str(SAMPLE_SERVICE_PATH),
        },
        "connections": [
            {
                "type": "database",
                "targetService": "PostgreSQL",
                "targetAddresses": ["${DATABASE_URL}"],
                "confidence": "high",
                "evidence": ["src/db.py:5 - DATABASE_URL"],
            }
        ],
        "confidence": "high",
        "filesSampled": 4,
        "filesTotal": 4,
    }


@pytest.fixture
def tmp_repo(tmp_path: Path) -> Path:
    """Create a minimal temporary repository for testing."""
    repo = tmp_path / "test-service"
    (repo / "src").mkdir(parents=True)
    (repo / "src" / "index.py").write_text("# entry point\n")
    (repo / "src" / "db.py").write_text(
        "import os\nDB_URL = os.environ.get('DATABASE_URL', 'postgresql://localhost/db')\n"
    )
    return repo


@pytest.fixture
def tmp_output(tmp_path: Path) -> Path:
    """Return a temporary output directory."""
    out = tmp_path / "output"
    out.mkdir()
    return out


@pytest.fixture
def minimal_config_dict(tmp_repo: Path, tmp_output: Path) -> dict[str, Any]:
    """Return a minimal valid ImportConfig dict (already resolved)."""
    return {
        "version": "1.0",
        "provider": {"type": "anthropic"},
        "output": {
            "directory": str(tmp_output),
            "diagramFileName": "architecture.arch.json",
        },
        "analysis": {
            "maxFilesPerRepo": 200,
            "excludePatterns": [],
            "forceRefresh": False,
            "concurrency": 3,
        },
        "repositories": [
            {"path": str(tmp_repo), "name": "test-service"},
        ],
    }
