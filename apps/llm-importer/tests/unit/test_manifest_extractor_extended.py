"""Tests for universal config scanner, go.mod parsing, and existing manifest parsers."""
from __future__ import annotations

import json
from pathlib import Path

import yaml
import pytest

from llm_importer.extraction.manifest_extractor import (
    extract_from_repo,
    scan_config_files,
    _parse_go_mod,
    _extract_signals_from_flat,
    _parse_yaml_flat,
    _parse_json_flat,
    _parse_toml_flat,
    _parse_properties_flat,
)


# ── Universal config scanner: value-based URL detection ───────────────────────

class TestConnectionStringValues:
    def test_postgres_dsn_in_yaml(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("database_url: postgres://db:5432/mydb\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "PostgreSQL" and s.connection_type == "database" for s in sigs)

    def test_jdbc_url_plain_in_yaml(self, tmp_path: Path) -> None:
        (tmp_path / "application.yaml").write_text(
            "spring:\n  datasource:\n    url: jdbc:postgresql://db-host:5432/mydb\n"
        )
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "PostgreSQL" and s.confidence >= 0.97 for s in sigs)

    def test_jdbc_url_with_spring_placeholders(self, tmp_path: Path) -> None:
        (tmp_path / "application.yaml").write_text(
            "spring:\n  datasource:\n    url: jdbc:postgresql://${POSTGRES_HOST:localhost}:5432/db\n"
        )
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)

    def test_mysql_dsn_in_json(self, tmp_path: Path) -> None:
        (tmp_path / "config.json").write_text(json.dumps({"db": {"url": "mysql://root@mysql:3306/shop"}}))
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "MySQL" for s in sigs)

    def test_mongodb_dsn_in_toml(self, tmp_path: Path) -> None:
        (tmp_path / "config.toml").write_text('[db]\nurl = "mongodb://mongo:27017/mydb"\n')
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "MongoDB" for s in sigs)

    def test_redis_dsn_in_properties(self, tmp_path: Path) -> None:
        (tmp_path / "application.properties").write_text("redis.url=redis://cache:6379\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "Redis" for s in sigs)

    def test_rabbitmq_amqp_dsn(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("broker_url: amqp://guest:guest@rabbitmq:5672/\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "RabbitMQ" and s.connection_type == "queue" for s in sigs)

    def test_mongodb_srv_dsn(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("mongo_uri: mongodb+srv://user:pass@cluster.mongodb.net/db\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "MongoDB" for s in sigs)

    def test_quarkus_style_datasource_url(self, tmp_path: Path) -> None:
        (tmp_path / "application.properties").write_text(
            "quarkus.datasource.jdbc.url=jdbc:postgresql://db:5432/orders\n"
        )
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)

    def test_generic_jdbc_oracle(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("jdbc_url: jdbc:oracle://ora-host:1521/SID\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "Oracle" for s in sigs)


class TestHttpServiceUrlValues:
    def test_internal_service_url_detected(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text(
            "notification:\n  base_url: http://notification-service:8080\n"
        )
        sigs = scan_config_files(tmp_path)
        assert any(s.connection_type == "http" and "notification-service" in s.target_service for s in sigs)

    def test_localhost_url_ignored(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("service_url: http://localhost:8080/api\n")
        sigs = scan_config_files(tmp_path)
        assert not any(s.connection_type == "http" for s in sigs)

    def test_127_0_0_1_ignored(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("db_url: http://127.0.0.1:5432\n")
        sigs = scan_config_files(tmp_path)
        assert not any(s.connection_type == "http" for s in sigs)


class TestKeyNameFallback:
    def test_kafka_bootstrap_servers_key(self, tmp_path: Path) -> None:
        # Kafka bootstrap-servers value is host:port — no URL scheme
        (tmp_path / "config.yaml").write_text(
            "spring:\n  kafka:\n    bootstrap-servers: kafka-broker:9092\n"
        )
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "Kafka" and s.connection_type == "kafka" for s in sigs)

    def test_kafka_bootstrap_servers_properties(self, tmp_path: Path) -> None:
        (tmp_path / "application.properties").write_text(
            "kafka.bootstrap.servers=kafka1:9092,kafka2:9092\n"
        )
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "Kafka" for s in sigs)

    def test_redis_host_key(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("redis_host: redis-server\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "Redis" for s in sigs)

    def test_postgres_host_key(self, tmp_path: Path) -> None:
        (tmp_path / "config.yaml").write_text("POSTGRES_HOST: db-server\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)

    def test_no_duplicate_within_file(self, tmp_path: Path) -> None:
        # Both value (postgres://) AND key (POSTGRES_HOST) match — only one signal emitted
        (tmp_path / "config.yaml").write_text(
            "postgres_host: db\ndb_url: postgres://db:5432/mydb\n"
        )
        sigs = scan_config_files(tmp_path)
        db_sigs = [s for s in sigs if s.target_service == "PostgreSQL"]
        assert len(db_sigs) == 1


class TestFileDiscovery:
    def test_skips_node_modules(self, tmp_path: Path) -> None:
        nm = tmp_path / "node_modules" / "some-pkg"
        nm.mkdir(parents=True)
        (nm / "config.yaml").write_text("db: postgres://host/db\n")
        sigs = scan_config_files(tmp_path)
        assert not sigs

    def test_skips_large_files(self, tmp_path: Path) -> None:
        big = tmp_path / "config.yaml"
        big.write_bytes(b"x" * (201 * 1024))
        sigs = scan_config_files(tmp_path)
        assert not sigs

    def test_skips_package_lock_json(self, tmp_path: Path) -> None:
        (tmp_path / "package-lock.json").write_text(json.dumps({"db": "postgres://host/db"}))
        sigs = scan_config_files(tmp_path)
        assert not sigs

    def test_finds_nested_config(self, tmp_path: Path) -> None:
        nested = tmp_path / "src" / "main" / "resources"
        nested.mkdir(parents=True)
        (nested / "application.yaml").write_text("spring:\n  datasource:\n    url: jdbc:postgresql://db/app\n")
        sigs = scan_config_files(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)


# ── Go module parsing ──────────────────────────────────────────────────────────

class TestGoModParsing:
    def _make_go_mod(self, tmp_path: Path, content: str) -> Path:
        p = tmp_path / "go.mod"
        p.write_text(content)
        return p

    def test_detects_postgresql_pgx(self, tmp_path: Path) -> None:
        p = self._make_go_mod(tmp_path, (
            "module github.com/example/svc\ngo 1.21\n"
            "require (\n    github.com/jackc/pgx/v5 v5.4.3\n)\n"
        ))
        sigs = _parse_go_mod(p, "go.mod")
        assert any(s.target_service == "PostgreSQL" for s in sigs)

    def test_detects_postgresql_lib_pq(self, tmp_path: Path) -> None:
        p = self._make_go_mod(tmp_path, (
            "module example.com/app\ngo 1.21\n"
            "require github.com/lib/pq v1.10.9\n"
        ))
        sigs = _parse_go_mod(p, "go.mod")
        assert any(s.target_service == "PostgreSQL" for s in sigs)

    def test_detects_mongodb(self, tmp_path: Path) -> None:
        p = self._make_go_mod(tmp_path, (
            "module example.com/app\ngo 1.21\n"
            "require go.mongodb.org/mongo-driver v1.12.0\n"
        ))
        sigs = _parse_go_mod(p, "go.mod")
        assert any(s.target_service == "MongoDB" for s in sigs)

    def test_detects_kafka(self, tmp_path: Path) -> None:
        p = self._make_go_mod(tmp_path, (
            "module example.com/app\ngo 1.21\n"
            "require (\n    github.com/segmentio/kafka-go v0.4.43\n)\n"
        ))
        sigs = _parse_go_mod(p, "go.mod")
        assert any(s.target_service == "Kafka" for s in sigs)

    def test_detects_redis(self, tmp_path: Path) -> None:
        p = self._make_go_mod(tmp_path, (
            "module example.com/app\ngo 1.21\n"
            "require github.com/redis/go-redis/v9 v9.2.0\n"
        ))
        sigs = _parse_go_mod(p, "go.mod")
        assert any(s.target_service == "Redis" for s in sigs)

    def test_skips_indirect_deps(self, tmp_path: Path) -> None:
        p = self._make_go_mod(tmp_path, (
            "module example.com/app\ngo 1.21\n"
            "require (\n    github.com/lib/pq v1.10.9 // indirect\n)\n"
        ))
        sigs = _parse_go_mod(p, "go.mod")
        assert not any(s.target_service == "PostgreSQL" for s in sigs)

    def test_go_mod_picked_up_by_extract_from_repo(self, tmp_path: Path) -> None:
        (tmp_path / "go.mod").write_text(
            "module example.com/app\ngo 1.21\nrequire github.com/lib/pq v1.10.9\n"
        )
        sigs = extract_from_repo(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)


# ── Existing manifest parsers (unchanged behaviour) ───────────────────────────

class TestPomXml:
    def test_detects_spring_kafka(self, tmp_path: Path) -> None:
        pom = """<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <dependencies>
    <dependency><artifactId>spring-kafka</artifactId></dependency>
  </dependencies>
</project>"""
        (tmp_path / "pom.xml").write_text(pom)
        sigs = extract_from_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in sigs)

    def test_detects_postgresql_driver(self, tmp_path: Path) -> None:
        pom = """<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <dependencies>
    <dependency><artifactId>postgresql</artifactId></dependency>
  </dependencies>
</project>"""
        (tmp_path / "pom.xml").write_text(pom)
        sigs = extract_from_repo(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)


class TestDockerComposeEnvList:
    def test_env_as_list_format(self, tmp_path: Path) -> None:
        compose = {
            "services": {
                "app": {
                    "image": "app:latest",
                    "environment": ["REDIS_URL=redis://localhost:6379", "PORT=8080"],
                }
            }
        }
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        sigs = extract_from_repo(tmp_path)
        assert any(s.connection_type == "database" for s in sigs)

    def test_depends_on_dict_format(self, tmp_path: Path) -> None:
        compose = {
            "services": {
                "app": {"image": "app:latest", "depends_on": {"db": {"condition": "service_healthy"}}},
                "db": {"image": "postgres:latest"},
            }
        }
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        sigs = extract_from_repo(tmp_path)
        assert len(sigs) >= 1

    def test_detects_kafka_env_var(self, tmp_path: Path) -> None:
        compose = {
            "services": {
                "app": {"image": "app:latest", "environment": {"KAFKA_BROKER": "kafka:9092"}}
            }
        }
        (tmp_path / "docker-compose.yml").write_text(yaml.dump(compose))
        sigs = extract_from_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in sigs)


class TestNodeExternalServices:
    def test_detects_stripe(self, tmp_path: Path) -> None:
        pkg = {"name": "api", "dependencies": {"stripe": "^13.0.0"}}
        (tmp_path / "package.json").write_text(json.dumps(pkg))
        sigs = extract_from_repo(tmp_path)
        assert any("Stripe" in s.target_service for s in sigs)
