from __future__ import annotations

import hashlib
import re
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..cache import file_fingerprint
from ..config import CONVERT_VERSION, SCHEMA_VERSION

MIN_SUBSTITUTIONS = 2
MIN_TARGET_SHARE = 0.9
MIN_DOMINANCE = 0.5
PHRASE_CONTEXT = 2
PHRASE_ROUNDS = 4
BMP_LIMIT = 0x10000


@dataclass
class Conversion:
    lang: str
    source: str
    pairs: dict[str, str]
    phrases: dict[str, str] = field(default_factory=dict)
    overrides: dict[str, str] = field(default_factory=dict)
    stats: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        index: dict[str, list[str]] = {}
        for key in sorted(self.phrases, key=len, reverse=True):
            index.setdefault(key[0], []).append(key)
        self._index = index
        self._heads = frozenset(index)
        self._translate = str.maketrans(self.pairs) if self.pairs else {}
        self._scan = _scanner(index)

    def _phrase_at(self, text: str, index: int) -> str:
        for key in self._index.get(text[index], ()):
            if text.startswith(key, index):
                return key
        return ""

    def convert(self, text: str) -> str:
        hit = self.overrides.get(text)
        if hit is not None:
            return hit
        scan = self._scan
        if scan is None or self._heads.isdisjoint(text):
            return text.translate(self._translate)
        out: list[str] = []
        last = 0
        matched = False
        for match in scan.finditer(text):
            start = match.start()
            if start < last:
                continue
            key = self._phrase_at(text, start)
            if not key:
                continue
            matched = True
            if last < start:
                out.append(text[last:start].translate(self._translate))
            out.append(self.phrases[key])
            last = start + len(key)
        if not matched:
            return text.translate(self._translate)
        if last < len(text):
            out.append(text[last:].translate(self._translate))
        return "".join(out)


def _scanner(index: Mapping[str, Any]) -> re.Pattern[str] | None:
    if not index:
        return None
    return re.compile("[" + "".join(re.escape(char) for char in sorted(index)) + "]")


def _shared_entries(source_locale: dict[str, Any], target_locale: dict[str, Any]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for namespace, table in source_locale.items():
        target_table = target_locale.get(namespace)
        if not isinstance(table, dict) or not isinstance(target_table, dict):
            continue
        for key, value in table.items():
            other = target_table.get(key)
            if not isinstance(value, str) or not isinstance(other, str) or value == other:
                continue
            entries.append((value, other))
    return entries


def _transitions(entries: Sequence[tuple[str, str]]) -> tuple[dict[str, Counter], int]:
    pairs: Counter = Counter()
    aligned_total = 0
    for source, target in entries:
        if len(source) != len(target):
            continue
        aligned_total += 1
        pairs.update(zip(source, target))
    counts: dict[str, Counter] = {}
    for (char, mapped), count in pairs.items():
        if ord(char) >= BMP_LIMIT or ord(mapped) >= BMP_LIMIT:
            continue
        bucket = counts.get(char)
        if bucket is None:
            bucket = counts[char] = Counter()
        bucket[mapped] += count
    return counts, aligned_total


def _pair_table(counts: dict[str, Counter]) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for char, bucket in counts.items():
        hit = bucket.get(char, 0)
        changed = sum(count for mapped, count in bucket.items() if mapped != char)
        if changed < MIN_SUBSTITUTIONS:
            continue
        if changed / (changed + hit) < MIN_TARGET_SHARE:
            continue
        mapped, count = max(((value, total) for value, total in bucket.items() if value != char),
                            key=lambda item: (item[1], item[0]))
        if count < changed * MIN_DOMINANCE:
            continue
        pairs[char] = mapped
    return pairs


def _runs(left: str, right: str) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = -1
    for index in range(len(left)):
        if left[index] != right[index]:
            if start < 0:
                start = index
        elif start >= 0:
            runs.append((start, index))
            start = -1
    if start >= 0:
        runs.append((start, len(left)))
    return runs


def _failing(conv: Conversion, entries: Sequence[tuple[str, str]]) -> list[int]:
    return [index for index, (source, target) in enumerate(entries) if conv.convert(source) != target]


def _phrase_candidates(conv: Conversion, entries: Sequence[tuple[str, str]],
                       pending: Sequence[int]) -> dict[str, Counter]:
    votes: dict[str, Counter] = {}
    pairs = conv.pairs
    for index in pending:
        source, target = entries[index]
        converted = conv.convert(source)
        if len(converted) != len(target):
            continue
        for start, stop in _runs(converted, target):
            low = max(0, start - PHRASE_CONTEXT)
            high = min(len(source), stop + PHRASE_CONTEXT)
            key, value = source[low:high], target[low:high]
            if len(key) < 2:
                continue
            if key == value and "".join(pairs.get(char, char) for char in key) == key:
                continue
            votes.setdefault(key, Counter())[value] += 1
    return votes


def _confirmed_phrases(votes: dict[str, Counter], entries: Sequence[tuple[str, str]]) -> dict[str, str]:
    if not votes:
        return {}
    chosen = {key: bucket.most_common(1)[0][0] for key, bucket in votes.items()}
    sizes: dict[str, list[tuple[int, dict[str, str]]]] = {}
    for key, value in chosen.items():
        groups = sizes.setdefault(key[0], [])
        for group in groups:
            if group[0] == len(key):
                group[1][key] = value
                break
        else:
            groups.append((len(key), {key: value}))
    for groups in sizes.values():
        groups.sort(key=lambda item: item[0], reverse=True)
    scan = _scanner(sizes)
    if scan is None:
        return {}
    agree: Counter = Counter()
    seen: Counter = Counter()
    for source, target in entries:
        if len(source) != len(target):
            continue
        last = 0
        for match in scan.finditer(source):
            index = match.start()
            if index < last:
                continue
            hit = ""
            for size, table in sizes[source[index]]:
                if index + size <= len(source):
                    key = source[index:index + size]
                    if key in table:
                        hit = key
                        break
            if not hit:
                continue
            last = index + len(hit)
            seen[hit] += 1
            if target[index:index + len(hit)] == chosen[hit]:
                agree[hit] += 1
    return {key: value for key, value in chosen.items() if seen[key] and agree[key] == seen[key]}


def _rewrites(conv: Conversion, entries: Sequence[tuple[str, str]],
              pending: Sequence[int]) -> dict[str, str]:
    candidates: dict[str, Counter] = {}
    for index in pending:
        source, target = entries[index]
        candidates.setdefault(source, Counter())[target] += 1
    out: dict[str, str] = {}
    for source, bucket in candidates.items():
        target = max(bucket.items(), key=lambda item: (item[1], item[0]))[0]
        if conv.convert(source) != target:
            out[source] = target
    return out


def build_conversion(lang: str, source: str, source_locale: dict[str, Any],
                     target_locale: dict[str, Any]) -> Conversion:
    entries = _shared_entries(source_locale, target_locale)
    counts, aligned_total = _transitions(entries)
    conv = Conversion(lang=lang, source=source, pairs=_pair_table(counts))
    pending = _failing(conv, entries)
    for _ in range(PHRASE_ROUNDS):
        votes = {key: value for key, value in _phrase_candidates(conv, entries, pending).items()
                 if key not in conv.phrases}
        if not votes:
            break
        added = _confirmed_phrases(votes, entries)
        if not added:
            break
        conv.phrases.update(added)
        conv.__post_init__()
        pending = [index for index in pending if conv.convert(entries[index][0]) != entries[index][1]]
        if not pending:
            break
    conv.overrides = _rewrites(conv, entries, pending)
    failing = set(pending)
    verified = 0
    for index, (source_text, target_text) in enumerate(entries):
        override = conv.overrides.get(source_text)
        if override is not None:
            if override == target_text:
                verified += 1
            continue
        if index not in failing:
            verified += 1
    conv.stats.update({
        "compared": len(entries),
        "aligned": aligned_total,
        "rewritten": len(entries) - aligned_total,
        "pairs": len(conv.pairs),
        "phrases": len(conv.phrases),
        "overrides": len(conv.overrides),
        "verified": verified,
        "fidelity": round(verified / len(entries), 5) if entries else 0.0,
    })
    return conv


def conversion_fingerprint(source: str, lang: str, source_path: Path, target_path: Path) -> str:
    material = "|".join((
        str(CONVERT_VERSION),
        source,
        lang,
        str(file_fingerprint(source_path)["sha256_16"]),
        str(file_fingerprint(target_path)["sha256_16"]),
        f"{MIN_SUBSTITUTIONS}:{MIN_TARGET_SHARE}:{MIN_DOMINANCE}:{PHRASE_CONTEXT}:{PHRASE_ROUNDS}",
    ))
    return hashlib.sha1(material.encode("utf-8")).hexdigest()[:16]


def conversion_payload(conv: Conversion) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "source": conv.source,
        "lang": conv.lang,
        "pairs": "".join(f"{char}{conv.pairs[char]}" for char in sorted(conv.pairs)),
        "phrases": {key: conv.phrases[key] for key in sorted(conv.phrases)},
        "overrides": {key: conv.overrides[key] for key in sorted(conv.overrides)},
    }


def conversion_from_payload(payload: dict[str, Any], stats: dict[str, Any] | None = None) -> Conversion:
    flat = payload.get("pairs") or ""
    pairs = {flat[index]: flat[index + 1] for index in range(0, len(flat) - 1, 2)}
    conv = Conversion(
        lang=str(payload.get("lang") or ""),
        source=str(payload.get("source") or ""),
        pairs=pairs,
        phrases=dict(payload.get("phrases") or {}),
        overrides=dict(payload.get("overrides") or {}),
    )
    if stats:
        conv.stats.update(stats)
    return conv


def payload_bytes(payload: dict[str, Any]) -> int:
    total = len((payload.get("pairs") or "").encode("utf-8"))
    for table in ("phrases", "overrides"):
        total += sum(len(key.encode("utf-8")) + len(value.encode("utf-8"))
                     for key, value in (payload.get(table) or {}).items())
    return total
