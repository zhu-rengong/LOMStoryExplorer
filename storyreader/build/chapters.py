from __future__ import annotations

import re
from collections.abc import Sequence

from ..model import Chapter

_PALETTE = [
    "#C8A96A", "#B4453B", "#6E8B8F", "#A8763E", "#7FA36B", "#8C7CA8",
    "#C98B6B", "#5B8FA8", "#A8A06B", "#9C6B8F", "#6B8FA8", "#B08A5B",
    "#8FA86B", "#A85B77", "#5B77A8", "#A88F5B",
]

_CH_RULE = re.compile(r"^ch(\d+)_", re.IGNORECASE)
_ACT_RULE = re.compile(r"^act(\d+)", re.IGNORECASE)
_S_RULE = re.compile(r"^[sS](\d{2})\d{2}_")
_SCENE_RULE = re.compile(r"^(door|room|center|back|meeting|mall|teashop|fortress|talk|shop|inn)")
_WORK_RULE = re.compile(r"^(kitchen|pharmacy|alchemy|craft|forge|chess|fish|farm|work|labour)")
_TRAVEL_RULE = re.compile(r"^travel", re.IGNORECASE)
_FREE_RULE = re.compile(r"^section_\d+_free", re.IGNORECASE)
_SECTION_RULE = re.compile(r"^section_", re.IGNORECASE)
_MISC_RULE = re.compile(r"^(legend|library|book|event|mission)", re.IGNORECASE)

_TAIL_RANK = {"scene": 3, "work": 4, "travel": 5, "free": 6, "section": 7, "misc": 8}


def classify(script_id: str) -> tuple[str, str]:
    match = _CH_RULE.match(script_id)
    if match:
        number = int(match.group(1))
        return f"ch{number}", "序章" if number == 0 else f"第{number}章"
    match = _ACT_RULE.match(script_id)
    if match:
        number = int(match.group(1))
        return f"act{number}", f"第{number}幕"
    match = _S_RULE.match(script_id)
    if match:
        return f"s{match.group(1)}", f"事件 S{match.group(1)}xx"
    if _SCENE_RULE.match(script_id):
        return "scene", "場景互動"
    if _WORK_RULE.match(script_id):
        return "work", "勞作雜務"
    if _TRAVEL_RULE.match(script_id):
        return "travel", "旅途見聞"
    if _FREE_RULE.match(script_id):
        return "free", "自由模式"
    if _SECTION_RULE.match(script_id):
        return "section", "場景段落"
    if _MISC_RULE.match(script_id):
        return "misc", "雜項事件"
    return "other", "其他劇本"


def build_chapters(script_ids: Sequence[str]) -> tuple[list[Chapter], dict[str, int]]:
    order: list[str] = []
    titles: dict[str, str] = {}
    counts: dict[str, int] = {}
    for sid in script_ids:
        chapter_id, title = classify(sid)
        if chapter_id not in titles:
            order.append(chapter_id)
            titles[chapter_id] = title
            counts[chapter_id] = 0
        counts[chapter_id] += 1

    def sort_key(cid: str) -> tuple[int, int, str]:
        if cid.startswith("ch"):
            return 0, int(cid[2:] or 0), cid
        if cid.startswith("act"):
            return 1, int(cid[3:] or 0), cid
        if cid.startswith("s") and cid[1:].isdigit():
            return 2, int(cid[1:]), cid
        return _TAIL_RANK.get(cid, 9), -counts[cid], cid

    order.sort(key=sort_key)
    chapters = [
        Chapter(cid, titles[cid], _PALETTE[index % len(_PALETTE)], counts[cid])
        for index, cid in enumerate(order)
    ]
    return chapters, {cid: index for index, cid in enumerate(order)}
