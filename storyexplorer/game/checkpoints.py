from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from ..console import Reporter
from ..vocab import COMPARE_OP_SYMBOL
from .conditions import (
    condition_node,
    dice_addition,
    dice_branch_node,
    label_of,
    tree_of,
)
from .unity import Deref, asset_files, build_generator, unitypy

GAP_NOT_FOUND = "not_found"
GAP_NO_TREE = "no_tree"
GAP_PARSE_ERROR = "parse_error"
GAP_UNMATCHED = "unmatched"
GAP_FILE_ERROR = "file_error"


def choose_model(models: list[dict[str, Any]], hinted: set[str] | None = None) -> dict[str, Any]:
    if hinted:
        for model in models:
            if model.get("kind") in hinted:
                return model
    return models[0]


def _distinct_models(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for model in models:
        kind = str(model.get("kind") or "")
        if not kind or kind in seen:
            continue
        seen.add(kind)
        out.append(model)
    return out


def _model_with_variants(models: list[dict[str, Any]],
                         hinted: set[str] | None = None) -> dict[str, Any]:
    distinct = _distinct_models(models)
    primary = choose_model(distinct, hinted)
    variants = [model for model in distinct if model is not primary]
    if not variants:
        return primary
    merged = dict(primary)
    merged["variants"] = variants
    return merged


def _norm(name: str) -> str:
    return (name or "").strip().lower()


def _match(name: str, wanted: set[str], norm_map: dict[str, str]) -> str | None:
    if not name:
        return None
    if name in wanted:
        return name
    return norm_map.get(_norm(name))


def scan(base_dir: Path, wanted: set[str], reporter: Reporter) -> dict[str, Path]:
    found: dict[str, Path] = {}
    fuzzy: dict[str, Path] = {}
    norm_map: dict[str, str] = {}
    for key in sorted(wanted):
        norm_map.setdefault(_norm(key), key)
    files = asset_files(base_dir)
    for index, path in enumerate(files, 1):
        try:
            env = unitypy().load(str(path))
            objects = list(env.objects)
        except Exception as exc:
            reporter.warn(f"failed to read {path.name}: {type(exc).__name__}")
            continue
        hits = 0
        for obj in objects:
            try:
                name = obj.peek_name()
            except Exception:
                continue
            if not name:
                continue
            if name in wanted:
                if name not in found:
                    found[name] = path
                    hits += 1
                continue
            key = _match(name, wanted, norm_map)
            if key and key not in found and key not in fuzzy:
                fuzzy[key] = path
                hits += 1
        reporter.info(f"[{index}/{len(files)}] {path.name}: {hits} hits ({len(found)} total)")
    rescued = 0
    for key, path in fuzzy.items():
        if key not in found:
            found[key] = path
            rescued += 1
    if rescued:
        reporter.info(f"name normalization (case/whitespace) rescued {rescued}")
    return found


def _branch(result: int, expr: dict[str, Any] | None) -> dict[str, Any]:
    branch: dict[str, Any] = {"result": result}
    if expr:
        branch["expr"] = expr
    return branch


def _parse_switch(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    branches = [
        _branch(index + 1, condition_node(item, deref))
        for index, item in enumerate(tree.get("_items") or [])
    ]
    count_items = tree.get("_countItems") or []
    return {
        "kind": "switch",
        "useCount": bool(tree.get("_useCount", 0)),
        "note": (tree.get("_devNote") or "").strip(),
        "branches": branches,
        "fallback": len(branches) + 1,
        "countItems": [
            {"op": COMPARE_OP_SYMBOL.get(item.get("_compareOp", 0), "?"),
             "value": item.get("_value"), "result": index + 1}
            for index, item in enumerate(count_items)
        ],
    }


def _parse_condition(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    branches = [_branch(1, condition_node(item, deref)) for item in tree.get("_items") or []]
    return {
        "kind": "condition",
        "note": (tree.get("_devNote") or "").strip(),
        "branches": branches,
    }


def _parse_dice(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    additions = [dice_addition(item, deref) for item in tree.get("_propertyItems") or []]
    branches = [
        _branch(index + 1, dice_branch_node(item))
        for index, item in enumerate(tree.get("_resultItems") or [])
    ]
    return {
        "kind": "dice",
        "note": (tree.get("_devNote") or "").strip(),
        "additions": additions,
        "branches": branches,
        "fallback": len(branches) + 1,
    }


def _parse_position(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    candidates = []
    for item in tree.get("_list") or []:
        ref = item.get("_config")
        target = deref(ref)
        candidates.append({
            "name": label_of(target, (ref or {}).get("m_PathID")),
            "rate": item.get("_defaultRate", 0),
            "note": (item.get("_devNote") or "").strip(),
        })
    return {
        "kind": "position",
        "note": (tree.get("_devNote") or "").strip(),
        "prefix": tree.get("_scriptPrefix") or "",
        "candidates": candidates,
    }


PARSERS = (
    ("_useCount", _parse_switch),
    ("_resultItems", _parse_dice),
    ("_scriptPrefix", _parse_position),
)


def _parse(tree: dict[str, Any], deref: Deref) -> dict[str, Any] | None:
    for marker, parser in PARSERS:
        if marker in tree:
            return parser(tree, deref)
    if "_default" in tree and "State" in tree:
        return {"kind": "flag", "note": (tree.get("_devNote") or "").strip(),
                "default": tree.get("_default", 0)}
    if "_items" in tree:
        return _parse_condition(tree, deref)
    return None


def extract(assets_dir: Path, found: dict[str, Path], reporter: Reporter,
            hints: dict[str, set[str]] | None = None) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    if not found:
        return {}, []
    _generator, adapter = build_generator(assets_dir / "Managed")
    by_file: dict[Path, list[str]] = {}
    for key, path in found.items():
        by_file.setdefault(path, []).append(key)

    models: dict[str, dict[str, Any]] = {}
    gaps: list[dict[str, Any]] = []
    rescued: list[str] = []
    started = time.time()
    reporter.info(f"parsing {len(found)} checkpoint configs ({len(by_file)} files)...")
    for path, keys in sorted(by_file.items(), key=lambda item: str(item[0])):
        try:
            env = unitypy().load(str(path))
        except Exception as exc:
            reporter.warn(f"failed to open {path.name}: {type(exc).__name__}")
            gaps.extend({"key": key, "reason": GAP_FILE_ERROR, "detail": type(exc).__name__}
                        for key in keys)
            continue
        env.typetree_generator = adapter
        exact: dict[str, list[Any]] = {}
        normed: dict[str, Any] = {}
        local: dict[int, Any] = {}
        for obj in env.objects:
            local[obj.path_id] = obj
            try:
                name = obj.peek_name()
            except Exception:
                continue
            if not name:
                continue
            exact.setdefault(name, []).append(obj)
            normed.setdefault(_norm(name), obj)
        serialized = getattr(env, "file", None) or next(iter(env.files.values()))
        deref = Deref(env, local, serialized, path.parent, adapter)
        for key in keys:
            candidates = exact.get(key)
            if not candidates:
                fuzzy = normed.get(_norm(key))
                if fuzzy is None:
                    gaps.append({"key": key, "reason": GAP_NOT_FOUND})
                    continue
                candidates = [fuzzy]
                rescued.append(key)
            parsed_models: list[dict[str, Any]] = []
            reasons: list[str] = []
            for candidate in candidates:
                tree = tree_of(candidate)
                if not tree:
                    reasons.append(GAP_NO_TREE)
                    continue
                try:
                    parsed = _parse(tree, deref)
                except Exception as exc:
                    reporter.warn(f"failed to parse {key}: {type(exc).__name__}")
                    reasons.append(GAP_PARSE_ERROR)
                    continue
                if parsed is None:
                    reasons.append(GAP_UNMATCHED)
                    continue
                parsed_models.append(parsed)
            if not parsed_models:
                gaps.append({"key": key, "reason": reasons[0] if reasons else GAP_UNMATCHED})
                continue
            models[key] = _model_with_variants(parsed_models, (hints or {}).get(key))
    by_reason: dict[str, int] = {}
    for gap in gaps:
        by_reason[gap["reason"]] = by_reason.get(gap["reason"], 0) + 1
    reporter.info(
        f"checkpoint conditions: {len(models)} resolved, {len(gaps)} failed"
        + (f" ({', '.join(f'{key} {value}' for key, value in sorted(by_reason.items()))})" if gaps else "")
        + (f", {len(rescued)} rescued by name normalization" if rescued else "")
        + f", {time.time() - started:.1f}s"
    )
    for gap in gaps[:8]:
        reporter.info(f"gap {gap['key']}: {gap['reason']}"
                      + (f" ({gap['detail']})" if gap.get("detail") else ""))
    if len(gaps) > 8:
        reporter.info(f"... {len(gaps) - 8} more gaps, see data/checkpoints.json")
    return models, gaps


def summarize(models: dict[str, dict[str, Any]], wanted: int,
              gaps: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    by_kind: dict[str, int] = {}
    variant_count = 0
    for model in models.values():
        by_kind[model["kind"]] = by_kind.get(model["kind"], 0) + 1
        variant_count += len(model.get("variants") or [])
    out: dict[str, Any] = {
        "resolved": len(models),
        "wanted": wanted,
        "missing": max(wanted - len(models), 0),
        "by_kind": by_kind,
        "variants": variant_count,
    }
    if gaps is not None:
        by_reason: dict[str, int] = {}
        for gap in gaps:
            by_reason[gap["reason"]] = by_reason.get(gap["reason"], 0) + 1
        out["gaps"] = {"total": len(gaps), "by_reason": by_reason}
    return out
