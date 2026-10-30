from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .. import lua as L
from ..model import TextRef
from .model import CheckpointValue, LockedValue, UnknownValue, FlowState, callee, number_text, short, text_value

CHECKPOINT_LABELS = {"switch": "分支判定", "dice": "骰子判定", "condition": "條件", "position": "場所事件"}


class ExpressionEvaluator:
    def __init__(self) -> None:
        self.call_evaluator: Callable[[L.Call, FlowState], Any] = lambda call, state: UnknownValue(call.text())

    def evaluate(self, expression: L.Expr, state: FlowState) -> Any:
        if isinstance(expression, L.Str):
            return TextRef("text", expression.value)
        if isinstance(expression, L.Num):
            return int(expression.value) if expression.value.is_integer() else expression.value
        if isinstance(expression, L.Literal):
            return {"nil": None, "true": True, "false": False}[expression.value]
        if isinstance(expression, L.Name):
            return state.env.get(expression.id, UnknownValue(expression.id))
        if isinstance(expression, L.Index):
            base = self.evaluate(expression.obj, state)
            key = self.key(expression.key, state)
            if isinstance(base, dict):
                return base.get(key, UnknownValue(expression.text()))
            return UnknownValue(expression.text())
        if isinstance(expression, L.Table):
            table: dict[str, Any] = {}
            automatic = 1
            for key_expression, value_expression in expression.fields:
                value = self.evaluate(value_expression, state)
                if key_expression is None:
                    table[str(automatic)] = value
                    automatic += 1
                else:
                    table[self.key(key_expression, state)] = value
            return table
        if isinstance(expression, L.Un):
            return self.unary(expression, state)
        if isinstance(expression, L.Bin):
            return self.binary(expression, state)
        if isinstance(expression, L.Call):
            return self.call_evaluator(expression, state)
        return UnknownValue(expression.text())

    def key(self, expression: L.Expr, state: FlowState) -> str:
        value = self.evaluate(expression, state)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return number_text(value)
        return text_value(value) or expression.text()

    def unary(self, expression: L.Un, state: FlowState) -> Any:
        value = self.evaluate(expression.operand, state)
        if expression.op == "-" and isinstance(value, (int, float)) and not isinstance(value, bool):
            return -value
        if expression.op == "not" and not isinstance(value, UnknownValue):
            return not self.truthy(value)
        return UnknownValue(expression.text())

    def binary(self, expression: L.Bin, state: FlowState) -> Any:
        operator = expression.op
        if operator == "or" and isinstance(expression.left, L.Bin) and expression.left.op == "and" \
                and isinstance(expression.right, L.Str) and expression.right.value.startswith("~"):
            return LockedValue(
                available=self.evaluate(expression.left.right, state),
                locked=TextRef("text", expression.right.value.lstrip("~")),
                condition=expression.left.left.text(),
            )
        left = self.evaluate(expression.left, state)
        if operator == "and":
            if isinstance(left, UnknownValue):
                return left
            return self.evaluate(expression.right, state) if self.truthy(left) else left
        if operator == "or":
            if isinstance(left, UnknownValue):
                return left
            return left if self.truthy(left) else self.evaluate(expression.right, state)
        right = self.evaluate(expression.right, state)
        if operator == ".." and text_value(left) is not None and text_value(right) is not None:
            return TextRef("text", (text_value(left) or "") + (text_value(right) or ""))
        if isinstance(left, UnknownValue) or isinstance(right, UnknownValue):
            return UnknownValue(expression.text())
        try:
            if operator == "+":
                return left + right
            if operator == "-":
                return left - right
            if operator == "*":
                return left * right
            if operator == "/":
                return left / right
            if operator == "//":
                return left // right
            if operator == "%":
                return left % right
            if operator == "==":
                return left == right
            if operator == "~=":
                return left != right
            if operator == "<":
                return left < right
            if operator == "<=":
                return left <= right
            if operator == ">":
                return left > right
            if operator == ">=":
                return left >= right
        except (ArithmeticError, TypeError):
            return UnknownValue(expression.text())
        return UnknownValue(expression.text())

    @staticmethod
    def truthy(value: Any) -> bool:
        return value is not None and value is not False

    def condition_kind(self, expression: L.Expr | None, state: FlowState) -> str:
        if expression is None:
            return "if"
        if isinstance(expression, L.Call):
            value = self.evaluate(expression, state)
            return value.kind if isinstance(value, CheckpointValue) else "if"
        if isinstance(expression, L.Name):
            value = state.env.get(expression.id)
            return value.kind if isinstance(value, CheckpointValue) else "if"
        if isinstance(expression, L.Bin):
            left = self.condition_kind(expression.left, state)
            right = self.condition_kind(expression.right, state)
            if left == "if":
                return right
            if right == "if" or left == right:
                return left
        return "if"

    def condition_label(self, expression: L.Expr | None, state: FlowState) -> str:
        if expression is None:
            return "其他情況"
        if isinstance(expression, L.Name):
            value = state.env.get(expression.id)
            if isinstance(value, CheckpointValue):
                return f"{CHECKPOINT_LABELS.get(value.kind, '判定')}「{value.key}」"
            return expression.id
        if isinstance(expression, L.Call):
            value = self.evaluate(expression, state)
            if isinstance(value, CheckpointValue):
                return f"{CHECKPOINT_LABELS.get(value.kind, '判定')}「{value.key}」"
            return short(expression)
        if isinstance(expression, L.Bin):
            if expression.op in ("and", "or"):
                joiner = " 且 " if expression.op == "and" else " 或 "
                return self.condition_label(expression.left, state) + joiner + self.condition_label(expression.right, state)
            return f"{self.condition_label(expression.left, state)} {expression.op} {self.condition_label(expression.right, state)}"
        if isinstance(expression, L.Str):
            return expression.value
        if isinstance(expression, L.Num):
            return number_text(expression.value)
        if isinstance(expression, L.Index) and isinstance(expression.key, L.Str):
            return f"{self.condition_label(expression.obj, state)}.{expression.key.value}"
        return short(expression)
