from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ..vocab import COND_TAGS


def _sanitize_model(model: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(model)
    branches = []
    for branch in model.get("branches") or []:
        if not isinstance(branch, dict):
            continue
        item = dict(branch)
        expr = item.get("expr")
        if expr is not None and not (isinstance(expr, dict) and expr.get("tag") in COND_TAGS):
            item.pop("expr", None)
        branches.append(item)
    sanitized["branches"] = branches
    variants = model.get("variants")
    if isinstance(variants, list):
        cleaned = [_sanitize_model(variant) for variant in variants if isinstance(variant, dict)]
        if cleaned:
            sanitized["variants"] = cleaned
        else:
            sanitized.pop("variants", None)
    return sanitized


def sanitize(items: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if not isinstance(items, dict):
        return out
    for key, model in items.items():
        if isinstance(model, dict):
            out[key] = _sanitize_model(model)
    return out


def count_kinds(items: Mapping[str, Any]) -> dict[str, int]:
    kinds: dict[str, int] = {}
    for model in items.values():
        if not isinstance(model, dict):
            continue
        kind = str(model.get("kind") or "?")
        kinds[kind] = kinds.get(kind, 0) + 1
    return kinds
