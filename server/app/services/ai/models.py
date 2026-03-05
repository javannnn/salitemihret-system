from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Literal


ChatRole = Literal["system", "user", "assistant"]


class AIProviderKind(StrEnum):
    DISABLED = "disabled"
    MOCK = "mock"
    OPENAI_COMPATIBLE = "openai_compatible"


@dataclass(frozen=True, slots=True)
class AIChatMessage:
    role: ChatRole
    content: str


@dataclass(frozen=True, slots=True)
class AITextGeneration:
    provider: AIProviderKind
    model: str
    content: str
    warnings: tuple[str, ...] = ()
