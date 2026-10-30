from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .jsout import _dump

MAX_SHARD_BYTES = 700 * 1024

MAX_SHARDS = 24


def story_bytes(beats: Any) -> int:
    return len(_dump(beats).encode("utf-8"))


def shard_key(index: int) -> str:
    if 0 <= index < 26:
        return chr(ord("a") + index)
    return f"s{index}"


def pack_shards(ids: Sequence[str], sizes: dict[str, int], chapter_of: dict[str, int],
                chapter_ids: Sequence[str], max_bytes: int = MAX_SHARD_BYTES,
                max_shards: int = MAX_SHARDS) -> tuple[dict[str, str], list[dict]]:
    total = sum(sizes.get(sid, 0) for sid in ids)
    budget = max(1, max_bytes, -(-total // max_shards))

    def build(limit: int) -> list[dict]:
        grouped: dict[int, list[str]] = {}
        for sid in ids:
            grouped.setdefault(chapter_of.get(sid, -1), []).append(sid)
        bins: list[dict] = []
        cur: dict | None = None

        def flush() -> None:
            nonlocal cur
            if cur and cur["ids"]:
                bins.append(cur)
            cur = None

        for chapter in sorted(grouped):
            members = grouped[chapter]
            weight = sum(sizes.get(sid, 0) for sid in members)
            if weight > limit:
                flush()
                for sid in members:
                    size = sizes.get(sid, 0)
                    if cur is None or cur["bytes"] + size > limit:
                        flush()
                        cur = {"ids": [], "bytes": 0, "chapters": set()}
                    cur["ids"].append(sid)
                    cur["bytes"] += size
                    cur["chapters"].add(chapter)
                continue
            if cur is not None and cur["bytes"] + weight > limit:
                flush()
            if cur is None:
                cur = {"ids": [], "bytes": 0, "chapters": set()}
            cur["ids"].extend(members)
            cur["bytes"] += weight
            cur["chapters"].add(chapter)
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
