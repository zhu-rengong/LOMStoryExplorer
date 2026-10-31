from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..cache import dump_json, atomic_write_text
from ..wire import GLOBAL_CHECKPOINTS, GLOBAL_GRAPH, GLOBAL_TEXT, GLOBAL_WORDCOUNT


def dump_payload(payload: Any) -> str:
    return dump_json(payload)


def write_script(path: Path, body: str) -> int:
    return atomic_write_text(path, body)


def graph_script(payload: Any) -> str:
    return f"window.{GLOBAL_GRAPH}={dump_payload(payload)};\n"


def text_head_script(lang: str, payload: Any) -> str:
    return (f"window.{GLOBAL_TEXT}=window.{GLOBAL_TEXT}||{{}};"
            f"window.{GLOBAL_TEXT}[{json.dumps(lang, ensure_ascii=False)}]={dump_payload(payload)};\n")


def text_shard_script(lang: str, stories: Any) -> str:
    return (
        f"(function(){{var p=(window.{GLOBAL_TEXT}||{{}})[{json.dumps(lang, ensure_ascii=False)}];"
        f"if(!p)return;p.stories=p.stories||{{}};var s={dump_payload(stories)};"
        "for(var k in s)p.stories[k]=s[k];})();\n"
    )


def checkpoint_script(items: Any) -> str:
    return (
        f"(function(){{var t=window.{GLOBAL_CHECKPOINTS}||(window.{GLOBAL_CHECKPOINTS}={{}});"
        f"var s={dump_payload(items)};for(var k in s)t[k]=s[k];}})();\n"
    )


def wordcount_script(payload: Any) -> str:
    return f"window.{GLOBAL_WORDCOUNT}={dump_payload(payload)};\n"
