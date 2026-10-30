from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..manifest import atomic_write_text


def dump(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def write_script(path: Path, script: str) -> int:
    atomic_write_text(path, script.rstrip() + "\n")
    return path.stat().st_size


def write_assignment(path: Path, name: str, payload: Any) -> int:
    body = dump(payload)
    return write_script(path, f"window.{name}={body};")


def write_language_index(path: Path, lang: str, payload: dict[str, Any]) -> int:
    body = dump(payload)
    language = dump(lang)
    script = (
        "window.__SR_STORIES__=window.__SR_STORIES__||{};"
        f"window.__SR_STORIES__[{language}]={body};"
        f"window.__SR_STORIES__[{language}].loadedShards={{}};"
        f"window.__SR_STORIES__[{language}].shardVersions={{}};"
    )
    return write_script(path, script)


def write_language_stories(path: Path, lang: str, payload: dict[str, Any], shard: str = "") -> int:
    body = dump(payload)
    language = dump(lang)
    script = (
        "(function(){var root=window.__SR_STORIES__=window.__SR_STORIES__||{};"
        f"var pack=root[{language}];if(!pack)throw new Error('Story index must load before story data');"
        "var data=" + body + ";Object.assign(pack.stories,data.stories);"
        + (f"pack.loadedShards[{dump(shard)}]=true;pack.shardVersions[{dump(shard)}]=data.version;"
           if shard else "pack.fullTextLoaded=true;pack.fullTextVersion=data.version;")
        + "})();"
    )
    return write_script(path, script)


def write_conditions(path: Path, shard: int, payload: dict[str, Any]) -> int:
    body = dump(payload)
    script = (
        "window.__SR_CONDITIONS__=window.__SR_CONDITIONS__||{version:0,items:{},loaded:{}};"
        f"window.__SR_CONDITIONS__.items[{shard}]={body};"
        f"window.__SR_CONDITIONS__.loaded[{shard}]=true;"
    )
    return write_script(path, script)


def cleanup_generated(directory: Path, keep: set[str]) -> None:
    patterns = ("catalog.js", "graph.js", "stories-*.js", "text-*.js", "conditions-*.js", "checkpoints-*.js", "wordcount.js")
    for pattern in patterns:
        for path in directory.glob(pattern):
            if path.is_file() and path.name not in keep:
                path.unlink()
