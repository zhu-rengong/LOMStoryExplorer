from __future__ import annotations

import re
from typing import Any

from ..model import ChoiceOption, TextRef
from .model import LockedValue, UnknownValue, text_value

LITERAL = re.compile(r'"([^"\\]*(?:\\.[^"\\]*)*)"')


def option_list(table: Any, menu: str) -> list[ChoiceOption]:
    if not isinstance(table, dict):
        return []
    options: list[ChoiceOption] = []
    for key in sorted(table, key=lambda item: (int(item) if item.isdigit() else 10**9, item)):
        value = table[key]
        availability = ""
        locked = None
        if isinstance(value, LockedValue):
            availability = value.condition
            locked = value.locked if isinstance(value.locked, TextRef) else None
            value = value.available
        if isinstance(value, UnknownValue):
            literal = first_literal(value.expression)
            if literal is None:
                continue
            value = TextRef("text", literal)
        raw = text_value(value)
        if raw is None or not raw or raw.startswith("~"):
            continue
        dice = ""
        text = raw
        if menu == "Dice" and "|" in raw:
            text, dice = raw.split("|", 1)
        reference = value if isinstance(value, TextRef) else TextRef("text", text)
        if reference.kind == "text":
            reference = TextRef("text", text)
        index = int(key) if key.isdigit() else len(options) + 1
        options.append(ChoiceOption(
            index=index,
            text=reference,
            availability=availability,
            dice=dice,
            locked=locked,
            menu=menu,
            raw=raw,
        ))
    return options


def first_literal(expression: str) -> str | None:
    matches = LITERAL.findall(expression)
    for candidate in matches:
        if not candidate.startswith("~"):
            return candidate
    return matches[0] if matches else None


def fallback_option(label: str, index: int, menu: str) -> ChoiceOption:
    return ChoiceOption(index=index, text=TextRef("text", label), menu=menu, raw=label)
