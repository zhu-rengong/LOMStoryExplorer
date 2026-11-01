from __future__ import annotations

from typing import Any

from ..versions import MAX_BRANCH_DEPTH
from ..vocab import (
    COMPARE_OP_SYMBOL,
    COND_COMPARE,
    COND_CONST,
    COND_DICE,
    COND_GROUP,
    COND_LOGIC,
    COND_RANDOM,
    COND_VAR,
    GROUP_OP_KIND,
    LOGIC_OP_KIND,
    VALUE_CONST,
    VALUE_GROUP,
    VALUE_KIND_BY_CODE,
    VALUE_RANDOM,
    VALUE_TALENT,
)
from .profile import DICE_FIELD_BY_KIND, DICE_NAME_KINDS, ITEM_KINDS, STAT_FIELD_BY_KIND
from .unity import Deref


def label_of(obj: Any, path_id: Any = None) -> str:
    if obj is None:
        return str(path_id) if path_id else ""
    try:
        name = obj.peek_name()
    except Exception:
        name = None
    return name or str(getattr(obj, "path_id", path_id) or "")


def tree_of(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    try:
        return obj.read_typetree()
    except Exception:
        return None


def item_id(obj: Any) -> str:
    tree = tree_of(obj) or {}
    value = tree.get("_id")
    if isinstance(value, bool):
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, int):
        return str(value)
    return ""


def _kind_of(code: Any) -> str | None:
    if isinstance(code, bool) or not isinstance(code, int):
        return None
    return VALUE_KIND_BY_CODE.get(code)


def _compare_symbol(code: Any) -> str:
    if isinstance(code, int) and code in COMPARE_OP_SYMBOL:
        return COMPARE_OP_SYMBOL[code]
    return "?"


def _group_kind(code: Any) -> str:
    if isinstance(code, int) and code in GROUP_OP_KIND:
        return GROUP_OP_KIND[code]
    return "sum"


def _logic_kind(code: Any) -> str:
    if isinstance(code, int) and code in LOGIC_OP_KIND:
        return LOGIC_OP_KIND[code]
    return "and"


def const_node(value: Any) -> dict[str, Any]:
    return {"tag": COND_CONST, "value": value}


def random_node(lo: Any, hi: Any) -> dict[str, Any]:
    return {"tag": COND_RANDOM, "min": lo, "max": hi}


def dice_node() -> dict[str, Any]:
    return {"tag": COND_DICE}


def var_node(kind: str, name: str, negative: bool, ident: str = "") -> dict[str, Any]:
    node: dict[str, Any] = {"tag": COND_VAR, "kind": kind, "name": name, "negative": negative}
    if ident:
        node["id"] = ident
    return node


def compare_node(op: Any, left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    return {"tag": COND_COMPARE, "op": _compare_symbol(op), "left": left, "right": right}


def logic_node(op: Any, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"tag": COND_LOGIC, "op": _logic_kind(op), "items": items}


def group_node(ref: Any, deref: Deref, depth: int = 0) -> dict[str, Any] | None:
    obj, scope = deref.scope(ref)
    tree = tree_of(obj)
    if not tree:
        return None
    name = label_of(obj)
    if depth >= MAX_BRANCH_DEPTH:
        return {"tag": COND_GROUP, "op": _group_kind(tree.get("_groupType")),
                "name": name, "items": []}
    items = [value_node(entry, scope, depth + 1) for entry in tree.get("_value") or []]
    if any(node is None for node in items):
        return None
    return {"tag": COND_GROUP, "op": _group_kind(tree.get("_groupType")),
            "name": name, "items": [node for node in items if node is not None]}


def value_node(entry: dict[str, Any], deref: Deref, depth: int = 0) -> dict[str, Any] | None:
    check = entry.get("_checkType", 0)
    kind = _kind_of(check)
    negative = bool(entry.get("_negative", 0))
    if kind == VALUE_CONST:
        return const_node(entry.get("_constant", 0))
    if kind == VALUE_RANDOM:
        return random_node(entry.get("_randomMin", 0), entry.get("_randomMax", 0))
    if kind == VALUE_GROUP:
        node = group_node(entry.get("_statGroup"), deref, depth)
        if node is None:
            return None
        node["negative"] = negative
        return node
    if kind is None:
        return None
    field = STAT_FIELD_BY_KIND.get(kind)
    ref = entry.get(field) if field else None
    if not ref:
        return None
    target = deref(ref)
    if target is None:
        return None
    ident = item_id(target) if kind in ITEM_KINDS else ""
    return var_node(kind, label_of(target), negative, ident)


def compare_node_of(item: dict[str, Any], deref: Deref) -> dict[str, Any] | None:
    left = group_node(item.get("_value1"), deref)
    right = group_node(item.get("_value2"), deref)
    if left is None or right is None:
        return None
    return compare_node(item.get("_compareOp", 0), left, right)


def condition_node(item: dict[str, Any], deref: Deref) -> dict[str, Any] | None:
    subs = item.get("_items") or []
    nodes = [compare_node_of(sub, deref) for sub in subs]
    if not nodes or any(node is None for node in nodes):
        return None
    if len(nodes) == 1:
        return nodes[0]
    return logic_node(item.get("_logicOp", 0), [node for node in nodes if node is not None])


def dice_branch_node(item: dict[str, Any]) -> dict[str, Any] | None:
    nodes = [
        compare_node(sub.get("_compareOp", 0), dice_node(), const_node(sub.get("_value", 0)))
        for sub in item.get("_items") or []
    ]
    if not nodes:
        return None
    return nodes[0] if len(nodes) == 1 else logic_node(0, nodes)


def dice_addition(item: dict[str, Any], deref: Deref) -> dict[str, Any]:
    code = item.get("_type", 0)
    kind = DICE_NAME_KINDS.get(code) if isinstance(code, int) and not isinstance(code, bool) else None
    field = DICE_FIELD_BY_KIND.get(kind) if kind else None
    ref = item.get(field) if field else None
    target = deref(ref) if ref else None
    name = label_of(target, (ref or {}).get("m_PathID")) if ref else ""
    ident = ""
    if kind == VALUE_TALENT and target is not None:
        ident = str((tree_of(target) or {}).get("_id") or "")
    try:
        rate = float(item.get("_rate", 1))
    except (TypeError, ValueError):
        rate = 1.0
    node: dict[str, Any] = {
        "kind": kind or "",
        "name": name,
        "rate": rate,
        "negative": bool(item.get("_negative", 0)),
        "hide": bool(item.get("_autoHide", 0)),
    }
    if ident:
        node["id"] = ident
    return node
