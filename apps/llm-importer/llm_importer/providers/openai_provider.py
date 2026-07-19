"""OpenAI-compatible chat-completions LLM provider (e.g. local MLX servers)."""
from __future__ import annotations

import asyncio
import os
from typing import Any, Optional

import httpx

from .base import CompletionOptions, LLMProvider, ProviderError

_DEFAULT_MODEL = "gpt-4o-mini"
_DEFAULT_ENDPOINT = "http://localhost:8000/v1"


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


class OpenAIProvider(LLMProvider):
    """LLM provider backed by any OpenAI-compatible /v1/chat/completions endpoint."""

    name = "openai"
    DEFAULT_MODEL = _DEFAULT_MODEL
    DEFAULT_ENDPOINT = _DEFAULT_ENDPOINT

    def __init__(self, config: dict[str, Any]) -> None:
        endpoint = config.get("endpoint") or self.DEFAULT_ENDPOINT
        self._endpoint = endpoint.rstrip("/")
        self._model = config.get("model", self.DEFAULT_MODEL)

        api_key = config.get("apiKey")
        if not api_key:
            env_var = config.get("apiKeyEnvVar")
            if env_var:
                api_key = os.environ.get(env_var)
        self._api_key = api_key
        # Low temperature by default — this provider is used for classification/extraction
        # tasks where run-to-run reproducibility matters more than creative variation.
        self._temperature = config.get("temperature", 0.2)

    async def complete(
        self,
        prompt: str,
        options: Optional[CompletionOptions] = None,
    ) -> str:
        opts = options or CompletionOptions()
        last_exc: Optional[BaseException] = None

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        for attempt in range(opts.max_retries + 1):
            if attempt > 0:
                await asyncio.sleep(2 ** (attempt - 1))

            try:
                async with httpx.AsyncClient(timeout=opts.timeout_s) as client:
                    response = await client.post(
                        f"{self._endpoint}/chat/completions",
                        headers=headers,
                        json={
                            "model": self._model,
                            "messages": [{"role": "user", "content": prompt}],
                            "stream": False,
                            "temperature": self._temperature,
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    if "error" in data:
                        raise ProviderError(
                            f"OpenAI-compatible server returned an error: {data['error'].get('message', data['error'])}",
                            provider="openai",
                        )
                    choices = data.get("choices") or []
                    content = choices[0].get("message", {}).get("content", "") if choices else ""
                    if not content:
                        raise ProviderError(
                            "Empty or missing content in OpenAI-compatible response",
                            provider="openai",
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
            f"OpenAI-compatible API call failed after {opts.max_retries + 1} attempt(s): {last_exc}",
            provider="openai",
            retryable=False,
        )
