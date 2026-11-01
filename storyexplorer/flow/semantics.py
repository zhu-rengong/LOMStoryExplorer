from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping


@dataclass(frozen=True)
class Effect:
    kind: str
    key_index: int = 0
    key_fallback: int | None = None
    value_index: int | None = None
    value_default: int = 0


@dataclass(frozen=True)
class Semantics:
    say_method: str = "say"
    speaker_method: str = "setcharacter"
    dialog_method: str = "setsaydialog"
    choice_method: str = "choose"
    think_object: str = "os_mask"
    think_method: str = "Show"
    narration_dialogs: frozenset[str] = frozenset()
    think_dialogs: frozenset[str] = frozenset()
    speaker_sentinels: frozenset[str] = frozenset()
    jumps: Mapping[str, str] = field(default_factory=dict)
    scene_object: str = "luamanager"
    scene_method: str = "ChangeScene"
    scene_args: int = 3
    check_object: str = "checkpointmanager"
    check_methods: Mapping[str, str] = field(default_factory=dict)
    stat_object: str = "statmodifymanager"
    effects: Mapping[str, Effect] = field(default_factory=dict)
    dice_object: str = "dicemenudialog"
    dice_roll_methods: tuple[str, ...] = ()
    dice_result_field: str = "ResultSelection"
    menu_prefix: str = "setmenu"
    fx_objects: frozenset[str] = frozenset()
    story_getter: str = "GetStoryText"
    character_object: str = "characters"
    character_get: str = "Get"
    character_portrait: str = "GetPortrait"
    stat_getter_prefix: str = "Get"
