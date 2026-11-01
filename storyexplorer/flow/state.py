from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import lua as L
from ..model import CharRef, Mark, OptionCond, TextRef


@dataclass(frozen=True)
class OptionDraft:
    ref: TextRef
    cond: OptionCond | None = None
    lock: TextRef | None = None


@dataclass
class EvalState:
    speaker: str | None = None
    dialog: str = ""
    think: bool = False
    env: dict[str, Any] = field(default_factory=dict)
    menu_options: list[OptionDraft] = field(default_factory=list)

    def clone(self) -> EvalState:
        return EvalState(
            speaker=self.speaker,
            dialog=self.dialog,
            think=self.think,
            env=dict(self.env),
            menu_options=list(self.menu_options),
        )


def as_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, TextRef):
        return value.value
    if isinstance(value, CharRef):
        return value.id
    if isinstance(value, Mark):
        return value.key
    return None


def short(expr: L.Node, limit: int = 120) -> str:
    text = L.text(expr)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def num_text(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"


def numeric_key(value: str) -> tuple[int, int | str]:
    try:
        return (0, int(value))
    except ValueError:
        return (1, value)
