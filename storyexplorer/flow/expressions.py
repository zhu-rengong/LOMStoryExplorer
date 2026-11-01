from __future__ import annotations

from typing import Any

from .. import lua as L
from ..model import Locked, Mark, MetaBeat, TextRef, Unknown
from ..vocab import (
    COND_CHECK,
    COND_COMPARE,
    COND_CONST,
    COND_LOGIC,
    COND_RAW,
    COND_VAR,
)
from .calls import callee
from .state import EvalState, as_text, num_text, short

_COMPARE_SYMBOL = {
    "==": "=",
    "~=": "≠",
    "<": "<",
    "<=": "≤",
    ">": ">",
    ">=": "≥",
}

_INDEX_KINDS = ("dot_index_expression", "bracket_index_expression")


class ExpressionEvaluator:
    def __init__(self, flow: Any) -> None:
        self.flow = flow

    @property
    def sem(self) -> Any:
        return self.flow.semantics

    def eval(self, expr: L.Node, state: EvalState) -> Any:
        kind = expr.type
        if kind == "string":
            return TextRef(L.string_value(expr))
        if kind == "number":
            return int(L.number_value(expr))
        if kind == "nil":
            return None
        if kind == "true":
            return True
        if kind == "false":
            return False
        if kind == "identifier":
            name = L.text(expr)
            return state.env.get(name, Unknown(name))
        if kind in _INDEX_KINDS:
            return self._index(expr, state)
        if kind == "table_constructor":
            return self._table(expr, state)
        if kind == "unary_expression":
            return self._unary(expr, state)
        if kind == "binary_expression":
            return self._binary(expr, state)
        if kind == "function_call":
            return self.flow.calls.eval_call(expr, state)
        if kind == "parenthesized_expression":
            children = expr.named_children
            return self.eval(children[0], state) if children else Unknown("")
        return Unknown(L.text(expr))

    def _index(self, expr: L.Node, state: EvalState) -> Any:
        base = self.eval(expr.child_by_field_name("table"), state)
        field = expr.child_by_field_name("field")
        key = L.index_key(expr) or as_text(self.eval(field, state)) or L.text(field)
        if isinstance(base, dict):
            return base.get(key, Unknown(L.text(expr)))
        return Unknown(L.text(expr))

    def _table(self, expr: L.Node, state: EvalState) -> dict[str, Any]:
        table: dict[str, Any] = {}
        auto = 1
        for field in expr.named_children:
            if field.type != "field":
                continue
            value = self.eval(field.child_by_field_name("value"), state)
            key = L.field_key(field)
            if key is None and L.field_has_key(field):
                name = field.child_by_field_name("name")
                key = as_text(self.eval(name, state)) or L.text(name)
            if key is None:
                table[str(auto)] = value
                auto += 1
            else:
                table[key] = value
        return table

    def _unary(self, expr: L.Node, state: EvalState) -> Any:
        operand = self.eval(expr.child_by_field_name("operand"), state)
        if L.operator(expr) == "-" and isinstance(operand, int) and not isinstance(operand, bool):
            return -operand
        return Unknown(L.text(expr))

    def _binary(self, expr: L.Node, state: EvalState) -> Any:
        op = L.operator(expr)
        left_node = expr.child_by_field_name("left")
        right_node = expr.child_by_field_name("right")
        if op == "..":
            left = as_text(self.eval(left_node, state))
            right = as_text(self.eval(right_node, state))
            if left is not None and right is not None:
                return TextRef(left + right)
            return Unknown(L.text(expr))
        if op == "or":
            if left_node.type == "binary_expression" and L.operator(left_node) == "and" \
                    and right_node.type == "string" and L.string_value(right_node).startswith("~"):
                return Locked(
                    available=self.eval(left_node.child_by_field_name("right"), state),
                    locked=TextRef(L.string_value(right_node).lstrip("~")),
                )
            left = self.eval(left_node, state)
            return left if isinstance(left, TextRef) else self.eval(right_node, state)
        if op == "and":
            return self.eval(right_node, state)
        return Unknown(L.text(expr))

    def eval_stmt_value(self, expr: L.Node, state: EvalState, beats: list[Any]) -> tuple[Any, dict[str, Any] | None]:
        if expr.type == "dot_index_expression":
            table = expr.child_by_field_name("table")
            if table is not None and table.type == "identifier" \
                    and L.text(table) == self.sem.dice_object \
                    and L.index_key(expr) == self.sem.dice_result_field:
                beats.append(None)
                return Unknown(L.text(expr)), {"index": len(beats) - 1, "var": "",
                                               "options": list(state.menu_options)}
        if expr.type == "function_call":
            obj, method = callee(expr)
            args = L.arguments(expr)
            if not obj and method == self.sem.choice_method and args:
                options = self.flow.calls.option_list(self.eval(args[0], state))
                beats.append(None)
                return Unknown(L.text(expr)), {"index": len(beats) - 1, "var": "", "options": options}
            if obj == self.sem.check_object and method in self.sem.check_methods:
                value = self.eval(expr, state)
                if isinstance(value, Mark) and method == "Dice":
                    beats.append(MetaBeat("dice", value.key))
                return value, None
            self.flow.ctx.fx_count += 1
            return self.eval(expr, state), None
        return self.eval(expr, state), None

    def cond_node(self, cond: L.Node, state: EvalState) -> dict[str, Any]:
        kind = cond.type
        if kind == "function_call":
            obj, method = callee(cond)
            args = L.arguments(cond)
            if obj == self.sem.check_object and method in self.sem.check_methods:
                key = as_text(self.eval(args[0], state)) if args else ""
                if key:
                    self.flow.ctx.reads.add(key)
                    return {"tag": COND_CHECK, "kind": self.sem.check_methods[method], "key": key}
            if obj == self.sem.stat_object and method.startswith(self.sem.stat_getter_prefix) and args:
                key = as_text(self.eval(args[0], state)) or L.text(args[0]).strip("\"'")
                return {"tag": COND_VAR, "kind": "stat", "key": key}
            return {"tag": COND_RAW, "text": short(cond)}
        if kind == "binary_expression":
            op = L.operator(cond)
            left_node = cond.child_by_field_name("left")
            right_node = cond.child_by_field_name("right")
            if op in ("and", "or"):
                return {
                    "tag": COND_LOGIC,
                    "op": op,
                    "items": [self.cond_node(left_node, state), self.cond_node(right_node, state)],
                }
            return {
                "tag": COND_COMPARE,
                "op": _COMPARE_SYMBOL.get(op, op),
                "left": self.cond_node(left_node, state),
                "right": self.cond_node(right_node, state),
            }
        if kind == "identifier":
            value = state.env.get(L.text(cond))
            if isinstance(value, Mark):
                return {"tag": COND_CHECK, "kind": value.kind, "key": value.key}
            if isinstance(value, (str, int)) and not isinstance(value, bool):
                return {"tag": COND_CONST, "value": value}
            return {"tag": COND_RAW, "text": L.text(cond)}
        if kind == "string":
            return {"tag": COND_CONST, "value": L.string_value(cond)}
        if kind == "number":
            return {"tag": COND_CONST, "value": num_text(L.number_value(cond))}
        if kind == "unary_expression" and L.operator(cond) == "-":
            operand = cond.child_by_field_name("operand")
            if operand is not None and operand.type == "number":
                return {"tag": COND_CONST, "value": num_text(-L.number_value(operand))}
            return {"tag": COND_RAW, "text": short(cond)}
        if kind in _INDEX_KINDS:
            return {"tag": COND_RAW, "text": short(cond)}
        return {"tag": COND_RAW, "text": short(cond)}
