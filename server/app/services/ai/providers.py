from __future__ import annotations

import json
from typing import Protocol
from urllib import error, request

from app.core.config import settings
from app.services.ai.models import AIChatMessage, AIProviderKind, AITextGeneration


class AIProviderError(RuntimeError):
    pass


class AIProvider(Protocol):
    kind: AIProviderKind

    def is_available(self) -> bool:
        ...

    def generate_text(
        self,
        *,
        model: str,
        messages: list[AIChatMessage],
        temperature: float,
        max_tokens: int,
    ) -> AITextGeneration:
        ...


class DisabledAIProvider:
    kind = AIProviderKind.DISABLED

    def __init__(self, reason: str = "AI provider is disabled or not configured.") -> None:
        self.reason = reason

    def is_available(self) -> bool:
        return False

    def generate_text(
        self,
        *,
        model: str,
        messages: list[AIChatMessage],
        temperature: float,
        max_tokens: int,
    ) -> AITextGeneration:
        raise AIProviderError(self.reason)


class MockAIProvider:
    kind = AIProviderKind.MOCK

    def is_available(self) -> bool:
        return True

    def generate_text(
        self,
        *,
        model: str,
        messages: list[AIChatMessage],
        temperature: float,
        max_tokens: int,
    ) -> AITextGeneration:
        latest_user_prompt = next((message.content for message in reversed(messages) if message.role == "user"), "")
        excerpt = " ".join(latest_user_prompt.split())[:180].strip()
        content = (
            "Subject: Mock AI Draft Preview\n\n"
            "This is deterministic mock output from the local AI scaffold.\n\n"
            f"Prompt excerpt: {excerpt}"
        )
        return AITextGeneration(
            provider=self.kind,
            model=model,
            content=content,
            warnings=("Mock provider output. Use an OpenAI-compatible endpoint before production rollout.",),
        )


class OpenAICompatibleAIProvider:
    kind = AIProviderKind.OPENAI_COMPATIBLE

    def __init__(self, base_url: str | None, api_key: str | None, timeout_seconds: int) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def is_available(self) -> bool:
        return bool(self.base_url)

    def generate_text(
        self,
        *,
        model: str,
        messages: list[AIChatMessage],
        temperature: float,
        max_tokens: int,
    ) -> AITextGeneration:
        if not self.is_available():
            raise AIProviderError("AI_BASE_URL is not configured for the openai_compatible provider.")

        payload = {
            "model": model,
            "messages": [{"role": message.role, "content": message.content} for message in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        raw_response = _post_json(
            url=f"{self.base_url}/chat/completions",
            payload=payload,
            headers=headers,
            timeout_seconds=self.timeout_seconds,
        )
        choices = raw_response.get("choices") or []
        if not choices:
            raise AIProviderError("AI provider returned no completion choices.")

        message = choices[0].get("message") or {}
        content = _extract_content(message.get("content"))
        if not content:
            raise AIProviderError("AI provider returned an empty completion.")

        return AITextGeneration(
            provider=self.kind,
            model=str(raw_response.get("model") or model),
            content=content,
        )


def build_provider() -> AIProvider:
    if not settings.AI_ENABLED:
        return DisabledAIProvider("AI is disabled. Set AI_ENABLED=true to use AI routes.")

    provider_name = (settings.AI_PROVIDER or "").strip().lower()
    if provider_name in {"", AIProviderKind.DISABLED.value}:
        return DisabledAIProvider("AI_PROVIDER is disabled. Configure `mock` or `openai_compatible`.")
    if provider_name == AIProviderKind.MOCK.value:
        return MockAIProvider()
    if provider_name == AIProviderKind.OPENAI_COMPATIBLE.value:
        return OpenAICompatibleAIProvider(
            base_url=settings.AI_BASE_URL,
            api_key=settings.AI_API_KEY,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
    return DisabledAIProvider(f"Unsupported AI provider `{settings.AI_PROVIDER}`.")


def _post_json(*, url: str, payload: dict, headers: dict[str, str], timeout_seconds: int) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:  # pragma: no cover - depends on live provider
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        raise AIProviderError(f"AI provider HTTP {exc.code}: {detail or exc.reason}") from exc
    except error.URLError as exc:  # pragma: no cover - depends on live provider
        raise AIProviderError(f"AI provider connection failed: {exc.reason}") from exc


def _extract_content(content: object) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return "\n".join(parts).strip()
    return ""
