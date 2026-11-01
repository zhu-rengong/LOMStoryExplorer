from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from ..game.profile import NAME_SPECS, STAT_ALIASES, STAT_GROUP_PREFIX, NameSpec
from ..vocab import COND_CHECK, COND_COMPARE, COND_GROUP, COND_LOGIC, COND_VAR, VALUE_STAT

_SEGMENT_SPLIT = re.compile(r"[^0-9A-Za-z]+")
_TOKEN_SPLIT = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+")

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


def resolve(kind: str, key: str, ident: str, locale: Mapping[str, Any],
            used: NameTables, stats: Mapping[str, str] | None = None) -> str:
    spec = NAME_SPECS.get(kind)
    wire_key = ident or key
    if spec is None or not wire_key:
        return wire_key
    bucket = used.setdefault(kind, {})
    if wire_key in bucket:
        return wire_key
    if kind == VALUE_STAT:
        note = _note(stats, wire_key)
        if note:
            bucket[wire_key] = note
            return wire_key
    table = locale.get(spec.namespace) or {}
    if not isinstance(table, dict):
        return wire_key
    alias = STAT_ALIASES.get(key, "") if kind == VALUE_STAT else ""
    for candidate in _candidates(spec, key, ident, alias):
        value = table.get(candidate)
        if value:
            bucket[wire_key] = str(value)
            return wire_key
    return wire_key


def resolve_check(key: str, locale: Mapping[str, Any], used: NameTables) -> None:
    if not key:
        return
    table = locale.get(CHECK_NAMESPACE) or {}
    if isinstance(table, dict) and table.get(key):
        used.setdefault("check", {})[key] = str(table[key])


def _seed_group(node: Mapping[str, Any], used: NameTables) -> None:
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
    key = str(child.get("id") or child.get("name") or "")
    if key:
        used.setdefault(VALUE_STAT, {}).setdefault(key, label)


def _seed_expr(node: Any, used: NameTables) -> None:
    if not isinstance(node, Mapping):
        return
    tag = node.get("tag")
    if tag == COND_GROUP:
        _seed_group(node, used)
        for item in node.get("items") or []:
            _seed_expr(item, used)
        return
    if tag in (COND_COMPARE, COND_LOGIC):
        _seed_expr(node.get("left"), used)
        _seed_expr(node.get("right"), used)
        for item in node.get("items") or []:
            _seed_expr(item, used)


def _seed_model(model: Mapping[str, Any], used: NameTables) -> None:
    for branch in model.get("branches") or []:
        if isinstance(branch, Mapping):
            _seed_expr(branch.get("expr"), used)
    for variant in model.get("variants") or []:
        if isinstance(variant, Mapping):
            _seed_model(variant, used)
    for item in model.get("countItems") or []:
        _seed_expr(item, used)


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
            _seed_model(model, used)
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
