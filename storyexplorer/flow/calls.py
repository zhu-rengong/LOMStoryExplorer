from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from .. import lua as L
from ..model import (
    CharRef,
    CheckRef,
    ChoiceBeat,
    ChoiceOption,
    JumpBeat,
    Locked,
    Mark,
    MetaBeat,
    SayBeat,
    SceneBeat,
    TextRef,
    Unknown,
)
from .semantics import Semantics
from .state import EvalState, OptionDraft, as_text, numeric_key, short

_LITERAL = re.compile(r'"([^"]*)"')
_INDEX_KINDS = ("dot_index_expression", "bracket_index_expression")


def callee(expr: L.Node) -> tuple[str, str]:
    name = expr.child_by_field_name("name")
    if name is None:
        return "", L.text(expr)
    if name.type == "identifier":
        return "", L.text(name)
    if name.type == "method_index_expression":
        return _receiver(name.child_by_field_name("table")), L.text(name.child_by_field_name("method"))
    if name.type == "dot_index_expression":
        receiver = _receiver(name.child_by_field_name("table"))
        if receiver:
            return receiver, L.text(name.child_by_field_name("field"))
    return "", L.text(name)


def _receiver(node: L.Node | None) -> str:
    if node is None:
        return ""
    if node.type == "identifier":
        return L.text(node)
    if node.type == "dot_index_expression":
        base = _receiver(node.child_by_field_name("table"))
        key = L.text(node.child_by_field_name("field"))
        return f"{base}.{key}" if base else key
    if node.type == "method_index_expression":
        base = _receiver(node.child_by_field_name("table"))
        key = L.text(node.child_by_field_name("method"))
        return f"{base}.{key}" if base else key
    if node.type == "parenthesized_expression":
        children = node.named_children
        return _receiver(children[0]) if children else ""
    return L.text(node)


def dialog_of(arg: Any, table_name: str) -> str:
    if arg.type != "dot_index_expression":
        return ""
    table = arg.child_by_field_name("table")
    if table is not None and table.type == "identifier" and L.text(table) == table_name:
        return L.index_key(arg) or ""
    return ""


class CallHandler:
    def __init__(self, flow: Any) -> None:
        self.flow = flow

    @property
    def sem(self) -> Semantics:
        return self.flow.semantics

    def eval_call(self, expr: L.Node, state: EvalState) -> Any:
        obj, method = callee(expr)
        args = L.arguments(expr)
        if method == self.sem.story_getter and args:
            key = as_text(self.flow.expressions.eval(args[0], state))
            return TextRef(key, keyed=True) if key else Unknown(L.text(expr))
        if obj == self.sem.character_object and method == self.sem.character_get and args:
            cid = as_text(self.flow.expressions.eval(args[0], state))
            return CharRef(cid) if cid else Unknown(L.text(expr))
        if obj == self.sem.character_object and method == self.sem.character_portrait and args:
            cid = as_text(self.flow.expressions.eval(args[0], state)) or ""
            pid = as_text(self.flow.expressions.eval(args[1], state)) if len(args) > 1 else ""
            return CharRef(f"{cid}:{pid}")
        if obj == self.sem.check_object and method in self.sem.check_methods and args:
            key = as_text(self.flow.expressions.eval(args[0], state))
            if key:
                self.flow.ctx.reads.add(key)
            return Mark(self.sem.check_methods[method], key or L.text(expr))
        return Unknown(L.text(expr))

    def handle_call(self, call: L.Node, state: EvalState, beats: list[Any]) -> dict[str, Any] | None:
        obj, method = callee(call)
        args = L.arguments(call)

        for arg in args:
            if arg.type == "function_call":
                inner_obj, inner_method = callee(arg)
                inner_args = L.arguments(arg)
                if inner_obj == self.sem.dice_object and inner_method == self.sem.dice_roll_methods[0] \
                        and inner_args:
                    state.menu_options = self.option_list(
                        self.flow.expressions.eval(inner_args[0], state))

        if method == self.sem.say_method and not obj:
            self._say(state, args, beats)
            return None

        if method == self.sem.speaker_method and not obj:
            if args:
                value = self.flow.expressions.eval(args[0], state)
                state.speaker = value.id.split(":")[0] if isinstance(value, CharRef) else None
            return None

        if method == self.sem.dialog_method and not obj:
            dialog = dialog_of(args[0], "saydialogs") if args else ""
            if not dialog and args and args[0].type in _INDEX_KINDS:
                dialog = as_text(self.flow.expressions.eval(args[0], state)) or ""
            if dialog:
                state.dialog = dialog
                state.think = dialog in self.sem.think_dialogs
            return None

        if obj == self.sem.think_object and method == self.sem.think_method:
            state.think = bool(args) and L.text(args[0]) == "true"
            self.flow.ctx.fx_count += 1
            return None

        if obj == self.sem.scene_object and method in self.sem.jumps:
            self.emit_jump(method, args, state, beats)
            return None

        if obj == self.sem.scene_object and method == self.sem.scene_method:
            self.emit_scene(args, state, beats)
            return None

        if obj == self.sem.stat_object:
            self.stat_call(method, args, state, beats)
            return None

        if obj == self.sem.check_object:
            is_read = method in self.sem.check_methods and bool(args)
            key = as_text(self.flow.expressions.eval(args[0], state)) if is_read else None
            if key:
                self.flow.ctx.reads.add(key)
                if method == self.sem.check_methods.get("Dice"):
                    beats.append(MetaBeat("dice", key))
            return None

        if obj == self.sem.dice_object and method in self.sem.dice_roll_methods:
            if method == self.sem.dice_roll_methods[0] and args:
                state.menu_options = self.option_list(
                    self.flow.expressions.eval(args[0], state))
            self.flow.ctx.fx_count += 1
            return None

        if not obj and method == self.sem.choice_method and args:
            options = self.option_list(self.flow.expressions.eval(args[0], state))
            beats.append(None)
            return {"index": len(beats) - 1, "var": "", "options": options}

        if method.startswith(self.sem.menu_prefix) or obj in self.sem.fx_objects:
            self.flow.ctx.fx_count += 1
            return None

        self.flow.ctx.fx_count += 1
        return None

    def _say(self, state: EvalState, args: Sequence[L.Node], beats: list[Any]) -> None:
        if not args:
            return
        value = self.flow.expressions.eval(args[0], state)
        ref = value if isinstance(value, TextRef) else TextRef(short(args[0]))
        mode = "dialog"
        if state.speaker is None or state.dialog in self.sem.narration_dialogs:
            mode = "narration"
        if state.dialog in self.sem.think_dialogs or state.think:
            mode = "think"
        speaker = state.speaker if mode in ("dialog", "think") else None
        if speaker in self.sem.speaker_sentinels:
            speaker = None
        beats.append(SayBeat(speaker, ref, mode))
        self.flow.ctx.say_count += 1

    def stat_call(self, method: str, args: Sequence[L.Node], state: EvalState,
                  beats: list[Any]) -> None:
        effect = self.sem.effects.get(method)
        if effect is None or not args:
            self.flow.ctx.fx_count += 1
            return

        def arg_text(index: int) -> str | None:
            if index >= len(args):
                return None
            return as_text(self.flow.expressions.eval(args[index], state))

        def arg_int(index: int, fallback: int) -> int:
            if index >= len(args):
                return fallback
            value = self.flow.expressions.eval(args[index], state)
            return value if isinstance(value, int) and not isinstance(value, bool) else fallback

        key = arg_text(effect.key_index)
        if not key and effect.key_fallback is not None:
            key = arg_text(effect.key_fallback)
        if not key:
            return
        value = None
        if effect.value_index is not None:
            value = arg_int(effect.value_index, effect.value_default)
        beats.append(MetaBeat(effect.kind, key, value))

    def emit_jump(self, method: str, args: Sequence[L.Node], state: EvalState,
                  beats: list[Any]) -> None:
        target_expr = args[-1] if args else None
        kind = self.sem.jumps[method]
        target = as_text(self.flow.expressions.eval(target_expr, state)) if target_expr is not None else None
        if target is None:
            self.flow.ctx.dynamic.append(
                f"{method}({L.text(target_expr) if target_expr is not None else ''})")
            beats.append(JumpBeat(None, f"{method}({L.text(target_expr) if target_expr else ''})"))
            return
        beats.append(JumpBeat(target, ""))
        self.flow.ctx.add_edge(target, kind, "")

    def emit_scene(self, args: Sequence[L.Node], state: EvalState, beats: list[Any]) -> None:
        values = ["", "", ""]
        for index in range(min(len(args), self.sem.scene_args)):
            values[index] = as_text(self.flow.expressions.eval(args[index], state)) or ""
        beats.append(SceneBeat(values[0], values[1], values[2]))
        self.flow.ctx.scene_count += 1

    def option_list(self, table: Any) -> list[OptionDraft]:
        options: list[OptionDraft] = []
        if not isinstance(table, dict):
            return options
        for key in sorted(table, key=numeric_key):
            value = table[key]
            if isinstance(value, Locked):
                ref = value.available if isinstance(value.available, TextRef) else TextRef(
                    as_text(value.available) or "")
                if not ref.value or ref.value.startswith("~"):
                    continue
                lock = value.locked if isinstance(value.locked, TextRef) else None
                options.append(OptionDraft(ref, None, lock))
                continue
            if isinstance(value, TextRef) and not value.keyed:
                if value.value and not value.value.startswith("~"):
                    options.append(OptionDraft(value))
                continue
            if isinstance(value, Unknown):
                literal = self.literal_of(value.text)
                if literal and not literal.startswith("~"):
                    options.append(OptionDraft(TextRef(literal)))
                continue
            text = as_text(value)
            if text and not text.startswith("~"):
                options.append(OptionDraft(TextRef(text)))
        return options

    @staticmethod
    def literal_of(text: str) -> str | None:
        matches = _LITERAL.findall(text)
        for candidate in matches:
            if not candidate.startswith("~"):
                return candidate
        return matches[0] if matches else None

    @staticmethod
    def branch_row(option: OptionDraft, sub: list[Any]) -> ChoiceOption:
        return ChoiceOption(option.ref, option.cond, option.lock, tuple(sub))

    def if_uses_choice(self, stmt: L.Node, var: str) -> bool:
        for cond, _ in L.clauses(stmt):
            if cond is not None and self.choice_index(cond, var) is not None:
                return True
        return False

    @staticmethod
    def choice_index(cond: L.Node, var: str) -> int | None:
        if cond.type != "binary_expression" or L.operator(cond) != "==":
            return None
        left = cond.child_by_field_name("left")
        right = cond.child_by_field_name("right")
        if left is None or right is None:
            return None
        if left.type == "identifier" and L.text(left) == var and right.type == "number":
            return int(L.number_value(right))
        if right.type == "identifier" and L.text(right) == var and left.type == "number":
            return int(L.number_value(left))
        return None

    def fill_choice(self, pending: dict[str, Any], stmt: L.Node, state: EvalState,
                    beats: list[Any]) -> None:
        option_map = {index: option for index, option in enumerate(pending["options"], start=1)}
        branches: list[ChoiceOption] = []
        for cond, body in L.clauses(stmt):
            if cond is None:
                option = OptionDraft(TextRef(""))
            else:
                index = self.choice_index(cond, pending["var"])
                option = option_map.get(index) if index is not None else None
                if option is None:
                    option = OptionDraft(TextRef(L.text(cond)))
            sub: list[Any] = []
            self.flow.block(body, state.clone(), sub)
            branches.append(self.branch_row(option, sub))
        beats[pending["index"]] = ChoiceBeat(tuple(branches))
        self.flow.ctx.option_count += len(branches)

    def close_incomplete(self, pending: dict[str, Any], beats: list[Any]) -> None:
        options = pending["options"]
        beats[pending["index"]] = ChoiceBeat(tuple(self.branch_row(option, []) for option in options))
        self.flow.ctx.option_count += len(options)


def check_ref_of(node: dict[str, Any] | None) -> CheckRef | None:
    if not isinstance(node, dict):
        return None
    tag = node.get("tag")
    if tag == "check":
        return CheckRef(str(node.get("kind") or ""), str(node.get("key") or ""))
    if tag != "compare":
        return None
    for side, other in ((node.get("left"), node.get("right")), (node.get("right"), node.get("left"))):
        if isinstance(side, dict) and side.get("tag") == "check" and isinstance(other, dict) \
                and other.get("tag") == "const":
            result = _int_value(other.get("value"))
            if result is not None:
                return CheckRef(str(side.get("kind") or ""), str(side.get("key") or ""), result)
    return None


def _int_value(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None
