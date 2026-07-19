"""Interactive CLI wizard for reviewing architecture candidates."""
from __future__ import annotations

from pathlib import Path

import click

from .models import ReviewCandidate, ReviewFile
from .review_manager import load_review, save_review

_CONF_COLOR = {"high": "green", "medium": "yellow", "low": "red"}
_STATUS_ICON = {"accepted": "✓", "rejected": "✗", "pending": "·"}


def run_wizard(review_path: Path) -> None:
    review = load_review(review_path)
    pending = [c for c in review.candidates if c.status == "pending"]

    if not pending:
        total = len(review.candidates)
        accepted = sum(1 for c in review.candidates if c.status == "accepted")
        rejected = sum(1 for c in review.candidates if c.status == "rejected")
        click.echo(
            f"\nAll {total} candidates already reviewed  "
            f"(✓ {accepted} accepted, ✗ {rejected} rejected)."
        )
        _print_summary(review)
        return

    total = len(review.candidates)
    click.echo(f"\n  {len(pending)} pending  /  {total} total candidates\n")

    for i, cand in enumerate(pending, 1):
        _print_candidate(cand, i, len(pending))

        action = _prompt_action(cand)

        if action == "q":
            save_review(review, review_path)
            click.echo(f"\n  Progress saved. {_count_pending(review)} candidates still pending.")
            return
        elif action == "s":
            continue
        elif action == "a":
            cand.status = "accepted"
            click.echo(click.style("  ✓ Accepted", fg="green"))
        elif action == "r":
            cand.status = "rejected"
            click.echo(click.style("  ✗ Rejected", fg="red"))
        elif action == "e":
            _edit_candidate(cand)

        save_review(review, review_path)

    click.echo()
    _print_summary(review)


def _print_candidate(cand: ReviewCandidate, idx: int, total: int) -> None:
    sep = "─" * 60
    click.echo(f"\n{sep}")
    click.echo(
        f"  [{idx}/{total}]  "
        + click.style(cand.source, fg="cyan", bold=True)
        + "  →  "
        + click.style(cand.override_name or cand.target, fg="white", bold=True)
    )
    click.echo(sep)
    click.echo(f"  Type        : {cand.type}")
    click.echo(
        "  Confidence  : "
        + click.style(cand.confidence, fg=_CONF_COLOR.get(cand.confidence, "white"))
    )
    # Word-wrap reasoning at 70 chars
    words = cand.reasoning.split()
    line: list[str] = []
    lines: list[str] = []
    for word in words:
        if sum(len(w) + 1 for w in line) + len(word) > 70:
            lines.append(" ".join(line))
            line = [word]
        else:
            line.append(word)
    if line:
        lines.append(" ".join(line))
    prefix = "  Reasoning   : "
    for j, ln in enumerate(lines):
        click.echo(prefix + ln)
        prefix = "               "


def _prompt_action(cand: ReviewCandidate) -> str:
    while True:
        raw = click.prompt(
            "\n  [a] Accept  [r] Reject  [e] Edit name  [s] Skip  [q] Quit",
            default="a",
            prompt_suffix="  > ",
            show_default=False,
        ).strip().lower()
        if raw in ("a", "r", "e", "s", "q"):
            return raw
        click.echo("  Please enter a, r, e, s, or q.")


def _edit_candidate(cand: ReviewCandidate) -> None:
    click.echo()
    new_name = click.prompt(
        f"  New name for target (current: {cand.override_name or cand.target})",
        default=cand.override_name or cand.target,
    ).strip()
    if new_name and new_name != cand.target:
        cand.override_name = new_name

    new_type = click.prompt(
        f"  Relationship type (current: {cand.override_type or cand.type})",
        default=cand.override_type or cand.type,
    ).strip()
    if new_type and new_type != cand.type:
        cand.override_type = new_type

    cand.status = "accepted"
    click.echo(click.style(f"  ✓ Accepted as {cand.override_name or cand.target}", fg="green"))


def _count_pending(review: ReviewFile) -> int:
    return sum(1 for c in review.candidates if c.status == "pending")


def _print_summary(review: ReviewFile) -> None:
    click.echo("\n  ── Summary ─────────────────────────────────────")
    for cand in review.candidates:
        icon = _STATUS_ICON[cand.status]
        color = {"accepted": "green", "rejected": "red", "pending": "white"}[cand.status]
        name = cand.override_name or cand.target
        click.echo(
            "  "
            + click.style(icon, fg=color)
            + f"  {cand.source}  →  {name}  [{cand.type}]"
        )
    pending = _count_pending(review)
    if pending:
        click.echo(f"\n  {pending} candidate(s) still pending. Run `review` again to continue.")
    else:
        accepted = sum(1 for c in review.candidates if c.status == "accepted")
        click.echo(f"\n  {accepted} accepted. Run `finalize` to generate the diagram.")
