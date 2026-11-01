from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from ..game.profile import NAME_SPECS, NameSpec
from ..vocab import COND_CHECK, COND_COMPARE, COND_GROUP, COND_LOGIC, COND_VAR

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


def _candidates(spec: NameSpec, key: str, ident: str) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            keys.append(value)

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


def resolve(kind: str, key: str, ident: str, locale: Mapping[str, Any],
            used: NameTables) -> str:
    spec = NAME_SPECS.get(kind)
    wire_key = ident or key
    if spec is None or not wire_key:
        return wire_key
    table = locale.get(spec.namespace) or {}
    if not isinstance(table, dict):
        return wire_key
    for candidate in _candidates(spec, key, ident):
        value = table.get(candidate)
        if value:
            used.setdefault(kind, {})[wire_key] = str(value)
            return wire_key
    return wire_key


def resolve_check(key: str, locale: Mapping[str, Any], used: NameTables) -> None:
    if not key:
        return
    table = locale.get(CHECK_NAMESPACE) or {}
    if isinstance(table, dict) and table.get(key):
        used.setdefault("check", {})[key] = str(table[key])


def _walk_expr(node: Any, locale: Mapping[str, Any], used: NameTables) -> None:
    if not isinstance(node, dict):
        return
    tag = node.get("tag")
    if tag == COND_VAR:
        kind = str(node.get("kind") or "")
        key = str(node.get("name") or "")
        ident = str(node.get("id") or "")
        wire_key = resolve(kind, key, ident, locale, used)
        node["key"] = wire_key
        node.pop("name", None)
        node.pop("id", None)
        return
    if tag == COND_CHECK:
        resolve_check(str(node.get("key") or ""), locale, used)
        return
    if tag in (COND_COMPARE, COND_LOGIC):
        _walk_expr(node.get("left"), locale, used)
        _walk_expr(node.get("right"), locale, used)
        for item in node.get("items") or []:
            _walk_expr(item, locale, used)
        return
    if tag == COND_GROUP:
        for item in node.get("items") or []:
            _walk_expr(item, locale, used)


def _walk_model(model: dict[str, Any], locale: Mapping[str, Any], used: NameTables) -> None:
    for branch in model.get("branches") or []:
        if isinstance(branch, dict):
            _walk_expr(branch.get("expr"), locale, used)
    for addition in model.get("additions") or []:
        if not isinstance(addition, dict):
            continue
        kind = str(addition.get("kind") or "")
        key = str(addition.get("name") or "")
        ident = str(addition.get("id") or "")
        wire_key = resolve(kind, key, ident, locale, used)
        addition["key"] = wire_key
        addition.pop("name", None)
        addition.pop("id", None)
    for variant in model.get("variants") or []:
        if isinstance(variant, dict):
            _walk_model(variant, locale, used)
    for item in model.get("countItems") or []:
        if isinstance(item, dict):
            _walk_expr(item, locale, used)


def attach(models: Mapping[str, dict[str, Any]], locale: Mapping[str, Any],
           used: NameTables) -> None:
    for model in models.values():
        if isinstance(model, dict):
            _walk_model(model, locale, used)


def trim(tables: NameTables, kinds: Iterable[str] | None = None) -> dict[str, dict[str, str]]:
    allowed = set(kinds) if kinds is not None else None
    out: dict[str, dict[str, str]] = {}
    for kind, table in tables.items():
        if allowed is not None and kind not in allowed:
            continue
        if table:
            out[kind] = {key: table[key] for key in sorted(table)}
    return out
