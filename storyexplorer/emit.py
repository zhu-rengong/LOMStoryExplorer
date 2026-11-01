from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from .cache import atomic_write_text, dump_json
from .config import CHECKPOINT_SHARDS, SCHEMA_VERSION
from .wire import GLOBAL_CHECKPOINTS, GLOBAL_GRAPH, GLOBAL_TEXT, GLOBAL_TEXT_CONV, GLOBAL_WORDCOUNT


def write_script(path: Path, body: str) -> int:
    return atomic_write_text(path, body)


def graph_script(payload: Any) -> str:
    return f"window.{GLOBAL_GRAPH}={dump_json(payload)};\n"


def text_head_script(lang: str, payload: Any) -> str:
    return (f"window.{GLOBAL_TEXT}=window.{GLOBAL_TEXT}||{{}};"
            f"window.{GLOBAL_TEXT}[{json.dumps(lang, ensure_ascii=False)}]={dump_json(payload)};\n")


def text_shard_script(lang: str, stories: Any) -> str:
    return (
        f"(function(){{var p=(window.{GLOBAL_TEXT}||{{}})[{json.dumps(lang, ensure_ascii=False)}];"
        f"if(!p)return;p.stories=p.stories||{{}};var s={dump_json(stories)};"
        "for(var k in s)p.stories[k]=s[k];})();\n"
    )


def conv_script(lang: str, payload: Any) -> str:
    return (f"window.{GLOBAL_TEXT_CONV}=window.{GLOBAL_TEXT_CONV}||{{}};"
            f"window.{GLOBAL_TEXT_CONV}[{json.dumps(lang, ensure_ascii=False)}]={dump_json(payload)};\n")


def checkpoint_script(items: Any) -> str:
    return (
        f"(function(){{var t=window.{GLOBAL_CHECKPOINTS}||(window.{GLOBAL_CHECKPOINTS}={{}});"
        f"var s={dump_json(items)};for(var k in s)t[k]=s[k];}})();\n"
    )


def wordcount_script(payload: Any) -> str:
    return f"window.{GLOBAL_WORDCOUNT}={dump_json(payload)};\n"


def text_payload(lang: str, characters: Mapping[str, str], names: Mapping[str, Any],
                 edge_labels: Mapping[str, str], stories: Mapping[str, Any],
                 shard_keys: Sequence[str], missing: int, missing_keys: Sequence[str],
                 full_text: bool) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "lang": lang,
        "characters": dict(characters),
        "names": {key: dict(value) for key, value in names.items()},
        "edgeLabels": dict(edge_labels),
        "missing": missing,
        "missingKeys": list(missing_keys),
        "stories": dict(stories),
        "shardKeys": list(shard_keys),
        "fullText": full_text,
    }


def write_graph(path: Path, payload: Mapping[str, Any]) -> int:
    return write_script(path, graph_script(payload))


def write_text(path: Path, lang: str, payload: Mapping[str, Any]) -> int:
    return write_script(path, text_head_script(lang, payload))


def write_text_shard(path: Path, lang: str, stories: Mapping[str, Any]) -> int:
    return write_script(path, text_shard_script(lang, stories))


def write_conversion(path: Path, lang: str, payload: Mapping[str, Any]) -> int:
    return write_script(path, conv_script(lang, payload))


def write_wordcount(path: Path, payload: Mapping[str, Any]) -> int:
    return write_script(path, wordcount_script(payload))


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
        size = write_script(path, checkpoint_script(bucket))
        written.append({"index": index, "name": path.name, "keys": len(bucket), "bytes": size})
    return written
