"""Unit tests for MLXProvider."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from llm_importer.providers.mlx_provider import MLXProvider
from llm_importer.providers.openai_provider import OpenAIProvider


def _make_ok_response(content: str) -> MagicMock:
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": content}}],
    }
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


class TestMLXProviderInit:
    def test_name_is_mlx(self) -> None:
        provider = MLXProvider({})
        assert provider.name == "mlx"

    def test_is_an_openai_compatible_provider(self) -> None:
        # Local MLX servers (e.g. the omlx app) speak the OpenAI chat-completions
        # API, so MLXProvider reuses OpenAIProvider's request/response handling
        # verbatim.
        assert issubclass(MLXProvider, OpenAIProvider)

    def test_default_endpoint_is_local_mlx_server(self) -> None:
        provider = MLXProvider({})
        assert provider._endpoint == "http://localhost:8000/v1"

    def test_default_model(self) -> None:
        provider = MLXProvider({})
        assert provider._model == "Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"

    def test_custom_endpoint_overrides_default(self) -> None:
        provider = MLXProvider({"endpoint": "http://localhost:9999/v1"})
        assert provider._endpoint == "http://localhost:9999/v1"

    def test_custom_model_overrides_default(self) -> None:
        provider = MLXProvider({"model": "mlx-community/Llama-3-8B-4bit"})
        assert provider._model == "mlx-community/Llama-3-8B-4bit"

    def test_no_api_key_by_default(self) -> None:
        # Not every local MLX server requires auth, so the provider itself
        # stays neutral — callers opt in via apiKey/apiKeyEnvVar.
        provider = MLXProvider({})
        assert provider._api_key is None

    def test_api_key_passed_through_when_configured(self) -> None:
        # Apps like omlx require an API key even for local requests.
        provider = MLXProvider({"apiKey": "1234"})
        assert provider._api_key == "1234"


class TestMLXProviderComplete:
    async def test_successful_post_hits_local_mlx_endpoint(self) -> None:
        provider = MLXProvider({})
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
        payload = call_args[1]["json"]
        assert payload["model"] == "Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
        # No Authorization header when no API key is configured.
        assert "Authorization" not in call_args[1]["headers"]

    async def test_sends_authorization_header_when_api_key_configured(self) -> None:
        # omlx (and similar apps) return 401 without this.
        provider = MLXProvider({"apiKey": "1234"})
        ok_response = _make_ok_response("Here is the analysis result.")

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=ok_response)

        with patch("httpx.AsyncClient", return_value=mock_client):
            await provider.complete("analyze this repo")

        call_args = mock_client.post.call_args
        assert call_args[1]["headers"]["Authorization"] == "Bearer 1234"
