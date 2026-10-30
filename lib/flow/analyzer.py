from __future__ import annotations

from typing import Any

from .. import lua as L

from .beats import BeatsMixin
from .calls import CallsMixin
from .expr import ExprMixin
from .model import State
from .stmt import StmtMixin


class Analyzer(StmtMixin, CallsMixin, BeatsMixin, ExprMixin):
    def __init__(self, script_id: str) -> None:
        self.id = script_id
        self.edges: list[list[Any]] = []
        self.beats: list[list[Any]] = []
        self.warnings: list[str] = []
        self.dynamic_jumps: list[str] = []
        self.say_count = 0
        self.fx_count = 0
        self.option_count = 0
        self.read_marks: set[str] = set()
        self._edge_keys: set[tuple] = set()

    def analyze(self, source: str) -> dict[str, Any]:
        stmts = L.parse(source)
        self._block(stmts, State(), self.beats, "")
        return {
            "id": self.id,
            "beats": self.beats,
            "edges": self.edges,
            "dynamic": self.dynamic_jumps,
            "warnings": self.warnings[:20],
            "reads": sorted(self.read_marks),
            "stats": {
                "say": self.say_count,
                "choice": self.option_count,
                "fx": self.fx_count,
                "beats": len(self.beats),
                "reads": len(self.read_marks),
            },
        }


def analyze(script_id: str, source: str) -> dict[str, Any]:
    return Analyzer(script_id).analyze(source)
