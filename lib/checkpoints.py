from __future__ import annotations

import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from . import unityprobe

CHECKPOINT_VERSION = 6
UNITY_VERSION = unityprobe.UNITY_VERSION

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
DICE_PROPERTY = {0: "數值", 1: "好感度", 2: "技能", 3: "旗標"}
DICE_FIELD = {0: "_stat", 1: "_relationship", 2: "_talent", 3: "_flag"}

CHECKPOINT_CALL = re.compile(
    r'checkpointmanager\.(Switch|Condition|Dice|Position)\(\s*"([^"]{2,60})"\s*\)')

MAX_DEPTH = 3

available = unityprobe.available
build_generator = unityprobe.build_generator
asset_files = unityprobe.asset_files
fingerprint = unityprobe.fingerprint
_Adapter = unityprobe.Adapter
_Deref = unityprobe.Deref


def collect_keys(lua_dir: Path) -> set[str]:
    keys: set[str] = set()
    for path in sorted(lua_dir.glob("*.lua")):
        for _method, key in CHECKPOINT_CALL.findall(path.read_text(encoding="utf-8")):
            keys.add(key)
    return keys


def collect_key_methods(lua_dir: Path) -> dict[str, set[str]]:
    hints: dict[str, set[str]] = {}
    for path in sorted(lua_dir.glob("*.lua")):
        for method, key in CHECKPOINT_CALL.findall(path.read_text(encoding="utf-8")):
            hints.setdefault(key, set()).add(method.lower())
    return hints


def choose_model(models: list[dict], hinted: set[str] | None = None) -> dict:
    if hinted:
        for model in models:
            if model.get("kind") in hinted:
                return model
    return models[0]


def _norm(name: str) -> str:
    return (name or "").strip().lower()


def match_wanted(name: str, wanted: set[str], norm_map: dict[str, str]) -> str | None:
    if not name:
        return None
    if name in wanted:
        return name
    return norm_map.get(_norm(name))


def scan(base_dir: Path, wanted: set[str], log: Callable[[str], None] = print) -> dict[str, Path]:
    import UnityPy

    found: dict[str, Path] = {}
    fuzzy: dict[str, Path] = {}
    norm_map: dict[str, str] = {}
    for key in sorted(wanted):
        norm_map.setdefault(_norm(key), key)
    files = asset_files(base_dir)
    for index, path in enumerate(files, 1):
        try:
            env = UnityPy.load(str(path))
            objects = list(env.objects)
        except Exception as exc:
            log(f"      [warn] failed to read {path.name}: {type(exc).__name__}")
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
            key = match_wanted(name, wanted, norm_map)
            if key and key not in found and key not in fuzzy:
                fuzzy[key] = path
                hits += 1
        log(f"      [{index}/{len(files)}] {path.name}: {hits} hits ({len(found)} total)")
    rescued = 0
    for key, path in fuzzy.items():
        if key not in found:
            found[key] = path
            rescued += 1
    if rescued:
        log(f"      name normalization (case/whitespace) rescued {rescued}")
    return found


def _label(obj: Any, path_id: Any = None) -> str:
    if obj is None:
        return f"＃{path_id}" if path_id else "未設定"
    try:
        name = obj.peek_name()
    except Exception:
        name = None
    return name or f"＃{getattr(obj, 'path_id', path_id)}"


def _tree(obj: Any) -> dict | None:
    if obj is None:
        return None
    try:
        return obj.read_typetree()
    except Exception:
        return None


def _group_text(ref: Any, deref: _Deref, depth: int = 0) -> str:
    obj = deref(ref)
    tree = _tree(obj)
    if not tree:
        fallback = ref.get("m_PathID") if isinstance(ref, dict) else None
        return _label(obj, fallback)
    name = _label(obj)
    if depth >= MAX_DEPTH:
        return name
    parts = [_value_text(entry, deref, depth + 1) for entry in tree.get("_value") or []]
    group = GROUP.get(tree.get("_groupType"), "")
    inner = " + ".join(parts) if parts else "空"
    return f"{name}（{group}[{inner}]）" if group else f"{name}（{inner}）"


def _value_text(entry: dict, deref: _Deref, depth: int = 0) -> str:
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


def _compare_text(item: dict, deref: _Deref) -> str:
    op = COMPARE.get(item.get("_compareOp", 0), "?")
    left = _group_text(item.get("_value1"), deref)
    right = _group_text(item.get("_value2"), deref)
    return f"{left} {op} {right}"


def _condition_text(item: dict, deref: _Deref) -> str:
    conds = [_compare_text(sub, deref) for sub in item.get("_items") or []]
    if not conds:
        return "（未設定條件）"
    joiner = f" {LOGIC.get(item.get('_logicOp', 0), '且')} "
    return joiner.join(conds)


def _group_node(ref: Any, deref: _Deref, depth: int = 0) -> list | None:
    obj = deref(ref)
    tree = _tree(obj)
    if not tree:
        return None
    name = _label(obj)
    if depth >= MAX_DEPTH:
        return ["g", tree.get("_groupType", 0), name, []]
    items = [_value_node(entry, deref, depth + 1) for entry in tree.get("_value") or []]
    if any(node is None for node in items):
        return None
    return ["g", tree.get("_groupType", 0), name, items]


def _value_node(entry: dict, deref: _Deref, depth: int = 0) -> list | None:
    check = entry.get("_checkType", 0)
    neg = 1 if entry.get("_negative", 0) else 0
    if check == 0:
        return ["c", entry.get("_constant", 0)]
    if check == 7:
        return ["r", entry.get("_randomMin", 0), entry.get("_randomMax", 0)]
    if check == 8:
        node = _group_node(entry.get("_statGroup"), deref, depth)
        if node is None:
            return None
        if neg:
            node = node + [neg]
        return node
    field = STAT_FIELD.get(check)
    ref = entry.get(field) if field else None
    if not ref:
        return None
    target = deref(ref)
    if target is None:
        return None
    return ["v", check, _label(target), neg]


def _compare_node(item: dict, deref: _Deref) -> list | None:
    left = _group_node(item.get("_value1"), deref)
    right = _group_node(item.get("_value2"), deref)
    if left is None or right is None:
        return None
    return ["p", item.get("_compareOp", 0), left, right]


def _condition_node(item: dict, deref: _Deref) -> list | None:
    subs = item.get("_items") or []
    nodes = [_compare_node(sub, deref) for sub in subs]
    if not nodes or any(node is None for node in nodes):
        return None
    if len(nodes) == 1:
        return nodes[0]
    return ["l", item.get("_logicOp", 0), nodes]


def _dice_branch_node(item: dict) -> list | None:
    nodes = [["p", sub.get("_compareOp", 0), ["d"], ["c", sub.get("_value", 0)]]
             for sub in item.get("_items") or []]
    if not nodes:
        return None
    return nodes[0] if len(nodes) == 1 else ["l", 0, nodes]


def _parse_switch(tree: dict, deref: _Deref) -> dict:
    branches = []
    for index, item in enumerate(tree.get("_items") or []):
        branch = {"conds": [_condition_text(item, deref)], "result": index + 1}
        expr = _condition_node(item, deref)
        if expr:
            branch["expr"] = expr
        branches.append(branch)
    count_items = tree.get("_countItems") or []
    return {
        "kind": "switch",
        "useCount": bool(tree.get("_useCount", 0)),
        "note": (tree.get("_devNote") or "").strip(),
        "branches": branches,
        "fallback": len(branches) + 1,
        "countItems": [
            {"op": COMPARE.get(item.get("_compareOp", 0), "?"), "value": item.get("_value"),
             "result": index + 1} for index, item in enumerate(count_items)
        ],
    }


def _parse_condition(tree: dict, deref: _Deref) -> dict:
    branches = []
    for item in tree.get("_items") or []:
        branch = {"conds": [_condition_text(item, deref)]}
        expr = _condition_node(item, deref)
        if expr:
            branch["expr"] = expr
        branches.append(branch)
    return {
        "kind": "condition",
        "note": (tree.get("_devNote") or "").strip(),
        "branches": branches,
    }


def _parse_dice(tree: dict, deref: _Deref) -> dict:
    additions = []
    for item in tree.get("_propertyItems") or []:
        ptype = item.get("_type", 0)
        field = DICE_FIELD.get(ptype)
        ref = item.get(field) if field else None
        name = _label(deref(ref), (ref or {}).get("m_PathID")) if ref else "未設定"
        rate = item.get("_rate", 1)
        sign = "-" if item.get("_negative", 0) else "+"
        hidden = "（為空不顯示）" if item.get("_autoHide", 0) else ""
        additions.append(f"{DICE_PROPERTY.get(ptype, '?')}（{name}）{sign}×{rate:g}{hidden}")
    branches = []
    for index, item in enumerate(tree.get("_resultItems") or []):
        conds = []
        for sub in item.get("_items") or []:
            op = COMPARE.get(sub.get("_compareOp", 0), "?")
            conds.append(f"骰值 {op} {sub.get('_value')}")
        branch = {"conds": [" 且 ".join(conds)] if conds else ["（未設定）"],
                  "result": index + 1}
        expr = _dice_branch_node(item)
        if expr:
            branch["expr"] = expr
        branches.append(branch)
    return {
        "kind": "dice",
        "note": (tree.get("_devNote") or "").strip(),
        "additions": additions,
        "branches": branches,
        "fallback": len(branches) + 1,
    }


def _parse_position(tree: dict, deref: _Deref) -> dict:
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


def _parse(tree: dict, deref: _Deref) -> dict | None:
    for marker, parser in PARSERS.items():
        if marker in tree:
            return parser(tree, deref)
    if "_default" in tree and "State" in tree:
        return {"kind": "flag",
                "note": (tree.get("_devNote") or "").strip(),
                "default": tree.get("_default", 0)}
    if "_items" in tree:
        return _parse_condition(tree, deref)
    return None


def extract(assets_dir: Path, found: dict[str, Path],
            log: Callable[[str], None] = print,
            hints: dict[str, set[str]] | None = None) -> tuple[dict[str, dict], list[dict]]:
    import UnityPy

    if not found:
        return {}, []
    _generator, adapter = build_generator(assets_dir / "Managed")

    by_file: dict[Path, list[str]] = {}
    for key, path in found.items():
        by_file.setdefault(path, []).append(key)

    models: dict[str, dict] = {}
    gaps: list[dict] = []
    rescued: list[str] = []
    started = time.time()
    log(f"      parsing {len(found)} checkpoint configs ({len(by_file)} files)...")
    for path, keys in sorted(by_file.items(), key=lambda item: str(item[0])):
        try:
            env = UnityPy.load(str(path))
        except Exception as exc:
            log(f"      [warn] failed to open {path.name}: {type(exc).__name__}")
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
        deref = _Deref(env, local, serialized, path.parent, adapter)
        for key in keys:
            candidates = exact.get(key)
            if not candidates:
                fuzzy = normed.get(_norm(key))
                if fuzzy is None:
                    gaps.append({"key": key, "reason": GAP_NOT_FOUND})
                    continue
                candidates = [fuzzy]
                rescued.append(key)
            parsed_models: list[dict] = []
            reasons: list[str] = []
            for candidate in candidates:
                tree = _tree(candidate)
                if not tree:
                    reasons.append(GAP_NO_TREE)
                    continue
                try:
                    parsed = _parse(tree, deref)
                except Exception as exc:
                    log(f"      [warn] failed to parse {key}: {type(exc).__name__}")
                    reasons.append(GAP_PARSE_ERROR)
                    continue
                if parsed is None:
                    reasons.append(GAP_UNMATCHED)
                    continue
                parsed_models.append(parsed)
            if not parsed_models:
                gaps.append({"key": key, "reason": reasons[0] if reasons else GAP_UNMATCHED})
                continue
            models[key] = choose_model(parsed_models, (hints or {}).get(key))
    by_reason: dict[str, int] = {}
    for gap in gaps:
        by_reason[gap["reason"]] = by_reason.get(gap["reason"], 0) + 1
    log(f"      checkpoint conditions: {len(models)} resolved, {len(gaps)} failed"
        + (f" ({', '.join(f'{key} {value}' for key, value in sorted(by_reason.items()))})" if gaps else "")
        + (f", {len(rescued)} rescued by name normalization" if rescued else "")
        + f", {time.time() - started:.1f}s")
    for gap in gaps[:8]:
        log(f"            gap {gap['key']}: {gap['reason']}"
            + (f" ({gap['detail']})" if gap.get("detail") else ""))
    if len(gaps) > 8:
        log(f"            ... {len(gaps) - 8} more gaps, see data/checkpoints.json")
    return models, gaps


def summarize(models: dict[str, dict], wanted: int,
              gaps: list[dict] | None = None) -> dict:
    by_kind: dict[str, int] = {}
    for model in models.values():
        by_kind[model["kind"]] = by_kind.get(model["kind"], 0) + 1
    out = {"resolved": len(models), "wanted": wanted,
           "missing": max(wanted - len(models), 0), "by_kind": by_kind}
    if gaps is not None:
        by_reason: dict[str, int] = {}
        for gap in gaps:
            by_reason[gap["reason"]] = by_reason.get(gap["reason"], 0) + 1
        out["gaps"] = {"total": len(gaps), "by_reason": by_reason, "items": gaps}
    return out
