"""Provider factory — creates the correct LLMProvider from config."""
from __future__ import annotations

from typing import Any, Optional

from ..config.loader import ConfigError
from .anthropic_provider import AnthropicProvider
from .base import LLMProvider
from .mlx_provider import MLXProvider
from .ollama_provider import OllamaProvider
from .openai_provider import OpenAIProvider


def create_provider(
    config: dict[str, Any],
    provider_override: Optional[str] = None,
) -> LLMProvider:
    """Instantiate and return an LLMProvider based on config or override.

    Args:
        config: Full resolved import config dict.
        provider_override: Optional provider type string that overrides config.

    Returns:
        An LLMProvider instance.

    Raises:
        ConfigError: If the provider type is unknown.
    """
    provider_type = provider_override or config["provider"]["type"]

    if provider_type == "anthropic":
        return AnthropicProvider(config["provider"])
    elif provider_type == "ollama":
        return OllamaProvider(config["provider"])
    elif provider_type == "openai":
        return OpenAIProvider(config["provider"])
    elif provider_type == "mlx":
        return MLXProvider(config["provider"])
    else:
        raise ConfigError(f"Unknown provider type: {provider_type!r}")
