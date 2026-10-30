from __future__ import annotations

import re

_LOCALE_LINE = re.compile(r"^([A-Za-z][A-Za-z0-9_]*)/([^\r\n=]{1,160}?) = (.*)$")

_TRAD = "這幾個們說為與後裡臺灣點麼樣還過對發現實當經開關無麼"
_SIMP = "这几个们说为与后里台湾点么样还过对发现实当经开关无么"

_HANGUL_LO, _HANGUL_HI = "\uac00", "\ud7a3"
_CJK_LO, _CJK_HI = "\u4e00", "\u9fff"

KNOWN_LANGS = ("zh-tw", "zh-cn", "kr")


def _count_range(text: str, lo: str, hi: str) -> int:
    return sum(1 for ch in text if lo <= ch <= hi)


def _count_chars(text: str, charset: str) -> int:
    total = 0
    for ch in text:
        if ch in charset:
            total += 1
    return total


def detect_language(text: str, hint: str = "") -> str | None:
    hint = (hint or "").lower()
    for lang in KNOWN_LANGS:
        if hint.endswith(lang.replace("-", "_")) or hint.endswith(lang):
            if _looks_like_locale(text):
                return lang

    hangul = _count_range(text, _HANGUL_LO, _HANGUL_HI)
    han = _count_range(text, _CJK_LO, _CJK_HI)
    if hangul > 0 and hangul >= han * 0.2:
        return "kr"
    if han == 0:
        return None

    trad = _count_chars(text, _TRAD)
    simp = _count_chars(text, _SIMP)
    if trad > simp:
        return "zh-tw"
    if simp > trad:
        return "zh-cn"
    return None


def _looks_like_locale(text: str) -> bool:
    head = text[:4000]
    hits = sum(1 for line in head.splitlines() if _LOCALE_LINE.match(line))
    return hits >= 8


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


def iter_prefixes(table: dict[str, dict[str, str]]) -> list[str]:
    return list(table.keys())
