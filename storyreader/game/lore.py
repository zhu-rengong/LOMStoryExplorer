from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ..console import Reporter
from .unity import asset_files, build_generator, unitypy

_STORY_CALL = re.compile(r"""statmodifymanager\.AddStory\(\s*["']([^"']+)["']\s*\)""")

GAP_NOT_FOUND = "not_found"
GAP_EMPTY_TEXT = "empty_text"
GAP_PARSE_ERROR = "parse_error"


def collect_story_keys(sources: Mapping[str, str]) -> set[str]:
    keys: set[str] = set()
    for source in sources.values():
        keys.update(_STORY_CALL.findall(source))
    return keys


def _clean(text: Any) -> str:
    if not isinstance(text, str):
        return ""
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def probe(assets_dir: Path, wanted: set[str], reporter: Reporter) -> tuple[dict[str, str], list[dict[str, str]]]:
    if not wanted:
        return {}, []
    base = Path(assets_dir)
    generator, adapter = build_generator(base / "Managed")
    files = [path for path in asset_files(base) if path.suffix == ".assets"]
    items: dict[str, str] = {}
    seen: set[str] = set()
    failed: set[str] = set()
    for index, path in enumerate(files, 1):
        try:
            env = unitypy().load(str(path))
        except Exception as exc:
            reporter.warn(f"lore: failed to open {path.name}: {type(exc).__name__}")
            continue
        env.typetree_generator = adapter
        hits = 0
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                name = obj.peek_name()
            except Exception:
                continue
            name = name.strip() if isinstance(name, str) else ""
            if not name or name not in wanted:
                continue
            seen.add(name)
            try:
                tree = obj.read_typetree()
            except Exception:
                failed.add(name)
                continue
            text = _clean(tree.get("_text"))
            if not text:
                continue
            if len(text) > len(items.get(name, "")):
                items[name] = text
                hits += 1
        reporter.info(f"[{index}/{len(files)}] {path.name}: {hits} lore texts ({len(items)} total)")
    gaps: list[dict[str, str]] = []
    for key in sorted(wanted):
        if key in items:
            continue
        if key in failed:
            reason = GAP_PARSE_ERROR
        elif key in seen:
            reason = GAP_EMPTY_TEXT
        else:
            reason = GAP_NOT_FOUND
        gaps.append({"key": key, "reason": reason})
    return dict(sorted(items.items())), gaps


def summarize(candidates: set[str], items: dict[str, str], gaps: list[dict[str, str]],
              elapsed: float) -> dict[str, Any]:
    by_reason: dict[str, int] = {}
    for gap in gaps:
        reason = str(gap.get("reason") or "?")
        by_reason[reason] = by_reason.get(reason, 0) + 1
    return {
        "wanted": len(candidates),
        "resolved": len(items),
        "unresolved": max(len(candidates) - len(items), 0),
        "by_reason": by_reason,
        "elapsed": round(elapsed, 1),
    }
