from __future__ import annotations

from typing import Any

from .. import lua as L
from ..model import Locked, Mark, MetaBeat, TextRef, Unknown
from .calls import callee
from .state import EvalState, as_text, num_text, short

_COND_KIND_BY_MARK = {"switch": "分支判定", "dice": "骰子判定", "condition": "條件", "position": "場所事件"}

_MARK_KINDS = {"switch", "dice", "condition", "position"}


class ExpressionEvaluator:
    def __init__(self, flow: Any) -> None:
        self.flow = flow

    def eval(self, expr: L.Expression, state: EvalState) -> Any:
        if isinstance(expr, L.String):
            return TextRef(L.string_value(expr))
        if isinstance(expr, L.Number):
            return int(expr.n)
        if isinstance(expr, L.Nil):
            return None
        if isinstance(expr, L.TrueExpr):
            return True
        if isinstance(expr, L.FalseExpr):
            return False
        if isinstance(expr, L.Name):
            return state.env.get(expr.id, Unknown(expr.id))
        if isinstance(expr, L.Index):
            return self._index(expr, state)
        if isinstance(expr, L.Table):
            return self._table(expr, state)
        if isinstance(expr, L.UnaryOp):
            return self._unary(expr, state)
        if isinstance(expr, L.BinaryOp):
            return self._binary(expr, state)
        if isinstance(expr, L.Call | L.Invoke):
            return self.flow.calls.eval_call(expr, state)
        return Unknown(L.text(expr) if isinstance(expr, L.Expression) else "")

    def _index(self, expr: L.Index, state: EvalState) -> Any:
        base = self.eval(expr.value, state)
        key = L.index_key(expr) or as_text(self.eval(expr.idx, state)) or L.text(expr.idx)
        if isinstance(base, dict):
            return base.get(key, Unknown(L.text(expr)))
        return Unknown(L.text(expr))

    def _table(self, expr: L.Table, state: EvalState) -> dict[str, Any]:
        table: dict[str, Any] = {}
        auto = 1
        for field in expr.fields:
            value = self.eval(field.value, state)
            key = L.field_key(field)
            if key is None and field.key is not None:
                key = as_text(self.eval(field.key, state)) or L.text(field.key)
            if key is None:
                table[str(auto)] = value
                auto += 1
            else:
                table[key] = value
        return table

    def _unary(self, expr: L.UnaryOp, state: EvalState) -> Any:
        operand = self.eval(expr.operand, state)
        if isinstance(expr, L.UMinusOp) and isinstance(operand, int) and not isinstance(operand, bool):
            return -operand
        return Unknown(L.text(expr))

    def _binary(self, expr: L.BinaryOp, state: EvalState) -> Any:
        op = L.operator(expr)
        if op == "..":
            left = as_text(self.eval(expr.left, state))
            right = as_text(self.eval(expr.right, state))
            if left is not None and right is not None:
                return TextRef(left + right)
            return Unknown(L.text(expr))
        if op == "or":
            if isinstance(expr.left, L.BinaryOp) and L.operator(expr.left) == "and" \
                    and isinstance(expr.right, L.String) and L.string_value(expr.right).startswith("~"):
                return Locked(
                    available=self.eval(expr.left.right, state),
                    locked=TextRef(L.string_value(expr.right).lstrip("~")),
                    cond=L.text(expr.left.left),
                )
            left = self.eval(expr.left, state)
            return left if isinstance(left, TextRef) else self.eval(expr.right, state)
        if op == "and":
            return self.eval(expr.right, state)
        return Unknown(L.text(expr))

    def eval_stmt_value(self, expr: L.Expression, state: EvalState, beats: list[Any],
                        label: str) -> tuple[Any, dict[str, Any] | None]:
        if isinstance(expr, L.Index) and isinstance(expr.value, L.Name) \
                and expr.value.id == "dicemenudialog" and L.index_key(expr) == "ResultSelection":
            beats.append(None)
            return Unknown(L.text(expr)), {"index": len(beats) - 1, "var": "", "options": list(state.menu_options)}
        if isinstance(expr, L.Call | L.Invoke):
            obj, method = callee(expr)
            if not obj and method == "choose" and expr.args:
                options = self.flow.calls.option_list(self.eval(expr.args[0], state))
                beats.append(None)
                return Unknown(L.text(expr)), {"index": len(beats) - 1, "var": "", "options": options}
            if obj == "checkpointmanager" and method in ("Switch", "Dice", "Condition", "Position"):
                value = self.eval(expr, state)
                if isinstance(value, Mark) and method == "Dice":
                    beats.append(MetaBeat("dice", value.key))
                return value, None
            self.flow.ctx.fx_count += 1
            return self.eval(expr, state), None
        return self.eval(expr, state), None

    def cond_kind(self, cond: L.Expression, state: EvalState) -> str:
        if isinstance(cond, L.Call | L.Invoke):
            obj, method = callee(cond)
            if obj == "checkpointmanager":
                return {"Switch": "switch", "Dice": "dice",
                        "Condition": "condition", "Position": "position"}.get(method, "if")
            return "if"
        if isinstance(cond, L.Name):
            value = state.env.get(cond.id)
            if isinstance(value, Mark) and value.kind in _MARK_KINDS:
                return value.kind
            return "if"
        if isinstance(cond, L.BinaryOp):
            left = self.cond_kind(cond.left, state)
            right = self.cond_kind(cond.right, state)
            if L.operator(cond) in ("and", "or"):
                return left if left == right else "if"
            if left == "if":
                return right
            if right == "if":
                return left
            return left if left == right else "if"
        return "if"

    def cond_label(self, cond: L.Expression, state: EvalState) -> str:
        if isinstance(cond, L.Call | L.Invoke):
            obj, method = callee(cond)
            if obj == "checkpointmanager" and cond.args:
                key = as_text(self.eval(cond.args[0], state)) or ""
                if key:
                    self.flow.ctx.reads.add(key)
                name = {"Condition": "條件", "Switch": "分支判定", "Dice": "骰子判定",
                        "Position": "場所事件"}.get(method, method)
                return f"{name}「{key}」"
            if obj == "statmodifymanager" and method.startswith("Get"):
                key = as_text(self.eval(cond.args[0], state)) if cond.args else ""
                if not key and cond.args:
                    key = L.text(cond.args[0]).strip("\"'")
                return f"屬性「{key}」"
            return short(cond)
        if isinstance(cond, L.BinaryOp):
            op = L.operator(cond)
            if op in ("and", "or"):
                joiner = " 且 " if op == "and" else " 或 "
                return self.cond_label(cond.left, state) + joiner + self.cond_label(cond.right, state)
            left = self.cond_label(cond.left, state)
            right = self.cond_label(cond.right, state)
            return f"{left} {op} {right}"
        if isinstance(cond, L.Name):
            value = state.env.get(cond.id)
            if isinstance(value, Mark):
                name = _COND_KIND_BY_MARK.get(value.kind, "判定")
                return f"{name}「{value.key}」"
            return cond.id
        if isinstance(cond, L.String):
            return L.string_value(cond)
        if isinstance(cond, L.Number):
            return num_text(cond.n)
        if isinstance(cond, L.UnaryOp):
            if isinstance(cond, L.UMinusOp):
                value = self.eval(cond.operand, state)
                if isinstance(value, int) and not isinstance(value, bool):
                    return str(-value)
                if isinstance(cond.operand, L.Number):
                    return num_text(-cond.operand.n)
            return short(cond)
        if isinstance(cond, L.Index):
            key = L.index_key(cond)
            if key is not None:
                base = self.cond_label(cond.value, state) if isinstance(cond.value, L.Expression) else ""
                return f"{base}.{key}"
            return short(cond)
        return short(cond)
