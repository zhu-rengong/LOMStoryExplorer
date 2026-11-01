from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .vocab import FACET_LIST_FIELDS


@dataclass(frozen=True)
class TextRef:
    value: str
    keyed: bool = False


@dataclass(frozen=True)
class CharRef:
    id: str


@dataclass(frozen=True)
class Mark:
    kind: str
    key: str


@dataclass(frozen=True)
class Unknown:
    text: str


@dataclass(frozen=True)
class Locked:
    available: Any
    locked: TextRef


@dataclass(frozen=True)
class OptionCond:
    op: str
    value: str


@dataclass(frozen=True)
class CheckRef:
    kind: str
    key: str
    result: int | None = None


@dataclass(frozen=True)
class SayBeat:
    speaker: str | None
    ref: TextRef
    mode: str


@dataclass(frozen=True)
class ChoiceOption:
    ref: TextRef
    cond: OptionCond | None
    lock: TextRef | None
    beats: tuple[Beat, ...] = ()
    action: str = ""
    need: tuple[OptionCond, ...] = ()


@dataclass(frozen=True)
class ChoiceBeat:
    options: tuple[ChoiceOption, ...]


@dataclass(frozen=True)
class BranchBeat:
    check: CheckRef | None
    cond: dict[str, Any] | None
    text: str
    beats: tuple[Beat, ...]
    group: int = 0


@dataclass(frozen=True)
class JumpBeat:
    target: str | None
    label: str = ""


@dataclass(frozen=True)
class MetaBeat:
    kind: str
    key: str
    value: int | None = None


@dataclass(frozen=True)
class LoreBeat:
    key: str


@dataclass(frozen=True)
class SceneBeat:
    name: str
    key: str = ""
    next: str = ""


Beat = SayBeat | ChoiceBeat | BranchBeat | JumpBeat | MetaBeat | LoreBeat | SceneBeat


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    kind: str
    label: str = ""
    data: dict[str, Any] | None = None

    def to_wire(self, index: int) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": index,
            "from": self.source,
            "to": self.target,
            "kind": self.kind,
            "label": self.label,
        }
        if self.data:
            payload["data"] = dict(self.data)
        return payload


@dataclass
class ScriptAnalysis:
    id: str
    beats: list[Beat] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    reads: list[str] = field(default_factory=list)
    dynamic: list[str] = field(default_factory=list)
    say_count: int = 0
    fx_count: int = 0
    scene_count: int = 0
    option_count: int = 0


@dataclass(frozen=True)
class Chapter:
    id: str
    kind: str
    number: int | None
    color: str
    count: int

    def to_wire(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "kind": self.kind,
            "color": self.color,
            "count": self.count,
        }
        if self.number is not None:
            payload["number"] = self.number
        return payload


@dataclass(frozen=True)
class Facets:
    speakers: tuple[str, ...] = ()
    flags: tuple[str, ...] = ()
    checks: tuple[str, ...] = ()
    stats: tuple[str, ...] = ()
    rels: tuple[str, ...] = ()
    options: int = 0
    locks: int = 0
    dice: int = 0

    def to_wire(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for name in FACET_LIST_FIELDS:
            values = getattr(self, name)
            if values:
                out[name] = list(values)
        if self.options:
            out["options"] = self.options
        if self.locks:
            out["locks"] = self.locks
        if self.dice:
            out["dice"] = self.dice
        return out


@dataclass(frozen=True)
class NodeFlags:
    empty: bool = False
    simplified_only: bool = False
    no_out: bool = False
    no_in: bool = False

    def to_wire(self) -> dict[str, bool]:
        out: dict[str, bool] = {}
        if self.empty:
            out["empty"] = True
        if self.simplified_only:
            out["simplifiedOnly"] = True
        if self.no_out:
            out["noOut"] = True
        if self.no_in:
            out["noIn"] = True
        return out


@dataclass(frozen=True)
class NodeRecord:
    id: str
    chapter: int
    out_degree: int
    in_degree: int
    say: int
    system_in: int
    flags: NodeFlags
    facets: Facets
    entry: str | None = None
    time: int | None = None

    def to_wire(self) -> dict[str, Any]:
        node: dict[str, Any] = {
            "id": self.id,
            "chapter": self.chapter,
            "out": self.out_degree,
            "in": self.in_degree,
            "say": self.say,
        }
        if self.system_in:
            node["systemIn"] = self.system_in
        flags = self.flags.to_wire()
        if flags:
            node["flags"] = flags
        facets = self.facets.to_wire()
        if facets:
            node["facets"] = facets
        if self.entry:
            node["entry"] = self.entry
        if self.time is not None:
            node["time"] = self.time
        return node


@dataclass(frozen=True)
class GameInfo:
    version: str | None = None
    build: str | None = None
    updated: str | None = None

    def to_wire(self) -> dict[str, str | None]:
        return {"version": self.version, "build": self.build, "updated": self.updated}
