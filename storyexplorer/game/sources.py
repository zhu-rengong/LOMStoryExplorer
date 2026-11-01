from __future__ import annotations

from collections.abc import Mapping

from .profile import (
    CHECKPOINT_CALL,
    GAME_TIME_CALL,
    POSITION_CALL,
    ROUNDS_PER_MONTH,
    ROUNDS_PER_YEAR,
    SCRIPT_LITERAL,
    SEMANTICS,
    STORY_CALL,
)


def collect_checkpoint_keys(sources: Mapping[str, str]) -> set[str]:
    keys: set[str] = set()
    for text in sources.values():
        for _method, key in CHECKPOINT_CALL.findall(text):
            keys.add(key)
    return keys


def collect_checkpoint_methods(sources: Mapping[str, str]) -> dict[str, set[str]]:
    hints: dict[str, set[str]] = {}
    for text in sources.values():
        for method, key in CHECKPOINT_CALL.findall(text):
            hints.setdefault(key, set()).add(SEMANTICS.check_methods.get(method, method.lower()))
    return hints


def scan_positions(sources: Mapping[str, str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for sid in sorted(sources):
        names = sorted(set(POSITION_CALL.findall(sources[sid] or "")))
        if names:
            found[sid] = names
    return found


def scan_literals(sources: Mapping[str, str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for sid in sorted(sources):
        literals = sorted(set(SCRIPT_LITERAL.findall(sources[sid] or "")))
        if literals:
            found[sid] = literals
    return found


def scan_story_keys(sources: Mapping[str, str]) -> set[str]:
    keys: set[str] = set()
    for source in sources.values():
        keys.update(STORY_CALL.findall(source))
    return keys


def rounds_of(year: int, month: int, stage: int) -> int:
    return (year - 1) * ROUNDS_PER_YEAR + (month - 1) * ROUNDS_PER_MONTH + stage


def date_of(rounds: float) -> tuple[int, int, int]:
    index = max(0, int(round(rounds)) - 1)
    year = index // ROUNDS_PER_YEAR + 1
    rest = index % ROUNDS_PER_YEAR
    return year, rest // ROUNDS_PER_MONTH + 1, rest % ROUNDS_PER_MONTH + 1


def scan_times(sources: Mapping[str, str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for sid in sorted(sources):
        for match in GAME_TIME_CALL.finditer(sources[sid] or ""):
            year, month, stage = (int(match.group(index)) for index in (1, 2, 3))
            if not (1 <= year <= 9 and 1 <= month <= 12 and 1 <= stage <= 3):
                continue
            result[sid] = rounds_of(year, month, stage)
            break
    return result
