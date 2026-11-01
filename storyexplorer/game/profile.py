from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from ..flow.semantics import Effect, Semantics
from ..vocab import (
    CHECKPOINT_METHODS,
    EDGE_JUMP,
    EDGE_TEMP,
    EDGE_TRAVEL,
    ENTRY_COMBAT,
    ENTRY_FREE,
    VALUE_BOOK,
    VALUE_BOOK_LEVEL,
    VALUE_BOOK_MASTER,
    VALUE_CHRONICLE,
    VALUE_CONDITION,
    VALUE_FLAG,
    VALUE_GROUP,
    VALUE_MISC,
    VALUE_REL,
    VALUE_SPECIAL,
    VALUE_STAT,
    VALUE_TALENT,
    VALUE_TIME,
    VALUE_UPGRADE,
    VALUE_UPGRADE_LEVEL,
)

GAME_ENV = "MORTAL_GAME_DIR"
MANAGERS_SUBDIR = "Mortal_Data"
RESOURCES_ASSET = "resources.assets"
LOCALE_ASSET = "sharedassets0.assets"
MANAGERS_ASSET = "globalgamemanagers"
UNITY_VERSION = "2020.3.49f1"

SCRIPT_PREFIX = "story/"
PRIMARY_PREFIX = "story/chinesetraditional/"
FALLBACK_PREFIX = "story/chinesesimplified/"

ROUNDS_PER_MONTH = 3
ROUNDS_PER_YEAR = 36

BUNDLE_MARKER = b"release_"
BUNDLE_VERSION_PATTERN = re.compile(r"^release_(\d+(?:\.\d+)+)$")
BUNDLE_STRING_LIMIT = 64

POSITION_CALL = re.compile(r'Position\(\s*"([^"]+)"\s*\)')
SCRIPT_LITERAL = re.compile(r'"([A-Za-z][A-Za-z0-9_]{2,60})"')
GAME_TIME_CALL = re.compile(
    r"luamanager\.SetGameTime\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)")
STORY_CALL = re.compile(r"""statmodifymanager\.AddStory\(\s*["']([^"']+)["']\s*\)""")

SEMANTICS = Semantics(
    narration_dialogs=frozenset({"center", "center2", "narrative"}),
    think_dialogs=frozenset({"think"}),
    speaker_sentinels=frozenset({"narrative", "narrator", "none", "center", "center2", "think"}),
    jumps={
        "SetNextScript": EDGE_JUMP,
        "SetCurrentStoryScript": EDGE_JUMP,
        "SetTempScript": EDGE_TEMP,
        "SetCurrentTravelScript": EDGE_TRAVEL,
    },
    check_methods={
        "Switch": "switch",
        "Dice": "dice",
        "Condition": "condition",
        "Position": "position",
    },
    effects={
        "Player": Effect("stat", value_index=1),
        "Character": Effect("rel", value_index=1),
        "SetPlayer": Effect("setstat", value_index=1),
        "UpdateSetPlayerStat": Effect("setstat", value_index=1),
        "SetCharacter": Effect("setrel", value_index=1),
        "SetFlag": Effect("flag", value_index=1),
        "AddFlag": Effect("flag", value_index=1),
        "AddStory": Effect("story"),
        "AddBook": Effect("book", value_index=1, value_default=1),
        "RemoveBook": Effect("book", value_index=1, value_default=-1),
        "AddMisc": Effect("misc", value_index=1, value_default=1),
        "RemoveMisc": Effect("misc", value_index=1, value_default=-1),
        "AddSpecial": Effect("special", value_index=1, value_default=1),
        "RemoveSpecial": Effect("special", value_index=1, value_default=-1),
        "AddTalent": Effect("talent", value_index=1, value_default=1),
        "AddAchievementLib": Effect("library"),
        "Mission": Effect("mission", key_index=1, key_fallback=0),
    },
    dice_roll_methods=("ExecuteRoll", "Setup", "SetRandom"),
    fx_objects=frozenset({
        "menudialogs", "mainui", "flowcharts", "getvar", "runblock", "runwait",
        "wait", "stage", "characters", "effects", "trait", "dicemenudialog",
    }),
)


CHECKPOINT_CALL = re.compile(
    rf'checkpointmanager\.({"|".join(CHECKPOINT_METHODS)})\(\s*"([^"]{{2,60}})"')


@dataclass(frozen=True)
class NameSpec:
    namespace: str
    prefix: str = ""
    use_id: bool = False
    use_name: bool = False
    use_segments: bool = False


NAME_SPECS: dict[str, NameSpec] = {
    VALUE_STAT: NameSpec("PlayerStat", use_name=True, use_segments=True),
    VALUE_REL: NameSpec("Character", use_name=True, use_segments=True),
    VALUE_FLAG: NameSpec("Flag", prefix="Name/", use_name=True),
    VALUE_BOOK: NameSpec("Book", prefix="Name/", use_id=True, use_segments=True),
    VALUE_MISC: NameSpec("Misc", prefix="Name/", use_id=True, use_segments=True),
    VALUE_SPECIAL: NameSpec("Special", prefix="Name/", use_id=True, use_segments=True),
    VALUE_TALENT: NameSpec("PlayerTalent", prefix="Name/", use_id=True, use_segments=True),
    VALUE_CHRONICLE: NameSpec("Library", prefix="Title/", use_name=True),
}

DICE_NAME_KINDS: dict[int, str] = {0: VALUE_STAT, 1: VALUE_REL, 2: VALUE_TALENT, 3: VALUE_FLAG}

STAT_FIELD_BY_KIND: dict[str, str] = {
    VALUE_STAT: "_stat",
    VALUE_REL: "_relationship",
    VALUE_FLAG: "_flag",
    VALUE_BOOK: "_book",
    VALUE_MISC: "_misc",
    VALUE_SPECIAL: "_specialItem",
    VALUE_GROUP: "_statGroup",
    VALUE_TIME: "_gameTime",
    VALUE_TALENT: "_talentData",
    VALUE_BOOK_LEVEL: "_book",
    VALUE_UPGRADE: "_upgradeItemData",
    VALUE_UPGRADE_LEVEL: "_upgradeItemData",
    VALUE_BOOK_MASTER: "_bookCollection",
    VALUE_CHRONICLE: "_libraryAchieve",
    VALUE_CONDITION: "_condition",
}

DICE_FIELD_BY_KIND: dict[str, str] = {
    VALUE_STAT: "_stat",
    VALUE_REL: "_relationship",
    VALUE_TALENT: "_talent",
    VALUE_FLAG: "_flag",
}

ITEM_KINDS = frozenset({
    VALUE_BOOK, VALUE_MISC, VALUE_SPECIAL, VALUE_TALENT, VALUE_CHRONICLE,
})


@dataclass(frozen=True)
class ChapterRule:
    pattern: re.Pattern[str]
    kind: str
    number_group: int | None = None
    zero_kind: str | None = None


CHAPTER_RULES: tuple[ChapterRule, ...] = (
    ChapterRule(re.compile(r"^ch(\d+)_", re.IGNORECASE), "chapter", 1, "prologue"),
    ChapterRule(re.compile(r"^act(\d+)", re.IGNORECASE), "act", 1),
    ChapterRule(re.compile(r"^[sS](\d{2})\d{2}_"), "event", 1),
    ChapterRule(re.compile(r"^(door|room|center|back|meeting|mall|teashop|fortress|talk|shop|inn)"),
                "scene"),
    ChapterRule(re.compile(r"^(kitchen|pharmacy|alchemy|craft|forge|chess|fish|farm|work|labour)"),
                "work"),
    ChapterRule(re.compile(r"^travel", re.IGNORECASE), "travel"),
    ChapterRule(re.compile(r"^section_\d+_free", re.IGNORECASE), "free"),
    ChapterRule(re.compile(r"^section_", re.IGNORECASE), "section"),
    ChapterRule(re.compile(r"^(legend|library|book|event|mission)", re.IGNORECASE), "misc"),
)

CHAPTER_PALETTE: tuple[str, ...] = (
    "#C8A96A", "#B4453B", "#6E8B8F", "#A8763E", "#7FA36B", "#8C7CA8",
    "#C98B6B", "#5B8FA8", "#A8A06B", "#9C6B8F", "#6B8FA8", "#B08A5B",
    "#8FA86B", "#A85B77", "#5B77A8", "#A88F5B",
)

CHAPTER_RANK: dict[str, int] = {
    "prologue": 0,
    "chapter": 1,
    "act": 2,
    "event": 3,
    "scene": 4,
    "work": 5,
    "travel": 6,
    "free": 7,
    "section": 8,
    "misc": 9,
    "other": 10,
}

ENTRY_FIELDS: dict[str, tuple[str, str]] = {
    "FreePositionData": ("_defaultScript", ENTRY_FREE),
    "PositionController": ("_scriptName", ENTRY_FREE),
    "CombatEventActionSetStoryScript": ("_name", ENTRY_COMBAT),
}
ENTRY_SOURCE_ORDER: dict[str, int] = {ENTRY_COMBAT: 0, ENTRY_FREE: 1}
POSITION_CLASS = "PositionResultData"

HARDCODED_ENTRIES: tuple[dict[str, str], ...] = (
    {"id": "ch1_1", "label": "New game start", "source": "SaveSystem.cs L174-L177"},
    {"id": "act1", "label": "New act start", "source": "SaveSystem.cs L209-L212"},
)

TITLE_PLACEHOLDERS = frozenset({"(title)", "{title}", "title", "（title）"})

TRADITIONAL_MARKERS = "這幾個們說為與後裡臺灣點麼樣還過對發現實當經開關無麼"
SIMPLIFIED_MARKERS = "这几个们说为与后里台湾点么样还过对发现实当经开关无么"
HANGUL_RANGE = ("\uac00", "\ud7a3")
HAN_RANGE = ("\u4e00", "\u9fff")
LOCALE_MIN_MATCHES = 8


def game_root() -> Path | None:
    raw = os.environ.get(GAME_ENV, "").strip()
    return Path(raw).expanduser() if raw else None


def asset_dir(game: Path) -> Path:
    return Path(game) / MANAGERS_SUBDIR


def managers_path(game: Path) -> Path:
    return asset_dir(game) / MANAGERS_ASSET


def resources_path(game: Path) -> Path:
    return asset_dir(game) / RESOURCES_ASSET


def locale_path(game: Path) -> Path:
    return asset_dir(game) / LOCALE_ASSET


def steamapps_dir(game: Path) -> Path | None:
    for parent in Path(game).parents:
        if parent.name.lower() == "steamapps":
            return parent
    return None


def install_dir(game: Path) -> str:
    return Path(game).name
