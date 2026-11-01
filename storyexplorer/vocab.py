from __future__ import annotations

from typing import Any

BEAT_SAY = "s"
BEAT_CHOICE = "c"
BEAT_BRANCH = "br"
BEAT_JUMP = "j"
BEAT_META = "m"
BEAT_LORE = "lore"
BEAT_SCENE = "sc"
BEAT_TAGS = (BEAT_SAY, BEAT_CHOICE, BEAT_BRANCH, BEAT_JUMP, BEAT_META, BEAT_LORE, BEAT_SCENE)

SAY_MODES = ("dialog", "narration", "think")
SAY_MODE_CODE = {mode: index for index, mode in enumerate(SAY_MODES)}

EDGE_JUMP = "jump"
EDGE_INFERRED = "inferred"
EDGE_TEMP = "temp"
EDGE_TRAVEL = "travel"
EDGE_POSITION = "position"
EDGE_KINDS = (EDGE_JUMP, EDGE_INFERRED, EDGE_TEMP, EDGE_TRAVEL, EDGE_POSITION)
EDGE_GROUPS = {
    EDGE_JUMP: "jump",
    EDGE_INFERRED: "inferred",
    EDGE_TEMP: "temp",
    EDGE_TRAVEL: "temp",
    EDGE_POSITION: "position",
}

FACET_LIST_FIELDS = ("speakers", "flags", "checks", "stats", "rels")
FACET_COUNT_FIELDS = ("options", "locks", "dice")
FACET_KINDS = FACET_LIST_FIELDS + FACET_COUNT_FIELDS

CHECK_SWITCH = "switch"
CHECK_DICE = "dice"
CHECK_CONDITION = "condition"
CHECK_POSITION = "position"
CHECK_FLAG = "flag"
CHECK_KINDS = (CHECK_SWITCH, CHECK_DICE, CHECK_CONDITION, CHECK_POSITION, CHECK_FLAG)
CHECKPOINT_METHODS = ("Switch", "Dice", "Condition", "Position")
CHECKPOINT_MARKS = {
    "Switch": CHECK_SWITCH,
    "Dice": CHECK_DICE,
    "Condition": CHECK_CONDITION,
    "Position": CHECK_POSITION,
}

COND_CONST = "const"
COND_RANDOM = "random"
COND_DICE = "dice"
COND_VAR = "var"
COND_GROUP = "group"
COND_COMPARE = "compare"
COND_LOGIC = "logic"
COND_CHECK = "check"
COND_RAW = "raw"
COND_TAGS = frozenset({
    COND_CONST, COND_RANDOM, COND_DICE, COND_VAR,
    COND_GROUP, COND_COMPARE, COND_LOGIC, COND_CHECK, COND_RAW,
})

VALUE_CONST = "const"
VALUE_STAT = "stat"
VALUE_REL = "rel"
VALUE_FLAG = "flag"
VALUE_BOOK = "book"
VALUE_MISC = "misc"
VALUE_SPECIAL = "special"
VALUE_RANDOM = "random"
VALUE_GROUP = "group"
VALUE_TIME = "time"
VALUE_TALENT = "talent"
VALUE_BOOK_LEVEL = "bookLevel"
VALUE_UPGRADE = "upgrade"
VALUE_UPGRADE_LEVEL = "upgradeLevel"
VALUE_BOOK_MASTER = "bookMaster"
VALUE_CHRONICLE = "chronicle"
VALUE_CONDITION = "condition"
VALUE_KINDS = (
    VALUE_CONST, VALUE_STAT, VALUE_REL, VALUE_FLAG, VALUE_BOOK, VALUE_MISC, VALUE_SPECIAL,
    VALUE_RANDOM, VALUE_GROUP, VALUE_TIME, VALUE_TALENT, VALUE_BOOK_LEVEL, VALUE_UPGRADE,
    VALUE_UPGRADE_LEVEL, VALUE_BOOK_MASTER, VALUE_CHRONICLE, VALUE_CONDITION,
)
VALUE_KIND_BY_CODE = {index: kind for index, kind in enumerate(VALUE_KINDS)}

VALUE_NAME_GROUPS = {
    VALUE_STAT: "stat",
    VALUE_REL: "rel",
    VALUE_FLAG: "flag",
    VALUE_BOOK: "book",
    VALUE_MISC: "misc",
    VALUE_SPECIAL: "special",
    VALUE_TALENT: "talent",
    VALUE_CHRONICLE: "library",
}

COMPARE_OP_SYMBOL = {0: "=", 1: "≠", 2: "<", 3: "≤", 4: ">", 5: "≥"}
COMPARE_SYMBOLS = tuple(COMPARE_OP_SYMBOL.values())
LOGIC_OP_KIND = {0: "and", 1: "or"}
GROUP_OP_KIND = {1: "sum", 2: "max", 3: "min", 4: "product", 5: "all", 6: "any"}
GROUP_KINDS = ("sum", "max", "min", "product", "all", "any")

META_KINDS = (
    "stat", "rel", "flag", "setstat", "setrel",
    "book", "misc", "special", "talent", "library",
    "mission", "dice",
)

ENTRY_FREE = "free"
ENTRY_COMBAT = "combat"
ENTRY_KINDS = (ENTRY_FREE, ENTRY_COMBAT)

CHAPTER_PROLOGUE = "prologue"
CHAPTER_CHAPTER = "chapter"
CHAPTER_ACT = "act"
CHAPTER_EVENT = "event"
CHAPTER_SCENE = "scene"
CHAPTER_WORK = "work"
CHAPTER_TRAVEL = "travel"
CHAPTER_FREE = "free"
CHAPTER_SECTION = "section"
CHAPTER_MISC = "misc"
CHAPTER_OTHER = "other"
CHAPTER_KINDS = (
    CHAPTER_PROLOGUE, CHAPTER_CHAPTER, CHAPTER_ACT, CHAPTER_EVENT, CHAPTER_SCENE,
    CHAPTER_WORK, CHAPTER_TRAVEL, CHAPTER_FREE, CHAPTER_SECTION, CHAPTER_MISC, CHAPTER_OTHER,
)

TEXT_MODE_FULL = "full"
TEXT_MODE_SHARDS = "shards"

GLOBAL_GRAPH = "SR_DATA"
GLOBAL_TEXT = "SR_TEXT"
GLOBAL_CHECKPOINTS = "SR_CHECKPOINTS"
GLOBAL_WORDCOUNT = "SR_WORDCOUNT"


def payload() -> dict[str, Any]:
    return {
        "beatTags": list(BEAT_TAGS),
        "sayModes": list(SAY_MODES),
        "edgeKinds": list(EDGE_KINDS),
        "edgeGroups": dict(EDGE_GROUPS),
        "facetKinds": list(FACET_KINDS),
        "checkKinds": list(CHECK_KINDS),
        "valueKinds": list(VALUE_KINDS),
        "compareOps": list(COMPARE_SYMBOLS),
        "groupOps": list(GROUP_KINDS),
        "metaKinds": list(META_KINDS),
        "entryKinds": list(ENTRY_KINDS),
        "chapterKinds": list(CHAPTER_KINDS),
    }
