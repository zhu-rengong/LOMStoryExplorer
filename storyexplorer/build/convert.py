from __future__ import annotations

import difflib
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from ..config import SCHEMA_VERSION

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

    def _phrase_at(self, text: str, index: int) -> str:
        for key in self._index.get(text[index], ()):
            if text.startswith(key, index):
                return key
        return ""

    def convert(self, text: str) -> str:
        hit = self.overrides.get(text)
        if hit is not None:
            return hit
        if not self._index:
            return "".join(self.pairs.get(char, char) for char in text)
        out: list[str] = []
        index = 0
        size = len(text)
        while index < size:
            key = self._phrase_at(text, index)
            if key:
                out.append(self.phrases[key])
                index += len(key)
                continue
            char = text[index]
            out.append(self.pairs.get(char, char))
            index += 1
        return "".join(out)


def _aligned(source: str, target: str) -> list[tuple[str, str]] | None:
    out: list[tuple[str, str]] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, source, target, autojunk=False).get_opcodes():
        if tag == "equal":
            out.extend((source[i1 + offset], source[i1 + offset]) for offset in range(i2 - i1))
            continue
        if tag != "replace" or i2 - i1 != j2 - j1:
            return None
        out.extend((source[i1 + offset], target[j1 + offset]) for offset in range(i2 - i1))
    return out


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


def _transitions(entries: list[tuple[str, str]]) -> tuple[dict[str, Counter], int]:
    counts: dict[str, Counter] = {}
    aligned_total = 0
    for source, target in entries:
        aligned = _aligned(source, target)
        if aligned is None:
            continue
        aligned_total += 1
        for char, mapped in aligned:
            if ord(char) >= BMP_LIMIT or ord(mapped) >= BMP_LIMIT:
                continue
            bucket = counts.get(char)
            if bucket is None:
                bucket = counts[char] = Counter()
            bucket[mapped] += 1
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


def _phrase_candidates(conv: Conversion, entries: list[tuple[str, str]]) -> dict[str, Counter]:
    votes: dict[str, Counter] = {}
    for source, target in entries:
        converted = conv.convert(source)
        if len(converted) != len(target) or converted == target:
            continue
        for start, stop in _runs(converted, target):
            low = max(0, start - PHRASE_CONTEXT)
            high = min(len(source), stop + PHRASE_CONTEXT)
            key, value = source[low:high], target[low:high]
            if len(key) < 2:
                continue
            if key == value and "".join(conv.pairs.get(char, char) for char in key) == key:
                continue
            votes.setdefault(key, Counter())[value] += 1
    return votes


def _confirmed_phrases(votes: dict[str, Counter], entries: list[tuple[str, str]]) -> dict[str, str]:
    if not votes:
        return {}
    buckets: dict[str, list[str]] = {}
    for key in votes:
        buckets.setdefault(key[0], []).append(key)
    for bucket in buckets.values():
        bucket.sort(key=len, reverse=True)
    agree: Counter = Counter()
    seen: Counter = Counter()
    for source, target in entries:
        if len(source) != len(target):
            continue
        index = 0
        size = len(source)
        while index < size:
            hit = ""
            for key in buckets.get(source[index], ()):
                if source.startswith(key, index):
                    hit = key
                    break
            if not hit:
                index += 1
                continue
            value = votes[hit].most_common(1)[0][0]
            seen[hit] += 1
            if target[index:index + len(hit)] == value:
                agree[hit] += 1
            index += len(hit)
    return {key: votes[key].most_common(1)[0][0] for key in votes
            if seen[key] and agree[key] == seen[key]}


def _rewrites(conv: Conversion, entries: list[tuple[str, str]]) -> dict[str, str]:
    candidates: dict[str, Counter] = {}
    for source, target in entries:
        if conv.convert(source) == target:
            continue
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
    for _ in range(PHRASE_ROUNDS):
        votes = _phrase_candidates(conv, entries)
        added = {key: value for key, value in _confirmed_phrases(votes, entries).items()
                 if key not in conv.phrases}
        if not added:
            break
        conv.phrases.update(added)
        conv.__post_init__()
    conv.overrides = _rewrites(conv, entries)
    verified = sum(1 for source_text, target_text in entries if conv.convert(source_text) == target_text)
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


def conversion_payload(conv: Conversion) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "source": conv.source,
        "lang": conv.lang,
        "pairs": "".join(f"{char}{conv.pairs[char]}" for char in sorted(conv.pairs)),
        "phrases": {key: conv.phrases[key] for key in sorted(conv.phrases)},
        "overrides": {key: conv.overrides[key] for key in sorted(conv.overrides)},
    }


def payload_bytes(payload: dict[str, Any]) -> int:
    total = len((payload.get("pairs") or "").encode("utf-8"))
    for table in ("phrases", "overrides"):
        total += sum(len(key.encode("utf-8")) + len(value.encode("utf-8"))
                     for key, value in (payload.get(table) or {}).items())
    return total
