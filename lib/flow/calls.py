from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .. import lua as L

from .model import CharRef, Mark, Ref, State, Unknown, _as_text, _short

_SPEAKER_SENTINELS = frozenset({"narrative", "narrator", "none", "center", "center2", "think"})

_CHECKPOINT_METHODS = ("Switch", "Dice", "Condition", "Position")

_JUMP_KINDS = {
    "SetNextScript": "explicit",
    "SetCurrentStoryScript": "explicit",
    "SetTempScript": "temp",
    "SetCurrentTravelScript": "travel",
    "ExecuteScript": "inline",
}

_FX_OBJECTS = ("menudialogs", "mainui", "flowcharts", "getvar", "runblock", "runwait", "wait",
               "stage", "characters", "effects", "trait", "dicemenudialog")


class CallsMixin:
    @staticmethod
    def _callee(expr: L.Call) -> tuple[str, str]:
        func = expr.func
        if isinstance(func, L.Name):
            return "", func.id
        if isinstance(func, L.Index):
            if isinstance(func.obj, L.Name) and isinstance(func.key, L.Str):
                return func.obj.id, func.key.value
            if isinstance(func.obj, L.Index) and isinstance(func.key, L.Str):
                inner = func.obj
                if isinstance(inner.obj, L.Name) and isinstance(inner.key, L.Str):
                    return f"{inner.obj.id}.{inner.key.value}", func.key.value
        return "", expr.func.text()

    @staticmethod
    def _saydialog_of(arg: Any) -> str:
        if not isinstance(arg, L.Index):
            return ""
        obj = getattr(arg, "obj", None)
        key = getattr(arg, "key", None)
        if isinstance(obj, L.Name) and obj.id == "saydialogs" and isinstance(key, L.Str):
            return key.value
        return ""

    def _eval_call(self, expr: L.Call, state: State) -> Any:
        obj, method = self._callee(expr)
        args = expr.args

        if method == "GetStoryText" and args:
            key = _as_text(self._eval(args[0], state))
            return Ref("key", key) if key else Unknown(expr.text())
        if obj == "characters" and method == "Get" and args:
            cid = _as_text(self._eval(args[0], state))
            return CharRef(cid) if cid else Unknown(expr.text())
        if obj == "characters" and method == "GetPortrait" and args:
            cid = _as_text(self._eval(args[0], state)) or ""
            pid = _as_text(self._eval(args[1], state)) if len(args) > 1 else ""
            return CharRef(f"{cid}:{pid}")
        if obj == "checkpointmanager" and method in _CHECKPOINT_METHODS and args:
            key = _as_text(self._eval(args[0], state))
            if key:
                self.read_marks.add(key)
            return Mark(method.lower(), key or expr.text())
        return Unknown(expr.text())

    def _call(self, call: L.Call, state: State, beats: list[list[Any]], label: str,
              stmt: bool) -> dict[str, Any] | None:
        obj, method = self._callee(call)
        args = call.args

        for arg in args:
            if isinstance(arg, L.Call):
                inner_obj, inner_method = self._callee(arg)
                if inner_obj == "dicemenudialog" and inner_method == "ExecuteRoll" and arg.args:
                    state.menu_options = self._option_list(self._eval(arg.args[0], state))

        if method == "say" and not obj:
            if args:
                value = self._eval(args[0], state)
                ref = value if isinstance(value, Ref) else Ref("text", _short(args[0]))
                kind = "dialog"
                if state.speaker is None or state.dialog in ("center", "center2", "narrative"):
                    kind = "narration"
                if state.dialog == "think" or state.think:
                    kind = "think"
                speaker = state.speaker if kind in ("dialog", "think") else None
                if speaker in _SPEAKER_SENTINELS:
                    speaker = None
                beats.append(["say", speaker, [ref.kind, ref.value], kind])
                self.say_count += 1
            return None

        if method == "setcharacter" and not obj:
            if args:
                value = self._eval(args[0], state)
                if isinstance(value, CharRef):
                    state.speaker = value.id.split(":")[0]
                else:
                    state.speaker = None
            return None

        if method == "setsaydialog" and not obj:
            dialog = self._saydialog_of(args[0]) if args else ""
            if not dialog and args and isinstance(args[0], L.Index):
                dialog = _as_text(self._eval(args[0], state)) or ""
            if dialog:
                state.dialog = dialog
                state.think = dialog == "think"
            return None

        if obj == "os_mask" and method == "Show":
            state.think = bool(args) and args[0].text() == "true"
            self.fx_count += 1
            return None

        if obj == "luamanager" and method in _JUMP_KINDS:
            return self._emit_jump(method, args, state, beats, label)

        if obj == "statmodifymanager":
            self._stat_call(method, args, state, beats)
            return None

        if obj == "checkpointmanager":
            is_read = method in _CHECKPOINT_METHODS and bool(args)
            key = _as_text(self._eval(args[0], state)) if is_read else None
            if key:
                self.read_marks.add(key)
                if method == "Dice":
                    beats.append(["meta", "dice", key])
            return None

        if obj == "dicemenudialog" and method in ("ExecuteRoll", "Setup", "SetRandom"):
            if method == "ExecuteRoll" and args:
                table = self._eval(args[0], state)
                state.menu_options = self._option_list(table)
            self.fx_count += 1
            return None

        if not obj and method == "choose" and args:
            options = self._option_list(self._eval(args[0], state))
            beat: list[Any] = ["_choice"]
            beats.append(beat)
            return {"beat": beat, "var": "", "options": options}

        if method.startswith("setmenu") or obj in _FX_OBJECTS:
            self.fx_count += 1
            return None

        self.fx_count += 1
        return None

    def _stat_call(self, method: str, args: Sequence[L.Expr], state: State,
                   beats: list[list[Any]]) -> None:
        if not args:
            return

        def arg_text(index: int) -> str | None:
            if index >= len(args):
                return None
            return _as_text(self._eval(args[index], state))

        def arg_int(index: int, fallback: int = 0) -> int:
            if index >= len(args):
                return fallback
            value = self._eval(args[index], state)
            return value if isinstance(value, int) and not isinstance(value, bool) else fallback

        if method == "Player":
            key = arg_text(0)
            delta = self._eval(args[1], state) if len(args) > 1 else None
            if key:
                beats.append(["meta", "stat", key, delta if isinstance(delta, int) else 0])
        elif method == "Character":
            key = arg_text(0)
            delta = self._eval(args[1], state) if len(args) > 1 else None
            if key:
                beats.append(["meta", "rel", key, delta if isinstance(delta, int) else 0])
        elif method in ("SetPlayer", "UpdateSetPlayerStat"):
            key = arg_text(0)
            if key:
                beats.append(["meta", "setstat", key, arg_int(1)])
        elif method == "SetCharacter":
            key = arg_text(0)
            if key:
                beats.append(["meta", "setrel", key, arg_int(1)])
        elif method in ("SetFlag", "AddFlag"):
            key = arg_text(0)
            value = self._eval(args[1], state) if len(args) > 1 else None
            if key:
                beats.append(["meta", "flag", key, value if isinstance(value, int) else 0])
        elif method == "AddStory":
            key = arg_text(0)
            if key:
                beats.append(["meta", "story", key])
        elif method in ("AddBook", "RemoveBook"):
            key = arg_text(0)
            if key:
                beats.append(["meta", "book", key, arg_int(1, 1) if method == "AddBook" else -1])
        elif method in ("AddMisc", "RemoveMisc"):
            key = arg_text(0)
            if key:
                beats.append(["meta", "misc", key, arg_int(1, 1) if method == "AddMisc" else -1])
        elif method in ("AddSpecial", "RemoveSpecial"):
            key = arg_text(0)
            if key:
                beats.append(["meta", "special", key, arg_int(1, 1) if method == "AddSpecial" else -1])
        elif method == "AddTalent":
            key = arg_text(0)
            if key:
                beats.append(["meta", "talent", key, arg_int(1, 1)])
        elif method == "AddAchievementLib":
            key = arg_text(0)
            if key:
                beats.append(["meta", "library", key])
        elif method == "Mission":
            key = arg_text(1) or arg_text(0)
            if key:
                beats.append(["meta", "mission", key])
        else:
            self.fx_count += 1

    def _emit_jump(self, method: str, args: Sequence[L.Expr], state: State,
                   beats: list[list[Any]], label: str) -> None:
        target_expr = args[-1] if args else None
        kind = _JUMP_KINDS.get(method, "explicit")

        if method == "ExecuteScript":
            self.fx_count += 1
            return

        target: str | None = None
        if target_expr is not None:
            target = _as_text(self._eval(target_expr, state))

        if target is None:
            self.dynamic_jumps.append(
                f"{method}({target_expr.text() if target_expr is not None else ''})")
            beats.append(["jump", None, f"{method}（動態目標）"])
            return

        beats.append(["jump", target, ""])
        key = (target, kind, label)
        if key not in self._edge_keys:
            self._edge_keys.add(key)
            self.edges.append([target, kind, label])
