from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from ..game.profile import NAME_SPECS, STAT_ALIASES, STAT_GROUP_PREFIX, NameSpec
from ..vocab import COND_CHECK, COND_COMPARE, COND_GROUP, COND_LOGIC, COND_VAR, VALUE_STAT

_SEGMENT_SPLIT = re.compile(r"[^0-9A-Za-z]+")
_TOKEN_SPLIT = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+")
_KEY_HEAD = re.compile(r"[A-Za-z0-9]+")

CHECK_NAMESPACE = "DiceHeader"
META_NAME_KINDS = {"library": "chronicle"}

NameTables = dict[str, dict[str, str]]


def _segments(name: str) -> list[str]:
    segments: list[str] = []
    for chunk in _SEGMENT_SPLIT.split(name or ""):
        if not chunk:
            continue
        tokens: list[str] = []
        for token in _TOKEN_SPLIT.findall(chunk):
            if token.isdigit() and tokens:
                tokens[-1] += token
            else:
                tokens.append(token.lower())
        segments.extend(tokens)
    return segments


def _candidates(spec: NameSpec, key: str, ident: str, alias: str = "") -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            keys.append(value)

    add(alias)
    values = [ident, key]
    for value in values:
        if not value:
            continue
        if spec.prefix and not value.startswith(spec.prefix):
            add(spec.prefix + value)
        add(value)
    if spec.use_segments and key:
        segments = _segments(key)
        for index in range(len(segments)):
            add(spec.prefix + "-".join(segments[index:]))
    return keys


def _note(stats: Mapping[str, str] | None, key: str) -> str:
    if not stats:
        return ""
    note = stats.get(key)
    return note.strip() if isinstance(note, str) else ""


def _match(spec: NameSpec, key: str, ident: str, alias: str,
           locale: Mapping[str, Any]) -> tuple[str, str]:
    table = locale.get(spec.namespace) or {}
    if not isinstance(table, dict):
        return "", ""
    for candidate in _candidates(spec, key, ident, alias):
        value = table.get(candidate)
        if value:
            canonical = (candidate[len(spec.prefix):]
                         if spec.prefix and candidate.startswith(spec.prefix) else candidate)
            return canonical, str(value)
    return "", ""


def _fallback(spec: NameSpec, key: str, ident: str) -> str:
    if ident:
        return ident
    prefix = spec.key_prefix
    if prefix and key.startswith(prefix):
        rest = key[len(prefix):]
        head = _KEY_HEAD.match(rest)
        if head:
            rest = head.group(0)
        return rest.lower()
    return key


def canonical_of(kind: str, key: str, ident: str, locale: Mapping[str, Any],
                 alias: str = "") -> str:
    spec = NAME_SPECS.get(kind)
    if spec is None:
        return ident or key
    canonical, _display = _match(spec, key, ident, alias, locale)
    return canonical or _fallback(spec, key, ident)


def resolve(kind: str, key: str, ident: str, locale: Mapping[str, Any],
            used: NameTables, stats: Mapping[str, str] | None = None) -> str:
    spec = NAME_SPECS.get(kind)
    if spec is None:
        return ident or key
    alias = STAT_ALIASES.get(key, "") if kind == VALUE_STAT else ""
    canonical, display = _match(spec, key, ident, alias, locale)
    wire_key = canonical or _fallback(spec, key, ident)
    if not wire_key:
        return ""
    bucket = used.setdefault(kind, {})
    if wire_key in bucket:
        return wire_key
    if kind == VALUE_STAT:
        note = _note(stats, wire_key) or _note(stats, ident or key)
        if note:
            bucket[wire_key] = note
            return wire_key
    if display:
        bucket[wire_key] = display
    return wire_key


def resolve_check(key: str, locale: Mapping[str, Any], used: NameTables) -> None:
    if not key:
        return
    table = locale.get(CHECK_NAMESPACE) or {}
    if isinstance(table, dict) and table.get(key):
        used.setdefault("check", {})[key] = str(table[key])


def _seed_group(node: Mapping[str, Any], used: NameTables,
                locale: Mapping[str, Any]) -> None:
    if node.get("op") not in (None, "", "sum"):
        return
    items = node.get("items") or []
    if len(items) != 1:
        return
    child = items[0]
    if not isinstance(child, Mapping) or child.get("tag") != COND_VAR:
        return
    if child.get("kind") != VALUE_STAT:
        return
    name = node.get("name")
    if not isinstance(name, str) or not name.startswith(STAT_GROUP_PREFIX):
        return
    label = name[len(STAT_GROUP_PREFIX):].strip()
    if not label or "_" in label:
        return
    key = str(child.get("name") or "")
    ident = str(child.get("id") or "")
    alias = STAT_ALIASES.get(key, "")
    canonical = canonical_of(VALUE_STAT, key, ident, locale, alias) or ident or key
    if canonical:
        used.setdefault(VALUE_STAT, {}).setdefault(canonical, label)


def _seed_expr(node: Any, used: NameTables, locale: Mapping[str, Any]) -> None:
    if not isinstance(node, Mapping):
        return
    tag = node.get("tag")
    if tag == COND_GROUP:
        _seed_group(node, used, locale)
        for item in node.get("items") or []:
            _seed_expr(item, used, locale)
        return
    if tag in (COND_COMPARE, COND_LOGIC):
        _seed_expr(node.get("left"), used, locale)
        _seed_expr(node.get("right"), used, locale)
        for item in node.get("items") or []:
            _seed_expr(item, used, locale)


def _seed_model(model: Mapping[str, Any], used: NameTables,
                locale: Mapping[str, Any]) -> None:
    for branch in model.get("branches") or []:
        if isinstance(branch, Mapping):
            _seed_expr(branch.get("expr"), used, locale)
    for variant in model.get("variants") or []:
        if isinstance(variant, Mapping):
            _seed_model(variant, used, locale)
    for item in model.get("countItems") or []:
        _seed_expr(item, used, locale)


def _walk_expr(node: Any, locale: Mapping[str, Any], used: NameTables,
               stats: Mapping[str, str] | None = None) -> None:
    if not isinstance(node, dict):
        return
    tag = node.get("tag")
    if tag == COND_VAR:
        kind = str(node.get("kind") or "")
        key = str(node.get("name") or "")
        ident = str(node.get("id") or "")
        wire_key = resolve(kind, key, ident, locale, used, stats)
        node["key"] = wire_key
        node.pop("name", None)
        node.pop("id", None)
        return
    if tag == COND_CHECK:
        resolve_check(str(node.get("key") or ""), locale, used)
        return
    if tag in (COND_COMPARE, COND_LOGIC):
        _walk_expr(node.get("left"), locale, used, stats)
        _walk_expr(node.get("right"), locale, used, stats)
        for item in node.get("items") or []:
            _walk_expr(item, locale, used, stats)
        return
    if tag == COND_GROUP:
        for item in node.get("items") or []:
            _walk_expr(item, locale, used, stats)


def _walk_model(model: dict[str, Any], locale: Mapping[str, Any], used: NameTables,
                stats: Mapping[str, str] | None = None) -> None:
    for branch in model.get("branches") or []:
        if isinstance(branch, dict):
            _walk_expr(branch.get("expr"), locale, used, stats)
    for addition in model.get("additions") or []:
        if not isinstance(addition, dict):
            continue
        kind = str(addition.get("kind") or "")
        key = str(addition.get("name") or "")
        ident = str(addition.get("id") or "")
        wire_key = resolve(kind, key, ident, locale, used, stats)
        addition["key"] = wire_key
        addition.pop("name", None)
        addition.pop("id", None)
    for variant in model.get("variants") or []:
        if isinstance(variant, dict):
            _walk_model(variant, locale, used, stats)
    for item in model.get("countItems") or []:
        if isinstance(item, dict):
            _walk_expr(item, locale, used, stats)


def attach(models: Mapping[str, dict[str, Any]], locale: Mapping[str, Any],
           used: NameTables, stats: Mapping[str, str] | None = None) -> None:
    for model in models.values():
        if isinstance(model, dict):
            _seed_model(model, used, locale)
    for model in models.values():
        if isinstance(model, dict):
            _walk_model(model, locale, used, stats)


def trim(tables: NameTables, kinds: Iterable[str] | None = None) -> dict[str, dict[str, str]]:
    allowed = set(kinds) if kinds is not None else None
    out: dict[str, dict[str, str]] = {}
    for kind, table in tables.items():
        if allowed is not None and kind not in allowed:
            continue
        if table:
            out[kind] = {key: table[key] for key in sorted(table)}
    return out
