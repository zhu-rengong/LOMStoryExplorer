from __future__ import annotations

from collections.abc import Sequence

from ..config import MAX_STORY_SHARD_BYTES, MAX_STORY_SHARDS


def shard_key(index: int) -> str:
    if 0 <= index < 26:
        return chr(ord("a") + index)
    return f"s{index}"


def pack_stories(ids: Sequence[str], sizes: dict[str, int], chapter_of: dict[str, int],
                 chapter_ids: Sequence[str], max_bytes: int = MAX_STORY_SHARD_BYTES,
                 max_shards: int = MAX_STORY_SHARDS) -> tuple[dict[str, str], list[dict]]:
    total = sum(sizes.get(sid, 0) for sid in ids)
    budget = max(1, max_bytes, -(-total // max_shards))

    def build(limit: int) -> list[dict]:
        grouped: dict[int, list[str]] = {}
        for sid in ids:
            grouped.setdefault(chapter_of.get(sid, -1), []).append(sid)
        bins: list[dict] = []
        current: dict | None = None

        def flush() -> None:
            nonlocal current
            if current and current["ids"]:
                bins.append(current)
            current = None

        for chapter in sorted(grouped):
            members = grouped[chapter]
            weight = sum(sizes.get(sid, 0) for sid in members)
            if weight > limit:
                flush()
                for sid in members:
                    size = sizes.get(sid, 0)
                    if current is None or current["bytes"] + size > limit:
                        flush()
                        current = {"ids": [], "bytes": 0, "chapters": set()}
                    current["ids"].append(sid)
                    current["bytes"] += size
                    current["chapters"].add(chapter)
                continue
            if current is not None and current["bytes"] + weight > limit:
                flush()
            if current is None:
                current = {"ids": [], "bytes": 0, "chapters": set()}
            current["ids"].extend(members)
            current["bytes"] += weight
            current["chapters"].add(chapter)
        flush()
        return bins

    bins = build(budget)
    while len(bins) > max_shards and budget < total:
        budget = int(budget * 1.25) + 1
        bins = build(budget)

    assignment: dict[str, str] = {}
    shards: list[dict] = []
    for index, item in enumerate(bins):
        key = shard_key(index)
        for sid in item["ids"]:
            assignment[sid] = key
        shards.append({
            "key": key,
            "nodes": len(item["ids"]),
            "bytes": item["bytes"],
            "chapters": [chapter_ids[chapter] for chapter in sorted(item["chapters"])
                         if 0 <= chapter < len(chapter_ids)],
        })
    return assignment, shards


def assign_checkpoints(keys: Sequence[str], count: int) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for key in keys:
        value = 0
        for ch in key:
            value = (value * 31 + ord(ch)) & 0xFFFF
        mapping[key] = value % count
    return mapping
