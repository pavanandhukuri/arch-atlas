"""Tests for the CLI (using Click test runner)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

from click.testing import CliRunner

from llm_importer.cli import main

_PIPELINE_RESULT = {
    "metadata_list": [],
    "diagram_path": None,
    "failed_repos": [],
}


def _patch_pipeline(return_value=None):
    mock = AsyncMock(return_value=return_value or _PIPELINE_RESULT)
    return patch("llm_importer.cli.run_pipeline", mock)


class TestRunCommand:
    def test_help_prints_usage(self) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["run", "--help"])
        assert result.exit_code == 0
        assert "PROJECTS_DIR" in result.output

    def test_exits_1_when_no_repos_found(self, tmp_path: Path) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["run", str(tmp_path)])
        assert result.exit_code == 1
        assert "No repositories found" in result.output

    def test_exits_1_with_unmatched_repos_filter(self, tmp_path: Path) -> None:
        (tmp_path / "myrepo").mkdir()
        runner = CliRunner()
        result = runner.invoke(main, ["run", str(tmp_path), "--repos", "nonexistent"])
        assert result.exit_code == 1

    def test_discovers_subdirectories_as_repos(self, tmp_path: Path) -> None:
        for name in ("service-a", "service-b"):
            (tmp_path / name).mkdir()

        with _patch_pipeline() as mock_pipeline:
            runner = CliRunner()
            runner.invoke(main, ["run", str(tmp_path), "--analyze-only"])
            assert mock_pipeline.called
            call_args = mock_pipeline.call_args
            repos_arg = call_args.kwargs.get("repos") or call_args.args[0]
            assert len(repos_arg) == 2
            names = {r["name"] for r in repos_arg}
            assert "service-a" in names
            assert "service-b" in names

    def test_repos_filter_narrows_discovery(self, tmp_path: Path) -> None:
        for name in ("alpha", "beta", "gamma"):
            (tmp_path / name).mkdir()

        with _patch_pipeline() as mock_pipeline:
            runner = CliRunner()
            runner.invoke(main, ["run", str(tmp_path), "--repos", "alpha,gamma", "--analyze-only"])
            call_args = mock_pipeline.call_args
            repos_arg = call_args.kwargs.get("repos") or call_args.args[0]
            names = {r["name"] for r in repos_arg}
            assert names == {"alpha", "gamma"}

    def test_analyze_only_flag_passed_through(self, tmp_path: Path) -> None:
        (tmp_path / "svc").mkdir()
        with _patch_pipeline() as mock_pipeline:
            runner = CliRunner()
            runner.invoke(main, ["run", str(tmp_path), "--analyze-only"])
            assert mock_pipeline.call_args.kwargs["analyze_only"] is True

    def test_force_refresh_flag_passed_through(self, tmp_path: Path) -> None:
        (tmp_path / "svc").mkdir()
        with _patch_pipeline() as mock_pipeline:
            runner = CliRunner()
            runner.invoke(main, ["run", str(tmp_path), "--force-refresh", "--analyze-only"])
            assert mock_pipeline.call_args.kwargs["force_refresh"] is True

    def test_failed_repos_reported_in_output(self, tmp_path: Path) -> None:
        (tmp_path / "svc").mkdir()
        result_with_failure = {**_PIPELINE_RESULT, "failed_repos": ["svc"]}
        with _patch_pipeline(result_with_failure):
            runner = CliRunner()
            result = runner.invoke(main, ["run", str(tmp_path), "--analyze-only"])
            assert "svc" in result.output or "failed" in result.output.lower()

    def test_writes_diagram_path_to_output(self, tmp_path: Path) -> None:
        (tmp_path / "svc").mkdir()
        diagram_path = tmp_path / ".arch-atlas" / "architecture.arch.json"
        result_with_diagram = {**_PIPELINE_RESULT, "diagram_path": diagram_path}
        with _patch_pipeline(result_with_diagram):
            runner = CliRunner()
            result = runner.invoke(main, ["run", str(tmp_path), "--analyze-only"])
            assert str(diagram_path) in result.output or "Diagram" in result.output
