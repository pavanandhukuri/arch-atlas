"""Pipeline orchestrator: extract → graph → correlate → enrich → export."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Callable, Optional

import anyio

from ..extraction.code_parser import scan_repo
from ..extraction.manifest_extractor import extract_from_repo
from ..extraction.models import ExtractionSignal
from ..extraction.relationship_extractor import build_metadata
from ..graph.cross_repo_correlator import correlate
from ..graph.memory_graph import MemoryGraph
from ..providers.base import LLMProvider

_SECURITY_EXCLUSIONS = re.compile(
    r"(\.env(\.[a-z]+)?$|\.key$|\.pem$|secret|credential|password)",
    re.IGNORECASE,
)


async def run_pipeline(
    repos: list[dict[str, Any]],
    provider: LLMProvider,
    output_dir: Path,
    *,
    force_refresh: bool = False,
    concurrency: int = 3,
    analyze_only: bool = False,
    aggregate_only: bool = False,
    min_confidence: float = 0.5,
    on_repo_start: Optional[Callable[[str], None]] = None,
    on_repo_complete: Optional[Callable[[str, dict[str, Any]], None]] = None,
    on_repo_failed: Optional[Callable[[str, Exception], None]] = None,
) -> dict[str, Any]:
    """Run the full extraction + graph + enrichment + export pipeline.

    Returns a summary dict: {metadata_list, diagram_path, failed_repos}.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Stage 1: Per-repo extraction (parallel)                             #
    # ------------------------------------------------------------------ #
    metadata_list: list[dict[str, Any]] = []
    failed_repos: list[str] = []

    if not aggregate_only:
        semaphore = anyio.Semaphore(concurrency)
        results: list[dict[str, Any] | None] = [None] * len(repos)
        all_repo_names = frozenset(r["name"] for r in repos)

        async def _extract_one(idx: int, repo: dict[str, Any]) -> None:
            name: str = repo["name"]
            path = Path(repo["path"])
            metadata_path = output_dir / f"{name}.metadata.json"

            if not force_refresh and metadata_path.exists():
                try:
                    cached = json.loads(metadata_path.read_text())
                    results[idx] = {"status": "complete", "name": name, "metadata": cached}
                    if on_repo_complete:
                        on_repo_complete(name, cached)
                    return
                except Exception:
                    pass

            async with semaphore:
                if on_repo_start:
                    on_repo_start(name)
                try:
                    # Exclude the repo's own name so self-references aren't surfaced.
                    sibling_names = all_repo_names - {name}
                    metadata = await anyio.to_thread.run_sync(
                        lambda r=repo, s=sibling_names: _extract_repo(r, min_confidence, known_repo_names=s)
                    )
                    metadata_path.write_text(json.dumps(metadata, indent=2))
                    results[idx] = {"status": "complete", "name": name, "metadata": metadata}
                    if on_repo_complete:
                        on_repo_complete(name, metadata)
                except Exception as exc:
                    results[idx] = {"status": "failed", "name": name, "error": str(exc)}
                    if on_repo_failed:
                        on_repo_failed(name, exc)

        async with anyio.create_task_group() as tg:
            for i, repo in enumerate(repos):
                tg.start_soon(_extract_one, i, repo)

        for r in results:
            if r and r.get("status") == "complete":
                metadata_list.append(r["metadata"])
            elif r and r.get("status") == "failed":
                failed_repos.append(r.get("name", "unknown"))
    else:
        for repo in repos:
            meta_path = output_dir / f"{repo['name']}.metadata.json"
            if meta_path.exists():
                try:
                    metadata_list.append(json.loads(meta_path.read_text()))
                except Exception:
                    pass

    if analyze_only or not metadata_list:
        return {
            "metadata_list": metadata_list,
            "diagram_path": None,
            "failed_repos": failed_repos,
        }

    # ------------------------------------------------------------------ #
    # Stage 2: Build in-memory graph                                      #
    # ------------------------------------------------------------------ #
    graph = MemoryGraph()
    graph.populate_from_metadata_list(metadata_list)

    # ------------------------------------------------------------------ #
    # Stage 3: Cross-repo correlation                                     #
    # ------------------------------------------------------------------ #
    correlate(graph)

    # ------------------------------------------------------------------ #
    # Stage 4: LLM enrichment → final diagram                            #
    # ------------------------------------------------------------------ #
    from ..enrichment.llm_enricher import enrich
    from ..output.diagram_builder import build_diagram

    raw_diagram = await enrich(graph, provider)
    diagram = build_diagram(raw_diagram)

    diagram_path = output_dir / "architecture.arch.json"
    diagram_path.write_text(json.dumps(diagram, indent=2))

    return {
        "metadata_list": metadata_list,
        "diagram_path": diagram_path,
        "failed_repos": failed_repos,
    }


async def run_propose_pipeline(
    repos: list[dict[str, Any]],
    provider: LLMProvider,
    output_dir: Path,
    *,
    systems: Optional[list[dict[str, Any]]] = None,
    force_refresh: bool = False,
    concurrency: int = 3,
    min_confidence: float = 0.5,
    on_repo_start: Optional[Callable[[str], None]] = None,
    on_repo_complete: Optional[Callable[[str, dict[str, Any]], None]] = None,
    on_repo_failed: Optional[Callable[[str, Exception], None]] = None,
) -> dict[str, Any]:
    """Extract repos then call the LLM to propose candidates for human review.

    Writes architecture.review.yaml to output_dir, merging with any existing
    review file so human decisions on prior runs are preserved.
    """
    import datetime

    from ..enrichment.llm_enricher import propose
    from ..review.models import ReviewCandidate, ReviewFile, SystemGroup
    from ..review.review_manager import (
        default_review_path,
        load_review,
        merge_candidates,
        save_review,
    )

    system_groups = [SystemGroup(**s) for s in (systems or [])]

    result = await run_pipeline(
        repos=repos,
        provider=provider,
        output_dir=output_dir,
        force_refresh=force_refresh,
        concurrency=concurrency,
        analyze_only=True,
        min_confidence=min_confidence,
        on_repo_start=on_repo_start,
        on_repo_complete=on_repo_complete,
        on_repo_failed=on_repo_failed,
    )

    metadata_list: list[dict[str, Any]] = result.get("metadata_list", [])

    # Load all existing cached metadata so propose has full cross-repo context,
    # even when --repos filtered extraction to a subset of repos.
    fresh_names = {m["repository"]["name"] for m in metadata_list}
    for meta_file in sorted(output_dir.glob("*.metadata.json")):
        try:
            cached = json.loads(meta_file.read_text())
            if cached.get("repository", {}).get("name") not in fresh_names:
                metadata_list.append(cached)
        except Exception:
            pass

    # Build and correlate the graph to surface Kafka producer→consumer chains
    # that span multiple repos — the LLM would otherwise have to infer these
    # from raw topic names scattered across separate service metadata entries.
    graph = MemoryGraph()
    graph.populate_from_metadata_list(metadata_list)
    correlate(graph)
    correlated_pairs = _extract_correlated_pairs(graph)

    repo_names = [r["name"] for r in repos]
    raw_candidates = await propose(
        metadata_list,
        provider,
        correlated_pairs=correlated_pairs or None,
        known_repo_names=repo_names,
    )

    new_candidates: list[ReviewCandidate] = []
    for i, c in enumerate(raw_candidates):
        if not isinstance(c, dict):
            continue
        try:
            new_candidates.append(ReviewCandidate(
                id=f"cand_{i + 1}",
                source=c.get("source", ""),
                target=c.get("target", ""),
                type=c.get("type", "http"),
                reasoning=c.get("reasoning", ""),
                confidence=c.get("confidence", "medium"),
            ))
        except Exception:
            continue

    review_path = default_review_path(output_dir)
    if review_path.exists():
        existing = load_review(review_path)
        existing.generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        existing.source_repos = [r["name"] for r in repos]
        existing.systems = system_groups
        review = merge_candidates(existing, new_candidates)
    else:
        review = ReviewFile(
            generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            source_repos=[r["name"] for r in repos],
            systems=system_groups,
            candidates=new_candidates,
        )

    save_review(review, review_path)
    return {
        "review_path": review_path,
        "total_candidates": len(review.candidates),
        "pending": sum(1 for c in review.candidates if c.status == "pending"),
        "failed_repos": result.get("failed_repos", []),
    }


async def run_finalize_pipeline(
    review_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Build architecture.arch.json from accepted candidates in the review file."""
    import json as _json

    from ..review.review_manager import build_diagram_from_review, load_review

    review = load_review(review_path)
    accepted = [c for c in review.candidates if c.status == "accepted"]
    if not accepted:
        return {"diagram_path": None, "accepted": 0}

    diagram = build_diagram_from_review(review)
    output_dir.mkdir(parents=True, exist_ok=True)
    diagram_path = output_dir / "architecture.arch.json"
    diagram_path.write_text(_json.dumps(diagram, indent=2))
    return {"diagram_path": diagram_path, "accepted": len(accepted)}


def _extract_repo(
    repo: dict[str, Any],
    min_confidence: float,
    known_repo_names: frozenset[str] | None = None,
) -> dict[str, Any]:
    """Synchronous per-repo extraction (runs in anyio thread pool)."""
    name: str = repo["name"]
    path = Path(repo["path"])

    if not path.exists():
        raise FileNotFoundError(f"Repository path does not exist: {path}")

    try:
        all_files = [p for p in path.rglob("*") if p.is_file() and not _is_excluded(p, path)]
    except PermissionError:
        all_files = []
    files_total = len(all_files)

    code_signals: list[ExtractionSignal] = scan_repo(path)
    manifest_signals: list[ExtractionSignal] = extract_from_repo(path)

    # Tree-sitter is authoritative for HTTP connections found in source code.
    # Supplement with manifest HTTP signals when:
    #   (a) the codebase itself has HTTP call evidence, OR
    #   (b) the signal's target matches a known sibling repo — these are
    #       inter-service calls that must not be dropped even when tree-sitter
    #       didn't detect an explicit HTTP client pattern.
    ts_has_http = any(s.connection_type == "http" for s in code_signals)
    filtered_manifest = [
        s for s in manifest_signals
        if s.connection_type != "http"
        or ts_has_http
        or _targets_known_repo(s, known_repo_names)
    ]

    all_signals = [s for s in filtered_manifest + code_signals if s.confidence >= min_confidence]

    return build_metadata(
        repo_name=name,
        repo_path=str(path),
        signals=all_signals,
        files_scanned=min(files_total, 200),
        files_total=files_total,
    )


def _targets_known_repo(signal: ExtractionSignal, known_repo_names: frozenset[str] | None) -> bool:
    """Return True if the signal's target looks like a sibling repo in this import batch."""
    if not known_repo_names:
        return False
    haystack = ((signal.target_address or "") + " " + signal.target_service).lower()
    return any(repo.lower() in haystack for repo in known_repo_names)


def _is_excluded(path: Path, base: Path) -> bool:
    excluded_dirs = {"node_modules", ".git", "dist", "build", "__pycache__", ".venv", "venv"}
    parts = path.relative_to(base).parts
    if any(p in excluded_dirs for p in parts):
        return True
    return bool(_SECURITY_EXCLUSIONS.search(path.name))


def _extract_correlated_pairs(graph: MemoryGraph) -> list[dict[str, Any]]:
    """Return Kafka publisher→topic→consumer chains discovered by cross-repo correlation."""
    from ..graph.models import EdgeKind, NodeKind

    # Index publish and consume edges by topic node id
    topic_publishers: dict[str, list[str]] = {}
    topic_consumers: dict[str, list[str]] = {}
    topic_names: dict[str, str] = {}

    for edge in graph.edges():
        if edge.kind == EdgeKind.KAFKA_PUBLISH:
            topic_node = graph.get_node(edge.target_id)
            src_node = graph.get_node(edge.source_id)
            if topic_node and src_node:
                topic_publishers.setdefault(topic_node.id, []).append(src_node.name)
                topic_names[topic_node.id] = topic_node.name
        elif edge.kind == EdgeKind.KAFKA_CONSUME:
            topic_node = graph.get_node(edge.source_id)
            dst_node = graph.get_node(edge.target_id)
            if topic_node and dst_node:
                topic_consumers.setdefault(topic_node.id, []).append(dst_node.name)
                topic_names[topic_node.id] = topic_node.name

    pairs: list[dict[str, Any]] = []
    for topic_id, publishers in topic_publishers.items():
        consumers = topic_consumers.get(topic_id, [])
        topic_name = topic_names.get(topic_id, topic_id)
        for publisher in publishers:
            for consumer in consumers:
                if publisher != consumer:
                    pairs.append({
                        "type": "kafka",
                        "publisher": publisher,
                        "topic": topic_name,
                        "consumer": consumer,
                    })
    return pairs
