from __future__ import annotations

import time
from collections.abc import Iterator
from pathlib import Path

from .paths import MANAGERS_ASSET, MANAGERS_SUBDIR


def log(message: str) -> None:
    print(message, flush=True)


def iter_text_assets(asset_path: Path) -> Iterator[tuple[str, str]]:
    import UnityPy

    env = UnityPy.load(str(asset_path))
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        try:
            data = obj.read()
        except Exception as exc:
            log(f"  [warn] failed to read TextAsset: {exc}")
            continue
        name = str(getattr(data, "m_Name", "") or obj.peek_name() or "").strip()
        text = getattr(data, "m_Script", None)
        if text is None:
            raw = getattr(data, "script", b"")
            text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
        if not name:
            continue
        yield name, text.lstrip("\ufeff")


def resource_map(game: Path) -> dict[str, int]:
    import UnityPy

    env = UnityPy.load(str(game / MANAGERS_SUBDIR / MANAGERS_ASSET))
    for obj in env.objects:
        if obj.type.name != "ResourceManager":
            continue
        container = obj.read_typetree().get("m_Container") or []
        return {str(path).lower(): int(info["m_PathID"]) for path, info in container}
    return {}


def extract_locales(asset_path: Path, langs: tuple[str, ...]) -> tuple[dict[str, dict[str, dict[str, str]]], dict]:
    from .locale import detect_language, merge_tables, parse_locale_text

    log(f"[2/3] reading locale table: {asset_path.name}")
    started = time.time()
    tables: dict[str, dict[str, dict[str, str]]] = {lang: {} for lang in langs}
    stats = {"shards": 0, "lines": 0, "continued": 0, "unknown_lang": 0, "skipped": 0}
    for name, text in iter_text_assets(asset_path):
        if " = " not in text:
            stats["skipped"] += 1
            continue
        table, matched, continued = parse_locale_text(text)
        if matched < 8:
            stats["skipped"] += 1
            continue
        stats["shards"] += 1
        stats["lines"] += matched
        stats["continued"] += continued
        lang = detect_language(text, name)
        if lang is None or lang not in tables:
            stats["unknown_lang"] += 1
            continue
        merge_tables(tables[lang], table)
    log(f"      {stats['shards']} locale shards, {stats['lines']} lines"
        f" ({stats['continued']} continuations), {stats['unknown_lang']} unknown languages,"
        f" {time.time() - started:.1f}s")
    return tables, stats
