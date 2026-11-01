from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..model import Edge, ScriptAnalysis


@dataclass
class AnalysisContext:
    id: str
    beats: list[Any] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    reads: set[str] = field(default_factory=set)
    dynamic: list[str] = field(default_factory=list)
    say_count: int = 0
    fx_count: int = 0
    scene_count: int = 0
    option_count: int = 0
    branch_seq: int = 0
    edge_keys: set[tuple[str, str, str]] = field(default_factory=set)

    def add_edge(self, target: str, kind: str, label: str) -> None:
        key = (target, kind, label)
        if key in self.edge_keys:
            return
        self.edge_keys.add(key)
        self.edges.append(Edge(self.id, target, kind, label))

    def snapshot(self) -> ScriptAnalysis:
        return ScriptAnalysis(
            id=self.id,
            beats=[beat for beat in self.beats if beat is not None],
            edges=list(self.edges),
            reads=sorted(self.reads),
            dynamic=list(self.dynamic),
            say_count=self.say_count,
            fx_count=self.fx_count,
            scene_count=self.scene_count,
            option_count=self.option_count,
        )
