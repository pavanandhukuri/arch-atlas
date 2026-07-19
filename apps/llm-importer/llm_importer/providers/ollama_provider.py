"""Ollama LLM provider implementation."""
from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx

from .base import CompletionOptions, LLMProvider, ProviderError

_DEFAULT_MODEL = "qwen2.5-coder:7b"


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


class OllamaProvider(LLMProvider):
    """LLM provider backed by a local Ollama instance."""

    name = "ollama"
    DEFAULT_MODEL = _DEFAULT_MODEL

    def __init__(self, config: dict[str, Any]) -> None:
        endpoint = config.get("endpoint") or "http://localhost:11434"
        if not endpoint:
            raise ProviderError("Ollama endpoint required", provider="ollama")
        self._endpoint = endpoint.rstrip("/")
        self._model = config.get("model", self.DEFAULT_MODEL)

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
                async with httpx.AsyncClient(timeout=opts.timeout_s) as client:
                    response = await client.post(
                        f"{self._endpoint}/api/chat",
                        json={
                            "model": self._model,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": False,
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    message = data.get("message", {})
                    content = message.get("content", "")
                    if not content:
                        raise ProviderError(
                            "Empty or missing content in Ollama response",
                            provider="ollama",
                        )
                    return str(content)

            except ProviderError:
                raise
            except httpx.TimeoutException as exc:
                last_exc = exc
                if attempt < opts.max_retries:
                    continue
            except httpx.ConnectError as exc:
                last_exc = exc
                if attempt < opts.max_retries:
                    continue
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if _is_retryable_status(exc.response.status_code) and attempt < opts.max_retries:
                    continue
                break
            except Exception as exc:
                last_exc = exc
                break

        raise ProviderError(
            f"Ollama API call failed after {opts.max_retries + 1} attempt(s): {last_exc}",
            provider="ollama",
            retryable=False,
        )
