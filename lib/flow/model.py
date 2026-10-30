from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from .. import lua as L
from ..model import ChoiceBeat, ChoiceOption, Diagnostic, StoryEdge

FLOW_VERSION = 10


@dataclass(slots=True, frozen=True)
class CharacterValue:
    id: str
    portrait: str = ""


@dataclass(slots=True, frozen=True)
class CheckpointValue:
    kind: str
    key: str


@dataclass(slots=True, frozen=True)
class UnknownValue:
    expression: str


@dataclass(slots=True, frozen=True)
class LockedValue:
    available: Any
    locked: Any
    condition: str


@dataclass(slots=True)
class FlowState:
    speaker: str = ""
    portrait: str = ""
    dialog: str = "character"
    think: bool = False
    menu: str = "Options"
    menu_options: list[ChoiceOption] = field(default_factory=list)
    env: dict[str, Any] = field(default_factory=dict)

    def clone(self) -> FlowState:
        return FlowState(
            speaker=self.speaker,
            portrait=self.portrait,
            dialog=self.dialog,
            think=self.think,
            menu=self.menu,
            menu_options=copy.deepcopy(self.menu_options),
            env=copy.deepcopy(self.env),
        )


@dataclass(slots=True)
class PendingChoice:
    beat: ChoiceBeat
    variable: str
    options: list[ChoiceOption]


@dataclass(slots=True)
class AnalysisContext:
    script_id: str
    edges: list[StoryEdge] = field(default_factory=list)
    dynamic: list[str] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    reads: set[str] = field(default_factory=set)
    say_count: int = 0
    choice_count: int = 0
    fx_count: int = 0
    branch_sequence: int = 0
    edge_keys: set[tuple[str, str, str]] = field(default_factory=set)

    def add_edge(self, target: str, kind: str, label: str) -> None:
        key = (target, kind, label)
        if key in self.edge_keys:
            return
        self.edge_keys.add(key)
        self.edges.append(StoryEdge(self.script_id, target, kind, label))

    def warn(self, code: str, message: str, line: int = 0) -> None:
        if len(self.diagnostics) < 40:
            self.diagnostics.append(Diagnostic(code, message, self.script_id, line))


def callee(call: L.Call) -> tuple[str, str]:
    function = call.func
    if isinstance(function, L.Name):
        return "", function.id
    if isinstance(function, L.Index) and isinstance(function.key, L.Str):
        if isinstance(function.obj, L.Name):
            return function.obj.id, function.key.value
        if isinstance(function.obj, L.Index) and isinstance(function.obj.obj, L.Name) \
                and isinstance(function.obj.key, L.Str):
            return f"{function.obj.obj.id}.{function.obj.key.value}", function.key.value
    return "", function.text()


def text_value(value: Any) -> str | None:
    from ..model import TextRef

    if isinstance(value, TextRef):
        return value.value
    if isinstance(value, str):
        return value
    return None


def number_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(int(value)) if float(value).is_integer() else f"{value:g}"
    return str(value)


def short(expression: L.Expr, limit: int = 140) -> str:
    text = expression.text()
    return text if len(text) <= limit else text[:limit - 1] + "…"
