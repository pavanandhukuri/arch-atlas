"""Unit tests for OllamaProvider (T038)."""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from llm_importer.providers.base import CompletionOptions, ProviderError
from llm_importer.providers.ollama_provider import OllamaProvider


def _make_ok_response(content: str) -> MagicMock:
    """Build a mock httpx.Response that returns a valid Ollama chat response."""
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "model": "qwen2.5-coder:7b",
        "message": {"role": "assistant", "content": content},
        "done": True,
    }
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


def _make_error_response(status_code: int) -> MagicMock:
    """Build a mock httpx.Response that raises HTTPStatusError."""
    request = MagicMock(spec=httpx.Request)
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        f"HTTP {status_code}", request=request, response=response
    )
    return response


class TestOllamaProviderInit:
    def test_name_is_ollama(self) -> None:
        provider = OllamaProvider({"endpoint": "http://localhost:11434"})
        assert provider.name == "ollama"

    def test_default_endpoint_when_not_specified(self) -> None:
        provider = OllamaProvider({})
        assert provider._endpoint == "http://localhost:11434"

    def test_endpoint_trailing_slash_stripped(self) -> None:
        provider = OllamaProvider({"endpoint": "http://localhost:11434/"})
        assert provider._endpoint == "http://localhost:11434"

    def test_default_model(self) -> None:
        provider = OllamaProvider({})
        assert provider._model == OllamaProvider.DEFAULT_MODEL

    def test_custom_model(self) -> None:
        provider = OllamaProvider({"model": "llama3:8b"})
        assert provider._model == "llama3:8b"

    def test_custom_endpoint(self) -> None:
        provider = OllamaProvider({"endpoint": "http://myhost:12345"})
        assert provider._endpoint == "http://myhost:12345"


class TestOllamaProviderComplete:
    async def test_successful_post_returns_content(self) -> None:
        """A successful POST to /api/chat returns the assistant content string."""
        provider = OllamaProvider({"endpoint": "http://localhost:11434"})
        ok_response = _make_ok_response("Here is the analysis result.")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=ok_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await provider.complete("analyze this repo")

        assert result == "Here is the analysis result."
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://localhost:11434/api/chat"
        payload = call_args[1]["json"]
        assert payload["model"] == OllamaProvider.DEFAULT_MODEL
        assert payload["messages"][0]["role"] == "user"
        assert payload["messages"][0]["content"] == "analyze this repo"
        assert payload["stream"] is False

    async def test_timeout_raises_provider_error_after_retries(self) -> None:
        """TimeoutException triggers retries, then raises ProviderError."""
        provider = OllamaProvider({"endpoint": "http://localhost:11434"})

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError, match="Ollama API call failed"):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=1.0, max_retries=2)
                )

        assert mock_client.post.call_count == 3  # 1 initial + 2 retries

    async def test_503_status_retries_then_raises_provider_error(self) -> None:
        """HTTP 503 response retries exhausted → ProviderError."""
        provider = OllamaProvider({"endpoint": "http://localhost:11434"})
        error_response = _make_error_response(503)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=error_response)

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError, match="Ollama API call failed"):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=5.0, max_retries=2)
                )

    async def test_missing_content_raises_provider_error(self) -> None:
        """Empty content field in response raises ProviderError immediately."""
        provider = OllamaProvider({"endpoint": "http://localhost:11434"})

        empty_response = MagicMock(spec=httpx.Response)
        empty_response.status_code = 200
        empty_response.raise_for_status = MagicMock()
        empty_response.json.return_value = {
            "message": {"role": "assistant", "content": ""},
            "done": True,
        }

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=empty_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ProviderError, match="Empty or missing content"):
                await provider.complete("prompt")

    async def test_connect_error_retries_then_raises(self) -> None:
        """ConnectError triggers retries, then raises ProviderError."""
        provider = OllamaProvider({"endpoint": "http://localhost:11434"})

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=1.0, max_retries=1)
                )

        assert mock_client.post.call_count == 2  # 1 initial + 1 retry

    async def test_provider_name_attribute(self) -> None:
        provider = OllamaProvider({})
        assert provider.name == "ollama"
