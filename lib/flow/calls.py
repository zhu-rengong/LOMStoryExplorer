from __future__ import annotations

from collections.abc import Iterator, Sequence
from typing import Any

from .. import lua as L
from ..model import ChoiceBeat, JumpBeat, MetadataBeat, SayBeat, TextRef
from .beats import option_list
from .expr import ExpressionEvaluator
from .model import AnalysisContext, CharacterValue, CheckpointValue, FlowState, PendingChoice, UnknownValue, callee, short, text_value

CHECKPOINT_METHODS = frozenset({"Switch", "Dice", "Condition", "Position"})
SCRIPT_RELATIONS = {
    "SetNextScript": "next",
    "SetCurrentStoryScript": "next",
    "SetTempScript": "temp",
    "SetCurrentTravelScript": "travel",
}
SPEAKER_SENTINELS = frozenset({"narrative", "narrator", "none", "center", "center2", "think"})
FX_OBJECTS = frozenset({
    "menudialogs", "mainui", "flowcharts", "getvar", "runblock", "runwait", "wait", "stage",
    "characters", "effects", "trait", "dicemenudialog", "transitionblack",
})


def nested_calls(expression: L.Expr) -> Iterator[L.Call]:
    if isinstance(expression, L.Call):
        yield expression
        yield from nested_calls(expression.func)
        for argument in expression.args:
            yield from nested_calls(argument)
    elif isinstance(expression, (L.Index, L.Un)):
        yield from nested_calls(expression.obj if isinstance(expression, L.Index) else expression.operand)
    elif isinstance(expression, L.Bin):
        yield from nested_calls(expression.left)
        yield from nested_calls(expression.right)
    elif isinstance(expression, L.Table):
        for key, value in expression.fields:
            if key:
                yield from nested_calls(key)
            yield from nested_calls(value)


class CallProcessor:
    def __init__(self, context: AnalysisContext, evaluator: ExpressionEvaluator) -> None:
        self.context = context
        self.evaluator = evaluator
        evaluator.call_evaluator = self.evaluate

    def evaluate(self, call: L.Call, state: FlowState) -> Any:
        obj, method = callee(call)
        arguments = call.args
        if method == "GetStoryText" and arguments:
            key = text_value(self.evaluator.evaluate(arguments[0], state))
            return TextRef("key", key) if key else UnknownValue(call.text())
        if obj == "characters" and method in ("Get", "GetPortrait") and arguments:
            character = text_value(self.evaluator.evaluate(arguments[0], state))
            if not character:
                return UnknownValue(call.text())
            portrait = ""
            if method == "GetPortrait" and len(arguments) > 1:
                portrait = text_value(self.evaluator.evaluate(arguments[1], state)) or ""
            return CharacterValue(character, portrait)
        if obj == "checkpointmanager" and method in CHECKPOINT_METHODS and arguments:
            key = text_value(self.evaluator.evaluate(arguments[0], state))
            if key:
                self.context.reads.add(key)
                return CheckpointValue(method.lower(), key)
        return UnknownValue(call.text())

    def execute(self, call: L.Call, state: FlowState, beats: list, label: str) -> PendingChoice | None:
        obj, method = callee(call)
        arguments = call.args
        for argument in arguments:
            for nested in nested_calls(argument):
                nested_obj, nested_method = callee(nested)
                if nested_obj == "dicemenudialog" and nested_method == "ExecuteRoll" and nested.args:
                    table = self.evaluator.evaluate(nested.args[0], state)
                    state.menu_options = option_list(table, state.menu)
        if not obj and method == "say":
            self.say(arguments, state, beats)
        elif not obj and method == "setcharacter":
            self.set_character(arguments, state)
        elif not obj and method == "setsaydialog":
            self.set_dialog(arguments, state)
        elif not obj and method == "setmenudialog":
            state.menu = self.menu_name(arguments[0]) if arguments else "Options"
        elif obj == "os_mask" and method == "Show":
            state.think = bool(arguments) and arguments[0].text() == "true"
            self.context.fx_count += 1
        elif obj == "luamanager" and method in SCRIPT_RELATIONS:
            self.script_reference(method, arguments, state, beats, label, call.line)
        elif obj == "luamanager" and method == "ExecuteScript":
            self.context.fx_count += 1
        elif obj == "statmodifymanager":
            self.stat_call(method, arguments, state, beats)
        elif obj == "checkpointmanager":
            self.evaluate(call, state)
            if method == "Dice" and arguments:
                key = text_value(self.evaluator.evaluate(arguments[0], state))
                if key:
                    beats.append(MetadataBeat("dice", key, operation="check"))
        elif obj == "dicemenudialog" and method in ("ExecuteRoll", "Setup", "SetRandom"):
            if method == "ExecuteRoll" and arguments:
                state.menu_options = option_list(self.evaluator.evaluate(arguments[0], state), state.menu)
            self.context.fx_count += 1
        elif not obj and method == "choose" and arguments:
            return self.pending_choice(option_list(self.evaluator.evaluate(arguments[0], state), state.menu), state, beats)
        else:
            self.context.fx_count += 1
        return None

    def pending_choice(self, options: list, state: FlowState, beats: list) -> PendingChoice:
        beat = ChoiceBeat([], state.menu)
        beats.append(beat)
        return PendingChoice(beat=beat, variable="", options=options)

    def say(self, arguments: Sequence[L.Expr], state: FlowState, beats: list) -> None:
        if not arguments:
            return
        value = self.evaluator.evaluate(arguments[0], state)
        reference = value if isinstance(value, TextRef) else TextRef("text", short(arguments[0]))
        mode = "dialog"
        if not state.speaker or state.dialog in ("center", "center2", "narrative"):
            mode = "narration"
        if state.dialog == "think" or state.think:
            mode = "think"
        speaker = state.speaker if mode in ("dialog", "think") else ""
        if speaker in SPEAKER_SENTINELS:
            speaker = ""
        beats.append(SayBeat(speaker, reference, mode, state.portrait if speaker else ""))
        self.context.say_count += 1

    def set_character(self, arguments: Sequence[L.Expr], state: FlowState) -> None:
        if not arguments:
            return
        value = self.evaluator.evaluate(arguments[0], state)
        state.speaker = value.id if isinstance(value, CharacterValue) else ""
        state.portrait = ""
        if len(arguments) > 1:
            portrait = self.evaluator.evaluate(arguments[1], state)
            if isinstance(portrait, CharacterValue):
                state.portrait = portrait.portrait
        elif isinstance(value, CharacterValue):
            state.portrait = value.portrait

    @staticmethod
    def menu_name(expression: L.Expr) -> str:
        if isinstance(expression, L.Index) and isinstance(expression.key, L.Str):
            return expression.key.value
        return expression.text()

    def set_dialog(self, arguments: Sequence[L.Expr], state: FlowState) -> None:
        if not arguments:
            return
        dialog = self.menu_name(arguments[0])
        state.dialog = dialog
        state.think = dialog == "think"

    def script_reference(self, method: str, arguments: Sequence[L.Expr], state: FlowState, beats: list,
                         label: str, line: int) -> None:
        relation = SCRIPT_RELATIONS[method]
        expression = arguments[-1] if arguments else None
        value = self.evaluator.evaluate(expression, state) if expression else UnknownValue("")
        target = text_value(value)
        if target:
            beats.append(JumpBeat(target, "", relation))
            self.context.add_edge(target, relation, label)
            return
        if isinstance(value, CheckpointValue) and value.kind == "position":
            description = f"Position event「{value.key}」"
            beats.append(JumpBeat("", description, "position"))
            self.context.dynamic.append(f"{method} uses position provider {value.key}")
            return
        source = expression.text() if expression else ""
        beats.append(JumpBeat("", f"{method}: {source}", relation))
        self.context.dynamic.append(f"{method}({source})")
        self.context.warn("dynamic-script", f"Unresolved {relation} script expression: {source}", line)

    def stat_call(self, method: str, arguments: Sequence[L.Expr], state: FlowState, beats: list) -> None:
        if not arguments:
            return

        def text(index: int) -> str | None:
            if index >= len(arguments):
                return None
            return text_value(self.evaluator.evaluate(arguments[index], state))

        def value(index: int, fallback: Any = 0) -> Any:
            if index >= len(arguments):
                return fallback
            result = self.evaluator.evaluate(arguments[index], state)
            if isinstance(result, UnknownValue):
                return result.expression
            if isinstance(result, TextRef):
                return result.value
            if result is None or isinstance(result, (bool, int, float, str)):
                return result
            return str(result)

        key = text(0)
        if method == "Player" and key:
            beats.append(MetadataBeat("stat", key, value(1), "add"))
        elif method == "Character" and key:
            beats.append(MetadataBeat("rel", key, value(1), "add"))
        elif method == "SetPlayer" and key:
            beats.append(MetadataBeat("stat", key, value(1), "set"))
        elif method == "UpdateSetPlayerStat" and key:
            beats.append(MetadataBeat("stat", key, value(1), "preview"))
        elif method == "SetCharacter" and key:
            beats.append(MetadataBeat("rel", key, value(1), "set"))
        elif method in ("SetFlag", "AddFlag") and key:
            beats.append(MetadataBeat("flag", key, value(1), "set" if method == "SetFlag" else "add"))
        elif method == "AddStory" and key:
            beats.append(MetadataBeat("story", key, operation="unlock"))
        elif method in ("AddBook", "RemoveBook") and key:
            beats.append(MetadataBeat("book", key, value(1, 1) if method == "AddBook" else -1, "add"))
        elif method in ("AddMisc", "RemoveMisc") and key:
            beats.append(MetadataBeat("misc", key, value(1, 1) if method == "AddMisc" else -1, "add"))
        elif method in ("AddSpecial", "RemoveSpecial") and key:
            beats.append(MetadataBeat("special", key, value(1, 1) if method == "AddSpecial" else -1, "add"))
        elif method == "AddTalent" and key:
            beats.append(MetadataBeat("talent", key, value(1, 1), "add"))
        elif method == "AddAchievementLib" and key:
            beats.append(MetadataBeat("library", key, operation="unlock"))
        elif method == "Mission":
            mission = text(1) or key
            if mission:
                beats.append(MetadataBeat("mission", mission, operation="trigger"))
        elif not method.startswith("Get"):
            self.context.fx_count += 1
