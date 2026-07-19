"""Tests for the human-review pipeline: models, review_manager, cli_wizard."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from llm_importer.review.models import ReviewCandidate, ReviewFile
from llm_importer.review.review_manager import (
    _pretty,
    _slug,
    build_diagram_from_review,
    default_review_path,
    load_review,
    merge_candidates,
    save_review,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_candidate(
    idx: int = 1,
    source: str = "order-service",
    target: str = "PostgreSQL",
    conn_type: str = "database",
    confidence: str = "high",
    status: str = "pending",
    override_name: str | None = None,
) -> ReviewCandidate:
    return ReviewCandidate(
        id=f"cand_{idx}",
        source=source,
        target=target,
        type=conn_type,
        reasoning="Direct dependency.",
        confidence=confidence,  # type: ignore[arg-type]
        status=status,          # type: ignore[arg-type]
        override_name=override_name,
    )


def _make_review(*candidates: ReviewCandidate) -> ReviewFile:
    return ReviewFile(
        generated_at="2026-06-13T00:00:00+00:00",
        source_repos=["order-service"],
        candidates=list(candidates),
    )


# ── ReviewCandidate model ─────────────────────────────────────────────────────

class TestReviewCandidate:
    def test_defaults(self) -> None:
        c = _make_candidate()
        assert c.status == "pending"
        assert c.override_name is None
        assert c.override_type is None

    def test_accepted_status(self) -> None:
        c = _make_candidate(status="accepted")
        assert c.status == "accepted"

    def test_rejected_status(self) -> None:
        c = _make_candidate(status="rejected")
        assert c.status == "rejected"

    def test_override_name(self) -> None:
        c = _make_candidate(override_name="Keycloak")
        assert c.override_name == "Keycloak"

    def test_confidence_values(self) -> None:
        for conf in ("high", "medium", "low"):
            c = _make_candidate(confidence=conf)
            assert c.confidence == conf


# ── ReviewFile model ──────────────────────────────────────────────────────────

class TestReviewFile:
    def test_empty(self) -> None:
        r = ReviewFile(generated_at="2026-01-01T00:00:00+00:00")
        assert r.candidates == []
        assert r.source_repos == []
        assert r.version == "1.0"

    def test_with_candidates(self) -> None:
        r = _make_review(_make_candidate(1), _make_candidate(2))
        assert len(r.candidates) == 2

    def test_serialization_roundtrip(self) -> None:
        r = _make_review(_make_candidate(1, status="accepted"))
        data = r.model_dump(mode="json")
        r2 = ReviewFile.model_validate(data)
        assert r2.candidates[0].status == "accepted"


# ── save / load ───────────────────────────────────────────────────────────────

class TestSaveLoad:
    def test_roundtrip(self, tmp_path: Path) -> None:
        review = _make_review(
            _make_candidate(1, status="accepted"),
            _make_candidate(2, source="notification-service", target="Kafka", conn_type="kafka"),
        )
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)
        assert path.exists()
        loaded = load_review(path)
        assert len(loaded.candidates) == 2
        assert loaded.candidates[0].status == "accepted"
        assert loaded.candidates[1].type == "kafka"

    def test_default_review_path(self, tmp_path: Path) -> None:
        p = default_review_path(tmp_path)
        assert p.name == "architecture.review.yaml"
        assert p.parent == tmp_path

    def test_override_name_persisted(self, tmp_path: Path) -> None:
        review = _make_review(_make_candidate(1, override_name="Keycloak"))
        path = tmp_path / "r.yaml"
        save_review(review, path)
        loaded = load_review(path)
        assert loaded.candidates[0].override_name == "Keycloak"


# ── merge_candidates ──────────────────────────────────────────────────────────

class TestMergeCandidates:
    def test_new_candidates_appended(self) -> None:
        existing = _make_review(_make_candidate(1, status="accepted"))
        new = [_make_candidate(2, source="notification-service", target="Kafka", conn_type="kafka")]
        result = merge_candidates(existing, new)
        assert len(result.candidates) == 2

    def test_decided_candidates_not_duplicated(self) -> None:
        cand = _make_candidate(1, status="accepted")
        existing = _make_review(cand)
        # Same source/target/type — should not be added again
        dupe = _make_candidate(99, status="pending")
        result = merge_candidates(existing, [dupe])
        assert len(result.candidates) == 1

    def test_pending_duplicate_not_added(self) -> None:
        cand = _make_candidate(1, status="pending")
        existing = _make_review(cand)
        dupe = _make_candidate(99, status="pending")
        result = merge_candidates(existing, [dupe])
        assert len(result.candidates) == 1

    def test_different_type_not_merged(self) -> None:
        existing = _make_review(_make_candidate(1, conn_type="database", status="accepted"))
        new = [_make_candidate(2, conn_type="http")]
        result = merge_candidates(existing, new)
        assert len(result.candidates) == 2

    def test_preserves_human_decisions(self) -> None:
        rejected = _make_candidate(1, status="rejected")
        existing = _make_review(rejected)
        new = [_make_candidate(2, source="other-svc", target="Redis", conn_type="database")]
        result = merge_candidates(existing, new)
        assert result.candidates[0].status == "rejected"


# ── build_diagram_from_review ─────────────────────────────────────────────────

class TestBuildDiagram:
    def test_only_accepted_in_diagram(self) -> None:
        review = _make_review(
            _make_candidate(1, status="accepted"),
            _make_candidate(2, source="order-service", target="Redis",
                            conn_type="database", status="rejected"),
        )
        diagram = build_diagram_from_review(review)
        names = {e["name"] for e in diagram["elements"]}
        assert "Redis" not in names

    def test_accepted_builds_relationship(self) -> None:
        review = _make_review(_make_candidate(1, status="accepted"))
        diagram = build_diagram_from_review(review)
        assert len(diagram["relationships"]) == 1
        assert diagram["relationships"][0]["type"] == "uses"

    def test_http_relationship_type_is_calls(self) -> None:
        review = _make_review(
            _make_candidate(1, target="auth.example.com", conn_type="http", status="accepted")
        )
        diagram = build_diagram_from_review(review)
        assert diagram["relationships"][0]["type"] == "calls"

    def test_kafka_relationship_type_is_publishes(self) -> None:
        review = _make_review(
            _make_candidate(1, target="Kafka", conn_type="kafka", status="accepted")
        )
        diagram = build_diagram_from_review(review)
        assert diagram["relationships"][0]["type"] == "publishes"

    def test_override_name_used_in_diagram(self) -> None:
        review = _make_review(
            _make_candidate(1, target="account.naea1.example.com",
                            conn_type="http", override_name="Keycloak", status="accepted")
        )
        diagram = build_diagram_from_review(review)
        names = {e["name"] for e in diagram["elements"]}
        assert "Keycloak" in names
        assert not any("naea1" in n for n in names)

    def test_empty_accepted_returns_empty_diagram(self) -> None:
        review = _make_review(_make_candidate(1, status="rejected"))
        diagram = build_diagram_from_review(review)
        assert diagram["elements"] == []
        assert diagram["relationships"] == []

    def test_schema_version(self) -> None:
        review = _make_review(_make_candidate(1, status="accepted"))
        diagram = build_diagram_from_review(review)
        assert diagram["schemaVersion"] == "1.0.0"

    def test_layout_generated(self) -> None:
        review = _make_review(_make_candidate(1, status="accepted"))
        diagram = build_diagram_from_review(review)
        assert diagram["views"]
        assert diagram["views"][0]["layout"]["nodes"]

    def test_deduplication_of_shared_targets(self) -> None:
        review = _make_review(
            _make_candidate(1, source="svc-a", target="PostgreSQL",
                            conn_type="database", status="accepted"),
            _make_candidate(2, source="svc-b", target="PostgreSQL",
                            conn_type="database", status="accepted"),
        )
        diagram = build_diagram_from_review(review)
        pg_nodes = [e for e in diagram["elements"] if "Postgresql" in e["name"] or "PostgreSQL" in e["name"]]
        assert len(pg_nodes) == 1
        assert len(diagram["relationships"]) == 2


# ── helper functions ──────────────────────────────────────────────────────────

class TestHelpers:
    def test_slug_kebab(self) -> None:
        assert _slug("order-service") == "order-service"

    def test_slug_snake(self) -> None:
        assert _slug("order_service") == "order-service"

    def test_slug_uppercase(self) -> None:
        assert _slug("PostgreSQL") == "postgresql"

    def test_pretty_kebab(self) -> None:
        assert _pretty("order-service") == "Order Service"

    def test_pretty_snake(self) -> None:
        assert _pretty("order_service") == "Order Service"

    def test_pretty_single(self) -> None:
        assert _pretty("Redis") == "Redis"


# ── cli_wizard (mocked) ───────────────────────────────────────────────────────

class TestCliWizard:
    def test_accept_flow(self, tmp_path: Path) -> None:
        from llm_importer.review.cli_wizard import run_wizard

        review = _make_review(_make_candidate(1))
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)

        with patch("click.prompt", return_value="a"), patch("click.echo"):
            run_wizard(path)

        loaded = load_review(path)
        assert loaded.candidates[0].status == "accepted"

    def test_reject_flow(self, tmp_path: Path) -> None:
        from llm_importer.review.cli_wizard import run_wizard

        review = _make_review(_make_candidate(1))
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)

        with patch("click.prompt", return_value="r"), patch("click.echo"):
            run_wizard(path)

        loaded = load_review(path)
        assert loaded.candidates[0].status == "rejected"

    def test_quit_preserves_pending(self, tmp_path: Path) -> None:
        from llm_importer.review.cli_wizard import run_wizard

        review = _make_review(_make_candidate(1), _make_candidate(2, target="Redis"))
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)

        with patch("click.prompt", return_value="q"), patch("click.echo"):
            run_wizard(path)

        loaded = load_review(path)
        assert loaded.candidates[0].status == "pending"

    def test_skip_leaves_pending(self, tmp_path: Path) -> None:
        from llm_importer.review.cli_wizard import run_wizard

        review = _make_review(_make_candidate(1))
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)

        with patch("click.prompt", return_value="s"), patch("click.echo"):
            run_wizard(path)

        loaded = load_review(path)
        assert loaded.candidates[0].status == "pending"

    def test_all_reviewed_shows_summary(self, tmp_path: Path) -> None:
        from llm_importer.review.cli_wizard import run_wizard

        review = _make_review(_make_candidate(1, status="accepted"))
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)

        with patch("click.echo") as mock_echo:
            run_wizard(path)

        # Summary should be printed even when no pending
        assert mock_echo.called

    def test_edit_flow(self, tmp_path: Path) -> None:
        from llm_importer.review.cli_wizard import run_wizard

        review = _make_review(_make_candidate(1, target="account.naea1.example.com", conn_type="http"))
        path = tmp_path / "architecture.review.yaml"
        save_review(review, path)

        with (
            patch("click.prompt", side_effect=["e", "Keycloak", "calls"]),
            patch("click.echo"),
        ):
            run_wizard(path)

        loaded = load_review(path)
        assert loaded.candidates[0].status == "accepted"
        assert loaded.candidates[0].override_name == "Keycloak"
