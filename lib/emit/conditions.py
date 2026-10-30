from __future__ import annotations

from pathlib import Path
from typing import Any

from .jsout import write_conditions as write_condition_shard

CONDITION_SHARDS = 8


def condition_shard(key: str) -> int:
    value = 0
    for char in key:
        value = (value * 31 + ord(char)) & 0xFFFF
    return value % CONDITION_SHARDS


def slim(model: dict[str, Any]) -> dict[str, Any]:
    result = {key: value for key, value in model.items() if key != "note" or value}
    branches = result.get("branches")
    if isinstance(branches, list):
        result["branches"] = [
            {key: value for key, value in branch.items() if key != "conds" or not branch.get("expr")}
            if isinstance(branch, dict) else branch for branch in branches
        ]
    return result


def write_conditions(directory: Path, items: dict[str, dict[str, Any]], version: int) -> set[str]:
    buckets: list[dict[str, Any]] = [{} for _ in range(CONDITION_SHARDS)]
    for key, model in sorted(items.items()):
        buckets[condition_shard(key)][key] = slim(model) if isinstance(model, dict) else model
    files: set[str] = set()
    for index, bucket in enumerate(buckets):
        name = f"conditions-{index}.js"
        write_condition_shard(directory / name, index, {"version": version, "items": bucket})
        files.add(name)
    return files
