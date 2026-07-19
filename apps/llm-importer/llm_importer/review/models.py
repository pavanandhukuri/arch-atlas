"""Pydantic models for the human-review YAML file."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ReviewCandidate(BaseModel):
    id: str
    source: str
    target: str
    type: str                    # database | http | kafka | queue | grpc
    reasoning: str
    confidence: Literal["high", "medium", "low"]
    status: Literal["pending", "accepted", "rejected"] = "pending"
    override_name: Optional[str] = None   # human renames the target node
    override_type: Optional[str] = None  # human changes the relationship type


class SystemGroup(BaseModel):
    name: str
    repositories: list[str] = Field(default_factory=list)


class ReviewFile(BaseModel):
    version: str = "1.0"
    generated_at: str
    source_repos: list[str] = Field(default_factory=list)
    systems: list[SystemGroup] = Field(default_factory=list)
    candidates: list[ReviewCandidate] = Field(default_factory=list)
