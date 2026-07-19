"""CLI entry point for arch-atlas-import."""
from __future__ import annotations

import asyncio
import os
import sys
import threading
from pathlib import Path
from typing import Any, Optional

import click
import yaml

from .providers.factory import create_provider
from .session.session_manager import run_finalize_pipeline, run_pipeline, run_propose_pipeline

_DEFAULT_CONFIG_PATHS = [
    Path.home() / ".arch-atlas.yaml",
    Path.home() / ".arch-atlas" / "config.yaml",
    Path(".arch-atlas.yaml"),
]


def _load_config_file(path: Optional[str]) -> dict[str, Any]:
    """Load YAML config from explicit path or default search locations."""
    candidates: list[Path] = [Path(path)] if path else list(_DEFAULT_CONFIG_PATHS)
    for candidate in candidates:
        if candidate.exists():
            with candidate.open() as fh:
                data = yaml.safe_load(fh) or {}
            return data if isinstance(data, dict) else {}
    return {}


def _run_in_loop(coro: Any) -> Any:
    """Run a coroutine even when called from within a running event loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    holder: list[Any] = [None, None]

    def _target() -> None:
        try:
            holder[0] = asyncio.run(coro)
        except BaseException as exc:  # noqa: BLE001
            holder[1] = exc

    t = threading.Thread(target=_target)
    t.start()
    t.join()
    if holder[1] is not None:
        raise holder[1]
    return holder[0]


@click.group()
def main() -> None:
    """Arch Atlas — repository architecture importer.

    All options can also be set via environment variables prefixed with
    ARCH_ATLAS_ (e.g. ARCH_ATLAS_PROVIDER=anthropic, ARCH_ATLAS_MODEL=claude-opus-4-8).
    """


@main.command("run", context_settings={"auto_envvar_prefix": "ARCH_ATLAS"})
@click.argument("projects_dir", default=".", type=click.Path(exists=True, file_okay=False))
@click.option("--config", "config_file", default=None, metavar="FILE",
              help="Path to YAML config file (default: ~/.arch-atlas.yaml).")
@click.option("--output", default=None, help="Output directory (default: PROJECTS_DIR/.arch-atlas/)")
@click.option("--provider", default=None,
              type=click.Choice(["anthropic", "ollama", "openai", "mlx"]),
              help="LLM provider for enrichment. [default: ollama]")
@click.option("--model", default=None, help="Model name override.")
@click.option("--endpoint", default=None,
              help="Provider endpoint URL (ollama/openai/mlx only). "
                   "[default: ollama http://localhost:11434, mlx http://localhost:8000/v1]")
@click.option("--api-key-env", default=None,
              help="Env var holding the Anthropic API key. [default: ANTHROPIC_API_KEY]")
@click.option("--force-refresh", is_flag=True, default=False,
              help="Re-extract all repos, ignoring cached .metadata.json files.")
@click.option("--analyze-only", is_flag=True, default=False,
              help="Run extraction only; skip LLM enrichment and diagram generation.")
@click.option("--aggregate-only", is_flag=True, default=False,
              help="Skip extraction; re-run enrichment from existing .metadata.json files.")
@click.option("--repos", default=None,
              help="Comma-separated repo names to process (subset).")
@click.option("--min-confidence", default=None, show_default=False, type=float,
              help="Minimum confidence threshold; lower signals are discarded. [default: 0.5]")
@click.option("--concurrency", default=None, show_default=False, type=int,
              help="Maximum parallel repo extractions. [default: 3]")
@click.option("--verbose", is_flag=True, default=False, help="Detailed per-repo output.")
@click.option("--yes", "skip_consent", is_flag=True, default=False,
              help="Skip Anthropic cloud consent prompt.")
def run_command(
    projects_dir: str,
    config_file: Optional[str],
    output: Optional[str],
    provider: Optional[str],
    model: Optional[str],
    endpoint: Optional[str],
    api_key_env: Optional[str],
    force_refresh: bool,
    analyze_only: bool,
    aggregate_only: bool,
    repos: Optional[str],
    min_confidence: Optional[float],
    concurrency: Optional[int],
    verbose: bool,
    skip_consent: bool,
) -> None:
    """Scan PROJECTS_DIR for repositories and generate an architecture diagram.

    PROJECTS_DIR should be the parent folder that contains your project
    repositories as immediate subdirectories. Defaults to the current directory.

    \b
    Examples:
        arch-atlas-import run .
        arch-atlas-import run /workspace/projects --provider anthropic
        arch-atlas-import run . --provider ollama --model qwen2.5-coder:7b --verbose
        MLX_API_KEY=1234 arch-atlas-import run . --provider mlx --api-key-env MLX_API_KEY \
            --model Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
        ARCH_ATLAS_PROVIDER=anthropic arch-atlas-import run .
    """
    cfg = _load_config_file(config_file)

    # Resolve options: CLI flag > env var (handled by auto_envvar_prefix) > config file > hard default
    resolved_provider = provider or cfg.get("provider", "ollama")
    resolved_model = model or cfg.get("model")
    # No hard-coded default here — ollama/openai/mlx each supply their own
    # default endpoint when none is given, and defaulting to ollama's port
    # for every provider would silently misconfigure openai/mlx.
    resolved_endpoint = endpoint or cfg.get("endpoint")
    resolved_api_key_env = api_key_env or cfg.get("apiKeyEnv", "ANTHROPIC_API_KEY")
    resolved_min_confidence = min_confidence if min_confidence is not None else float(cfg.get("minConfidence", 0.5))
    resolved_concurrency = concurrency if concurrency is not None else int(cfg.get("concurrency", 3))

    root = Path(projects_dir).resolve()
    out_dir = Path(output).resolve() if output else root / ".arch-atlas"

    # Discover repos
    discovered = _discover_repos(root)
    if not discovered:
        click.echo(f"No repositories found in {root}.", err=True)
        sys.exit(1)

    # Apply --repos filter
    repo_filter = {r.strip() for r in repos.split(",")} if repos else None
    if repo_filter:
        discovered = [r for r in discovered if r["name"] in repo_filter]
        if not discovered:
            click.echo(f"No repositories matched the filter: {repos}", err=True)
            sys.exit(1)

    # Build provider config
    provider_cfg: dict[str, Any] = {"type": resolved_provider}
    if resolved_model:
        provider_cfg["model"] = resolved_model
    if resolved_endpoint and resolved_provider != "anthropic":
        provider_cfg["endpoint"] = resolved_endpoint
    if resolved_provider == "ollama":
        if not resolved_model:
            provider_cfg["model"] = "qwen2.5-coder:7b"
    else:
        provider_cfg["apiKeyEnvVar"] = resolved_api_key_env

    # Anthropic consent
    if resolved_provider == "anthropic" and not skip_consent and not analyze_only:
        _cloud_consent(discovered)

    # Create provider
    try:
        full_config = {"provider": provider_cfg}
        provider = create_provider(full_config)
    except Exception as exc:
        click.echo(f"Provider error: {exc}", err=True)
        sys.exit(1)

    click.echo(f"\nArch Atlas Import")
    click.echo(f"  Projects dir : {root}")
    click.echo(f"  Repositories : {len(discovered)} discovered")
    click.echo(f"  Output       : {out_dir}")
    click.echo(f"  Provider     : {resolved_provider} / {provider_cfg.get('model', 'default')}")
    click.echo("")

    def _on_start(name: str) -> None:
        click.echo(f"  Extracting {name}...", nl=not verbose)

    def _on_complete(name: str, meta: dict[str, Any]) -> None:
        n = len(meta.get("connections", []))
        suffix = f" ({n} connections)" if n else " (no connections detected)"
        if verbose:
            click.echo(f"  ✓ {name}{suffix}")
        else:
            click.echo(f" ✓{suffix}")

    def _on_failed(name: str, exc: Exception) -> None:
        click.echo(f"  ✗ {name}: {exc}", err=True)

    result = _run_in_loop(run_pipeline(
        repos=discovered,
        provider=provider,
        output_dir=out_dir,
        force_refresh=force_refresh,
        concurrency=resolved_concurrency,
        analyze_only=analyze_only,
        aggregate_only=aggregate_only,
        min_confidence=resolved_min_confidence,
        on_repo_start=_on_start if verbose else None,
        on_repo_complete=_on_complete,
        on_repo_failed=_on_failed,
    ))

    failed = result.get("failed_repos", [])
    if failed:
        click.echo(
            f"\n⚠  {len(failed)} repo(s) failed: {', '.join(failed)}", err=True
        )

    diagram_path = result.get("diagram_path")
    if diagram_path:
        click.echo(f"\n✓ Diagram written → {diagram_path}")
    elif analyze_only:
        click.echo(f"\n✓ Extraction complete. Metadata in {out_dir}")
    else:
        click.echo("\n✗ No diagram produced (all repos failed or no data).", err=True)
        sys.exit(2)


@main.command("propose", context_settings={"auto_envvar_prefix": "ARCH_ATLAS"})
@click.argument("projects_dir", default=".", type=click.Path(exists=True, file_okay=False))
@click.option("--config", "config_file", default=None, metavar="FILE")
@click.option("--output", default=None, help="Output directory (default: PROJECTS_DIR/.arch-atlas/)")
@click.option("--provider", default=None, type=click.Choice(["anthropic", "ollama", "openai", "mlx"]))
@click.option("--model", default=None)
@click.option("--endpoint", default=None)
@click.option("--api-key-env", default=None)
@click.option("--force-refresh", is_flag=True, default=False)
@click.option("--repos", default=None)
@click.option("--min-confidence", default=None, type=float)
@click.option("--concurrency", default=None, type=int)
@click.option("--verbose", is_flag=True, default=False)
@click.option("--yes", "skip_consent", is_flag=True, default=False)
def propose_command(
    projects_dir: str,
    config_file: Optional[str],
    output: Optional[str],
    provider: Optional[str],
    model: Optional[str],
    endpoint: Optional[str],
    api_key_env: Optional[str],
    force_refresh: bool,
    repos: Optional[str],
    min_confidence: Optional[float],
    concurrency: Optional[int],
    verbose: bool,
    skip_consent: bool,
) -> None:
    """Extract repos and generate a candidate review file for human sign-off.

    \b
    Workflow:
        1. arch-atlas-import propose --config arch-atlas.yaml  → writes architecture.review.yaml
        2. arch-atlas-import review  <file>                    → interactive wizard (accept/reject)
        3. arch-atlas-import finalize <file>                   → builds architecture.arch.json
    """
    from .config.loader import ConfigError, load_config

    # When a structured config file is provided, use it as the authoritative source
    # for repositories, systems, provider settings, and output directory.
    cfg_structured: dict[str, Any] = {}
    if config_file:
        try:
            cfg_structured = load_config(config_file)
        except ConfigError as exc:
            click.echo(f"Config error: {exc}", err=True)
            sys.exit(1)

    # Provider resolution: CLI flag > structured config > env-based flat config > default
    if cfg_structured:
        prov_cfg = cfg_structured["provider"]
        resolved_provider = provider or prov_cfg.get("type", "ollama")
        resolved_model = model or prov_cfg.get("model")
        # No hard-coded default — ollama/openai/mlx each supply their own.
        resolved_endpoint = endpoint or prov_cfg.get("endpoint")
        resolved_api_key_env = api_key_env or prov_cfg.get("apiKeyEnvVar", "ANTHROPIC_API_KEY")
        resolved_api_key = prov_cfg.get("apiKey")
        ana = cfg_structured.get("analysis", {})
        resolved_min_confidence = min_confidence if min_confidence is not None else float(ana.get("minConfidence", 0.5))
        resolved_concurrency = concurrency if concurrency is not None else int(ana.get("concurrency", 3))
        resolved_systems: list[dict[str, Any]] = cfg_structured.get("systems", [])
    else:
        flat_cfg = _load_config_file(None)
        resolved_provider = provider or flat_cfg.get("provider", "ollama")
        resolved_model = model or flat_cfg.get("model")
        resolved_endpoint = endpoint or flat_cfg.get("endpoint")
        resolved_api_key_env = api_key_env or flat_cfg.get("apiKeyEnv", "ANTHROPIC_API_KEY")
        resolved_api_key = None
        resolved_min_confidence = min_confidence if min_confidence is not None else float(flat_cfg.get("minConfidence", 0.5))
        resolved_concurrency = concurrency if concurrency is not None else int(flat_cfg.get("concurrency", 3))
        resolved_systems = []

    # Repository list: structured config > discover from projects_dir
    if cfg_structured and cfg_structured.get("repositories"):
        discovered = cfg_structured["repositories"]
        out_dir = Path(output).resolve() if output else Path(cfg_structured["output"]["directory"])
    else:
        root = Path(projects_dir).resolve()
        out_dir = Path(output).resolve() if output else root / ".arch-atlas"
        discovered = _discover_repos(root)
        if not discovered:
            click.echo(f"No repositories found in {root}.", err=True)
            sys.exit(1)

    repo_filter = {r.strip() for r in repos.split(",")} if repos else None
    if repo_filter:
        discovered = [r for r in discovered if r["name"] in repo_filter]

    provider_cfg: dict[str, Any] = {"type": resolved_provider}
    if resolved_model:
        provider_cfg["model"] = resolved_model
    if resolved_endpoint and resolved_provider != "anthropic":
        provider_cfg["endpoint"] = resolved_endpoint
    if resolved_provider == "ollama":
        if not resolved_model:
            provider_cfg["model"] = "qwen2.5-coder:7b"
    elif resolved_provider in ("openai", "mlx"):
        if resolved_api_key:
            provider_cfg["apiKey"] = resolved_api_key
        else:
            provider_cfg["apiKeyEnvVar"] = resolved_api_key_env
    else:
        provider_cfg["apiKeyEnvVar"] = resolved_api_key_env

    if resolved_provider == "anthropic" and not skip_consent:
        _cloud_consent(discovered)

    try:
        llm_provider = create_provider({"provider": provider_cfg})
    except Exception as exc:
        click.echo(f"Provider error: {exc}", err=True)
        sys.exit(1)

    click.echo(f"\nArch Atlas — Propose")
    click.echo(f"  Repositories : {len(discovered)}")
    if resolved_systems:
        click.echo(f"  Systems      : {len(resolved_systems)} ({', '.join(s['name'] for s in resolved_systems)})")
    click.echo(f"  Output       : {out_dir}")
    click.echo(f"  Provider     : {resolved_provider} / {provider_cfg.get('model', 'default')}")
    click.echo("")

    def _on_complete(name: str, meta: dict[str, Any]) -> None:
        n = len(meta.get("connections", []))
        suffix = f" ({n} connections)" if n else " (no connections detected)"
        if verbose:
            click.echo(f"  ✓ {name}{suffix}")

    result = _run_in_loop(run_propose_pipeline(
        repos=discovered,
        provider=llm_provider,
        output_dir=out_dir,
        systems=resolved_systems or None,
        force_refresh=force_refresh,
        concurrency=resolved_concurrency,
        min_confidence=resolved_min_confidence,
        on_repo_start=(lambda n: click.echo(f"  Extracting {n}...")) if verbose else None,
        on_repo_complete=_on_complete,
        on_repo_failed=lambda n, e: click.echo(f"  ✗ {n}: {e}", err=True),
    ))

    review_path = result.get("review_path")
    pending = result.get("pending", 0)
    total = result.get("total_candidates", 0)
    click.echo(f"\n✓ Review file written → {review_path}")
    click.echo(f"  {total} candidates proposed, {pending} pending review.")
    click.echo(f"\n  Next: arch-atlas-import review {review_path}")


@main.command("review")
@click.argument("review_file", type=click.Path(exists=True, dir_okay=False))
def review_command(review_file: str) -> None:
    """Interactively accept, reject, or edit candidates in REVIEW_FILE.

    \b
    Keys during the wizard:
        a  Accept
        r  Reject
        e  Edit target name / relationship type, then accept
        s  Skip (keep as pending)
        q  Save progress and quit
    """
    from .review.cli_wizard import run_wizard
    run_wizard(Path(review_file))


@main.command("finalize")
@click.argument("review_file", type=click.Path(exists=True, dir_okay=False))
@click.option("--output", default=None, help="Output directory (default: same dir as REVIEW_FILE).")
def finalize_command(review_file: str, output: Optional[str]) -> None:
    """Build architecture.arch.json from accepted candidates in REVIEW_FILE."""
    review_path = Path(review_file)
    out_dir = Path(output).resolve() if output else review_path.parent

    result = _run_in_loop(run_finalize_pipeline(review_path, out_dir))
    diagram_path = result.get("diagram_path")
    accepted = result.get("accepted", 0)

    if not diagram_path:
        click.echo("\n✗ No accepted candidates found. Run `review` first.", err=True)
        sys.exit(2)

    click.echo(f"\n✓ Diagram written → {diagram_path}  ({accepted} connections)")


def _discover_repos(root: Path) -> list[dict[str, Any]]:
    """Return all immediate subdirectories of root as repo dicts."""
    repos: list[dict[str, Any]] = []
    try:
        for child in sorted(root.iterdir()):
            if child.is_dir() and not child.name.startswith("."):
                repos.append({"name": child.name, "path": str(child)})
    except PermissionError:
        pass
    return repos


def _cloud_consent(repos: list[dict[str, Any]]) -> None:
    click.echo("\n⚠  Cloud provider: Anthropic")
    click.echo("   Static analysis data from these repositories will be sent for LLM enrichment:")
    for r in repos:
        click.echo(f"   - {r['name']}")
    click.echo("   Security exclusions applied: .env, *.key, *.pem, secrets, node_modules, .git")
    answer = click.prompt('\n   Type "yes" to continue or Ctrl+C to abort')
    if answer.strip().lower() != "yes":
        click.echo("Aborted.", err=True)
        sys.exit(5)


if __name__ == "__main__":
    main()
