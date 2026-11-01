from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..model import OptionCond

COND_SEPARATOR = "|"
COMPOSITE_SEPARATOR = "+"
COMPOSITE_LIMIT = 120
NEED_ACTION = "action"
NEED_CONTRIBUTION = "contribution"
NEED_OP = "≥"
COMPARE_TOKENS = ("<=", ">=", "==", "≠", "≤", "≥", "<", ">", "=")


@dataclass(frozen=True)
class OptionView:
    text: str
    cond: OptionCond | None = None
    action: str = ""
    need: tuple[dict[str, Any], ...] = field(default_factory=tuple)


def _int_of(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def split_condition(value: str) -> tuple[str, OptionCond | None]:
    if COND_SEPARATOR not in value:
        return value, None
    head, tail = value.split(COND_SEPARATOR, 1)
    tail = tail.strip()
    if not tail:
        return head, None
    for token in COMPARE_TOKENS:
        if tail.startswith(token):
            return head, OptionCond(token, tail[len(token):].strip())
    return head, OptionCond("", tail)


def decode_composite(value: str, story: Mapping[str, str]) -> OptionView:
    parts = value.split(COMPOSITE_SEPARATOR)
    action = parts[0]
    title = ""
    for part in parts[1:]:
        hit = story.get(part)
        if hit:
            title = hit
            break
    if not title:
        title = " / ".join(parts[1:])
    need: list[dict[str, Any]] = []
    if len(parts) >= 4:
        action_count = _int_of(parts[2])
        contribution = _int_of(parts[3])
        if action_count > 0:
            need.append({"kind": NEED_ACTION, "op": NEED_OP, "value": action_count})
        if contribution > 0:
            need.append({"kind": NEED_CONTRIBUTION, "op": NEED_OP, "value": contribution})
    return OptionView(title, None, action, tuple(need))


def decode(value: str, story: Mapping[str, str]) -> OptionView:
    hit = story.get(value)
    if hit is not None:
        return OptionView(hit)
    if COMPOSITE_SEPARATOR in value and len(value) <= COMPOSITE_LIMIT:
        return decode_composite(value, story)
    head, cond = split_condition(value)
    if cond is not None:
        return OptionView(story.get(head, head), cond)
    return OptionView(value)
