from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from ..config import CHECKPOINT_SHARDS, SCHEMA_VERSION
from .js import (
    checkpoint_script,
    graph_script,
    text_head_script,
    text_shard_script,
    wordcount_script,
    write_script,
)


def write_graph(path: Path, payload: Mapping[str, Any]) -> int:
    return write_script(path, graph_script(payload))


def text_head_payload(lang: str, characters: Mapping[str, str], names: Mapping[str, Any],
                      edge_labels: Mapping[str, str], shard_keys: Sequence[str],
                      missing: int, missing_keys: Sequence[str]) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "lang": lang,
        "characters": dict(characters),
        "names": {key: dict(value) for key, value in names.items()},
        "edgeLabels": dict(edge_labels),
        "missing": missing,
        "missingKeys": list(missing_keys),
        "stories": {},
        "shardKeys": list(shard_keys),
        "fullText": False,
    }


def write_text_head(path: Path, lang: str, payload: Mapping[str, Any]) -> int:
    return write_script(path, text_head_script(lang, payload))


def write_text_shard(path: Path, lang: str, stories: Mapping[str, Any]) -> int:
    return write_script(path, text_shard_script(lang, stories))


def write_text_full(path: Path, lang: str, payload: Mapping[str, Any]) -> int:
    return write_script(path, text_head_script(lang, payload))


def write_checkpoint_shards(dir_path: Path, items: Mapping[str, Any],
                            mapping: Mapping[str, int],
                            count: int = CHECKPOINT_SHARDS) -> list[dict[str, Any]]:
    buckets: list[dict[str, Any]] = [{} for _ in range(count)]
    for key, model in items.items():
        index = mapping.get(key, 0)
        if not 0 <= index < count:
            index = 0
        buckets[index][key] = model
    written: list[dict[str, Any]] = []
    for index, bucket in enumerate(buckets):
        path = Path(dir_path) / f"checkpoints-{index}.js"
        body = checkpoint_script(bucket)
        size = write_script(path, body)
        written.append({"index": index, "name": path.name, "keys": len(bucket), "bytes": size})
    return written


def write_wordcount(path: Path, payload: Mapping[str, Any]) -> int:
    return write_script(path, wordcount_script(payload))
