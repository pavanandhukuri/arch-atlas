"""Base classes and types for LLM providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class CompletionOptions:
    timeout_s: float = 1800.0  # local reasoning models (27B+, uncapped thinking) can be very slow; 30 min ceiling
    max_retries: int = 2


class ProviderError(Exception):
    """Raised when an LLM provider call fails."""

    def __init__(self, message: str, provider: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable


class LLMProvider(ABC):
    """Abstract base class for LLM provider implementations."""

    name: str

    @abstractmethod
    async def complete(
        self,
        prompt: str,
        options: Optional[CompletionOptions] = None,
    ) -> str:
        """Send a prompt and return the text response."""
