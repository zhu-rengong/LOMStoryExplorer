from __future__ import annotations

import re
from collections.abc import Mapping

from ..config import ROUNDS_PER_MONTH, ROUNDS_PER_YEAR

_STAGE_NAME = {1: "上旬", 2: "中旬", 3: "下旬"}

_SET_GAME_TIME = re.compile(
    r"luamanager\.SetGameTime\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)")


def rounds_of(year: int, month: int, stage: int) -> int:
    return (year - 1) * ROUNDS_PER_YEAR + (month - 1) * ROUNDS_PER_MONTH + stage


def date_of(rounds: float) -> tuple[int, int, int]:
    index = max(0, int(rounds) - 1)
    year = index // ROUNDS_PER_YEAR + 1
    rest = index % ROUNDS_PER_YEAR
    return year, rest // ROUNDS_PER_MONTH + 1, rest % ROUNDS_PER_MONTH + 1


def format_rounds(rounds: float) -> str:
    year, month, stage = date_of(rounds)
    return f"{year}年{month}月{_STAGE_NAME[stage]}"


def explicit_times(sources: Mapping[str, str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for sid in sorted(sources):
        for match in _SET_GAME_TIME.finditer(sources[sid]):
            year, month, stage = (int(match.group(index)) for index in (1, 2, 3))
            if not (1 <= year <= 9 and 1 <= month <= 12 and 1 <= stage <= 3):
                continue
            result[sid] = rounds_of(year, month, stage)
            break
    return result
