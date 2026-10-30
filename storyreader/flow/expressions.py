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

    def eval(self, expr: L.Expr, state: EvalState) -> Any:
        if isinstance(expr, L.Str):
            return TextRef(expr.value)
        if isinstance(expr, L.Num):
            return int(expr.value)
        if isinstance(expr, L.Literal):
            return {"nil": None, "true": True, "false": False}[expr.value]
        if isinstance(expr, L.Name):
            return state.env.get(expr.id, Unknown(expr.id))
        if isinstance(expr, L.Index):
            base = self.eval(expr.obj, state)
            key = as_text(self.eval(expr.key, state)) or expr.key.text()
            if isinstance(base, dict):
                return base.get(key, Unknown(expr.text()))
            return Unknown(expr.text())
        if isinstance(expr, L.Table):
            table: dict[str, Any] = {}
            auto = 1
            for key_expr, value_expr in expr.fields:
                value = self.eval(value_expr, state)
                if key_expr is None:
                    table[str(auto)] = value
                    auto += 1
                else:
                    key = as_text(self.eval(key_expr, state)) or key_expr.text()
                    table[key] = value
            return table
        if isinstance(expr, L.Un):
            operand = self.eval(expr.operand, state)
            if expr.op == "-" and isinstance(operand, int) and not isinstance(operand, bool):
                return -operand
            return Unknown(expr.text())
        if isinstance(expr, L.Bin):
            return self._binary(expr, state)
        if isinstance(expr, L.Call):
            return self.flow.calls.eval_call(expr, state)
        return Unknown(expr.text() if isinstance(expr, L.Expr) else "")

    def _binary(self, expr: L.Bin, state: EvalState) -> Any:
        if expr.op == "..":
            left = as_text(self.eval(expr.left, state))
            right = as_text(self.eval(expr.right, state))
            if left is not None and right is not None:
                return TextRef(left + right)
            return Unknown(expr.text())
        if expr.op == "or":
            if isinstance(expr.left, L.Bin) and expr.left.op == "and" \
                    and isinstance(expr.right, L.Str) and expr.right.value.startswith("~"):
                return Locked(
                    available=self.eval(expr.left.right, state),
                    locked=TextRef(expr.right.value.lstrip("~")),
                    cond=expr.left.left.text(),
                )
            left = self.eval(expr.left, state)
            return left if isinstance(left, TextRef) else self.eval(expr.right, state)
        if expr.op == "and":
            return self.eval(expr.right, state)
        return Unknown(expr.text())

    def eval_stmt_value(self, expr: L.Expr, state: EvalState, beats: list[Any],
                        label: str) -> tuple[Any, dict[str, Any] | None]:
        if isinstance(expr, L.Index) and isinstance(expr.obj, L.Name) \
                and expr.obj.id == "dicemenudialog" and isinstance(expr.key, L.Str) \
                and expr.key.value == "ResultSelection":
            beats.append(None)
            return Unknown(expr.text()), {"index": len(beats) - 1, "var": "", "options": list(state.menu_options)}
        if isinstance(expr, L.Call):
            obj, method = callee(expr)
            if not obj and method == "choose" and expr.args:
                options = self.flow.calls.option_list(self.eval(expr.args[0], state))
                beats.append(None)
                return Unknown(expr.text()), {"index": len(beats) - 1, "var": "", "options": options}
            if obj == "checkpointmanager" and method in ("Switch", "Dice", "Condition", "Position"):
                value = self.eval(expr, state)
                if isinstance(value, Mark) and method == "Dice":
                    beats.append(MetaBeat("dice", value.key))
                return value, None
            self.flow.ctx.fx_count += 1
            return self.eval(expr, state), None
        return self.eval(expr, state), None

    def cond_kind(self, cond: L.Expr, state: EvalState) -> str:
        if isinstance(cond, L.Call):
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
        if isinstance(cond, L.Bin):
            left = self.cond_kind(cond.left, state)
            right = self.cond_kind(cond.right, state)
            if cond.op in ("and", "or"):
                return left if left == right else "if"
            if left == "if":
                return right
            if right == "if":
                return left
            return left if left == right else "if"
        return "if"

    def cond_label(self, cond: L.Expr, state: EvalState) -> str:
        if isinstance(cond, L.Call):
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
                    key = cond.args[0].text().strip("\"'")
                return f"屬性「{key}」"
            return short(cond)
        if isinstance(cond, L.Bin):
            if cond.op in ("and", "or"):
                joiner = " 且 " if cond.op == "and" else " 或 "
                return self.cond_label(cond.left, state) + joiner + self.cond_label(cond.right, state)
            left = self.cond_label(cond.left, state)
            right = self.cond_label(cond.right, state)
            return f"{left} {cond.op} {right}"
        if isinstance(cond, L.Name):
            value = state.env.get(cond.id)
            if isinstance(value, Mark):
                name = _COND_KIND_BY_MARK.get(value.kind, "判定")
                return f"{name}「{value.key}」"
            return cond.id
        if isinstance(cond, L.Str):
            return cond.value
        if isinstance(cond, L.Num):
            return num_text(cond.value)
        if isinstance(cond, L.Un):
            if cond.op == "-":
                value = self.eval(cond.operand, state)
                if isinstance(value, int) and not isinstance(value, bool):
                    return str(-value)
                if isinstance(cond.operand, L.Num):
                    return num_text(-cond.operand.value)
            return short(cond)
        if isinstance(cond, L.Index):
            if isinstance(cond.key, L.Str):
                base = self.cond_label(cond.obj, state) if isinstance(cond.obj, L.Expr) else ""
                return f"{base}.{cond.key.value}"
            return short(cond)
        return short(cond)
