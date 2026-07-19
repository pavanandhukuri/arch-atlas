"""Data models for the extraction pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ExtractionSignal:
    """One piece of evidence that a connection exists."""
    source_file: str        # relative path within the repo
    line: int
    target_service: str     # raw extracted target name or URL fragment
    connection_type: str    # http | database | kafka | queue | grpc | unknown
    confidence: float       # 0.0 – 1.0
    evidence_text: str      # short snippet for the evidence string
    target_address: Optional[str] = None   # URL / host:port if extractable
    topic: Optional[str] = None            # Kafka topic name if applicable


@dataclass
class RepoScanResult:
    """All signals extracted from a single repository."""
    repo_name: str
    repo_path: str
    signals: list[ExtractionSignal] = field(default_factory=list)
    files_scanned: int = 0
    files_total: int = 0
