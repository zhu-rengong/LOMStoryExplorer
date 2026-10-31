from __future__ import annotations

import re
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ..config import MAX_BRANCH_DEPTH
from ..console import Reporter
from ..wire import (
    COND_COMPARE,
    COND_CONST,
    COND_DICE,
    COND_GROUP,
    COND_LOGIC,
    COND_RANDOM,
    COND_VAR,
)
from .unity import Deref, asset_files, build_generator, unitypy

GAP_NOT_FOUND = "not_found"
GAP_NO_TREE = "no_tree"
GAP_PARSE_ERROR = "parse_error"
GAP_UNMATCHED = "unmatched"
GAP_FILE_ERROR = "file_error"
GAP_REASONS = (GAP_NOT_FOUND, GAP_NO_TREE, GAP_PARSE_ERROR, GAP_UNMATCHED, GAP_FILE_ERROR)

STAT_CHECK = {0: "常數", 1: "角色數值", 2: "好感度", 3: "旗標", 4: "書籍", 5: "雜物",
              6: "貴重品", 7: "隨機值", 8: "數值群組", 9: "遊戲時間", 10: "技能",
              11: "秘笈等級", 12: "已開發項目", 13: "開發項目等級", 14: "書籍精通",
              15: "風雲史", 16: "條件設定"}

STAT_FIELD = {1: "_stat", 2: "_relationship", 3: "_flag", 4: "_book", 5: "_misc",
              6: "_specialItem", 8: "_statGroup", 9: "_gameTime", 10: "_talentData",
              11: "_book", 12: "_upgradeItemData", 13: "_upgradeItemData",
              14: "_bookCollection", 15: "_libraryAchieve", 16: "_condition"}

COMPARE = {0: "=", 1: "!=", 2: "<", 3: "≤", 4: ">", 5: "≥"}
LOGIC = {0: "且", 1: "或"}
GROUP = {1: "總和", 2: "最大", 3: "最小", 4: "相乘", 5: "全部非零", 6: "任一非零"}
DICE_FIELD = {0: "_stat", 1: "_relationship", 2: "_talent", 3: "_flag"}
ITEM_CHECKS = frozenset({4, 5, 6, 10, 15})

CHECKPOINT_CALL = re.compile(
    r'checkpointmanager\.(Switch|Condition|Dice|Position)\(\s*"([^"]{2,60})"')


def collect_keys(sources: Mapping[str, str]) -> set[str]:
    keys: set[str] = set()
    for text in sources.values():
        for _method, key in CHECKPOINT_CALL.findall(text):
            keys.add(key)
    return keys


def collect_key_methods(sources: Mapping[str, str]) -> dict[str, set[str]]:
    hints: dict[str, set[str]] = {}
    for text in sources.values():
        for method, key in CHECKPOINT_CALL.findall(text):
            hints.setdefault(key, set()).add(method.lower())
    return hints


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


def _label(obj: Any, path_id: Any = None) -> str:
    if obj is None:
        return f"＃{path_id}" if path_id else "未設定"
    try:
        name = obj.peek_name()
    except Exception:
        name = None
    return name or f"＃{getattr(obj, 'path_id', path_id)}"


def _tree(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    try:
        return obj.read_typetree()
    except Exception:
        return None


def _item_id(obj: Any) -> str:
    tree = _tree(obj) or {}
    value = tree.get("_id")
    if isinstance(value, bool):
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, int):
        return str(value)
    return ""


def _group_text(ref: Any, deref: Deref, depth: int = 0) -> str:
    obj, scope = deref.scope(ref)
    tree = _tree(obj)
    if not tree:
        fallback = ref.get("m_PathID") if isinstance(ref, dict) else None
        return _label(obj, fallback)
    name = _label(obj)
    if depth >= MAX_BRANCH_DEPTH:
        return name
    parts = [_value_text(entry, scope, depth + 1) for entry in tree.get("_value") or []]
    group = GROUP.get(tree.get("_groupType"), "")
    inner = " + ".join(parts) if parts else "空"
    return f"{name}（{group}[{inner}]）" if group else f"{name}（{inner}）"


def _value_text(entry: dict[str, Any], deref: Deref, depth: int = 0) -> str:
    check = entry.get("_checkType", 0)
    label = STAT_CHECK.get(check, f"類型{check}")
    if check == 0:
        detail = str(entry.get("_constant", 0))
    elif check == 7:
        detail = f"{entry.get('_randomMin', 0)}~{entry.get('_randomMax', 0)}"
    elif check == 8:
        detail = _group_text(entry.get("_statGroup"), deref, depth)
    else:
        field = STAT_FIELD.get(check)
        ref = entry.get(field) if field else None
        detail = _label(deref(ref), (ref or {}).get("m_PathID")) if ref else "未設定"
    negative = entry.get("_negative", 0)
    return f"{label}（{detail}）{'×-1' if negative else ''}"


def _compare_text(item: dict[str, Any], deref: Deref) -> str:
    op = COMPARE.get(item.get("_compareOp", 0), "?")
    left = _group_text(item.get("_value1"), deref)
    right = _group_text(item.get("_value2"), deref)
    return f"{left} {op} {right}"


def _condition_text(item: dict[str, Any], deref: Deref) -> str:
    conds = [_compare_text(sub, deref) for sub in item.get("_items") or []]
    if not conds:
        return "（未設定條件）"
    joiner = f" {LOGIC.get(item.get('_logicOp', 0), '且')} "
    return joiner.join(conds)


def _const_node(value: Any) -> dict[str, Any]:
    return {"tag": COND_CONST, "value": value}


def _random_node(lo: Any, hi: Any) -> dict[str, Any]:
    return {"tag": COND_RANDOM, "min": lo, "max": hi}


def _dice_node() -> dict[str, Any]:
    return {"tag": COND_DICE}


def _var_node(check: int, name: str, negative: bool, ident: str = "") -> dict[str, Any]:
    node: dict[str, Any] = {"tag": COND_VAR, "type": check, "name": name, "negative": negative}
    if ident:
        node["id"] = ident
    return node


def _compare_node(op: int, left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    return {"tag": COND_COMPARE, "op": op, "left": left, "right": right}


def _logic_node(op: int, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"tag": COND_LOGIC, "op": op, "items": items}


def _group_node(ref: Any, deref: Deref, depth: int = 0) -> dict[str, Any] | None:
    obj, scope = deref.scope(ref)
    tree = _tree(obj)
    if not tree:
        return None
    name = _label(obj)
    if depth >= MAX_BRANCH_DEPTH:
        return {"tag": COND_GROUP, "group": tree.get("_groupType", 0), "name": name, "items": []}
    items = [_value_node(entry, scope, depth + 1) for entry in tree.get("_value") or []]
    if any(node is None for node in items):
        return None
    return {"tag": COND_GROUP, "group": tree.get("_groupType", 0), "name": name, "items": items}


def _value_node(entry: dict[str, Any], deref: Deref, depth: int = 0) -> dict[str, Any] | None:
    check = entry.get("_checkType", 0)
    negative = bool(entry.get("_negative", 0))
    if check == 0:
        return _const_node(entry.get("_constant", 0))
    if check == 7:
        return _random_node(entry.get("_randomMin", 0), entry.get("_randomMax", 0))
    if check == 8:
        node = _group_node(entry.get("_statGroup"), deref, depth)
        if node is None:
            return None
        node["negative"] = negative
        return node
    field = STAT_FIELD.get(check)
    ref = entry.get(field) if field else None
    if not ref:
        return None
    target = deref(ref)
    if target is None:
        return None
    ident = _item_id(target) if check in ITEM_CHECKS else ""
    return _var_node(check, _label(target), negative, ident)


def _compare_node_of(item: dict[str, Any], deref: Deref) -> dict[str, Any] | None:
    left = _group_node(item.get("_value1"), deref)
    right = _group_node(item.get("_value2"), deref)
    if left is None or right is None:
        return None
    return _compare_node(item.get("_compareOp", 0), left, right)


def _condition_node(item: dict[str, Any], deref: Deref) -> dict[str, Any] | None:
    subs = item.get("_items") or []
    nodes = [_compare_node_of(sub, deref) for sub in subs]
    if not nodes or any(node is None for node in nodes):
        return None
    if len(nodes) == 1:
        return nodes[0]
    return _logic_node(item.get("_logicOp", 0), [node for node in nodes if node is not None])


def _dice_branch_node(item: dict[str, Any]) -> dict[str, Any] | None:
    nodes = [
        _compare_node(sub.get("_compareOp", 0), _dice_node(), _const_node(sub.get("_value", 0)))
        for sub in item.get("_items") or []
    ]
    if not nodes:
        return None
    return nodes[0] if len(nodes) == 1 else _logic_node(0, nodes)


def _branch(result: int, text: str, expr: dict[str, Any] | None) -> dict[str, Any]:
    branch: dict[str, Any] = {"result": result, "text": text}
    if expr:
        branch["expr"] = expr
    return branch


def _parse_switch(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    branches = []
    for index, item in enumerate(tree.get("_items") or []):
        branches.append(_branch(index + 1, _condition_text(item, deref), _condition_node(item, deref)))
    count_items = tree.get("_countItems") or []
    return {
        "kind": "switch",
        "useCount": bool(tree.get("_useCount", 0)),
        "note": (tree.get("_devNote") or "").strip(),
        "branches": branches,
        "fallback": len(branches) + 1,
        "countItems": [
            {"op": COMPARE.get(item.get("_compareOp", 0), "?"), "value": item.get("_value"),
             "result": index + 1}
            for index, item in enumerate(count_items)
        ],
    }


def _parse_condition(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    branches = []
    for item in tree.get("_items") or []:
        branches.append(_branch(1, _condition_text(item, deref), _condition_node(item, deref)))
    return {
        "kind": "condition",
        "note": (tree.get("_devNote") or "").strip(),
        "branches": branches,
    }


def _dice_addition(item: dict[str, Any], deref: Deref) -> dict[str, Any]:
    ptype = item.get("_type", 0)
    field = DICE_FIELD.get(ptype)
    ref = item.get(field) if field else None
    target = deref(ref) if ref else None
    name = _label(target, (ref or {}).get("m_PathID")) if ref else ""
    ident = ""
    if ptype == 2 and target is not None:
        ident = str((_tree(target) or {}).get("_id") or "")
    try:
        rate = float(item.get("_rate", 1))
    except (TypeError, ValueError):
        rate = 1.0
    return {
        "type": ptype,
        "name": name,
        "id": ident,
        "rate": rate,
        "negative": bool(item.get("_negative", 0)),
        "hide": bool(item.get("_autoHide", 0)),
    }


def _parse_dice(tree: dict[str, Any], deref: Deref) -> dict[str, Any]:
    additions = [_dice_addition(item, deref) for item in tree.get("_propertyItems") or []]
    branches = []
    for index, item in enumerate(tree.get("_resultItems") or []):
        conds = []
        for sub in item.get("_items") or []:
            op = COMPARE.get(sub.get("_compareOp", 0), "?")
            conds.append(f"骰值 {op} {sub.get('_value')}")
        branches.append(_branch(index + 1, " 且 ".join(conds) if conds else "（未設定）",
                                _dice_branch_node(item)))
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
            "name": _label(target, (ref or {}).get("m_PathID")),
            "rate": item.get("_defaultRate", 0),
            "note": (item.get("_devNote") or "").strip(),
        })
    return {
        "kind": "position",
        "note": (tree.get("_devNote") or "").strip(),
        "prefix": tree.get("_scriptPrefix") or "",
        "candidates": candidates,
    }


PARSERS = {
    "_useCount": _parse_switch,
    "_resultItems": _parse_dice,
    "_scriptPrefix": _parse_position,
}


def _parse(tree: dict[str, Any], deref: Deref) -> dict[str, Any] | None:
    for marker, parser in PARSERS.items():
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
                tree = _tree(candidate)
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
