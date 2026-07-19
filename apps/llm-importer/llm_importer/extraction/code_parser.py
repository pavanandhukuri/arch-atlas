"""AST-based source code scanner using tree-sitter for precise connection detection.

Tree-sitter parses source files into a real AST, so signals are only extracted
from *call expression* contexts (runtime connections), not from constant
declarations, enum entries, comments, or config data classes.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .models import ExtractionSignal

# ── Excluded directories / extensions ────────────────────────────────────────

_EXCLUDED_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__",
    ".venv", "venv", ".tox", "coverage",
    "helm", "charts", "k8s", "kubernetes", "deploy", "deployments",
    "infra", "infrastructure", "ops", ".github", ".ci", ".circleci",
}
_EXCLUDED_EXTS = {
    ".pyc", ".class", ".jar", ".so", ".dylib", ".dll", ".exe",
    ".png", ".jpg", ".gif", ".svg", ".ico", ".woff", ".ttf",
    ".eot", ".min.js", ".min.css",
}

_LANG_EXTENSIONS: dict[str, str] = {
    ".py": "python",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".rb": "ruby",
    ".cs": "csharp",
}

# ── tree-sitter initialisation (lazy, graceful) ───────────────────────────────

_PARSERS: dict[str, Any] = {}
_LANGUAGES: dict[str, Any] = {}
_TS_READY = False


def _init_ts() -> None:
    global _TS_READY
    if _TS_READY:
        return
    _TS_READY = True
    try:
        from tree_sitter import Language, Parser  # type: ignore[import]
    except ImportError:
        return

    _grammar_specs = [
        ("python",     "tree_sitter_python",     "language"),
        ("java",       "tree_sitter_java",        "language"),
        ("javascript", "tree_sitter_javascript",  "language"),
        ("go",         "tree_sitter_go",          "language"),
        ("kotlin",     "tree_sitter_kotlin",      "language"),
    ]
    for lang, module_name, func_name in _grammar_specs:
        try:
            import importlib
            mod = importlib.import_module(module_name)
            lang_obj = Language(getattr(mod, func_name)())
            _LANGUAGES[lang] = lang_obj
            _PARSERS[lang] = Parser(lang_obj)
        except Exception:
            pass

    # TypeScript — dedicated grammar or fall back to JS
    try:
        import tree_sitter_typescript as tsts  # type: ignore[import]
        ts_lang = Language(tsts.language_typescript())
        _LANGUAGES["typescript"] = ts_lang
        _PARSERS["typescript"] = Parser(ts_lang)
    except Exception:
        if "javascript" in _PARSERS:
            _PARSERS["typescript"] = _PARSERS["javascript"]
            _LANGUAGES["typescript"] = _LANGUAGES["javascript"]


# ── String extraction ─────────────────────────────────────────────────────────

def _str(node: Any) -> str | None:
    """Extract the raw string value from any language's string literal node."""
    for child in node.children:
        if child.type in (
            "string_content",                       # Kotlin, Python
            "string_fragment",                      # Java
            "interpreted_string_literal_content",   # Go
        ):
            return child.text.decode("utf-8", errors="replace")
    text = node.text.decode("utf-8", errors="replace").strip()
    if len(text) >= 2 and text[0] in ('"', "'", "`") and text[-1] == text[0]:
        return text[1:-1]
    return text or None


# ── Per-language signal extraction ────────────────────────────────────────────

# ── Python ────────────────────────────────────────────────────────────────────

# obj.method(arg, ...) where arg may be a string
_PY_Q_ATTR_CALL = """
(call
  function: (attribute
    object: (identifier) @obj
    attribute: (identifier) @method)
  arguments: (argument_list . [(string) @arg]?))
"""

# func(arg, ...) bare identifier call
_PY_Q_FUNC_CALL = """
(call
  function: (identifier) @func
  arguments: (argument_list . [(string) @arg]?))
"""

# HTTP clients: pkg → {methods}
_PY_HTTP: dict[str, set[str]] = {
    "requests": {"get", "post", "put", "delete", "patch", "head", "request"},
    "httpx":    {"get", "post", "put", "delete", "patch", "request"},
    "urllib":   {"urlopen"},
    "aiohttp":  {"get", "post", "put", "delete", "patch", "request"},
}
# DB clients: pkg → {methods}
_PY_DB: dict[str, set[str]] = {
    "psycopg2":      {"connect"},
    "psycopg":       {"connect"},
    "pymysql":       {"connect"},
    "pymongo":       {"MongoClient"},
    "motor":         {"AsyncIOMotorClient"},
    "redis":         {"Redis", "StrictRedis", "from_url"},
    "elasticsearch": {"Elasticsearch"},
    "cassandra":     {"Cluster"},
    "aiomysql":      {"connect"},
    "asyncpg":       {"connect", "create_pool"},
}
# Kafka clients
_PY_KAFKA_FUNCS = {"KafkaProducer", "KafkaConsumer", "AIOKafkaProducer", "AIOKafkaConsumer"}
# Queue clients
_PY_QUEUE: dict[str, set[str]] = {
    "pika":     {"BlockingConnection", "SelectConnection"},
    "aio_pika": {"connect", "connect_robust"},
}
# gRPC
_PY_GRPC_METHODS = {"insecure_channel", "secure_channel"}

# SQLAlchemy / DSN funcs
_PY_DSN_FUNCS = {"create_engine", "create_async_engine"}


def _py_signals(source: bytes, rel: str) -> list[ExtractionSignal]:
    from tree_sitter import Query  # type: ignore[import]
    parser = _PARSERS["python"]
    lang = _LANGUAGES["python"]
    tree = parser.parse(source)
    out: list[ExtractionSignal] = []

    def _add(line: int, target: str, conn: str, conf: float, evidence: str) -> None:
        out.append(ExtractionSignal(
            source_file=rel, line=line,
            target_service=target, connection_type=conn,
            confidence=conf, evidence_text=evidence[:120],
            target_address=target if conn == "http" and target.startswith("http") else None,
            topic=target if conn in ("kafka", "queue") and not target.startswith("http") else None,
        ))

    # obj.method(arg?) calls
    for _, cap in Query(lang, _PY_Q_ATTR_CALL).matches(tree.root_node):
        obj_nodes = cap.get("obj", [])
        mth_nodes = cap.get("method", [])
        arg_nodes = cap.get("arg", [])
        if not obj_nodes:
            continue
        obj = obj_nodes[0].text.decode()
        mth = mth_nodes[0].text.decode() if mth_nodes else ""
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = obj_nodes[0].start_point[0] + 1
        ev = obj_nodes[0].text.decode() + "." + mth + "(...)"

        if obj in _PY_HTTP and mth in _PY_HTTP[obj]:
            target = _hostname(arg_val) if arg_val and arg_val.startswith("http") else "HTTP Service"
            _add(line, target, "http", 0.87 if arg_val else 0.75, ev)
        elif obj in _PY_DB and mth in _PY_DB[obj]:
            target = _db_target_from_dsn(arg_val) if arg_val else _db_name_from_pkg(obj)
            _add(line, target, "database", 0.92 if arg_val else 0.88, ev)
        elif obj == "grpc" and mth in _PY_GRPC_METHODS:
            _add(line, arg_val or "gRPC Service", "grpc", 0.91 if arg_val else 0.80, ev)
        elif obj in _PY_QUEUE and mth in _PY_QUEUE[obj]:
            _add(line, "RabbitMQ", "queue", 0.90, ev)
        elif obj == "producer" and mth == "produce" and arg_val:
            _add(line, arg_val, "kafka", 0.91, ev)
        elif obj == "consumer" and mth == "subscribe" and arg_val:
            _add(line, arg_val, "kafka", 0.91, ev)

    # func(arg?) bare calls
    for _, cap in Query(lang, _PY_Q_FUNC_CALL).matches(tree.root_node):
        func_nodes = cap.get("func", [])
        arg_nodes = cap.get("arg", [])
        if not func_nodes:
            continue
        func = func_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = func_nodes[0].start_point[0] + 1
        ev = func + "(...)"

        if func in _PY_DSN_FUNCS and arg_val:
            target = _db_target_from_dsn(arg_val)
            _add(line, target, "database", 0.92, ev)
        elif func in _PY_KAFKA_FUNCS:
            _add(line, "Kafka", "kafka", 0.90, ev)
        elif func in {"KafkaProducer", "AIOKafkaProducer"}:
            _add(line, "Kafka", "kafka", 0.90, ev)

    return out


# ── Java ──────────────────────────────────────────────────────────────────────

_JAVA_Q_ANNOTATION = """
(annotation
  name: (identifier) @ann
  arguments: (annotation_argument_list
    (element_value_pair
      key: (identifier) @key
      value: (string_literal) @val)))
"""

_JAVA_Q_SIMPLE_ANN = """
(marker_annotation name: (identifier) @ann)
"""

_JAVA_Q_METHOD_CALL = """
(method_invocation
  object: (identifier) @obj
  name: (identifier) @method
  arguments: (argument_list . (string_literal) @arg))
"""

_JAVA_Q_STATIC_CALL = """
(method_invocation
  name: (identifier) @method
  arguments: (argument_list . (string_literal) @arg))
"""

_JAVA_TYPE_REFS = {
    "KafkaTemplate":   ("Kafka",    "kafka",    0.88),
    "RabbitTemplate":  ("RabbitMQ", "queue",    0.88),
    "RestTemplate":    ("HTTP Service", "http", 0.80),
}

_JAVA_SIMPLE_ANNS = {
    "@Entity":      ("Database", "database", 0.82),
    "@Repository":  ("Database", "database", 0.82),
    # @RestController / @Controller mark inbound endpoints, not outbound calls — omitted.
}

# Field/parameter declarations of known HTTP client types signal outbound HTTP calls.
_JAVA_HTTP_CLIENT_TYPES = frozenset({
    "WebClient", "RestTemplate", "RestClient",
    "OkHttpClient", "HttpClient", "AsyncHttpClient",
    "Retrofit", "FeignClient",
})

_JAVA_Q_FIELD_DECL = """
(field_declaration
  type: (type_identifier) @type)
"""


def _java_signals(source: bytes, rel: str) -> list[ExtractionSignal]:
    from tree_sitter import Query  # type: ignore[import]
    parser = _PARSERS["java"]
    lang = _LANGUAGES["java"]
    tree = parser.parse(source)
    out: list[ExtractionSignal] = []

    def _add(line: int, target: str, conn: str, conf: float, evidence: str) -> None:
        out.append(ExtractionSignal(
            source_file=rel, line=line,
            target_service=target, connection_type=conn,
            confidence=conf, evidence_text=evidence[:120],
            target_address=target if conn == "http" and target.startswith("http") else None,
            topic=target if conn in ("kafka", "queue") and not target.startswith("http") else None,
        ))

    # Key-value annotations: @FeignClient(name="svc"), @KafkaListener(topics="t")
    for _, cap in Query(lang, _JAVA_Q_ANNOTATION).matches(tree.root_node):
        ann = cap.get("ann", [])
        key_nodes = cap.get("key", [])
        val_nodes = cap.get("val", [])
        if not ann or not val_nodes:
            continue
        ann_name = ann[0].text.decode()
        key = key_nodes[0].text.decode() if key_nodes else ""
        val = _str(val_nodes[0]) or ""
        line = ann[0].start_point[0] + 1
        ev = f"@{ann_name}({key}={repr(val)})"

        if ann_name == "FeignClient" and key in ("name", "value", ""):
            _add(line, val, "http", 0.97, ev)
        elif ann_name == "KafkaListener" and key in ("topics", "value"):
            _add(line, val, "kafka", 0.95, ev)
        elif ann_name == "RabbitListener" and key in ("queues", "value"):
            _add(line, val, "queue", 0.90, ev)

    # Simple annotations: @Entity, @Repository
    for _, cap in Query(lang, _JAVA_Q_SIMPLE_ANN).matches(tree.root_node):
        ann_nodes = cap.get("ann", [])
        if not ann_nodes:
            continue
        ann_name = "@" + ann_nodes[0].text.decode()
        line = ann_nodes[0].start_point[0] + 1
        if ann_name in _JAVA_SIMPLE_ANNS:
            target, conn, conf = _JAVA_SIMPLE_ANNS[ann_name]
            _add(line, target, conn, conf, ann_name)

    # Field declarations of HTTP client types → service makes outbound HTTP calls
    for _, cap in Query(lang, _JAVA_Q_FIELD_DECL).matches(tree.root_node):
        type_nodes = cap.get("type", [])
        if not type_nodes:
            continue
        type_name = type_nodes[0].text.decode()
        if type_name in _JAVA_HTTP_CLIENT_TYPES:
            line = type_nodes[0].start_point[0] + 1
            _add(line, "HTTP Service", "http", 0.78, f"{type_name} field")

    # Method calls with a string as first argument
    for _, cap in Query(lang, _JAVA_Q_METHOD_CALL).matches(tree.root_node):
        obj_nodes = cap.get("obj", [])
        mth_nodes = cap.get("method", [])
        arg_nodes = cap.get("arg", [])
        if not obj_nodes or not mth_nodes:
            continue
        obj = obj_nodes[0].text.decode()
        mth = mth_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = obj_nodes[0].start_point[0] + 1
        ev = f"{obj}.{mth}(...)"

        if obj == "WebClient" and mth == "create" and arg_val:
            _add(line, _hostname(arg_val), "http", 0.88, ev)
        elif obj in ("URI", "URL") and mth == "create" and arg_val and arg_val.startswith("http"):
            host = _hostname(arg_val)
            if host not in {"localhost", "127.0.0.1", "0.0.0.0"} and not host.startswith("$"):
                _add(line, host, "http", 0.85, f'{obj}.create("{arg_val[:60]}")')
        elif obj == "kafkaTemplate" and mth == "send" and arg_val:
            _add(line, arg_val, "kafka", 0.94, ev)
        elif obj == "rabbitTemplate" and mth == "convertAndSend" and arg_val:
            _add(line, arg_val, "queue", 0.90, ev)
        elif obj == "ManagedChannelBuilder" and mth == "forAddress" and arg_val:
            _add(line, arg_val, "grpc", 0.92, ev)
        elif mth in _JAVA_TYPE_REFS:
            target, conn, conf = _JAVA_TYPE_REFS[mth]
            _add(line, target, conn, conf, ev)

    # Static calls (no object): DriverManager.getConnection(...)
    for _, cap in Query(lang, _JAVA_Q_STATIC_CALL).matches(tree.root_node):
        mth_nodes = cap.get("method", [])
        arg_nodes = cap.get("arg", [])
        if not mth_nodes:
            continue
        mth = mth_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = mth_nodes[0].start_point[0] + 1

        if mth == "getConnection" and arg_val:
            target = _db_target_from_dsn(arg_val)
            _add(line, target, "database", 0.93, f"getConnection({repr(arg_val[:40])})")

    return out


# ── Go ────────────────────────────────────────────────────────────────────────

_GO_Q_CALL = """
(call_expression
  function: (selector_expression
    operand: (identifier) @pkg
    field: (field_identifier) @func)
  arguments: (argument_list . [(interpreted_string_literal) @arg]?))
"""

_GO_HTTP: dict[str, set[str]] = {
    "http":  {"Get", "Post", "Put", "Delete", "Head", "Do"},
    "resty": {"Get", "Post", "Put", "Delete"},
}
_GO_DB: dict[str, set[str]] = {
    "sql":     {"Open"},
    "redis":   {"NewClient", "NewClusterClient"},
    "mongo":   {"Connect", "NewClient"},
    "elastic": {"NewDefaultClient", "NewClient"},
}
_GO_KAFKA: dict[str, set[str]] = {
    "kafka":   {"NewWriter", "NewReader"},
    "sarama":  {"NewSyncProducer", "NewAsyncProducer", "NewConsumer"},
    "kgo":     {"NewClient"},
}
_GO_QUEUE: dict[str, set[str]] = {
    "amqp":    {"Dial"},
    "amqp091": {"Dial"},
}
_GO_GRPC: dict[str, set[str]] = {
    "grpc": {"Dial", "DialContext", "NewClient"},
}


def _go_signals(source: bytes, rel: str) -> list[ExtractionSignal]:
    from tree_sitter import Query  # type: ignore[import]
    parser = _PARSERS["go"]
    lang = _LANGUAGES["go"]
    tree = parser.parse(source)
    out: list[ExtractionSignal] = []

    def _add(line: int, target: str, conn: str, conf: float, evidence: str) -> None:
        out.append(ExtractionSignal(
            source_file=rel, line=line,
            target_service=target, connection_type=conn,
            confidence=conf, evidence_text=evidence[:120],
            target_address=target if conn == "http" and target.startswith("http") else None,
            topic=target if conn in ("kafka", "queue") and not target.startswith("http") else None,
        ))

    for _, cap in Query(lang, _GO_Q_CALL).matches(tree.root_node):
        pkg_nodes = cap.get("pkg", [])
        func_nodes = cap.get("func", [])
        arg_nodes = cap.get("arg", [])
        if not pkg_nodes or not func_nodes:
            continue
        pkg = pkg_nodes[0].text.decode()
        func = func_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = pkg_nodes[0].start_point[0] + 1
        ev = f"{pkg}.{func}(...)"

        if pkg in _GO_HTTP and func in _GO_HTTP[pkg]:
            target = _hostname(arg_val) if arg_val and arg_val.startswith("http") else "HTTP Service"
            _add(line, target, "http", 0.83 if arg_val else 0.72, ev)
        elif pkg in _GO_DB and func in _GO_DB[pkg]:
            if pkg == "sql" and arg_val and func == "Open":
                # sql.Open("driverName", "dsn") — first arg is driver name
                target = _db_name_from_driver(arg_val)
            else:
                target = _db_name_from_pkg(pkg)
            _add(line, target, "database", 0.91, ev)
        elif pkg in _GO_KAFKA and func in _GO_KAFKA[pkg]:
            _add(line, "Kafka", "kafka", 0.90, ev)
        elif pkg in _GO_QUEUE and func in _GO_QUEUE[pkg]:
            _add(line, "RabbitMQ", "queue", 0.90, ev)
        elif pkg in _GO_GRPC and func in _GO_GRPC[pkg]:
            _add(line, arg_val or "gRPC Service", "grpc", 0.91 if arg_val else 0.80, ev)

    return out


# ── Kotlin ────────────────────────────────────────────────────────────────────

# Only match call_expression nodes inside function bodies — NOT enum entries,
# property initialisers in companion objects, or top-level val declarations.
# This is the key advantage of tree-sitter for Kotlin: enum URLs are in
# `enum_entry > value_arguments`, not `call_expression` inside a function body.

_KT_Q_CALL = """
(function_body
  (block
    (_
      (call_expression
        (navigation_expression
          (identifier) @obj
          .
          (identifier) @method)
        (value_arguments
          (value_argument (string_literal) @arg))))))
"""

# Simpler fallback for top-level call_expression (captures most patterns)
_KT_Q_CALL_ANY = """
(call_expression
  (navigation_expression
    (identifier) @obj
    .
    (identifier) @method)
  (value_arguments . (value_argument (string_literal) @arg) .))
"""

_KT_HTTP_CLIENTS = {
    "client", "httpClient", "http", "retrofit", "ktor",
    "okHttp", "okHttpClient", "webclient", "webClient",
}
_KT_HTTP_METHODS = {"get", "post", "put", "delete", "patch", "head", "request", "fetch"}


def _kt_signals(source: bytes, rel: str) -> list[ExtractionSignal]:
    from tree_sitter import Query  # type: ignore[import]
    parser = _PARSERS["kotlin"]
    lang = _LANGUAGES["kotlin"]
    tree = parser.parse(source)
    out: list[ExtractionSignal] = []

    def _add(line: int, target: str, conn: str, conf: float, evidence: str) -> None:
        out.append(ExtractionSignal(
            source_file=rel, line=line,
            target_service=target, connection_type=conn,
            confidence=conf, evidence_text=evidence[:120],
            target_address=target if conn == "http" and target.startswith("http") else None,
        ))

    # Walk call_expression nodes, but skip those inside enum_entry ancestors
    def _is_in_enum_entry(node: Any) -> bool:
        n = node.parent
        while n:
            if n.type == "enum_entry":
                return True
            if n.type in ("function_body", "function_declaration"):
                return False
            n = n.parent
        return False

    # Use the simpler any-call query and filter enum context in Python
    try:
        q = Query(lang, _KT_Q_CALL_ANY)
    except Exception:
        return out

    for _, cap in q.matches(tree.root_node):
        obj_nodes = cap.get("obj", [])
        mth_nodes = cap.get("method", [])
        arg_nodes = cap.get("arg", [])
        if not obj_nodes or not mth_nodes or not arg_nodes:
            continue
        obj_node = obj_nodes[0]
        # Skip calls that are inside an enum_entry
        if _is_in_enum_entry(obj_node):
            continue
        obj = obj_node.text.decode()
        mth = mth_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0])
        line = obj_node.start_point[0] + 1
        ev = f"{obj}.{mth}(...)"

        if obj.lower() in {c.lower() for c in _KT_HTTP_CLIENTS} and mth.lower() in _KT_HTTP_METHODS:
            if arg_val and arg_val.startswith("http"):
                target = _hostname(arg_val)
                _add(line, target, "http", 0.85, ev)
            else:
                _add(line, "HTTP Service", "http", 0.72, ev)
        elif "database" in obj.lower() or "db" in obj.lower() or "repository" in obj.lower():
            if arg_val and ("jdbc:" in arg_val or "postgresql://" in arg_val or "mysql://" in arg_val):
                _add(line, _db_target_from_dsn(arg_val), "database", 0.91, ev)
        elif "kafka" in obj.lower() and mth.lower() in ("send", "publish", "produce"):
            _add(line, arg_val or "Kafka", "kafka", 0.88, ev)

    return out


# ── JavaScript / TypeScript ───────────────────────────────────────────────────

_JS_Q_ATTR_CALL = """
(call_expression
  function: (member_expression
    object: (identifier) @obj
    property: (property_identifier) @method)
  arguments: (arguments . [(string) @arg (template_string) @arg]?))
"""

_JS_Q_FUNC_CALL = """
(call_expression
  function: (identifier) @func
  arguments: (arguments . [(string) @arg (template_string) @arg]?))
"""

_JS_Q_NEW = """
(new_expression
  constructor: (identifier) @cls
  arguments: (arguments . [(string) @arg (template_string) @arg]?))
"""

_JS_HTTP: dict[str, set[str]] = {
    "axios":  {"get", "post", "put", "delete", "patch", "request"},
    "fetch":  set(),  # bare function
    "got":    {"get", "post", "put", "delete"},
    "superagent": {"get", "post", "put", "delete"},
}
_JS_DB: dict[str, set[str]] = {
    "mongoose": {"connect", "createConnection"},
    "redis":    {"createClient"},
    "pg":       {"Pool", "Client"},
}
_JS_KAFKA = {"Kafka", "KafkaClient", "KafkaProducer", "KafkaConsumer"}
_JS_QUEUE = {"amqplib", "amqp"}


def _js_signals(source: bytes, rel: str, lang_key: str = "javascript") -> list[ExtractionSignal]:
    from tree_sitter import Query  # type: ignore[import]
    if lang_key not in _PARSERS:
        return []
    parser = _PARSERS[lang_key]
    lang = _LANGUAGES[lang_key]
    tree = parser.parse(source)
    out: list[ExtractionSignal] = []

    def _add(line: int, target: str, conn: str, conf: float, evidence: str) -> None:
        out.append(ExtractionSignal(
            source_file=rel, line=line,
            target_service=target, connection_type=conn,
            confidence=conf, evidence_text=evidence[:120],
            target_address=target if conn == "http" and target.startswith("http") else None,
            topic=target if conn in ("kafka", "queue") and not target.startswith("http") else None,
        ))

    # obj.method(arg?)
    for _, cap in Query(lang, _JS_Q_ATTR_CALL).matches(tree.root_node):
        obj_nodes = cap.get("obj", [])
        mth_nodes = cap.get("method", [])
        arg_nodes = cap.get("arg", [])
        if not obj_nodes or not mth_nodes:
            continue
        obj = obj_nodes[0].text.decode()
        mth = mth_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = obj_nodes[0].start_point[0] + 1
        ev = f"{obj}.{mth}(...)"

        if obj in _JS_HTTP and mth in _JS_HTTP[obj]:
            target = _hostname(arg_val) if arg_val and arg_val.startswith("http") else "HTTP Service"
            _add(line, target, "http", 0.87 if arg_val else 0.75, ev)
        elif obj in _JS_DB and mth in _JS_DB.get(obj, set()):
            target = _db_target_from_dsn(arg_val) if arg_val else _db_name_from_pkg(obj)
            _add(line, target, "database", 0.92, ev)
        elif obj == "mongoose" and mth == "connect" and arg_val:
            _add(line, "MongoDB", "database", 0.93, ev)
        elif obj in _JS_QUEUE and mth == "connect":
            _add(line, "RabbitMQ", "queue", 0.90, ev)
        elif obj == "producer" and mth == "send" and arg_val:
            _add(line, arg_val, "kafka", 0.91, ev)
        elif obj == "consumer" and mth == "subscribe" and arg_val:
            _add(line, arg_val, "kafka", 0.91, ev)

    # bare fetch("url")
    for _, cap in Query(lang, _JS_Q_FUNC_CALL).matches(tree.root_node):
        func_nodes = cap.get("func", [])
        arg_nodes = cap.get("arg", [])
        if not func_nodes:
            continue
        func = func_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = func_nodes[0].start_point[0] + 1

        if func == "fetch":
            if arg_val and arg_val.startswith("http"):
                _add(line, _hostname(arg_val), "http", 0.80, f"fetch({repr(arg_val[:40])})")
            else:
                _add(line, "HTTP Service", "http", 0.72, "fetch(...)")
        elif func == "require" and arg_val in _JS_QUEUE:
            _add(line, "RabbitMQ", "queue", 0.85, f"require({repr(arg_val)})")

    # new Kafka(), new Pool()
    for _, cap in Query(lang, _JS_Q_NEW).matches(tree.root_node):
        cls_nodes = cap.get("cls", [])
        arg_nodes = cap.get("arg", [])
        if not cls_nodes:
            continue
        cls = cls_nodes[0].text.decode()
        arg_val = _str(arg_nodes[0]) if arg_nodes else None
        line = cls_nodes[0].start_point[0] + 1

        if cls in _JS_KAFKA:
            _add(line, "Kafka", "kafka", 0.90, f"new {cls}()")
        elif cls in {"Pool", "Client"} and arg_val and "pg" in arg_val.lower():
            _add(line, "PostgreSQL", "database", 0.88, f"new {cls}()")
        elif cls == "MongoClient" and arg_val:
            _add(line, "MongoDB", "database", 0.91, f"new {cls}(...)")

    return out


# ── Regex fallback for Ruby / C# ─────────────────────────────────────────────

_REGEX_PATTERNS: dict[str, list[tuple[re.Pattern[str], str, float, int | None]]] = {
    "ruby": [
        (re.compile(r'Faraday\.new\s*\(\s*["\']([^"\']+)["\']'), "http", 0.85, 1),
        (re.compile(r'HTTParty\.get\s*\(\s*["\']([^"\']+)["\']'), "http", 0.85, 1),
        (re.compile(r'ActiveRecord::Base\.establish_connection'), "database", 0.90, None),
        (re.compile(r'Redis\.new\s*\('), "database", 0.90, None),
        (re.compile(r'Bunny\.new\s*\('), "queue", 0.90, None),
    ],
    "csharp": [
        (re.compile(r'new\s+HttpClient\s*\(\)'), "http", 0.78, None),
        (re.compile(r'SqlConnection\s*\(\s*["\']([^"\']+)["\']'), "database", 0.90, 1),
        (re.compile(r'NpgsqlConnection\s*\(\s*["\']([^"\']+)["\']'), "database", 0.91, 1),
        (re.compile(r'ConnectionMultiplexer\.Connect\s*\('), "database", 0.90, None),
        (re.compile(r'IConnection\s+.*RabbitMQ|new\s+ConnectionFactory\s*\(\)'), "queue", 0.88, None),
        (re.compile(r'IProducer<|IConsumer<'), "kafka", 0.88, None),
    ],
}


def _regex_signals(source: bytes, rel: str, lang: str) -> list[ExtractionSignal]:
    patterns = _REGEX_PATTERNS.get(lang, [])
    out: list[ExtractionSignal] = []
    try:
        text = source.decode("utf-8", errors="replace")
    except Exception:
        return out
    for line_no, line in enumerate(text.splitlines(), 1):
        for pattern, conn_type, confidence, tgt_group in patterns:
            m = pattern.search(line)
            if m:
                if tgt_group and m.lastindex and m.lastindex >= tgt_group:
                    raw = m.group(tgt_group)
                    target = _hostname(raw) if conn_type == "http" and raw.startswith("http") else raw
                else:
                    target = _infer_target(conn_type)
                out.append(ExtractionSignal(
                    source_file=rel, line=line_no,
                    target_service=target, connection_type=conn_type,
                    confidence=confidence, evidence_text=line.strip()[:120],
                ))
                break
    return out


# ── Helpers ───────────────────────────────────────────────────────────────────

_DB_DSN_RE = re.compile(
    r"(?:jdbc:)?(postgresql|postgres|mysql|mariadb|mongodb|redis|cassandra|oracle|sqlserver|sqlite)(?:\+[a-z0-9]+)*://",
    re.IGNORECASE,
)
_DB_PKG_NAMES = {
    "psycopg2": "PostgreSQL", "psycopg": "PostgreSQL", "asyncpg": "PostgreSQL",
    "pymysql": "MySQL", "aiomysql": "MySQL",
    "pymongo": "MongoDB", "motor": "MongoDB", "mongo": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "sql": "Database",  # Go — driver determined by argument
}
_DRIVER_NAMES = {
    "postgres": "PostgreSQL", "postgresql": "PostgreSQL",
    "mysql": "MySQL", "mariadb": "MariaDB",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "sqlite3": "SQLite", "sqlite": "SQLite",
    "oracle": "Oracle",
    "sqlserver": "SQL Server",
}


def _hostname(url: str | None) -> str:
    if not url:
        return "HTTP Service"
    m = re.match(r"https?://([^/?\s:]+)", url)
    return m.group(1) if m else "HTTP Service"


def _db_target_from_dsn(dsn: str) -> str:
    m = _DB_DSN_RE.search(dsn)
    if m:
        name = m.group(1).lower()
        return _DRIVER_NAMES.get(name, name.capitalize())
    return "Database"


def _db_name_from_pkg(pkg: str) -> str:
    return _DB_PKG_NAMES.get(pkg.lower(), "Database")


def _db_name_from_driver(driver: str) -> str:
    return _DRIVER_NAMES.get(driver.lower(), driver.capitalize())


def _infer_target(conn_type: str) -> str:
    return {
        "http": "HTTP Service",
        "database": "Database",
        "kafka": "Kafka",
        "queue": "Message Queue",
        "grpc": "gRPC Service",
    }.get(conn_type, "Unknown Service")


# ── Main entry point ──────────────────────────────────────────────────────────

_LANG_FN = {
    "python":     lambda src, rel: _py_signals(src, rel),
    "java":       lambda src, rel: _java_signals(src, rel),
    "kotlin":     lambda src, rel: _kt_signals(src, rel),
    "go":         lambda src, rel: _go_signals(src, rel),
    "javascript": lambda src, rel: _js_signals(src, rel, "javascript"),
    "typescript": lambda src, rel: _js_signals(src, rel, "typescript"),
    "ruby":       lambda src, rel: _regex_signals(src, rel, "ruby"),
    "csharp":     lambda src, rel: _regex_signals(src, rel, "csharp"),
}


def scan_repo(repo_path: Path, max_files: int = 300) -> list[ExtractionSignal]:
    """Scan source files in a repo using tree-sitter AST queries."""
    _init_ts()
    signals: list[ExtractionSignal] = []
    scanned = 0
    seen: set[tuple[str, int, str]] = set()

    for src_file in _iter_source_files(repo_path):
        if scanned >= max_files:
            break
        ext = src_file.suffix.lower()
        lang = _LANG_EXTENSIONS.get(ext)
        if lang is None:
            continue

        # Skip if tree-sitter unavailable for this language and no regex fallback
        if lang not in _LANG_FN:
            continue

        try:
            source = src_file.read_bytes()
        except OSError:
            continue

        rel = str(src_file.relative_to(repo_path))
        scanned += 1

        try:
            new_sigs = _LANG_FN[lang](source, rel)
        except Exception:
            continue

        for sig in new_sigs:
            key = (sig.source_file, sig.line, sig.target_service)
            if key not in seen:
                seen.add(key)
                signals.append(sig)

    return signals


def _iter_source_files(repo_path: Path):
    for p in sorted(repo_path.rglob("*")):
        if not p.is_file():
            continue
        parts = p.relative_to(repo_path).parts
        if any(part in _EXCLUDED_DIRS for part in parts):
            continue
        if p.suffix.lower() in _EXCLUDED_EXTS:
            continue
        if p.name.lower().endswith((".min.js", ".min.css")):
            continue
        yield p
