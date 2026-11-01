from __future__ import annotations

import re
from collections.abc import Mapping, Sequence

KINDS: tuple[str, ...] = ("dialog", "narration", "think", "option", "lore")

_RICH = re.compile(r"\{[^{}]*\}")
_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_CJK_EXT = re.compile(r"[\U00020000-\U0002a6df]")
_LATIN = re.compile(r"[A-Za-z]+")

Pair = tuple[int, int]


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
        return [[self.counts.get(kind, [0, 0])[0], self.counts.get(kind, [0, 0])[1]]
                for kind in KINDS]


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
