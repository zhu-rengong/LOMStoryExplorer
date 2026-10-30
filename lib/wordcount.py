from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence

KINDS: tuple[str, ...] = ("dialog", "narration", "think", "option", "lore")

_SAY_KIND = {0: "dialog", 1: "narration", 2: "think"}

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


def _zero() -> list[list[int]]:
    return [[0, 0] for _ in KINDS]


def _add(acc: dict[str, list[int]], kind: str, pair: Pair) -> None:
    bucket = acc.setdefault(kind, [0, 0])
    bucket[0] += pair[0]
    bucket[1] += pair[1]


def count_beats(beats: Sequence[Sequence]) -> dict[str, list[int]]:
    acc: dict[str, list[int]] = {}
    _walk(beats, acc)
    return acc


def _walk(beats: Sequence[Sequence], acc: dict[str, list[int]]) -> None:
    for beat in beats or ():
        if not isinstance(beat, (list, tuple)) or not beat:
            continue
        tag = beat[0]
        if tag == "s":
            code = beat[3] if len(beat) > 3 else 0
            _add(acc, _SAY_KIND.get(code if isinstance(code, int) else 0, "dialog"),
                 count_text(beat[2] if len(beat) > 2 else ""))
        elif tag == "c":
            for branch in beat[1] or ():
                if not isinstance(branch, (list, tuple)) or not branch:
                    continue
                _add(acc, "option", count_text(branch[0]))
                if len(branch) > 2 and isinstance(branch[2], (list, tuple)):
                    _walk(branch[2], acc)
        elif tag == "br":
            if len(beat) > 2 and isinstance(beat[2], (list, tuple)):
                _walk(beat[2], acc)
        elif tag == "lore":
            _add(acc, "lore", count_text(beat[1] if len(beat) > 1 else ""))


def build(stories: Mapping[str, Sequence[Sequence]],
          chapter_of: Mapping[str, str],
          node_ids: Iterable[str]) -> dict:
    chapters: dict[str, list[list[int]]] = {}
    rows: dict[str, list[list[int]]] = {}
    for sid in node_ids:
        counts = count_beats(stories.get(sid) or ())
        row = [[counts.get(kind, [0, 0])[0], counts.get(kind, [0, 0])[1]] for kind in KINDS]
        rows[sid] = row
        chapter = chapter_of.get(sid)
        if not chapter:
            continue
        bucket = chapters.setdefault(chapter, _zero())
        for index, pair in enumerate(row):
            bucket[index][0] += pair[0]
            bucket[index][1] += pair[1]
    return {"chapters": chapters, "stories": rows}


def totals(data: Mapping[str, list[list[int]]]) -> list[list[int]]:
    out = _zero()
    for row in data.values():
        for index, pair in enumerate(row):
            out[index][0] += pair[0]
            out[index][1] += pair[1]
    return out
