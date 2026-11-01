from __future__ import annotations

from collections.abc import Sequence

from ..game.profile import CHAPTER_PALETTE, CHAPTER_RANK, CHAPTER_RULES
from ..model import Chapter
from ..vocab import (
    CHAPTER_ACT,
    CHAPTER_CHAPTER,
    CHAPTER_EVENT,
    CHAPTER_OTHER,
    CHAPTER_PROLOGUE,
)


def classify(script_id: str) -> tuple[str, int | None]:
    for rule in CHAPTER_RULES:
        match = rule.pattern.match(script_id)
        if not match:
            continue
        number = int(match.group(rule.number_group)) if rule.number_group else None
        kind = rule.zero_kind if number == 0 and rule.zero_kind else rule.kind
        return kind, number
    return CHAPTER_OTHER, None


def chapter_id(kind: str, number: int | None) -> str:
    if number is None:
        return kind
    if kind in (CHAPTER_CHAPTER, CHAPTER_PROLOGUE):
        return f"ch{number}"
    if kind == CHAPTER_ACT:
        return f"act{number}"
    if kind == CHAPTER_EVENT:
        return f"s{number:02d}"
    return f"{kind}{number}"


def build_chapters(script_ids: Sequence[str]) -> tuple[list[Chapter], dict[str, int]]:
    order: list[str] = []
    kinds: dict[str, tuple[str, int | None]] = {}
    counts: dict[str, int] = {}
    for sid in script_ids:
        kind, number = classify(sid)
        cid = chapter_id(kind, number)
        if cid not in kinds:
            order.append(cid)
            kinds[cid] = (kind, number)
            counts[cid] = 0
        counts[cid] += 1

    def sort_key(cid: str) -> tuple[int, int, str]:
        kind, number = kinds[cid]
        return CHAPTER_RANK.get(kind, len(CHAPTER_RANK)), number or 0, cid

    order.sort(key=sort_key)
    chapters = [
        Chapter(cid, kinds[cid][0], kinds[cid][1], CHAPTER_PALETTE[index % len(CHAPTER_PALETTE)],
                counts[cid])
        for index, cid in enumerate(order)
    ]
    return chapters, {cid: index for index, cid in enumerate(order)}
