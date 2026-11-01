from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .. import lua as L
from ..model import BranchBeat, ScriptAnalysis
from .calls import CallHandler
from .context import AnalysisContext
from .expressions import ExpressionEvaluator
from .state import EvalState, as_text

_INDEX_KINDS = ("dot_index_expression", "bracket_index_expression")


class Analyzer:
    def __init__(self, script_id: str) -> None:
        self.ctx = AnalysisContext(script_id)
        self.expressions = ExpressionEvaluator(self)
        self.calls = CallHandler(self)

    def analyze(self, source: str) -> ScriptAnalysis:
        script = L.parse(source)
        self.block(script.statements, EvalState(), self.ctx.beats, "")
        return self.ctx.snapshot()

    def block(self, stmts: Sequence[L.Node], state: EvalState, beats: list[Any],
              label: str) -> None:
        index = 0
        pending: dict[str, Any] | None = None
        while index < len(stmts):
            stmt = stmts[index]
            if stmt.type == "if_statement" and pending is not None and self.calls.if_uses_choice(stmt, pending["var"]):
                self.calls.fill_choice(pending, stmt, state, label, beats)
                pending = None
                index += 1
                continue
            if stmt.type == "if_statement":
                self.emit_if(stmt, state, beats, label)
                index += 1
                continue
            if stmt.type == "do_statement":
                self.block(L.statements(stmt.child_by_field_name("body")),
                           state.clone(), beats, label)
                index += 1
                continue
            produced = self.statement(stmt, state, beats, label)
            if produced is not None:
                if pending is not None:
                    self.calls.close_incomplete(pending, beats)
                pending = produced
            index += 1
        if pending is not None:
            self.calls.close_incomplete(pending, beats)

    def statement(self, stmt: L.Node, state: EvalState, beats: list[Any],
                  label: str) -> dict[str, Any] | None:
        kind = stmt.type
        if kind == "variable_declaration":
            targets, values = L.local_declaration(stmt)
            names = [L.text(target) for target in targets]
            pending: dict[str, Any] | None = None
            for name, expr in zip(names, values):
                value, produced = self.expressions.eval_stmt_value(expr, state, beats, label)
                state.env[name] = value
                if produced is not None:
                    pending = produced
                    pending["var"] = name
            for name in names[len(values):]:
                state.env[name] = None
            return pending
        if kind == "assignment_statement":
            targets, values = L.assignment(stmt)
            for target, expr in zip(targets, values):
                self.assign(target, expr, state, beats, label)
            return None
        if kind == "function_call":
            return self.calls.handle_call(stmt, state, beats, label)
        return None

    def assign(self, target: L.Node, expr: L.Node, state: EvalState,
               beats: list[Any], label: str) -> None:
        value, _ = self.expressions.eval_stmt_value(expr, state, beats, label)
        if target.type == "identifier":
            state.env[L.text(target)] = value
            return
        if target.type not in _INDEX_KINDS:
            return
        table_node = target.child_by_field_name("table")
        if table_node is None or table_node.type != "identifier":
            return
        name = L.text(table_node)
        table = state.env.get(name)
        field = target.child_by_field_name("field")
        key = L.index_key(target) or as_text(self.expressions.eval(field, state)) or L.text(field)
        if isinstance(table, dict):
            table[key] = value
        else:
            state.env[name] = {key: value}

    def emit_if(self, stmt: L.Node, state: EvalState, beats: list[Any], label: str) -> None:
        group = self.ctx.branch_seq
        self.ctx.branch_seq += 1
        for cond, body in L.clauses(stmt):
            cond_label = "其他情況" if cond is None else self.expressions.cond_label(cond, state)
            kind = "if" if cond is None else self.expressions.cond_kind(cond, state)
            sub: list[Any] = []
            child = f"{label} › {cond_label}" if label else cond_label
            self.block(body, state.clone(), sub, child)
            beats.append(BranchBeat(cond_label, tuple(sub), kind, group))


def analyze(script_id: str, source: str) -> ScriptAnalysis:
    return Analyzer(script_id).analyze(source)
