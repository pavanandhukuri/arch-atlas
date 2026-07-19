"""Extract connection signals from deployment and dependency manifests."""
from __future__ import annotations

import json
import re
import tomllib
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import yaml

from .models import ExtractionSignal

# ── Per-language dependency maps ───────────────────────────────────────────────

_PYTHON_DEPS: dict[str, tuple[str, str, float]] = {
    "psycopg2": ("PostgreSQL", "database", 0.92),
    "psycopg2-binary": ("PostgreSQL", "database", 0.92),
    "asyncpg": ("PostgreSQL", "database", 0.92),
    "pymysql": ("MySQL", "database", 0.92),
    "aiomysql": ("MySQL", "database", 0.92),
    "pymongo": ("MongoDB", "database", 0.92),
    "motor": ("MongoDB", "database", 0.92),
    "redis": ("Redis", "database", 0.91),
    "aioredis": ("Redis", "database", 0.91),
    "elasticsearch": ("Elasticsearch", "database", 0.91),
    "kafka-python": ("Kafka", "kafka", 0.90),
    "confluent-kafka": ("Kafka", "kafka", 0.90),
    "aiokafka": ("Kafka", "kafka", 0.90),
    "pika": ("RabbitMQ", "queue", 0.90),
    "aio-pika": ("RabbitMQ", "queue", 0.90),
    "celery": ("Celery", "queue", 0.82),
    "boto3": ("AWS", "http", 0.78),
    "botocore": ("AWS", "http", 0.78),
}

_NODE_DEPS: dict[str, tuple[str, str, float]] = {
    "pg": ("PostgreSQL", "database", 0.92),
    "postgres": ("PostgreSQL", "database", 0.92),
    "mysql": ("MySQL", "database", 0.92),
    "mysql2": ("MySQL", "database", 0.92),
    "mongodb": ("MongoDB", "database", 0.92),
    "mongoose": ("MongoDB", "database", 0.92),
    "redis": ("Redis", "database", 0.91),
    "ioredis": ("Redis", "database", 0.91),
    "kafkajs": ("Kafka", "kafka", 0.90),
    "kafka-node": ("Kafka", "kafka", 0.90),
    "amqplib": ("RabbitMQ", "queue", 0.90),
    "amqp": ("RabbitMQ", "queue", 0.90),
    "aws-sdk": ("AWS", "http", 0.78),
    "@aws-sdk/client-s3": ("AWS S3", "http", 0.85),
    "stripe": ("Stripe", "http", 0.88),
    "sendgrid": ("SendGrid", "http", 0.88),
    "@sendgrid/mail": ("SendGrid", "http", 0.88),
    "twilio": ("Twilio", "http", 0.88),
}

_JAVA_DEPS: dict[str, tuple[str, str, float]] = {
    "spring-data-jpa": ("JPA Database", "database", 0.90),
    "spring-boot-starter-data-jpa": ("JPA Database", "database", 0.90),
    "spring-kafka": ("Kafka", "kafka", 0.92),
    "spring-boot-starter-data-redis": ("Redis", "database", 0.91),
    "spring-boot-starter-amqp": ("RabbitMQ", "queue", 0.91),
    "postgresql": ("PostgreSQL", "database", 0.91),
    "mysql-connector-java": ("MySQL", "database", 0.91),
    "mongodb-driver": ("MongoDB", "database", 0.91),
    "spring-boot-starter-data-mongodb": ("MongoDB", "database", 0.91),
    "grpc-stub": ("gRPC Service", "grpc", 0.90),
}

_GO_DEPS: dict[str, tuple[str, str, float]] = {
    "github.com/lib/pq": ("PostgreSQL", "database", 0.91),
    "github.com/jackc/pgx": ("PostgreSQL", "database", 0.91),
    "github.com/jackc/pgx/v4": ("PostgreSQL", "database", 0.91),
    "github.com/jackc/pgx/v5": ("PostgreSQL", "database", 0.91),
    "github.com/go-sql-driver/mysql": ("MySQL", "database", 0.91),
    "go.mongodb.org/mongo-driver": ("MongoDB", "database", 0.91),
    "github.com/go-redis/redis": ("Redis", "database", 0.91),
    "github.com/go-redis/redis/v8": ("Redis", "database", 0.91),
    "github.com/go-redis/redis/v9": ("Redis", "database", 0.91),
    "github.com/redis/go-redis/v9": ("Redis", "database", 0.91),
    "github.com/segmentio/kafka-go": ("Kafka", "kafka", 0.90),
    "github.com/IBM/sarama": ("Kafka", "kafka", 0.90),
    "github.com/Shopify/sarama": ("Kafka", "kafka", 0.90),
    "github.com/confluentinc/confluent-kafka-go": ("Kafka", "kafka", 0.90),
    "github.com/confluentinc/confluent-kafka-go/v2": ("Kafka", "kafka", 0.90),
    "github.com/rabbitmq/amqp091-go": ("RabbitMQ", "queue", 0.90),
    "github.com/streadway/amqp": ("RabbitMQ", "queue", 0.90),
    "github.com/elastic/go-elasticsearch": ("Elasticsearch", "database", 0.90),
    "github.com/elastic/go-elasticsearch/v8": ("Elasticsearch", "database", 0.90),
    "github.com/gocql/gocql": ("Cassandra", "database", 0.90),
    "google.golang.org/grpc": ("gRPC Service", "grpc", 0.88),
    "github.com/aws/aws-sdk-go": ("AWS", "http", 0.78),
    "github.com/aws/aws-sdk-go-v2": ("AWS", "http", 0.78),
}

# Applied to Docker Compose env var names AND config file keys (normalized to UPPER_SNAKE_CASE).
# Covers infrastructure that has no URL-scheme format (e.g. Kafka bootstrap-servers: "kafka:9092").
_ENV_VAR_PATTERNS: list[tuple[str, str, str, float]] = [
    (r"DATABASE_URL", "Database", "database", 0.95),
    (r"POSTGRES(?:_URL|_HOST|_DB|QL_URL)", "PostgreSQL", "database", 0.95),
    (r"MYSQL(?:_URL|_HOST)", "MySQL", "database", 0.95),
    (r"MONGO(?:DB)?(?:_URL|_HOST|_URI)", "MongoDB", "database", 0.95),
    (r"REDIS(?:_URL|_HOST)", "Redis", "database", 0.93),
    (r"KAFKA(?:_BROKER|_HOST|_BOOTSTRAP|_SERVERS)", "Kafka", "kafka", 0.93),
    (r"RABBITMQ(?:_URL|_HOST)", "RabbitMQ", "queue", 0.93),
    (r"AMQP(?:_URL|_HOST)", "RabbitMQ", "queue", 0.93),
    (r"ELASTICSEARCH(?:_URL|_HOST)", "Elasticsearch", "database", 0.91),
]

_SECURITY_EXCLUSIONS = {".env", ".env.local", ".env.production", ".env.staging", ".env.development"}

# ── Universal config-file scanner ─────────────────────────────────────────────
# Scans VALUES of any config file for connection string URL-scheme patterns.
# Language and framework agnostic — works for Spring, Quarkus, Go, Python, Node, etc.

_CONNECTION_STRING_PATTERNS: list[tuple[re.Pattern[str], str, str, float]] = [
    # JDBC patterns first — more specific, higher confidence
    (re.compile(r"jdbc:postgresql://", re.IGNORECASE), "PostgreSQL", "database", 0.97),
    (re.compile(r"jdbc:mysql://", re.IGNORECASE), "MySQL", "database", 0.97),
    (re.compile(r"jdbc:mariadb://", re.IGNORECASE), "MariaDB", "database", 0.97),
    (re.compile(r"jdbc:mongodb://", re.IGNORECASE), "MongoDB", "database", 0.97),
    # Universal DSN URL-scheme patterns (language/framework agnostic)
    (re.compile(r"postgres(?:ql)?://", re.IGNORECASE), "PostgreSQL", "database", 0.95),
    (re.compile(r"mysql://", re.IGNORECASE), "MySQL", "database", 0.95),
    (re.compile(r"mariadb://", re.IGNORECASE), "MariaDB", "database", 0.95),
    (re.compile(r"mongodb(?:\+srv)?://", re.IGNORECASE), "MongoDB", "database", 0.95),
    (re.compile(r"rediss?://", re.IGNORECASE), "Redis", "database", 0.95),
    (re.compile(r"amqps?://", re.IGNORECASE), "RabbitMQ", "queue", 0.95),
    (re.compile(r"elasticsearch://", re.IGNORECASE), "Elasticsearch", "database", 0.93),
    (re.compile(r"cassandra://", re.IGNORECASE), "Cassandra", "database", 0.93),
]

# Catches any other jdbc:driver:// not listed above
_JDBC_ANY_RE = re.compile(r"jdbc:([a-z]+)://", re.IGNORECASE)
_JDBC_DRIVER_MAP: dict[str, str] = {
    "postgresql": "PostgreSQL", "mysql": "MySQL", "mariadb": "MariaDB",
    "mongodb": "MongoDB", "oracle": "Oracle", "sqlserver": "SQL Server",
    "h2": "H2", "derby": "Derby", "sqlite": "SQLite",
}

_HTTP_VALUE_RE = re.compile(r"https?://([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?::[0-9]+)?)")
_LOCAL_ADDRESSES = frozenset({"localhost", "127.0.0.1", "0.0.0.0", "::1"})

# Domains that appear in config files but are never runtime architectural connections.
# Covers package registries, build tooling, documentation, and license scanners.
_NON_RUNTIME_DOMAINS = frozenset({
    # Package registries & build tooling
    "repo.maven.apache.org", "maven.apache.org", "repo1.maven.org",
    "plugins.gradle.org", "services.gradle.org",
    "registry.npmjs.org", "npmjs.com", "npmjs.org",
    "pypi.org", "files.pythonhosted.org",
    "crates.io", "static.crates.io",
    "pkg.go.dev", "proxy.golang.org", "sum.golang.org",
    "nuget.org", "api.nuget.org",
    # Documentation & specifications
    "docs.spring.io", "springframework.org",
    "openapi.org", "swagger.io",
    "json-schema.org",
    # Source control (dependency fetch, not runtime)
    "raw.githubusercontent.com",
    # License & security scanning
    "fossa.io", "snyk.io",
})

_CONFIG_EXTENSIONS = frozenset({
    ".yaml", ".yml", ".json", ".toml", ".properties", ".ini", ".conf", ".cfg",
})
_SKIP_CONFIG_NAMES = frozenset({
    "package-lock.json", "yarn.lock", "composer.lock",
    "tsconfig.json", "jsconfig.json",
    ".eslintrc.json", ".prettierrc.json", ".babelrc.json",
    "jest.config.json", "babel.config.json",
    "go.sum",
})
_SKIP_CONFIG_DIRS = frozenset({
    # Build and dependency artifacts
    "node_modules", ".git", "dist", "build", "target", "__pycache__",
    ".venv", "venv", ".tox", "vendor", "coverage", ".nyc_output", ".gradle",
    # CI/source-control metadata only — helm/k8s kept so Keycloak/service URLs in
    # env-values files are discovered; LLM consolidation handles env-variant noise.
    ".github", ".ci", ".circleci",
})
_ALREADY_HANDLED_NAMES = frozenset({
    "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
    "pom.xml", "package.json", "requirements.txt", "requirements-dev.txt",
    "pipfile", "pipfile.lock",
})
_MAX_CONFIG_SIZE = 200 * 1024
_KEY_NORM_RE = re.compile(r"[.\-/]")


# ── Public entry points ────────────────────────────────────────────────────────

def extract_from_repo(repo_path: Path) -> list[ExtractionSignal]:
    """Walk a repository and extract all manifest-based signals."""
    signals: list[ExtractionSignal] = []

    for manifest_file in _find_manifests(repo_path):
        rel = str(manifest_file.relative_to(repo_path))
        name = manifest_file.name.lower()
        if name in _SECURITY_EXCLUSIONS:
            continue
        try:
            if name in ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"):
                signals.extend(_parse_docker_compose(manifest_file, rel))
            elif name == "package.json":
                signals.extend(_parse_package_json(manifest_file, rel))
            elif name == "pom.xml":
                signals.extend(_parse_pom_xml(manifest_file, rel))
            elif name in ("requirements.txt", "requirements-dev.txt"):
                signals.extend(_parse_requirements_txt(manifest_file, rel))
            elif name in ("pipfile", "pipfile.lock"):
                signals.extend(_parse_pipfile(manifest_file, rel))
            elif name == "go.mod":
                signals.extend(_parse_go_mod(manifest_file, rel))
        except Exception:
            pass

    signals.extend(scan_config_files(repo_path))
    return signals


def scan_config_files(repo_path: Path) -> list[ExtractionSignal]:
    """Scan config files of any language/framework for connection strings.

    Detects connections by inspecting VALUES for URL-scheme patterns
    (postgres://, redis://, jdbc:postgresql://, etc.) and key names for
    infrastructure that has no URL-scheme format (Kafka bootstrap servers).
    Works across Spring, Quarkus, Micronaut, Go, Python, Node, and any
    other ecosystem that uses YAML/JSON/TOML/properties config files.
    """
    signals: list[ExtractionSignal] = []
    for path in _find_config_files(repo_path):
        rel = str(path.relative_to(repo_path))
        try:
            flat = _parse_to_flat(path)
            if flat:
                signals.extend(_extract_signals_from_flat(flat, rel))
        except Exception:
            pass
    return signals


# ── File discovery ─────────────────────────────────────────────────────────────

def _find_manifests(repo_path: Path) -> list[Path]:
    results: list[Path] = []
    manifest_names = {
        "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
        "package.json", "pom.xml", "requirements.txt", "requirements-dev.txt",
        "pipfile", "pipfile.lock", "go.mod",
    }
    for p in repo_path.rglob("*"):
        if p.is_file() and p.name.lower() in manifest_names:
            parts = p.relative_to(repo_path).parts
            if len(parts) <= 3 and "node_modules" not in parts and ".git" not in parts:
                results.append(p)
    return results


def _find_config_files(repo_path: Path) -> list[Path]:
    results: list[Path] = []
    for p in repo_path.rglob("*"):
        if not p.is_file():
            continue
        parts = p.relative_to(repo_path).parts
        if any(d in _SKIP_CONFIG_DIRS for d in parts):
            continue
        name = p.name.lower()
        if name in _SECURITY_EXCLUSIONS or name in _SKIP_CONFIG_NAMES or name in _ALREADY_HANDLED_NAMES:
            continue
        if p.suffix.lower() not in _CONFIG_EXTENSIONS:
            continue
        try:
            if p.stat().st_size > _MAX_CONFIG_SIZE:
                continue
        except OSError:
            continue
        results.append(p)
    return results


# ── Config file parsers ────────────────────────────────────────────────────────

def _parse_to_flat(path: Path) -> dict[str, str]:
    """Parse a config file of any format into a flat {dotted.key: value} dict."""
    suffix = path.suffix.lower()
    text = path.read_text(encoding="utf-8", errors="replace")

    if suffix in (".yaml", ".yml"):
        return _parse_yaml_flat(text)
    if suffix == ".json":
        return _parse_json_flat(text)
    if suffix == ".toml":
        return _parse_toml_flat(text)
    if suffix == ".properties" or name_lower(path).startswith(".env"):
        return _parse_properties_flat(text)
    # .ini / .conf / .cfg — try YAML first (common in Go/Rust apps), then key=value
    try:
        return _parse_yaml_flat(text)
    except Exception:
        return _parse_properties_flat(text)


def name_lower(path: Path) -> str:
    return path.name.lower()


def _flatten(data: Any, prefix: str = "") -> dict[str, str]:
    """Recursively flatten nested dicts/lists to dotted key paths."""
    result: dict[str, str] = {}
    if isinstance(data, dict):
        for k, v in data.items():
            child = f"{prefix}.{k}" if prefix else str(k)
            result.update(_flatten(v, child))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            child = f"{prefix}.{i}" if prefix else str(i)
            result.update(_flatten(v, child))
    elif data is not None:
        result[prefix] = str(data)
    return result


def _parse_yaml_flat(text: str) -> dict[str, str]:
    data = yaml.safe_load(text)
    return _flatten(data) if isinstance(data, (dict, list)) else {}


def _parse_json_flat(text: str) -> dict[str, str]:
    data = json.loads(text)
    return _flatten(data) if isinstance(data, (dict, list)) else {}


def _parse_toml_flat(text: str) -> dict[str, str]:
    return _flatten(tomllib.loads(text))


def _parse_properties_flat(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "!")):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
        elif ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
        else:
            continue
        result[k.strip()] = v.strip()
    return result


# ── Signal extraction from flat config ────────────────────────────────────────

def _extract_signals_from_flat(flat: dict[str, str], rel: str) -> list[ExtractionSignal]:
    """Extract connection signals from flattened config key-value pairs.

    Strategy:
      1. Scan values for URL-scheme connection strings (highest specificity).
      2. Scan values for HTTP service URLs.
      3. Scan normalised key names for infrastructure patterns (covers Kafka
         bootstrap-servers and similar cases where the value is host:port, not a URL).
    """
    signals: list[ExtractionSignal] = []
    seen: set[tuple[str, str]] = set()  # (target_service, conn_type) — dedup within file

    for key, raw_val in flat.items():
        val = str(raw_val).strip()
        if not val or len(val) > 500:
            continue

        # Step 1: URL-scheme connection strings
        matched = False
        for pat, label, conn_type, conf in _CONNECTION_STRING_PATTERNS:
            if pat.search(val):
                _add_signal(signals, seen, ExtractionSignal(
                    source_file=rel, line=1,
                    target_service=label,
                    connection_type=conn_type,
                    confidence=conf,
                    evidence_text=f"{key}={val[:80]}",
                ))
                matched = True
                break

        if matched:
            continue

        # Step 1b: Generic JDBC (driver not already in _CONNECTION_STRING_PATTERNS)
        m = _JDBC_ANY_RE.search(val)
        if m:
            driver = m.group(1).lower()
            label = _JDBC_DRIVER_MAP.get(driver, driver.capitalize())
            _add_signal(signals, seen, ExtractionSignal(
                source_file=rel, line=1,
                target_service=label,
                connection_type="database",
                confidence=0.95,
                evidence_text=f"{key}={val[:80]}",
            ))
            continue

        # Step 2: HTTP service URLs in values (skip local addresses and placeholders)
        if val.startswith(("http://", "https://")):
            m2 = _HTTP_VALUE_RE.match(val)
            if m2:
                host_port = m2.group(1)
                host = host_port.split(":")[0]
                if host not in _LOCAL_ADDRESSES and not host.startswith("$") and host not in _NON_RUNTIME_DOMAINS:
                    _add_signal(signals, seen, ExtractionSignal(
                        source_file=rel, line=1,
                        target_service=host,
                        connection_type="http",
                        confidence=0.75,  # lower than DSN — config URLs are often env-specific
                        evidence_text=f"{key}={val[:80]}",
                        target_address=host_port,
                    ))

    # Step 3: Key-name patterns for infrastructure without URL-scheme values
    for key, raw_val in flat.items():
        val = str(raw_val).strip()
        if not val:
            continue
        normalized = _KEY_NORM_RE.sub("_", key).upper()
        for env_pattern, label, conn_type, conf in _ENV_VAR_PATTERNS:
            if re.search(env_pattern, normalized):
                _add_signal(signals, seen, ExtractionSignal(
                    source_file=rel, line=1,
                    target_service=label,
                    connection_type=conn_type,
                    confidence=conf,
                    evidence_text=f"{key}={val[:80]}",
                ))
                break

    return signals


def _add_signal(
    signals: list[ExtractionSignal],
    seen: set[tuple[str, str]],
    sig: ExtractionSignal,
) -> None:
    key = (sig.target_service, sig.connection_type)
    if key not in seen:
        seen.add(key)
        signals.append(sig)


# ── Per-format manifest parsers ────────────────────────────────────────────────

def _parse_docker_compose(path: Path, rel: str) -> list[ExtractionSignal]:
    signals: list[ExtractionSignal] = []
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return signals

    services: dict[str, Any] = data.get("services", {}) or {}
    for svc_name, svc_cfg in services.items():
        if not isinstance(svc_cfg, dict):
            continue
        image: str = str(svc_cfg.get("image", "")).lower()
        infra = _image_to_infra(image)
        if infra:
            label, conn_type = infra
            signals.append(ExtractionSignal(
                source_file=rel, line=1,
                target_service=label,
                connection_type=conn_type,
                confidence=0.99,
                evidence_text=f"service '{svc_name}' image: {image}",
            ))

        depends = svc_cfg.get("depends_on") or []
        if isinstance(depends, dict):
            depends = list(depends.keys())
        for dep in (depends if isinstance(depends, list) else []):
            signals.append(ExtractionSignal(
                source_file=rel, line=1,
                target_service=str(dep),
                connection_type="http",
                confidence=0.93,
                evidence_text=f"service '{svc_name}' depends_on: {dep}",
            ))

        env = svc_cfg.get("environment") or {}
        if isinstance(env, list):
            env = dict(item.split("=", 1) if "=" in item else (item, "") for item in env)
        for key, val in (env.items() if isinstance(env, dict) else []):
            for pattern, label, conn_type, conf in _ENV_VAR_PATTERNS:
                if re.search(pattern, str(key), re.IGNORECASE):
                    signals.append(ExtractionSignal(
                        source_file=rel, line=1,
                        target_service=label,
                        connection_type=conn_type,
                        confidence=conf,
                        evidence_text=f"{key}={val or '...'} in service '{svc_name}'",
                        target_address=str(val) if val else None,
                    ))
                    break

    return signals


def _image_to_infra(image: str) -> tuple[str, str] | None:
    mappings = [
        ("postgres", "PostgreSQL", "database"),
        ("mysql", "MySQL", "database"),
        ("mariadb", "MariaDB", "database"),
        ("mongo", "MongoDB", "database"),
        ("redis", "Redis", "database"),
        ("kafka", "Kafka", "kafka"),
        ("zookeeper", "Zookeeper", "queue"),
        ("rabbitmq", "RabbitMQ", "queue"),
        ("elasticsearch", "Elasticsearch", "database"),
        ("cassandra", "Cassandra", "database"),
        ("influxdb", "InfluxDB", "database"),
    ]
    for key, label, conn_type in mappings:
        if key in image:
            return label, conn_type
    return None


def _parse_package_json(path: Path, rel: str) -> list[ExtractionSignal]:
    signals: list[ExtractionSignal] = []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return signals
    all_deps: dict[str, str] = {}
    all_deps.update(data.get("dependencies") or {})
    all_deps.update(data.get("peerDependencies") or {})
    for pkg in all_deps:
        info = _NODE_DEPS.get(pkg)
        if info:
            label, conn_type, conf = info
            signals.append(ExtractionSignal(
                source_file=rel, line=1,
                target_service=label,
                connection_type=conn_type,
                confidence=conf,
                evidence_text=f'dependency "{pkg}" in package.json',
            ))
    return signals


def _parse_pom_xml(path: Path, rel: str) -> list[ExtractionSignal]:
    signals: list[ExtractionSignal] = []
    tree = ET.parse(str(path))
    root = tree.getroot()
    ns = {"m": root.tag.split("}")[0].lstrip("{")} if "}" in root.tag else {}
    prefix = "{" + ns.get("m", "") + "}" if ns else ""
    for dep in root.iter(f"{prefix}dependency"):
        artifact_el = dep.find(f"{prefix}artifactId")
        if artifact_el is None or not artifact_el.text:
            continue
        artifact = artifact_el.text.strip()
        info = _JAVA_DEPS.get(artifact)
        if info:
            label, conn_type, conf = info
            signals.append(ExtractionSignal(
                source_file=rel, line=1,
                target_service=label,
                connection_type=conn_type,
                confidence=conf,
                evidence_text=f"Maven dependency: {artifact}",
            ))
    return signals


def _parse_requirements_txt(path: Path, rel: str) -> list[ExtractionSignal]:
    signals: list[ExtractionSignal] = []
    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        pkg = re.split(r"[>=<!;\[]", line)[0].strip().lower()
        info = _PYTHON_DEPS.get(pkg)
        if info:
            label, conn_type, conf = info
            signals.append(ExtractionSignal(
                source_file=rel, line=line_no,
                target_service=label,
                connection_type=conn_type,
                confidence=conf,
                evidence_text=f"{line} in requirements.txt",
            ))
    return signals


def _parse_pipfile(path: Path, rel: str) -> list[ExtractionSignal]:
    signals: list[ExtractionSignal] = []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception:
        return signals
    if not isinstance(data, dict):
        return signals
    packages: dict[str, Any] = {}
    packages.update(data.get("packages") or {})
    packages.update(data.get("dev-packages") or {})
    for pkg in packages:
        info = _PYTHON_DEPS.get(pkg.lower())
        if info:
            label, conn_type, conf = info
            signals.append(ExtractionSignal(
                source_file=rel, line=1,
                target_service=label,
                connection_type=conn_type,
                confidence=conf,
                evidence_text=f'"{pkg}" in Pipfile',
            ))
    return signals


def _parse_go_mod(path: Path, rel: str) -> list[ExtractionSignal]:
    """Parse go.mod for known infrastructure library imports (direct deps only)."""
    signals: list[ExtractionSignal] = []
    in_require = False
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("require ("):
            in_require = True
            continue
        if in_require and stripped == ")":
            in_require = False
            continue
        if not (in_require or stripped.startswith("require ")):
            continue
        if "// indirect" in stripped:
            continue
        module = stripped.replace("require ", "").split()[0] if stripped.split() else ""
        if not module:
            continue
        for dep_path, (label, conn_type, conf) in _GO_DEPS.items():
            if module == dep_path or module.startswith(dep_path + "/"):
                signals.append(ExtractionSignal(
                    source_file=rel, line=1,
                    target_service=label,
                    connection_type=conn_type,
                    confidence=conf,
                    evidence_text=f"go.mod dependency: {module}",
                ))
                break
    return signals
