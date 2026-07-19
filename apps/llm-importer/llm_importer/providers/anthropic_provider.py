"""Anthropic Claude LLM provider implementation."""
from __future__ import annotations

import asyncio
import os
from typing import Any, Optional

import anthropic

from .base import CompletionOptions, LLMProvider, ProviderError

_DEFAULT_MODEL = "claude-opus-4-7"
_DEFAULT_MAX_TOKENS = 8192


def _is_retryable(exc: BaseException) -> bool:
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "status", None)
    if isinstance(status, int):
        return status >= 500 or status == 429
    return False


class AnthropicProvider(LLMProvider):
    """LLM provider backed by the Anthropic Messages API."""

    name = "anthropic"

    def __init__(self, config: dict[str, Any]) -> None:
        env_var = config.get("apiKeyEnvVar", "ANTHROPIC_API_KEY")
        api_key = os.environ.get(env_var)
        if not api_key:
            raise ProviderError(
                f"API key not found. Set the {env_var} environment variable.",
                provider="anthropic",
            )
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = config.get("model", _DEFAULT_MODEL)

    async def complete(
        self,
        prompt: str,
        options: Optional[CompletionOptions] = None,
    ) -> str:
        opts = options or CompletionOptions()
        last_exc: Optional[BaseException] = None

        for attempt in range(opts.max_retries + 1):
            if attempt > 0:
                await asyncio.sleep(2 ** (attempt - 1))
            try:
                response = await asyncio.wait_for(
                    self._client.messages.create(
                        model=self._model,
                        max_tokens=_DEFAULT_MAX_TOKENS,
                        messages=[{"role": "user", "content": prompt}],
                    ),
                    timeout=opts.timeout_s,
                )
                first = response.content[0] if response.content else None
                if first is None or first.type != "text":
                    raise ProviderError("No text content in response", provider="anthropic")
                return first.text  # type: ignore[attr-defined]
            except ProviderError:
                raise
            except Exception as exc:
                last_exc = exc
                if not _is_retryable(exc) or attempt == opts.max_retries:
                    break

        raise ProviderError(
            f"Anthropic API call failed after {opts.max_retries + 1} attempt(s): {last_exc}",
            provider="anthropic",
            retryable=False,
        )
