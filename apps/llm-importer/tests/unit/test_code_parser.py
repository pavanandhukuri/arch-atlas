"""Tests for tree-sitter AST-based code_parser."""
from __future__ import annotations

from pathlib import Path

import pytest

from llm_importer.extraction.code_parser import scan_repo


# ── Python ────────────────────────────────────────────────────────────────────

class TestPythonHTTP:
    def test_requests_get_with_url(self, tmp_path: Path) -> None:
        (tmp_path / "client.py").write_text(
            "import requests\nresponse = requests.get('https://api.example.com/users')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "api.example.com" in s.target_service for s in sigs)

    def test_httpx_post_with_url(self, tmp_path: Path) -> None:
        (tmp_path / "client.py").write_text(
            "import httpx\nhttpx.post('https://payment-service/charge')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "payment-service" in s.target_service for s in sigs)

    def test_grpc_insecure_channel(self, tmp_path: Path) -> None:
        (tmp_path / "grpc_client.py").write_text(
            "import grpc\nchannel = grpc.insecure_channel('auth-service:50051')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "grpc" and "auth-service" in s.target_service for s in sigs)

    def test_constant_url_not_captured(self, tmp_path: Path) -> None:
        # URL in a constant — NOT a call argument — should not be a high-confidence signal
        (tmp_path / "config.py").write_text("BASE_URL = 'https://api.example.com'\n")
        sigs = scan_repo(tmp_path)
        assert not any(s.connection_type == "http" for s in sigs)


class TestPythonDatabase:
    def test_create_engine_with_dsn(self, tmp_path: Path) -> None:
        (tmp_path / "db.py").write_text(
            "from sqlalchemy import create_engine\n"
            "engine = create_engine('postgresql://localhost/mydb')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "PostgreSQL" for s in sigs)

    def test_psycopg2_connect(self, tmp_path: Path) -> None:
        (tmp_path / "db.py").write_text("import psycopg2\nconn = psycopg2.connect(host='db')\n")
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" for s in sigs)

    def test_redis_client(self, tmp_path: Path) -> None:
        (tmp_path / "cache.py").write_text(
            "import redis\nclient = redis.Redis(host='localhost', port=6379)\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "Redis" for s in sigs)

    def test_pymongo_client(self, tmp_path: Path) -> None:
        (tmp_path / "mongo.py").write_text(
            "import pymongo\nclient = pymongo.MongoClient('mongodb://localhost:27017')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "MongoDB" for s in sigs)


class TestPythonKafkaQueue:
    def test_kafka_producer(self, tmp_path: Path) -> None:
        (tmp_path / "events.py").write_text(
            "from kafka import KafkaProducer\np = KafkaProducer(bootstrap_servers=['kafka:9092'])\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in sigs)

    def test_pika_rabbitmq(self, tmp_path: Path) -> None:
        (tmp_path / "queue.py").write_text(
            "import pika\nconn = pika.BlockingConnection(pika.ConnectionParameters('localhost'))\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "queue" for s in sigs)


# ── Java ──────────────────────────────────────────────────────────────────────

class TestJavaAnnotations:
    def test_feign_client_name(self, tmp_path: Path) -> None:
        (tmp_path / "Client.java").write_text(
            '@FeignClient(name = "order-service")\npublic interface OrderClient {}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "order-service" and s.connection_type == "http" for s in sigs)

    def test_feign_client_value(self, tmp_path: Path) -> None:
        (tmp_path / "Client.java").write_text(
            '@FeignClient(value = "inventory-service")\npublic interface InventoryClient {}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "inventory-service" and s.connection_type == "http" for s in sigs)

    def test_kafka_listener_annotation(self, tmp_path: Path) -> None:
        (tmp_path / "Handler.java").write_text(
            'public class Handler {\n'
            '    @KafkaListener(topics = "orders")\n'
            '    void handle(String msg) {}\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "orders" and s.connection_type == "kafka" for s in sigs)

    def test_entity_annotation_signals_database(self, tmp_path: Path) -> None:
        (tmp_path / "Order.java").write_text(
            "@Entity\npublic class Order {\n    private Long id;\n}\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" for s in sigs)

    def test_repository_annotation_signals_database(self, tmp_path: Path) -> None:
        (tmp_path / "Repo.java").write_text(
            "@Repository\npublic interface OrderRepository {}\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" for s in sigs)


class TestJavaMethodCalls:
    def test_webclient_create(self, tmp_path: Path) -> None:
        (tmp_path / "Service.java").write_text(
            'public class Service {\n'
            '    void init() { WebClient.create("http://payment-service"); }\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "payment-service" in s.target_service for s in sigs)

    def test_kafka_template_send(self, tmp_path: Path) -> None:
        (tmp_path / "Publisher.java").write_text(
            'public class Publisher {\n'
            '    void publish() { kafkaTemplate.send("order-events", msg); }\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "order-events" and s.connection_type == "kafka" for s in sigs)

    def test_driver_manager_get_connection(self, tmp_path: Path) -> None:
        (tmp_path / "Repo.java").write_text(
            'public class Repo {\n'
            '    void connect() throws Exception {\n'
            '        DriverManager.getConnection("jdbc:postgresql://db:5432/shop");\n'
            '    }\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "PostgreSQL" for s in sigs)

    def test_managed_channel_builder(self, tmp_path: Path) -> None:
        (tmp_path / "GrpcClient.java").write_text(
            'public class GrpcClient {\n'
            '    void connect() {\n'
            '        ManagedChannelBuilder.forAddress("auth-service", 50051);\n'
            '    }\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "grpc" and "auth-service" in s.target_service for s in sigs)


# ── Go ────────────────────────────────────────────────────────────────────────

class TestGoPatterns:
    def test_http_get_with_url(self, tmp_path: Path) -> None:
        (tmp_path / "client.go").write_text(
            'package main\nimport "net/http"\n'
            'func fetch() { http.Get("http://order-service/api") }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "order-service" in s.target_service for s in sigs)

    def test_grpc_dial(self, tmp_path: Path) -> None:
        (tmp_path / "grpc.go").write_text(
            'package main\nimport "google.golang.org/grpc"\n'
            'func connect() { grpc.Dial("auth-service:50051") }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "grpc" and "auth-service" in s.target_service for s in sigs)

    def test_sql_open_postgres(self, tmp_path: Path) -> None:
        (tmp_path / "db.go").write_text(
            'package main\nimport "database/sql"\n'
            'func connect() { sql.Open("postgres", "postgres://localhost/mydb") }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "PostgreSQL" for s in sigs)

    def test_redis_new_client(self, tmp_path: Path) -> None:
        (tmp_path / "cache.go").write_text(
            'package main\n'
            'func connect() { redis.NewClient(&redis.Options{Addr: "localhost:6379"}) }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "Redis" for s in sigs)

    def test_kafka_new_writer(self, tmp_path: Path) -> None:
        (tmp_path / "producer.go").write_text(
            'package main\n'
            'func produce() { kafka.NewWriter(kafka.WriterConfig{}) }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in sigs)

    def test_amqp_dial(self, tmp_path: Path) -> None:
        (tmp_path / "mq.go").write_text(
            'package main\n'
            'func connect() { conn, _ := amqp.Dial("amqp://guest:guest@localhost:5672/") }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "queue" and s.target_service == "RabbitMQ" for s in sigs)


# ── Kotlin ────────────────────────────────────────────────────────────────────

class TestKotlinPatterns:
    def test_http_call_in_function_body_detected(self, tmp_path: Path) -> None:
        (tmp_path / "Service.kt").write_text(
            'fun fetchData() {\n'
            '    client.get("https://api-service/data")\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "api-service" in s.target_service for s in sigs)

    def test_enum_entry_urls_not_captured(self, tmp_path: Path) -> None:
        (tmp_path / "Environment.kt").write_text(
            'enum class Env(val url: String) {\n'
            '    DEV("https://api.dev.example.com"),\n'
            '    QA("https://api.qa.example.com"),\n'
            '    PROD("https://api.example.com")\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        # Enum constructor args must NOT be picked up as HTTP signals
        assert not any(s.connection_type == "http" for s in sigs)

    def test_enum_urls_ignored_while_function_calls_kept(self, tmp_path: Path) -> None:
        (tmp_path / "Client.kt").write_text(
            'enum class Env(val url: String) {\n'
            '    DEV("https://api.dev.example.com"),\n'
            '    PROD("https://api.example.com")\n'
            '}\n'
            'fun call() {\n'
            '    httpClient.get("https://other-service/resource")\n'
            '}\n'
        )
        sigs = scan_repo(tmp_path)
        http_sigs = [s for s in sigs if s.connection_type == "http"]
        # Only the function-body call, NOT the 2 enum entries
        assert len(http_sigs) == 1
        assert "other-service" in http_sigs[0].target_service


# ── JavaScript / TypeScript ───────────────────────────────────────────────────

class TestJavaScriptPatterns:
    def test_axios_get_with_url(self, tmp_path: Path) -> None:
        (tmp_path / "api.js").write_text(
            "import axios from 'axios';\nawait axios.get('https://api.payments.com/charge');\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "api.payments.com" in s.target_service for s in sigs)

    def test_fetch_with_url(self, tmp_path: Path) -> None:
        (tmp_path / "api.js").write_text(
            "const res = await fetch('https://notifications.internal/send');\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "notifications.internal" in s.target_service for s in sigs)

    def test_mongoose_connect(self, tmp_path: Path) -> None:
        (tmp_path / "db.js").write_text(
            "const mongoose = require('mongoose');\nmongoose.connect('mongodb://localhost/mydb');\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "database" and s.target_service == "MongoDB" for s in sigs)

    def test_new_kafka(self, tmp_path: Path) -> None:
        (tmp_path / "producer.js").write_text(
            "const { Kafka } = require('kafkajs');\nconst kafka = new Kafka({});\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "kafka" for s in sigs)


class TestTypeScriptPatterns:
    def test_axios_in_ts_file(self, tmp_path: Path) -> None:
        (tmp_path / "service.ts").write_text(
            "import axios from 'axios';\nconst data = await axios.get('https://user-service/api');\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.connection_type == "http" and "user-service" in s.target_service for s in sigs)


# ── Exclusions ────────────────────────────────────────────────────────────────

class TestExclusions:
    def test_skips_node_modules(self, tmp_path: Path) -> None:
        nm = tmp_path / "node_modules" / "some-lib"
        nm.mkdir(parents=True)
        (nm / "index.js").write_text("axios.get('https://api.example.com')")
        assert scan_repo(tmp_path) == []

    def test_skips_git_directory(self, tmp_path: Path) -> None:
        git_dir = tmp_path / ".git" / "hooks"
        git_dir.mkdir(parents=True)
        (git_dir / "pre-commit").write_text("requests.get('https://example.com')")
        assert scan_repo(tmp_path) == []

    def test_skips_binary_extensions(self, tmp_path: Path) -> None:
        (tmp_path / "image.pyc").write_bytes(b"\x00\x01\x02")
        assert scan_repo(tmp_path) == []

    def test_skips_helm_charts(self, tmp_path: Path) -> None:
        helm = tmp_path / "helm" / "templates"
        helm.mkdir(parents=True)
        (helm / "values.yaml").write_text("db: postgres://prod-db:5432/mydb\n")
        assert scan_repo(tmp_path) == []

    def test_no_duplicate_signals_same_line(self, tmp_path: Path) -> None:
        (tmp_path / "client.py").write_text(
            "import requests\nrequests.get('https://api.example.com')\n"
        )
        sigs = scan_repo(tmp_path)
        targets = [(s.source_file, s.line, s.target_service) for s in sigs]
        assert len(targets) == len(set(targets))

    def test_confidence_in_range(self, tmp_path: Path) -> None:
        (tmp_path / "main.py").write_text(
            "import requests\nrequests.get('https://example.com')\n"
            "import redis\nredis.Redis(host='localhost')\n"
        )
        sigs = scan_repo(tmp_path)
        for s in sigs:
            assert 0.0 <= s.confidence <= 1.0


# ── DSN parsing ───────────────────────────────────────────────────────────────

class TestDSNParsing:
    def test_jdbc_postgresql_resolved(self, tmp_path: Path) -> None:
        (tmp_path / "db.py").write_text(
            "create_engine('postgresql+psycopg2://user:pass@db:5432/shop')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "PostgreSQL" for s in sigs)

    def test_mysql_dsn_resolved(self, tmp_path: Path) -> None:
        (tmp_path / "db.py").write_text(
            "create_engine('mysql://user:pass@db:3306/shop')\n"
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "MySQL" for s in sigs)

    def test_go_sql_open_driver_resolved(self, tmp_path: Path) -> None:
        (tmp_path / "db.go").write_text(
            'package main\nfunc connect() { sql.Open("mysql", "user:pass@/dbname") }\n'
        )
        sigs = scan_repo(tmp_path)
        assert any(s.target_service == "MySQL" for s in sigs)
