"""Tests for manifest_extractor."""
from __future__ import annotations

import json
from pathlib import Path

import yaml
import pytest

from llm_importer.extraction.manifest_extractor import extract_from_repo


class TestDockerCompose:
    def test_detects_postgres_image(self, tmp_path: Path) -> None:
        compose = {
            "version": "3",
            "services": {
                "app": {"image": "myapp:latest"},
                "db": {"image": "postgres:16"},
            },
        }
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        signals = extract_from_repo(tmp_path)
        types = {s.connection_type for s in signals}
        assert "database" in types
        services = {s.target_service for s in signals}
        assert any("PostgreSQL" in s for s in services)

    def test_detects_depends_on(self, tmp_path: Path) -> None:
        compose = {
            "services": {
                "api": {"image": "api:latest", "depends_on": ["worker"]},
                "worker": {"image": "worker:latest"},
            }
        }
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        signals = extract_from_repo(tmp_path)
        targets = {s.target_service for s in signals}
        assert "worker" in targets

    def test_detects_database_url_env_var(self, tmp_path: Path) -> None:
        compose = {
            "services": {
                "app": {
                    "image": "app:latest",
                    "environment": {"DATABASE_URL": "postgres://localhost/mydb"},
                }
            }
        }
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        signals = extract_from_repo(tmp_path)
        assert any(s.connection_type == "database" for s in signals)

    def test_detects_kafka_image(self, tmp_path: Path) -> None:
        compose = {"services": {"kafka": {"image": "confluentinc/cp-kafka:latest"}}}
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        signals = extract_from_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in signals)

    def test_ignores_missing_file(self, tmp_path: Path) -> None:
        signals = extract_from_repo(tmp_path)
        assert signals == []


class TestPackageJson:
    def test_detects_pg_dependency(self, tmp_path: Path) -> None:
        pkg = {"name": "api", "dependencies": {"pg": "^8.0.0", "express": "^4.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        signals = extract_from_repo(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in signals)

    def test_detects_kafka_dependency(self, tmp_path: Path) -> None:
        pkg = {"name": "api", "dependencies": {"kafkajs": "^2.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        signals = extract_from_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in signals)

    def test_ignores_unknown_dependencies(self, tmp_path: Path) -> None:
        pkg = {"name": "api", "dependencies": {"lodash": "^4.0.0", "dayjs": "^1.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        signals = extract_from_repo(tmp_path)
        assert signals == []


class TestRequirementsTxt:
    def test_detects_psycopg2(self, tmp_path: Path) -> None:
        (tmp_path / "requirements.txt").write_text("psycopg2-binary==2.9.9\nfastapi>=0.100\n")
        signals = extract_from_repo(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in signals)

    def test_detects_redis(self, tmp_path: Path) -> None:
        (tmp_path / "requirements.txt").write_text("redis==5.0.0\n")
        signals = extract_from_repo(tmp_path)
        assert any(s.connection_type == "database" and "Redis" in s.target_service for s in signals)

    def test_skips_comments(self, tmp_path: Path) -> None:
        (tmp_path / "requirements.txt").write_text("# psycopg2\nflask>=2.0\n")
        signals = extract_from_repo(tmp_path)
        assert signals == []

    def test_confidence_is_high_for_manifest(self, tmp_path: Path) -> None:
        (tmp_path / "requirements.txt").write_text("psycopg2==2.9\n")
        signals = extract_from_repo(tmp_path)
        assert all(s.confidence >= 0.85 for s in signals)
