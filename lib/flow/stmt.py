from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .. import lua as L

from .model import Ref, State, _as_text


class StmtMixin:
    _MARK_KINDS = {"switch", "dice", "condition", "position"}

    def _block(self, stmts: Sequence[L.Stmt], state: State, beats: list[list[Any]],
               label: str) -> None:
        index = 0
        pending: dict[str, Any] | None = None
        while index < len(stmts):
            stmt = stmts[index]

            if isinstance(stmt, L.If) and pending is not None and self._if_uses_choice(stmt, pending["var"]):
                self._fill_choice(pending, stmt, state, label)
                pending = None
                index += 1
                continue

            if isinstance(stmt, L.If):
                self._emit_if(stmt, state, beats, label)
                index += 1
                continue

            if isinstance(stmt, L.Do):
                self._block(stmt.body, state.clone(), beats, label)
                index += 1
                continue

            produced = self._statement(stmt, state, beats, label)
            if produced is not None:
                if pending is not None:
                    self._close_incomplete(pending)
                pending = produced
            index += 1

        if pending is not None:
            self._close_incomplete(pending)

    def _statement(self, stmt: L.Stmt, state: State, beats: list[list[Any]],
                   label: str) -> dict[str, Any] | None:
        if isinstance(stmt, L.Local):
            pending = None
            for name, expr in zip(stmt.names, stmt.values or []):
                value, produced = self._eval_stmt_value(expr, state, beats, label)
                state.env[name] = value
                if produced is not None:
                    pending = produced
                    pending["var"] = name
            for name in stmt.names[len(stmt.values):]:
                state.env[name] = None
            return pending

        if isinstance(stmt, L.Assign):
            for target, expr in zip(stmt.targets, stmt.values or []):
                self._assign(target, expr, state, beats, label)
            return None

        if isinstance(stmt, L.CallStmt):
            return self._call(stmt.call, state, beats, label, stmt=True)

        return None

    def _assign(self, target: L.Expr, expr: L.Expr, state: State,
                beats: list[list[Any]], label: str) -> None:
        value, _ = self._eval_stmt_value(expr, state, beats, label)
        if isinstance(target, L.Name):
            state.env[target.id] = value
        elif isinstance(target, L.Index) and isinstance(target.obj, L.Name):
            table = state.env.get(target.obj.id)
            key = _as_text(self._eval(target.key, state)) or target.key.text()
            if isinstance(table, dict):
                table[key] = value
            else:
                state.env[target.obj.id] = {key: value}

    def _emit_if(self, stmt: L.If, state: State, beats: list[list[Any]], label: str) -> None:
        for cond, body in stmt.clauses:
            cond_label = "其他情況" if cond is None else self._cond_label(cond, state)
            kind = "if" if cond is None else self._cond_kind(cond, state)
            sub: list[list[Any]] = []
            child = f"{label} › {cond_label}" if label else cond_label
            self._block(body, state.clone(), sub, child)
            beats.append(["branch", cond_label, sub, kind])

    def _if_uses_choice(self, stmt: L.If, var: str) -> bool:
        for cond, _ in stmt.clauses:
            if cond is not None and self._choice_index(cond, var) is not None:
                return True
        return False

    @staticmethod
    def _choice_index(cond: L.Expr, var: str) -> int | None:
        if not isinstance(cond, L.Bin) or cond.op != "==":
            return None
        left, right = cond.left, cond.right
        if isinstance(left, L.Name) and left.id == var and isinstance(right, L.Num):
            return int(right.value)
        if isinstance(right, L.Name) and right.id == var and isinstance(left, L.Num):
            return int(left.value)
        return None

    def _fill_choice(self, pending: dict[str, Any], stmt: L.If, state: State, label: str) -> None:
        option_map = {index: option for index, option in enumerate(pending["options"], start=1)}
        branches: list[list[Any]] = []
        for cond, body in stmt.clauses:
            if cond is None:
                option: dict[str, Any] = {"ref": Ref("text", "（其他情況）"), "cond": None, "lock": None}
            else:
                index = self._choice_index(cond, pending["var"])
                option = option_map.get(index) if index is not None else None
                if option is None:
                    option = {"ref": Ref("text", self._cond_label(cond, state)), "cond": None, "lock": None}
            sub: list[list[Any]] = []
            text = _as_text(option["ref"]) or "選項"
            self._block(body, state.clone(), sub, text if not label else f"{label} › {text}")
            branches.append(self._branch_row(option, sub))
        pending["beat"][0] = "choice"
        pending["beat"].append(branches)
        self.option_count += len(branches)

    def _close_incomplete(self, pending: dict[str, Any]) -> None:
        beat = pending["beat"]
        beat[0] = "choice"
        beat.append([self._branch_row(option, []) for option in pending["options"]])
        self.option_count += len(pending["options"])
