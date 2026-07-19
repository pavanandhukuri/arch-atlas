"""Tests for config loader — written before implementation (TDD)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from llm_importer.config.loader import ConfigError, load_config


def write_config(path: Path, data: dict) -> Path:
    path.write_text(json.dumps(data))
    return path


def write_yaml(path: Path, data: dict) -> Path:
    path.write_text(yaml.dump(data))
    return path


@pytest.fixture
def repo_dir(tmp_path: Path) -> Path:
    d = tmp_path / "my-service"
    d.mkdir()
    return d


@pytest.fixture
def minimal_data(repo_dir: Path) -> dict:
    return {
        "version": "1.0",
        "provider": {"type": "anthropic"},
        "output": {"directory": "./output"},
        "repositories": [{"path": str(repo_dir)}],
    }


class TestLoadConfigJson:
    def test_loads_valid_json(self, tmp_path: Path, minimal_data: dict) -> None:
        cfg = write_config(tmp_path / "config.json", minimal_data)
        result = load_config(str(cfg))
        assert result["version"] == "1.0"
        assert result["provider"]["type"] == "anthropic"

    def test_raises_on_missing_file(self, tmp_path: Path) -> None:
        with pytest.raises(ConfigError, match="not found"):
            load_config(str(tmp_path / "nonexistent.json"))

    def test_raises_on_malformed_json(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad.json"
        bad.write_text("{ not valid }")
        with pytest.raises(ConfigError):
            load_config(str(bad))


class TestLoadConfigYaml:
    def test_loads_valid_yaml(self, tmp_path: Path, minimal_data: dict) -> None:
        cfg = write_yaml(tmp_path / "config.yaml", minimal_data)
        result = load_config(str(cfg))
        assert result["version"] == "1.0"

    def test_loads_valid_yml(self, tmp_path: Path, minimal_data: dict) -> None:
        cfg = write_yaml(tmp_path / "config.yml", minimal_data)
        result = load_config(str(cfg))
        assert result["version"] == "1.0"


class TestSchemaValidation:
    def test_raises_when_version_missing(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir)}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        with pytest.raises(ConfigError, match="version"):
            load_config(str(cfg))

    def test_raises_when_provider_type_invalid(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "gpt4-turbo-vision-pro"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir)}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        with pytest.raises(ConfigError):
            load_config(str(cfg))

    def test_raises_when_repositories_empty(self, tmp_path: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [],
        }
        cfg = write_config(tmp_path / "config.json", data)
        with pytest.raises(ConfigError, match="repositories"):
            load_config(str(cfg))


class TestPathResolution:
    def test_resolves_relative_repo_path(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": "./my-service"}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        result = load_config(str(cfg))
        assert result["repositories"][0]["path"] == str(repo_dir)

    def test_resolves_relative_output_dir(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir)}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        result = load_config(str(cfg))
        assert result["output"]["directory"] == str(tmp_path / "output")

    def test_infers_name_from_directory_basename(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir)}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        result = load_config(str(cfg))
        assert result["repositories"][0]["name"] == "my-service"

    def test_preserves_explicit_name(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir), "name": "My API"}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        result = load_config(str(cfg))
        assert result["repositories"][0]["name"] == "My API"


class TestDefaults:
    def test_applies_default_diagram_filename(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir)}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        result = load_config(str(cfg))
        assert result["output"]["diagramFileName"] == "architecture.arch.json"

    def test_applies_default_analysis_settings(self, tmp_path: Path, repo_dir: Path) -> None:
        data = {
            "version": "1.0",
            "provider": {"type": "anthropic"},
            "output": {"directory": "./output"},
            "repositories": [{"path": str(repo_dir)}],
        }
        cfg = write_config(tmp_path / "config.json", data)
        result = load_config(str(cfg))
        assert result["analysis"]["maxFilesPerRepo"] == 200
        assert result["analysis"]["concurrency"] == 3
        assert result["analysis"]["forceRefresh"] is False
        assert result["analysis"]["excludePatterns"] == []
