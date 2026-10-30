from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .jsout import dump

MAX_SHARD_BYTES = 640 * 1024
MAX_SHARDS = 32


@dataclass(slots=True)
class ShardPlan:
    assignment: dict[str, str]
    shards: list[dict[str, Any]]


def story_bytes(beats: Any) -> int:
    return len(dump(beats).encode("utf-8"))


def shard_key(index: int) -> str:
    return f"{index:02d}"


def plan_shards(ids: list[str], sizes: dict[str, int], chapter_of: dict[str, str], chapter_ids: list[str],
                max_bytes: int = MAX_SHARD_BYTES, max_shards: int = MAX_SHARDS) -> ShardPlan:
    total = sum(sizes.values())
    budget = max(max_bytes, -(-total // max_shards), 1)
    chapter_order = {chapter_id: index for index, chapter_id in enumerate(chapter_ids)}
    ordered = sorted(ids, key=lambda script_id: (chapter_order.get(chapter_of[script_id], 999), script_id))
    while True:
        groups: list[list[str]] = []
        current: list[str] = []
        weight = 0
        for script_id in ordered:
            size = sizes.get(script_id, 0)
            if current and (weight + size > budget or chapter_of[script_id] != chapter_of[current[-1]]):
                groups.append(current)
                current = []
                weight = 0
            current.append(script_id)
            weight += size
        if current:
            groups.append(current)
        if len(groups) <= max_shards or budget >= total:
            break
        budget = int(budget * 1.25) + 1
    assignment: dict[str, str] = {}
    shards: list[dict[str, Any]] = []
    for index, members in enumerate(groups):
        key = shard_key(index)
        for script_id in members:
            assignment[script_id] = key
        shards.append({
            "key": key,
            "file": f"stories-{{lang}}-{key}.js",
            "stories": len(members),
            "bytes": sum(sizes.get(script_id, 0) for script_id in members),
            "chapter": chapter_of[members[0]],
        })
    return ShardPlan(assignment, shards)
