from __future__ import annotations

import re
from collections.abc import Iterable

from .model import Chapter

PALETTE = ("#A86F28", "#A43B32", "#365F55", "#7E2924", "#3F7057", "#315E78")
RULES = (
    (re.compile(r"^ch(\d+)_", re.I), "chapter"),
    (re.compile(r"^act(\d+)", re.I), "act"),
    (re.compile(r"^[sS](\d{2})\d{2}_"), "series"),
    (re.compile(r"^(door|room|center|back|meeting|mall|teashop|fortress|talk|shop|inn)"), "scene"),
    (re.compile(r"^(kitchen|pharmacy|alchemy|craft|forge|chess|fish|farm|work|labour)"), "work"),
    (re.compile(r"^travel", re.I), "travel"),
    (re.compile(r"^section_\d+_free", re.I), "free"),
    (re.compile(r"^section_", re.I), "section"),
    (re.compile(r"^(legend|library|book|event|mission)", re.I), "misc"),
)
TITLES = {"scene": "場景互動", "work": "勞作雜務", "travel": "旅途見聞", "free": "自由模式",
          "section": "場景段落", "misc": "雜項事件", "other": "其他劇本"}
RANK = {"scene": 3, "work": 4, "travel": 5, "free": 6, "section": 7, "misc": 8, "other": 9}


def classify(script_id: str) -> tuple[str, str, int]:
    for rule, kind in RULES:
        match = rule.match(script_id)
        if not match:
            continue
        if kind == "chapter":
            number = int(match.group(1))
            return f"ch{number}", "序章" if number == 0 else f"第{number}章", number
        if kind == "act":
            number = int(match.group(1))
            return f"act{number}", f"第{number}幕", number
        if kind == "series":
            number = int(match.group(1))
            return f"s{number}", f"事件 S{number:02d}xx", number
        return kind, TITLES[kind], 0
    return "other", TITLES["other"], 0


def build_chapters(script_ids: Iterable[str]) -> tuple[list[Chapter], dict[str, int]]:
    counts: dict[str, int] = {}
    titles: dict[str, str] = {}
    ranks: dict[str, int] = {}
    kinds: dict[str, int] = {}
    for script_id in script_ids:
        chapter_id, title, number = classify(script_id)
        counts[chapter_id] = counts.get(chapter_id, 0) + 1
        titles[chapter_id] = title
        ranks[chapter_id] = number
        kinds[chapter_id] = 0 if chapter_id.startswith("ch") else 1 if chapter_id.startswith("act") \
            else 2 if chapter_id.startswith("s") and chapter_id[1:].isdigit() else RANK[chapter_id]
    ordered = sorted(counts, key=lambda cid: (kinds[cid], ranks[cid] if kinds[cid] < 3 else -counts[cid], cid))
    chapters = [Chapter(cid, titles[cid], PALETTE[index % len(PALETTE)], counts[cid])
                for index, cid in enumerate(ordered)]
    return chapters, {chapter.id: index for index, chapter in enumerate(chapters)}
