from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

from ..config import ROUNDS_PER_MONTH, ROUNDS_PER_YEAR

KINDS: tuple[str, ...] = ("dialog", "narration", "think", "option", "lore")

_STAGE_NAME = {1: "上旬", 2: "中旬", 3: "下旬"}

_SET_GAME_TIME = re.compile(
    r"luamanager\.SetGameTime\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)")

_RICH = re.compile(r"\{[^{}]*\}")
_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_CJK_EXT = re.compile(r"[\U00020000-\U0002a6df]")
_LATIN = re.compile(r"[A-Za-z]+")

Pair = tuple[int, int]


def _rounds_of(year: int, month: int, stage: int) -> int:
    return (year - 1) * ROUNDS_PER_YEAR + (month - 1) * ROUNDS_PER_MONTH + stage


def _date_of(rounds: float) -> tuple[int, int, int]:
    index = max(0, int(rounds) - 1)
    year = index // ROUNDS_PER_YEAR + 1
    rest = index % ROUNDS_PER_YEAR
    return year, rest // ROUNDS_PER_MONTH + 1, rest % ROUNDS_PER_MONTH + 1


def format_rounds(rounds: float) -> str:
    year, month, stage = _date_of(rounds)
    return f"{year}年{month}月{_STAGE_NAME[stage]}"


def explicit_times(sources: Mapping[str, str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for sid in sorted(sources):
        for match in _SET_GAME_TIME.finditer(sources[sid]):
            year, month, stage = (int(match.group(index)) for index in (1, 2, 3))
            if not (1 <= year <= 9 and 1 <= month <= 12 and 1 <= stage <= 3):
                continue
            result[sid] = _rounds_of(year, month, stage)
            break
    return result


def strip_rich(text: str) -> str:
    if not text:
        return ""
    return _RICH.sub(" ", str(text)).replace("\r", " ").replace("\n", " ")


def count_text(text: str) -> Pair:
    clean = strip_rich(text)
    if not clean:
        return 0, 0
    return (len(_CJK.findall(clean)) + len(_CJK_EXT.findall(clean)),
            len(_LATIN.findall(clean)))


class WordCounter:
    def __init__(self) -> None:
        self.counts: dict[str, list[int]] = {kind: [0, 0] for kind in KINDS}

    def add(self, kind: str, text: str) -> None:
        zh, en = count_text(text)
        bucket = self.counts.setdefault(kind, [0, 0])
        bucket[0] += zh
        bucket[1] += en

    def row(self) -> list[list[int]]:
        return [[self.counts.get(kind, [0, 0])[0], self.counts.get(kind, [0, 0])[1]] for kind in KINDS]


def zero_row() -> list[list[int]]:
    return [[0, 0] for _ in KINDS]


def add_row(target: list[list[int]], row: Sequence[Sequence[int]]) -> None:
    for index in range(min(len(target), len(row))):
        target[index][0] += row[index][0]
        target[index][1] += row[index][1]


def totals(rows: Mapping[str, list[list[int]]]) -> list[list[int]]:
    out = zero_row()
    for row in rows.values():
        add_row(out, row)
    return out
