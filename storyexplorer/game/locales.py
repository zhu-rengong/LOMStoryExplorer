from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from ..console import Reporter
from ..languages import SUPPORTED_LANGS
from .profile import (
    HAN_RANGE,
    HANGUL_RANGE,
    LOCALE_MIN_MATCHES,
    SIMPLIFIED_MARKERS,
    TRADITIONAL_MARKERS,
)
from .resources import iter_text_assets

_LOCALE_LINE = re.compile(r"^([A-Za-z][A-Za-z0-9_]*)/([^\r\n=]{1,160}?) = (.*)$")


def _count_range(text: str, lo: str, hi: str) -> int:
    return sum(1 for ch in text if lo <= ch <= hi)


def _count_chars(text: str, charset: str) -> int:
    return sum(1 for ch in text if ch in charset)


def _looks_like_locale(text: str) -> bool:
    head = text[:4000]
    hits = sum(1 for line in head.splitlines() if _LOCALE_LINE.match(line))
    return hits >= LOCALE_MIN_MATCHES


def detect_language(text: str, hint: str = "") -> str | None:
    hint = (hint or "").lower()
    for lang in SUPPORTED_LANGS:
        if hint.endswith(lang.replace("-", "_")) or hint.endswith(lang):
            if _looks_like_locale(text):
                return lang
    hangul = _count_range(text, *HANGUL_RANGE)
    han = _count_range(text, *HAN_RANGE)
    if hangul > 0 and hangul >= han * 0.2:
        return "kr"
    if han == 0:
        return None
    traditional = _count_chars(text, TRADITIONAL_MARKERS)
    simplified = _count_chars(text, SIMPLIFIED_MARKERS)
    if traditional > simplified:
        return "zh-tw"
    if simplified > traditional:
        return "zh-cn"
    return None


def parse_locale_text(text: str) -> tuple[dict[str, dict[str, str]], int, int]:
    table: dict[str, dict[str, str]] = {}
    matched = 0
    continued = 0
    last_pair: tuple[str, str] | None = None
    for raw_line in text.splitlines():
        if not raw_line.strip():
            last_pair = None
            continue
        match = _LOCALE_LINE.match(raw_line)
        if match:
            prefix, key, value = match.group(1), match.group(2), match.group(3)
            table.setdefault(prefix, {})[key] = value.replace("\\n", "\n")
            last_pair = (prefix, key)
            matched += 1
            continue
        if last_pair is not None and " = " not in raw_line and len(raw_line) > 40:
            prefix, key = last_pair
            table[prefix][key] += "\n" + raw_line
            continued += 1
    return table, matched, continued


def merge_tables(target: dict[str, dict[str, str]],
                 incoming: dict[str, dict[str, str]]) -> int:
    added = 0
    for prefix, entries in incoming.items():
        bucket = target.setdefault(prefix, {})
        for key, value in entries.items():
            if key not in bucket:
                bucket[key] = value
                added += 1
    return added


def extract_locales(asset_path: Path, langs: tuple[str, ...],
                    reporter: Reporter) -> tuple[dict[str, dict[str, dict[str, str]]], dict[str, Any]]:
    reporter.stage(4, 4, f"locale tables: {', '.join(langs)} ({Path(asset_path).name})")
    started = time.time()
    tables: dict[str, dict[str, dict[str, str]]] = {lang: {} for lang in langs}
    stats: dict[str, Any] = {"shards": 0, "lines": 0, "continued": 0, "unknown_lang": 0, "skipped": 0}
    for name, text in iter_text_assets(asset_path, reporter):
        if " = " not in text:
            stats["skipped"] += 1
            continue
        table, matched, continued = parse_locale_text(text)
        if matched < LOCALE_MIN_MATCHES:
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
    reporter.info(
        f"{stats['shards']} locale shards, {stats['lines']} lines"
        f" ({stats['continued']} continuations), {stats['unknown_lang']} unknown languages,"
        f" {time.time() - started:.1f}s"
    )
    return tables, stats
