"""Build LLM prompts for enrichment and proposal steps."""
from __future__ import annotations

import json
from typing import Any, Optional

_EXAMPLE_OUTPUT = """{
  "schemaVersion": "1.0.0",
  "metadata": {"title": "Imported Architecture"},
  "elements": [
    {"id": "svc_api", "kind": "system", "name": "API Service"},
    {"id": "svc_worker", "kind": "system", "name": "Worker Service"},
    {"id": "db_postgres", "kind": "system", "name": "PostgreSQL"},
    {"id": "topic_order", "kind": "system", "name": "Order Events Topic"},
    {"id": "ext_stripe", "kind": "system", "name": "Stripe", "isExternal": true}
  ],
  "relationships": [
    {"id": "rel_1", "sourceId": "svc_api", "targetId": "db_postgres", "type": "uses", "description": "reads/writes orders"},
    {"id": "rel_2", "sourceId": "svc_api", "targetId": "topic_order", "type": "publishes"},
    {"id": "rel_3", "sourceId": "svc_worker", "targetId": "topic_order", "type": "subscribes"},
    {"id": "rel_4", "sourceId": "svc_api", "targetId": "ext_stripe", "type": "calls"}
  ],
  "views": []
}"""


def build_enrichment_prompt(
    graph_dict: dict[str, Any],
    known_service_names: Optional[list[str]] = None,
) -> str:
    graph_text = json.dumps(graph_dict, indent=2)

    service_names_section = ""
    if known_service_names:
        names_list = "\n".join(f"  - {n}" for n in known_service_names)
        service_names_section = f"""
Known service names in this architecture (actual repository names):
{names_list}

When you see a node whose name closely resembles one of these known service names (e.g. "udssdk-notification-orchestrator-service" likely refers to "udssdk-notification-service"), resolve the name to the closest known service rather than creating a separate node. Use these names as the canonical identifiers.
"""

    return f"""You are an expert software architect. Below is an architecture graph extracted by static analysis from a set of repositories.

Architecture graph (nodes and edges):
```json
{graph_text}
```
{service_names_section}
Your task: produce a clean C4 landscape diagram in JSON, filtering out noise and consolidating environment variants.

Return ONLY a JSON object in EXACTLY this format (no extra text, no markdown, no explanation):

{_EXAMPLE_OUTPUT}

Rules:
- schemaVersion must be "1.0.0"
- ALL elements use kind "system" — this is the C4 landscape level
- Do NOT use kind "container" or containerSubtype
- Give each element a clean, human-readable name (fix abbreviations, remove underscores)
- Relationship types: REST/gRPC → "calls", kafka/queue → "publishes"/"subscribes", database → "uses"
- Set views to an empty array
- Return ONLY valid JSON, nothing else

CONSOLIDATION — apply before building the element list:
- If multiple nodes are environment or region variants of the same logical service (URLs whose hostname differs only in tokens like dev/qa/sit/stage/prod/staging/uat or region codes like us-east/eu-west/ap-southeast), merge them into ONE element. Use the production hostname as the name, or a clean logical name if no production URL is obvious. Mark it isExternal: true. Replace all N relationships to those variants with ONE relationship to the merged element.
- If multiple nodes clearly represent the same service under different names (aliases, abbreviations), merge them.

EXCLUSIONS — omit these entirely (no element, no relationship):
- Documentation and specification sites (e.g. slf4j.org, ktor.io, schemas.android.com, schema.getpostman.com, openapi.org)
- Package registries and build tooling (e.g. repo.maven.apache.org, npmjs.com, pypi.org, plugins.gradle.org)
- Source control hosts used only for dependency fetching (e.g. github.com, bitbucket.org) unless there is clear evidence of a runtime API call
- Developer tooling and issue trackers (e.g. youtrack.jetbrains.com, jira.atlassian.com)
- License and security scanning services (e.g. fossa.io, snyk.io)
- Generic placeholder names with no identifiable target (e.g. "HTTP Service", "Database")"""


_PROPOSE_EXAMPLE = """[
  {
    "source": "order-service",
    "target": "PostgreSQL",
    "type": "database",
    "reasoning": "Calls psycopg2.connect() in db/session.py — standard PostgreSQL client pattern.",
    "confidence": "high"
  },
  {
    "source": "order-service",
    "target": "Keycloak",
    "type": "http",
    "reasoning": "HTTP calls to account.<region>.<domain>/auth — URL pattern matches a Keycloak or OAuth2 identity provider endpoint.",
    "confidence": "medium"
  },
  {
    "source": "notification-service",
    "target": "Kafka",
    "type": "kafka",
    "reasoning": "KafkaConsumer instantiated in consumer/handler.py — subscribes to event topics.",
    "confidence": "high"
  }
]"""


def build_propose_prompt(
    metadata_list: list[dict[str, Any]],
    correlated_pairs: Optional[list[dict[str, Any]]] = None,
    known_repo_names: Optional[list[str]] = None,
) -> str:
    payload = json.dumps(metadata_list, indent=2)

    correlated_section = ""
    if correlated_pairs:
        pairs_text = json.dumps(correlated_pairs, indent=2)
        correlated_section = f"""

Cross-repository event flows detected by static analysis (Kafka topic matching across repos):
```json
{pairs_text}
```
Each entry above means the publisher service sends to the named topic and the consumer service reads from it — confirmed by matching topic names in both codebases. Include these as kafka-type candidates with confidence "high" unless you see contradicting evidence.
"""

    inter_service_section = ""
    if known_repo_names:
        names_list = "\n".join(f"  - {n}" for n in known_repo_names)
        inter_service_section = f"""

Known repositories in this import batch (the architecture's own services):
{names_list}

INTER-SERVICE CONNECTIONS — these are critical and easy to miss:
When evidence shows one known service calling another (e.g. a URL whose hostname contains "udssdk-notification-service"), propose it as a candidate with:
- source: the calling service's repo name (exactly as listed above)
- target: the called service's repo name (exactly as listed above, not a URL)
- type: "http"
- confidence: "high" if the URL appears in source code or production Helm values; "medium" if only in test/local config
Do NOT invent a generic name like "Notification Service" — use the exact repo name from the list above.
"""

    return f"""You are an expert software architect performing architecture discovery.

Below is the raw static-analysis output from scanning a set of repositories.
Each repository entry contains the connections that were detected in its source code and manifest files.

Static analysis data:
```json
{payload}
```
{correlated_section}{inter_service_section}
Your task: produce a list of CANDIDATE connections for human review.

For each connection found in the data above, produce one candidate object describing:
- which service initiates it (source)
- what it connects to — use a clean, canonical name (e.g. "PostgreSQL" not "db", "Keycloak" not a raw hostname)
- the connection type (database | http | kafka | queue | grpc)
- your reasoning — one or two sentences explaining what evidence you found and what the target most likely is
- your confidence (high | medium | low)

Rules:
- Use the evidence field and source file paths to reason about what the target really is.
  For example: a URL like account.<region>.example.com/auth → likely an identity/auth service (Keycloak, Auth0, etc.)
- If multiple raw connections clearly point to the same logical target (env variants, region variants),
  emit ONE candidate with the canonical name and explain the consolidation in the reasoning.
- If a connection target is clearly noise (package registry, build tool, docs site, ZooKeeper used only
  as a Kafka dependency, generic "HTTP Service" with no URL context), OMIT it entirely.
- Set confidence = "low" for any connection where you are guessing; "medium" where the evidence is
  indirect (manifest-only, no source code); "high" where source code directly shows the call.

NAME FORMATTING — this is easy to get wrong, follow it exactly:
- NEVER output a raw hostname fragment or slug as the target name (e.g. "vault-active", "ugain-guardrails-service",
  "auth-svc-prod" are all WRONG).
- If the target is one of the known repositories listed above, use that exact repo name verbatim (kebab-case is
  correct there — do not reformat it).
- Otherwise, convert the identifier into a clean, human-readable Title Case name by stripping environment/region
  tokens and separators: "vault-active" → "HashiCorp Vault", "ugain-guardrails-service" → "Guardrails Service",
  "auth-svc-prod" → "Auth Service". Use well-known product names when the identifier clearly matches one
  (Vault, Keycloak, Kafka, PostgreSQL, Redis, etc.) rather than inventing a literal translation of the slug.

Return ONLY a JSON array (no markdown, no explanation):

{_PROPOSE_EXAMPLE}"""
