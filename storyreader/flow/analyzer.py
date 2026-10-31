from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .. import lua as L
from ..model import BranchBeat, ScriptAnalysis
from .calls import CallHandler
from .context import AnalysisContext
from .expressions import ExpressionEvaluator
from .state import EvalState, as_text


class Analyzer:
    def __init__(self, script_id: str) -> None:
        self.ctx = AnalysisContext(script_id)
        self.expressions = ExpressionEvaluator(self)
        self.calls = CallHandler(self)

    def eval(self, expr: L.Expression, state: EvalState) -> Any:
        return self.expressions.eval(expr, state)

    def cond_label(self, cond: L.Expression, state: EvalState) -> str:
        return self.expressions.cond_label(cond, state)

    def cond_kind(self, cond: L.Expression, state: EvalState) -> str:
        return self.expressions.cond_kind(cond, state)

    def analyze(self, source: str) -> ScriptAnalysis:
        stmts = L.parse(source)
        self.block(stmts, EvalState(), self.ctx.beats, "")
        return self.ctx.snapshot()

    def block(self, stmts: Sequence[L.Statement], state: EvalState, beats: list[Any],
              label: str) -> None:
        index = 0
        pending: dict[str, Any] | None = None
        while index < len(stmts):
            stmt = stmts[index]
            if isinstance(stmt, L.If) and pending is not None and self.calls.if_uses_choice(stmt, pending["var"]):
                self.calls.fill_choice(pending, stmt, state, label, beats)
                pending = None
                index += 1
                continue
            if isinstance(stmt, L.If):
                self.emit_if(stmt, state, beats, label)
                index += 1
                continue
            if isinstance(stmt, L.Do):
                self.block(L.statements(stmt.body), state.clone(), beats, label)
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

    def statement(self, stmt: L.Statement, state: EvalState, beats: list[Any],
                  label: str) -> dict[str, Any] | None:
        if isinstance(stmt, L.LocalAssign):
            names = [target.id for target in stmt.targets if isinstance(target, L.Name)]
            pending: dict[str, Any] | None = None
            for name, expr in zip(names, stmt.values):
                value, produced = self.expressions.eval_stmt_value(expr, state, beats, label)
                state.env[name] = value
                if produced is not None:
                    pending = produced
                    pending["var"] = name
            for name in names[len(stmt.values):]:
                state.env[name] = None
            return pending
        if isinstance(stmt, L.Assign):
            for target, expr in zip(stmt.targets, stmt.values):
                self.assign(target, expr, state, beats, label)
            return None
        if isinstance(stmt, L.Call | L.Invoke):
            return self.calls.handle_call(stmt, state, beats, label)
        return None

    def assign(self, target: L.Expression, expr: L.Expression, state: EvalState,
               beats: list[Any], label: str) -> None:
        value, _ = self.expressions.eval_stmt_value(expr, state, beats, label)
        if isinstance(target, L.Name):
            state.env[target.id] = value
        elif isinstance(target, L.Index) and isinstance(target.value, L.Name):
            table = state.env.get(target.value.id)
            key = L.index_key(target) or as_text(self.eval(target.idx, state)) or L.text(target.idx)
            if isinstance(table, dict):
                table[key] = value
            else:
                state.env[target.value.id] = {key: value}

    def emit_if(self, stmt: L.If, state: EvalState, beats: list[Any], label: str) -> None:
        group = self.ctx.branch_seq
        self.ctx.branch_seq += 1
        for cond, body in L.clauses(stmt):
            cond_label = "其他情況" if cond is None else self.cond_label(cond, state)
            kind = "if" if cond is None else self.cond_kind(cond, state)
            sub: list[Any] = []
            child = f"{label} › {cond_label}" if label else cond_label
            self.block(body, state.clone(), sub, child)
            beats.append(BranchBeat(cond_label, tuple(sub), kind, group))


def analyze(script_id: str, source: str) -> ScriptAnalysis:
    return Analyzer(script_id).analyze(source)
