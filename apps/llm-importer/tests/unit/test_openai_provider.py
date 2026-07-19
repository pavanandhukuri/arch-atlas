"""Unit tests for OpenAIProvider."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from llm_importer.providers.base import CompletionOptions, ProviderError
from llm_importer.providers.openai_provider import OpenAIProvider


def _make_ok_response(content: str) -> MagicMock:
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": content}}],
    }
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


def _make_error_response(status_code: int) -> MagicMock:
    request = MagicMock(spec=httpx.Request)
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        f"HTTP {status_code}", request=request, response=response
    )
    return response


class TestOpenAIProviderInit:
    def test_name_is_openai(self) -> None:
        provider = OpenAIProvider({})
        assert provider.name == "openai"

    def test_default_endpoint_when_not_specified(self) -> None:
        provider = OpenAIProvider({})
        assert provider._endpoint == "http://localhost:8000/v1"

    def test_endpoint_trailing_slash_stripped(self) -> None:
        provider = OpenAIProvider({"endpoint": "http://localhost:8000/v1/"})
        assert provider._endpoint == "http://localhost:8000/v1"

    def test_default_model(self) -> None:
        provider = OpenAIProvider({})
        assert provider._model == OpenAIProvider.DEFAULT_MODEL

    def test_custom_model(self) -> None:
        provider = OpenAIProvider({"model": "gpt-4o"})
        assert provider._model == "gpt-4o"

    def test_no_api_key_by_default(self) -> None:
        provider = OpenAIProvider({})
        assert provider._api_key is None

    def test_api_key_from_config(self) -> None:
        provider = OpenAIProvider({"apiKey": "sk-test"})
        assert provider._api_key == "sk-test"

    def test_api_key_from_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MY_OPENAI_KEY", "sk-from-env")
        provider = OpenAIProvider({"apiKeyEnvVar": "MY_OPENAI_KEY"})
        assert provider._api_key == "sk-from-env"

    def test_direct_api_key_takes_precedence_over_env_var(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("MY_OPENAI_KEY", "sk-from-env")
        provider = OpenAIProvider({"apiKey": "sk-direct", "apiKeyEnvVar": "MY_OPENAI_KEY"})
        assert provider._api_key == "sk-direct"


class TestOpenAIProviderComplete:
    async def test_successful_post_returns_content(self) -> None:
        provider = OpenAIProvider({"apiKey": "sk-test"})
        ok_response = _make_ok_response("Here is the analysis result.")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=ok_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await provider.complete("analyze this repo")

        assert result == "Here is the analysis result."
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://localhost:8000/v1/chat/completions"
        assert call_args[1]["headers"]["Authorization"] == "Bearer sk-test"
        payload = call_args[1]["json"]
        assert payload["model"] == OpenAIProvider.DEFAULT_MODEL
        assert payload["messages"][0]["content"] == "analyze this repo"
        assert payload["stream"] is False

    async def test_no_authorization_header_without_api_key(self) -> None:
        provider = OpenAIProvider({})
        ok_response = _make_ok_response("ok")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=ok_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            await provider.complete("prompt")

        assert "Authorization" not in mock_client.post.call_args[1]["headers"]

    async def test_server_error_field_raises_provider_error(self) -> None:
        provider = OpenAIProvider({})
        error_response = MagicMock(spec=httpx.Response)
        error_response.status_code = 200
        error_response.raise_for_status = MagicMock()
        error_response.json.return_value = {"error": {"message": "invalid request"}}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=error_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ProviderError, match="invalid request"):
                await provider.complete("prompt")

    async def test_missing_content_raises_provider_error(self) -> None:
        provider = OpenAIProvider({})
        empty_response = MagicMock(spec=httpx.Response)
        empty_response.status_code = 200
        empty_response.raise_for_status = MagicMock()
        empty_response.json.return_value = {"choices": [{"message": {"role": "assistant", "content": ""}}]}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=empty_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ProviderError, match="Empty or missing content"):
                await provider.complete("prompt")

    async def test_timeout_raises_provider_error_after_retries(self) -> None:
        provider = OpenAIProvider({})

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError, match="OpenAI-compatible API call failed"):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=1.0, max_retries=2)
                )

        assert mock_client.post.call_count == 3  # 1 initial + 2 retries

    async def test_connect_error_retries_then_raises(self) -> None:
        provider = OpenAIProvider({})

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=1.0, max_retries=1)
                )

        assert mock_client.post.call_count == 2  # 1 initial + 1 retry

    async def test_retryable_5xx_status_retries_then_raises(self) -> None:
        provider = OpenAIProvider({})
        error_response = _make_error_response(503)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=error_response)

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError, match="OpenAI-compatible API call failed"):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=5.0, max_retries=2)
                )

        assert mock_client.post.call_count == 3

    async def test_non_retryable_4xx_status_fails_immediately(self) -> None:
        provider = OpenAIProvider({})
        error_response = _make_error_response(401)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=error_response)

        with patch("httpx.AsyncClient", return_value=mock_client), patch(
            "asyncio.sleep", new=AsyncMock()
        ):
            with pytest.raises(ProviderError):
                await provider.complete(
                    "prompt", CompletionOptions(timeout_s=5.0, max_retries=2)
                )

        # 401 is not in the retryable set (429 or >=500), so no retries happen.
        assert mock_client.post.call_count == 1
