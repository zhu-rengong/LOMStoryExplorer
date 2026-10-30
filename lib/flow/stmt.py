from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .. import lua as L
from ..model import Beat, BranchBeat, ChoiceOption, TextRef
from .beats import fallback_option
from .calls import CallProcessor
from .expr import ExpressionEvaluator
from .model import AnalysisContext, FlowState, PendingChoice, UnknownValue, callee, text_value


class BlockWalker:
    def __init__(self, context: AnalysisContext, evaluator: ExpressionEvaluator, calls: CallProcessor) -> None:
        self.context = context
        self.evaluator = evaluator
        self.calls = calls

    def walk(self, statements: Sequence[L.Stmt], state: FlowState, beats: list[Beat], label: str = "") -> None:
        pending: PendingChoice | None = None
        for statement in statements:
            if isinstance(statement, L.If) and pending and self.uses_choice(statement, pending.variable):
                self.fill_choice(pending, statement, state, label)
                pending = None
                continue
            if isinstance(statement, L.If):
                if pending:
                    self.close_choice(pending)
                    pending = None
                self.emit_if(statement, state, beats, label)
                continue
            if isinstance(statement, L.Do):
                self.walk(statement.body, state.clone(), beats, label)
                continue
            produced = self.statement(statement, state, beats, label)
            if produced:
                if pending:
                    self.close_choice(pending)
                pending = produced
        if pending:
            self.close_choice(pending)

    def statement(self, statement: L.Stmt, state: FlowState, beats: list[Beat], label: str) -> PendingChoice | None:
        if isinstance(statement, L.Local):
            pending = None
            for index, name in enumerate(statement.names):
                if index >= len(statement.values):
                    state.env[name] = None
                    continue
                value, produced = self.statement_value(statement.values[index], state, beats, label)
                state.env[name] = value
                if produced:
                    produced.variable = name
                    pending = produced
            return pending
        if isinstance(statement, L.Assign):
            pending = None
            for target, expression in zip(statement.targets, statement.values):
                value, produced = self.statement_value(expression, state, beats, label)
                self.assign(target, value, state)
                if produced:
                    produced.variable = target.id if isinstance(target, L.Name) else ""
                    pending = produced
            return pending
        if isinstance(statement, L.CallStmt):
            return self.calls.execute(statement.call, state, beats, label)
        return None

    def statement_value(self, expression: L.Expr, state: FlowState, beats: list[Beat],
                        label: str) -> tuple[Any, PendingChoice | None]:
        if isinstance(expression, L.Call):
            obj, method = callee(expression)
            if not obj and method == "choose":
                pending = self.calls.execute(expression, state, beats, label)
                return UnknownValue(expression.text()), pending
            value = self.evaluator.evaluate(expression, state)
            if isinstance(value, UnknownValue) and not (obj == "checkpointmanager"):
                self.context.fx_count += 1
            return value, None
        if self.is_dice_selection(expression):
            return UnknownValue(expression.text()), self.calls.pending_choice(state.menu_options, state, beats)
        return self.evaluator.evaluate(expression, state), None

    @staticmethod
    def is_dice_selection(expression: L.Expr) -> bool:
        return isinstance(expression, L.Index) and isinstance(expression.obj, L.Name) \
            and expression.obj.id == "dicemenudialog" and isinstance(expression.key, L.Str) \
            and expression.key.value == "ResultSelection"

    def assign(self, target: L.Expr, value: Any, state: FlowState) -> None:
        if isinstance(target, L.Name):
            state.env[target.id] = value
            return
        if isinstance(target, L.Index) and isinstance(target.obj, L.Name):
            key = self.evaluator.key(target.key, state)
            table = state.env.get(target.obj.id)
            if not isinstance(table, dict):
                table = {}
                state.env[target.obj.id] = table
            table[key] = value

    def emit_if(self, statement: L.If, state: FlowState, beats: list[Beat], label: str) -> None:
        group = self.context.branch_sequence
        self.context.branch_sequence += 1
        for condition, body in statement.clauses:
            condition_label = self.evaluator.condition_label(condition, state)
            kind = self.evaluator.condition_kind(condition, state)
            nested: list[Beat] = []
            child_label = f"{label} › {condition_label}" if label else condition_label
            self.walk(body, state.clone(), nested, child_label)
            beats.append(BranchBeat(condition_label, nested, kind, group))

    def uses_choice(self, statement: L.If, variable: str) -> bool:
        return any(
            condition is not None and self.choice_index(condition, variable) is not None
            for condition, _ in statement.clauses
        )

    @staticmethod
    def choice_index(condition: L.Expr, variable: str) -> int | None:
        if not isinstance(condition, L.Bin) or condition.op != "==":
            return None
        for name, number in ((condition.left, condition.right), (condition.right, condition.left)):
            if isinstance(name, L.Name) and name.id == variable and isinstance(number, L.Num):
                return int(number.value)
        return None

    def fill_choice(self, pending: PendingChoice, statement: L.If, state: FlowState, label: str) -> None:
        options = {option.index: option for option in pending.options}
        selected: list[ChoiceOption] = []
        for position, (condition, body) in enumerate(statement.clauses, start=1):
            if condition is None:
                option = fallback_option("其他情況", position, pending.beat.menu)
            else:
                index = self.choice_index(condition, pending.variable)
                option = options.get(index or -1) or fallback_option(
                    self.evaluator.condition_label(condition, state), index or position, pending.beat.menu
                )
            option.body = []
            option_label = text_value(option.text) or "選項"
            child_label = f"{label} › {option_label}" if label else option_label
            self.walk(body, state.clone(), option.body, child_label)
            selected.append(option)
        pending.beat.options = selected
        self.context.choice_count += len(selected)

    def close_choice(self, pending: PendingChoice) -> None:
        pending.beat.options = pending.options
        self.context.choice_count += len(pending.options)
