from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from .. import lua as L
from ..model import (
    CharRef,
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
from .state import EvalState, OptionDraft, as_text, short

_SPEAKER_SENTINELS = frozenset({"narrative", "narrator", "none", "center", "center2", "think"})

_CHECKPOINT_METHODS = ("Switch", "Dice", "Condition", "Position")

_JUMP_KINDS = {
    "SetNextScript": "jump",
    "SetCurrentStoryScript": "jump",
    "SetTempScript": "temp",
    "SetCurrentTravelScript": "travel",
    "ExecuteScript": "inline",
}

_FX_OBJECTS = ("menudialogs", "mainui", "flowcharts", "getvar", "runblock", "runwait", "wait",
               "stage", "characters", "effects", "trait", "dicemenudialog")

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


def _saydialog_of(arg: Any) -> str:
    if arg.type != "dot_index_expression":
        return ""
    table = arg.child_by_field_name("table")
    if table is not None and table.type == "identifier" and L.text(table) == "saydialogs":
        return L.index_key(arg) or ""
    return ""


class CallHandler:
    def __init__(self, flow: Any) -> None:
        self.flow = flow

    def eval_call(self, expr: L.Node, state: EvalState) -> Any:
        obj, method = callee(expr)
        args = L.arguments(expr)
        if method == "GetStoryText" and args:
            key = as_text(self.flow.eval(args[0], state))
            return TextRef(key, keyed=True) if key else Unknown(L.text(expr))
        if obj == "characters" and method == "Get" and args:
            cid = as_text(self.flow.eval(args[0], state))
            return CharRef(cid) if cid else Unknown(L.text(expr))
        if obj == "characters" and method == "GetPortrait" and args:
            cid = as_text(self.flow.eval(args[0], state)) or ""
            pid = as_text(self.flow.eval(args[1], state)) if len(args) > 1 else ""
            return CharRef(f"{cid}:{pid}")
        if obj == "checkpointmanager" and method in _CHECKPOINT_METHODS and args:
            key = as_text(self.flow.eval(args[0], state))
            if key:
                self.flow.ctx.reads.add(key)
            return Mark(method.lower(), key or L.text(expr))
        return Unknown(L.text(expr))

    def handle_call(self, call: L.Node, state: EvalState, beats: list[Any],
                    label: str) -> dict[str, Any] | None:
        obj, method = callee(call)
        args = L.arguments(call)

        for arg in args:
            if arg.type == "function_call":
                inner_obj, inner_method = callee(arg)
                inner_args = L.arguments(arg)
                if inner_obj == "dicemenudialog" and inner_method == "ExecuteRoll" and inner_args:
                    state.menu_options = self.option_list(self.flow.eval(inner_args[0], state))

        if method == "say" and not obj:
            self._say(state, args, beats)
            return None

        if method == "setcharacter" and not obj:
            if args:
                value = self.flow.eval(args[0], state)
                state.speaker = value.id.split(":")[0] if isinstance(value, CharRef) else None
            return None

        if method == "setsaydialog" and not obj:
            dialog = _saydialog_of(args[0]) if args else ""
            if not dialog and args and args[0].type in _INDEX_KINDS:
                dialog = as_text(self.flow.eval(args[0], state)) or ""
            if dialog:
                state.dialog = dialog
                state.think = dialog == "think"
            return None

        if obj == "os_mask" and method == "Show":
            state.think = bool(args) and L.text(args[0]) == "true"
            self.flow.ctx.fx_count += 1
            return None

        if obj == "luamanager" and method in _JUMP_KINDS:
            self.emit_jump(method, args, state, beats, label)
            return None

        if obj == "luamanager" and method == "ChangeScene":
            self.emit_scene(args, state, beats)
            return None

        if obj == "statmodifymanager":
            self.stat_call(method, args, state, beats)
            return None

        if obj == "checkpointmanager":
            is_read = method in _CHECKPOINT_METHODS and bool(args)
            key = as_text(self.flow.eval(args[0], state)) if is_read else None
            if key:
                self.flow.ctx.reads.add(key)
                if method == "Dice":
                    beats.append(MetaBeat("dice", key))
            return None

        if obj == "dicemenudialog" and method in ("ExecuteRoll", "Setup", "SetRandom"):
            if method == "ExecuteRoll" and args:
                state.menu_options = self.option_list(self.flow.eval(args[0], state))
            self.flow.ctx.fx_count += 1
            return None

        if not obj and method == "choose" and args:
            options = self.option_list(self.flow.eval(args[0], state))
            beats.append(None)
            return {"index": len(beats) - 1, "var": "", "options": options}

        if method.startswith("setmenu") or obj in _FX_OBJECTS:
            self.flow.ctx.fx_count += 1
            return None

        self.flow.ctx.fx_count += 1
        return None

    def _say(self, state: EvalState, args: Sequence[L.Node], beats: list[Any]) -> None:
        if not args:
            return
        value = self.flow.eval(args[0], state)
        ref = value if isinstance(value, TextRef) else TextRef(short(args[0]))
        mode = "dialog"
        if state.speaker is None or state.dialog in ("center", "center2", "narrative"):
            mode = "narration"
        if state.dialog == "think" or state.think:
            mode = "think"
        speaker = state.speaker if mode in ("dialog", "think") else None
        if speaker in _SPEAKER_SENTINELS:
            speaker = None
        beats.append(SayBeat(speaker, ref, mode))
        self.flow.ctx.say_count += 1

    def stat_call(self, method: str, args: Sequence[L.Node], state: EvalState,
                  beats: list[Any]) -> None:
        if not args:
            return

        def arg_text(index: int) -> str | None:
            if index >= len(args):
                return None
            return as_text(self.flow.eval(args[index], state))

        def arg_int(index: int, fallback: int = 0) -> int:
            if index >= len(args):
                return fallback
            value = self.flow.eval(args[index], state)
            return value if isinstance(value, int) and not isinstance(value, bool) else fallback

        if method == "Player":
            key = arg_text(0)
            delta = self.flow.eval(args[1], state) if len(args) > 1 else None
            if key:
                beats.append(MetaBeat("stat", key, delta if isinstance(delta, int) else 0))
        elif method == "Character":
            key = arg_text(0)
            delta = self.flow.eval(args[1], state) if len(args) > 1 else None
            if key:
                beats.append(MetaBeat("rel", key, delta if isinstance(delta, int) else 0))
        elif method in ("SetPlayer", "UpdateSetPlayerStat"):
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("setstat", key, arg_int(1)))
        elif method == "SetCharacter":
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("setrel", key, arg_int(1)))
        elif method in ("SetFlag", "AddFlag"):
            key = arg_text(0)
            value = self.flow.eval(args[1], state) if len(args) > 1 else None
            if key:
                beats.append(MetaBeat("flag", key, value if isinstance(value, int) else 0))
        elif method == "AddStory":
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("story", key))
        elif method in ("AddBook", "RemoveBook"):
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("book", key, arg_int(1, 1) if method == "AddBook" else -1))
        elif method in ("AddMisc", "RemoveMisc"):
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("misc", key, arg_int(1, 1) if method == "AddMisc" else -1))
        elif method in ("AddSpecial", "RemoveSpecial"):
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("special", key, arg_int(1, 1) if method == "AddSpecial" else -1))
        elif method == "AddTalent":
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("talent", key, arg_int(1, 1)))
        elif method == "AddAchievementLib":
            key = arg_text(0)
            if key:
                beats.append(MetaBeat("library", key))
        elif method == "Mission":
            key = arg_text(1) or arg_text(0)
            if key:
                beats.append(MetaBeat("mission", key))
        else:
            self.flow.ctx.fx_count += 1

    def emit_jump(self, method: str, args: Sequence[L.Node], state: EvalState,
                  beats: list[Any], label: str) -> None:
        target_expr = args[-1] if args else None
        kind = _JUMP_KINDS.get(method, "jump")
        if method == "ExecuteScript":
            self.flow.ctx.fx_count += 1
            return
        target = as_text(self.flow.eval(target_expr, state)) if target_expr is not None else None
        if target is None:
            self.flow.ctx.dynamic.append(
                f"{method}({L.text(target_expr) if target_expr is not None else ''})")
            beats.append(JumpBeat(None, f"{method}（動態目標）"))
            return
        beats.append(JumpBeat(target, ""))
        self.flow.ctx.add_edge(target, kind, label)

    def emit_scene(self, args: Sequence[L.Node], state: EvalState, beats: list[Any]) -> None:
        values = ["", "", ""]
        for index in range(min(len(args), 3)):
            values[index] = as_text(self.flow.eval(args[index], state)) or ""
        beats.append(SceneBeat(values[0], values[1], values[2]))
        self.flow.ctx.scene_count += 1

    def option_list(self, table: Any) -> list[OptionDraft]:
        options: list[OptionDraft] = []
        if not isinstance(table, dict):
            return options
        for key in sorted(table, key=lambda item: (len(item), item)):
            value = table[key]
            if isinstance(value, Locked):
                ref = value.available if isinstance(value.available, TextRef) else TextRef(as_text(value.available) or "")
                if not ref.value or ref.value.startswith("~"):
                    continue
                lock = value.locked if isinstance(value.locked, TextRef) else None
                options.append(OptionDraft(ref, None, lock))
                continue
            if isinstance(value, TextRef) and not value.keyed:
                raw, cond = self.split_dice(value.value)
                if not raw or raw.startswith("~"):
                    continue
                options.append(OptionDraft(TextRef(raw), cond))
                continue
            if isinstance(value, Unknown):
                literal = self.literal_of(value.text)
                if literal and not literal.startswith("~"):
                    raw, cond = self.split_dice(literal)
                    options.append(OptionDraft(TextRef(raw), cond))
                continue
            text = as_text(value)
            if text:
                raw, cond = self.split_dice(text)
                if raw and not raw.startswith("~"):
                    options.append(OptionDraft(TextRef(raw), cond))
        return options

    @staticmethod
    def split_dice(raw: str) -> tuple[str, str | None]:
        if "|" in raw:
            head, tail = raw.split("|", 1)
            return head, tail
        return raw, None

    @staticmethod
    def literal_of(text: str) -> str | None:
        matches = _LITERAL.findall(text)
        for candidate in matches:
            if not candidate.startswith("~"):
                return candidate
        return matches[0] if matches else None

    @staticmethod
    def branch_row(option: OptionDraft, sub: list[Any]) -> ChoiceOption:
        return ChoiceOption(option.ref, option.note, option.lock, tuple(sub))

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
                    label: str, beats: list[Any]) -> None:
        option_map = {index: option for index, option in enumerate(pending["options"], start=1)}
        branches: list[ChoiceOption] = []
        for cond, body in L.clauses(stmt):
            if cond is None:
                option = OptionDraft(TextRef("（其他情況）"))
            else:
                index = self.choice_index(cond, pending["var"])
                option = option_map.get(index) if index is not None else None
                if option is None:
                    option = OptionDraft(TextRef(self.flow.cond_label(cond, state)))
            sub: list[Any] = []
            text = option.ref.value or "選項"
            self.flow.block(body, state.clone(), sub, text if not label else f"{label} › {text}")
            branches.append(self.branch_row(option, sub))
        beats[pending["index"]] = ChoiceBeat(tuple(branches))
        self.flow.ctx.option_count += len(branches)

    def close_incomplete(self, pending: dict[str, Any], beats: list[Any]) -> None:
        options = pending["options"]
        beats[pending["index"]] = ChoiceBeat(tuple(self.branch_row(option, []) for option in options))
        self.flow.ctx.option_count += len(options)
