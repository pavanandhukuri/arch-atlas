"""Tests for AnthropicProvider — written before implementation (TDD)."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from llm_importer.providers.anthropic_provider import AnthropicProvider
from llm_importer.providers.base import CompletionOptions, ProviderError


@pytest.fixture(autouse=True)
def set_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-123")


def make_message_response(text: str) -> MagicMock:
    content = MagicMock()
    content.type = "text"
    content.text = text
    msg = MagicMock()
    msg.content = [content]
    return msg


class TestAnthropicProviderInit:
    def test_raises_when_api_key_not_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(ProviderError, match="ANTHROPIC_API_KEY"):
            AnthropicProvider({"type": "anthropic"})

    def test_raises_when_custom_env_var_not_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("MY_KEY", raising=False)
        with pytest.raises(ProviderError, match="MY_KEY"):
            AnthropicProvider({"type": "anthropic", "apiKeyEnvVar": "MY_KEY"})

    def test_accepts_custom_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MY_KEY", "custom-value")
        provider = AnthropicProvider({"type": "anthropic", "apiKeyEnvVar": "MY_KEY"})
        assert provider.name == "anthropic"

    def test_name_is_anthropic(self) -> None:
        provider = AnthropicProvider({"type": "anthropic"})
        assert provider.name == "anthropic"


class TestAnthropicProviderComplete:
    @pytest.mark.asyncio
    async def test_returns_text_content(self) -> None:
        provider = AnthropicProvider({"type": "anthropic"})
        mock_response = make_message_response("Hello from Claude")
        with patch.object(provider._client.messages, "create", new=AsyncMock(return_value=mock_response)):
            result = await provider.complete("test prompt")
        assert result == "Hello from Claude"

    @pytest.mark.asyncio
    async def test_retries_on_server_error(self) -> None:
        provider = AnthropicProvider({"type": "anthropic"})
        server_error = Exception("Service Unavailable")
        server_error.status_code = 503  # type: ignore[attr-defined]
        mock_response = make_message_response("ok after retry")

        call_count = 0

        async def flaky_create(**kwargs: object) -> MagicMock:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise server_error
            return mock_response

        with patch.object(provider._client.messages, "create", new=flaky_create):
            result = await provider.complete("test", CompletionOptions(timeout_s=5.0, max_retries=2))

        assert result == "ok after retry"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_raises_provider_error_after_all_retries(self) -> None:
        provider = AnthropicProvider({"type": "anthropic"})
        server_error = Exception("Service Unavailable")
        server_error.status_code = 503  # type: ignore[attr-defined]

        async def always_fail(**kwargs: object) -> None:
            raise server_error

        with patch.object(provider._client.messages, "create", new=always_fail):
            with pytest.raises(ProviderError):
                await provider.complete("test", CompletionOptions(timeout_s=5.0, max_retries=2))

    @pytest.mark.asyncio
    async def test_raises_provider_error_on_non_retryable(self) -> None:
        provider = AnthropicProvider({"type": "anthropic"})
        auth_error = Exception("Unauthorized")
        auth_error.status_code = 401  # type: ignore[attr-defined]

        async def auth_fail(**kwargs: object) -> None:
            raise auth_error

        with patch.object(provider._client.messages, "create", new=auth_fail):
            with pytest.raises(ProviderError):
                await provider.complete("test", CompletionOptions(max_retries=2))
