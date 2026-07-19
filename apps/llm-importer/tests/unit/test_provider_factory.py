"""Unit tests for the provider factory (T039)."""
from __future__ import annotations

import pytest

from llm_importer.config.loader import ConfigError
from llm_importer.providers.anthropic_provider import AnthropicProvider
from llm_importer.providers.factory import create_provider
from llm_importer.providers.mlx_provider import MLXProvider
from llm_importer.providers.ollama_provider import OllamaProvider
from llm_importer.providers.openai_provider import OpenAIProvider


def _config(provider_type: str, **kwargs: object) -> dict:
    base: dict = {
        "version": "1.0",
        "provider": {"type": provider_type, **kwargs},
        "output": {"directory": "/tmp/out", "diagramFileName": "arch.json"},
        "analysis": {
            "maxFilesPerRepo": 200,
            "excludePatterns": [],
            "forceRefresh": False,
            "concurrency": 3,
        },
        "repositories": [],
    }
    return base


class TestCreateProvider:
    def test_anthropic_type_returns_anthropic_provider(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        config = _config("anthropic")
        provider = create_provider(config)
        assert isinstance(provider, AnthropicProvider)

    def test_ollama_type_returns_ollama_provider(self) -> None:
        config = _config("ollama", endpoint="http://localhost:11434")
        provider = create_provider(config)
        assert isinstance(provider, OllamaProvider)

    def test_openai_type_returns_openai_provider(self) -> None:
        config = _config("openai")
        provider = create_provider(config)
        assert isinstance(provider, OpenAIProvider)

    def test_mlx_type_returns_mlx_provider(self) -> None:
        config = _config("mlx")
        provider = create_provider(config)
        assert isinstance(provider, MLXProvider)

    def test_unknown_type_raises_config_error(self) -> None:
        config = _config("gpt4-turbo-vision-pro")
        with pytest.raises(ConfigError, match="Unknown provider type"):
            create_provider(config)

    def test_provider_override_overrides_config_type(self) -> None:
        """provider_override='ollama' returns OllamaProvider even if config says anthropic."""
        config = _config("anthropic")
        # Override config type to ollama — should NOT need an API key
        provider = create_provider(config, provider_override="ollama")
        assert isinstance(provider, OllamaProvider)

    def test_provider_override_anthropic_uses_api_key(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-override")
        config = _config("ollama", endpoint="http://localhost:11434")
        provider = create_provider(config, provider_override="anthropic")
        assert isinstance(provider, AnthropicProvider)

    def test_unknown_override_raises_config_error(self) -> None:
        config = _config("anthropic")
        with pytest.raises(ConfigError, match="Unknown provider type"):
            create_provider(config, provider_override="gpt4")
