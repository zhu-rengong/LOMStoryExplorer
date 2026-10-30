from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import lua as L

FLOW_VERSION = 8


@dataclass(frozen=True)
class Ref:
    kind: str
    value: str


@dataclass(frozen=True)
class CharRef:
    id: str


@dataclass(frozen=True)
class Mark:
    kind: str
    arg: str


@dataclass(frozen=True)
class Unknown:
    text: str


@dataclass(frozen=True)
class Locked:
    available: Any
    locked: Any
    cond: str


@dataclass
class State:
    speaker: str | None = None
    dialog: str = "character"
    think: bool = False
    env: dict[str, Any] = field(default_factory=dict)
    menu_options: list[tuple[Any, str | None]] = field(default_factory=list)

    def clone(self) -> State:
        return State(
            speaker=self.speaker,
            dialog=self.dialog,
            think=self.think,
            env=dict(self.env),
            menu_options=list(self.menu_options),
        )


def _as_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, Ref):
        return value.value
    if isinstance(value, CharRef):
        return value.id
    if isinstance(value, Mark):
        return value.arg
    return None


def _short(expr: L.Expr, limit: int = 120) -> str:
    text = expr.text()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _num_text(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"
