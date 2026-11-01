from __future__ import annotations

BEAT_SAY = "s"
BEAT_CHOICE = "c"
BEAT_BRANCH = "br"
BEAT_JUMP = "j"
BEAT_META = "m"
BEAT_LORE = "lore"
BEAT_SCENE = "sc"

SAY_MODES = ("dialog", "narration", "think")
SAY_MODE_CODE = {mode: index for index, mode in enumerate(SAY_MODES)}

EDGE_JUMP = "jump"
EDGE_INFERRED = "inferred"
EDGE_TEMP = "temp"
EDGE_TRAVEL = "travel"
EDGE_POSITION = "position"
EDGE_KINDS = (EDGE_JUMP, EDGE_INFERRED, EDGE_TEMP, EDGE_TRAVEL, EDGE_POSITION)

FACET_LIST_FIELDS = ("speakers", "flags", "checks", "stats", "rels")
FACET_FIELDS = FACET_LIST_FIELDS + ("options", "locks", "dice")

COND_CONST = "const"
COND_RANDOM = "random"
COND_DICE = "dice"
COND_VAR = "var"
COND_GROUP = "group"
COND_COMPARE = "compare"
COND_LOGIC = "logic"

HARDCODED_ENTRIES = (
    {"id": "ch1_1", "label": "New game start", "source": "SaveSystem.cs L174-L177"},
    {"id": "act1", "label": "New act start", "source": "SaveSystem.cs L209-L212"},
)

GLOBAL_GRAPH = "SR_DATA"
GLOBAL_TEXT = "SR_TEXT"
GLOBAL_CHECKPOINTS = "SR_CHECKPOINTS"
GLOBAL_WORDCOUNT = "SR_WORDCOUNT"
