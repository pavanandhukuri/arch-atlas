"""MLX provider — local Apple Silicon inference via an OpenAI-compatible MLX server."""
from __future__ import annotations

from .openai_provider import OpenAIProvider


class MLXProvider(OpenAIProvider):
    """LLM provider backed by a local MLX inference server (e.g. the `omlx` macOS app).

    These local MLX servers expose an OpenAI-compatible `/v1/chat/completions`
    endpoint, so this only needs to override the defaults — the request/response
    handling is inherited from OpenAIProvider unchanged. Unlike `mlx_lm.server`,
    apps like `omlx` require an API key even for local requests; pass one via
    `apiKey` / `apiKeyEnvVar` in the provider config (or `--api-key-env`).
    """

    name = "mlx"
    DEFAULT_MODEL = "Qwen3-Coder-30B-A3B-Instruct-MLX-4bit"
    DEFAULT_ENDPOINT = "http://localhost:8000/v1"
