"""Load and validate the import config file."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jsonschema
import yaml

_SCHEMA_PATH = Path(__file__).parent / "import_config.schema.json"
_SCHEMA: dict[str, Any] = json.loads(_SCHEMA_PATH.read_text())
_VALIDATOR = jsonschema.Draft202012Validator(_SCHEMA)


class ConfigError(Exception):
    """Raised when the config file is missing, malformed, or fails schema validation."""


def load_config(config_path: str) -> dict[str, Any]:
    """Load, parse, validate, and normalize the import config file.

    Returns a fully resolved config dict with defaults applied and all
    relative paths converted to absolute paths.
    """
    path = Path(config_path).resolve()
    config_dir = path.parent

    if not path.exists():
        raise ConfigError(f"Config file not found: {path}")

    suffix = path.suffix.lower()
    try:
        raw_text = path.read_text(encoding="utf-8")
        if suffix == ".json":
            raw: Any = json.loads(raw_text)
        elif suffix in (".yaml", ".yml"):
            raw = yaml.safe_load(raw_text)
        else:
            raise ConfigError(
                f"Unsupported config file extension '{suffix}'. Use .json, .yaml, or .yml"
            )
    except ConfigError:
        raise
    except Exception as exc:
        raise ConfigError(f"Failed to parse config file: {exc}") from exc

    errors = list(_VALIDATOR.iter_errors(raw))
    if errors:
        messages = "; ".join(
            f"{e.json_path or '(root)'}: {e.message}" for e in errors[:5]
        )
        raise ConfigError(f"Config validation failed: {messages}")

    data: dict[str, Any] = raw  # type: ignore[assignment]

    # Resolve output directory
    output: dict[str, Any] = dict(data["output"])
    output["directory"] = str((config_dir / output["directory"]).resolve())
    output.setdefault("diagramFileName", "architecture.arch.json")

    # Resolve repo paths and infer names
    repositories: list[dict[str, Any]] = []
    for entry in data["repositories"]:
        repo: dict[str, Any] = dict(entry)
        repo["path"] = str((config_dir / repo["path"]).resolve())
        if "name" not in repo:
            repo["name"] = Path(repo["path"]).name
        repositories.append(repo)

    # Apply analysis defaults
    raw_analysis: dict[str, Any] = dict(data.get("analysis") or {})
    analysis: dict[str, Any] = {
        "maxFilesPerRepo": int(raw_analysis.get("maxFilesPerRepo", 200)),
        "excludePatterns": list(raw_analysis.get("excludePatterns") or []),
        "forceRefresh": bool(raw_analysis.get("forceRefresh", False)),
        "concurrency": int(raw_analysis.get("concurrency", 3)),
    }

    systems: list[dict] = []
    for sg in data.get("systems") or []:
        systems.append({
            "name": sg["name"],
            "repositories": list(sg.get("repositories") or []),
        })

    return {
        "version": "1.0",
        "provider": dict(data["provider"]),
        "output": output,
        "analysis": analysis,
        "repositories": repositories,
        "systems": systems,
    }
