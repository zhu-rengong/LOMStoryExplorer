from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

CHECKPOINT_SHARDS = 8


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write_graph_js(path: Path, payload: dict) -> int:
    body = _dump(payload)
    path.write_text(
        "window.__STORY_GRAPH__=" + body + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    return len(body.encode("utf-8"))


def write_checkpoints_js(path: Path, payload: dict) -> int:
    body = _dump(payload)
    path.write_text(
        "window.__STORY_CHECKPOINTS__=" + body + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    return len(body.encode("utf-8"))


def shard_of(key: str, count: int = CHECKPOINT_SHARDS) -> int:
    hash_value = 0
    for ch in key:
        hash_value = (hash_value * 31 + ord(ch)) & 0xFFFF
    return hash_value % count


def checkpoints_ascii(items: dict[str, dict]) -> bool:
    return all(ord(ch) < 128 for key in items for ch in key)


def slim_checkpoints(items: dict[str, dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for key, model in items.items():
        if not isinstance(model, dict):
            out[key] = model
            continue
        slim = dict(model)
        if not slim.get("note"):
            slim.pop("note", None)
        branches = slim.get("branches")
        if isinstance(branches, list):
            kept = []
            for branch in branches:
                if isinstance(branch, dict) and branch.get("expr"):
                    branch = {name: value for name, value in branch.items() if name != "conds"}
                kept.append(branch)
            slim["branches"] = kept
        out[key] = slim
    return out


def write_checkpoint_shards(dir_path: Path, items: dict[str, dict],
                            count: int = CHECKPOINT_SHARDS) -> list[dict]:
    buckets: list[dict[str, dict]] = [{} for _ in range(count)]
    for key, model in items.items():
        buckets[shard_of(key, count)][key] = model
    written: list[dict] = []
    for index, bucket in enumerate(buckets):
        path = dir_path / f"checkpoints-{index}.js"
        body = _dump(bucket)
        script = (
            "(function(){var t=window.__STORY_CHECKPOINTS__||"
            "(window.__STORY_CHECKPOINTS__={});var s=" + body
            + ";for(var k in s)t[k]=s[k];})();\n"
        )
        path.write_text(script, encoding="utf-8", newline="\n")
        written.append({"index": index, "name": path.name, "keys": len(bucket),
                        "bytes": len(body.encode("utf-8"))})
    return written


def write_wordcount_js(path: Path, payload: dict) -> int:
    body = _dump(payload)
    path.write_text(
        "window.__STORY_WORDCOUNT__=" + body + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    return len(body.encode("utf-8"))


def _text_assign(lang: str) -> str:
    return (f'window.__STORY_TEXT__=window.__STORY_TEXT__||{{}};'
            f'window.__STORY_TEXT__[{json.dumps(lang)}]')


def write_text_js(path: Path, lang: str, stories: dict[str, Any],
                  characters: dict[str, str], extra: dict) -> int:
    payload = {"characters": characters, "stories": stories, **extra, "fullText": True}
    body = _dump(payload)
    path.write_text(
        _text_assign(lang) + "=" + body + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    return len(body.encode("utf-8"))


def write_text_head_js(path: Path, lang: str, characters: dict[str, str],
                       extra: dict, shard_keys: Sequence[str]) -> int:
    payload = {
        "characters": characters,
        "stories": {},
        "shardKeys": list(shard_keys),
        "fullText": False,
        **extra,
    }
    body = _dump(payload)
    path.write_text(
        _text_assign(lang) + "=" + body + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    return len(body.encode("utf-8"))


def write_text_shard_js(path: Path, lang: str, stories: dict[str, Any]) -> int:
    body = _dump(stories)
    script = (
        "(function(){var p=(window.__STORY_TEXT__||{})["
        + json.dumps(lang)
        + "];if(!p)return;p.stories=p.stories||{};var s="
        + body
        + ";for(var k in s)p.stories[k]=s[k];})();\n"
    )
    path.write_text(script, encoding="utf-8", newline="\n")
    return len(body.encode("utf-8"))
