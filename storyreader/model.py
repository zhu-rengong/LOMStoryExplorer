from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .wire import (
    BEAT_BRANCH,
    BEAT_CHOICE,
    BEAT_JUMP,
    BEAT_LORE,
    BEAT_META,
    BEAT_SAY,
    SAY_MODE_CODE,
    SAY_MODES,
)


@dataclass(frozen=True)
class TextRef:
    value: str
    keyed: bool = False

    @property
    def kind(self) -> str:
        return "key" if self.keyed else "text"


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
    cond: str


@dataclass(frozen=True)
class SayBeat:
    speaker: str | None
    ref: TextRef
    mode: str


@dataclass(frozen=True)
class ChoiceOption:
    ref: TextRef
    note: str | None
    lock: TextRef | None
    beats: tuple[Beat, ...] = ()


@dataclass(frozen=True)
class ChoiceBeat:
    options: tuple[ChoiceOption, ...]


@dataclass(frozen=True)
class BranchBeat:
    label: str
    beats: tuple[Beat, ...]
    kind: str = "if"
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


Beat = SayBeat | ChoiceBeat | BranchBeat | JumpBeat | MetaBeat | LoreBeat


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    kind: str
    label: str = ""

    def to_wire(self, index: int) -> dict[str, Any]:
        return {"id": index, "from": self.source, "to": self.target, "kind": self.kind, "label": self.label}


@dataclass
class ScriptAnalysis:
    id: str
    beats: list[Beat] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    reads: list[str] = field(default_factory=list)
    dynamic: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    say_count: int = 0
    fx_count: int = 0
    option_count: int = 0

    @property
    def stats(self) -> dict[str, int]:
        return {
            "say": self.say_count,
            "choice": self.option_count,
            "fx": self.fx_count,
            "beats": len(self.beats),
            "reads": len(self.reads),
        }


@dataclass(frozen=True)
class Chapter:
    id: str
    title: str
    color: str
    count: int

    def to_wire(self) -> dict[str, Any]:
        return {"id": self.id, "title": self.title, "color": self.color, "count": self.count}


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
        for name in ("speakers", "flags", "checks", "stats", "rels"):
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


def _ref_to_raw(ref: TextRef | None) -> list[Any] | None:
    if ref is None:
        return None
    return ["k" if ref.keyed else "t", ref.value]


def _ref_from_raw(raw: Any) -> TextRef | None:
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    return TextRef(str(raw[1]), raw[0] == "k")


def beat_to_raw(beat: Beat) -> list[Any]:
    if isinstance(beat, SayBeat):
        return [BEAT_SAY, beat.speaker, _ref_to_raw(beat.ref), SAY_MODE_CODE.get(beat.mode, 0)]
    if isinstance(beat, ChoiceBeat):
        options = [
            [_ref_to_raw(option.ref), option.note, beats_to_raw(option.beats), _ref_to_raw(option.lock)]
            for option in beat.options
        ]
        return [BEAT_CHOICE, options]
    if isinstance(beat, BranchBeat):
        return [BEAT_BRANCH, beat.label, beats_to_raw(beat.beats), beat.kind, beat.group]
    if isinstance(beat, JumpBeat):
        return [BEAT_JUMP, beat.target, beat.label]
    if isinstance(beat, MetaBeat):
        return [BEAT_META, beat.kind, beat.key, beat.value]
    return [BEAT_LORE, beat.key]


def beat_from_raw(row: Any) -> Beat:
    tag = row[0] if isinstance(row, list) and row else ""
    if tag == BEAT_SAY:
        mode = SAY_MODES[row[3]] if len(row) > 3 and 0 <= row[3] < len(SAY_MODES) else SAY_MODES[0]
        return SayBeat(row[1], _ref_from_raw(row[2]) or TextRef(""), mode)
    if tag == BEAT_CHOICE:
        options = []
        for raw in row[1] or []:
            options.append(ChoiceOption(
                _ref_from_raw(raw[0]) or TextRef(""),
                raw[1] if len(raw) > 1 else None,
                _ref_from_raw(raw[3]) if len(raw) > 3 else None,
                beats_from_raw(raw[2] if len(raw) > 2 else []),
            ))
        return ChoiceBeat(tuple(options))
    if tag == BEAT_BRANCH:
        return BranchBeat(
            row[1] or "",
            beats_from_raw(row[2] or []),
            row[3] if len(row) > 3 else "if",
            row[4] if len(row) > 4 else 0,
        )
    if tag == BEAT_JUMP:
        return JumpBeat(row[1] if len(row) > 1 else None, row[2] if len(row) > 2 else "")
    if tag == BEAT_META:
        return MetaBeat(row[1], row[2], row[3] if len(row) > 3 else None)
    return LoreBeat(row[1] if len(row) > 1 else "")


def beats_to_raw(beats: tuple[Beat, ...] | list[Beat]) -> list[list[Any]]:
    return [beat_to_raw(beat) for beat in beats]


def beats_from_raw(rows: Any) -> tuple[Beat, ...]:
    if not isinstance(rows, list):
        return ()
    return tuple(beat_from_raw(row) for row in rows if isinstance(row, list) and row)


def analysis_to_wire(analysis: ScriptAnalysis) -> dict[str, Any]:
    return {
        "id": analysis.id,
        "beats": beats_to_raw(analysis.beats),
        "edges": [{"target": edge.target, "kind": edge.kind, "label": edge.label} for edge in analysis.edges],
        "reads": list(analysis.reads),
        "dynamic": list(analysis.dynamic),
        "warnings": list(analysis.warnings),
        "say": analysis.say_count,
        "fx": analysis.fx_count,
        "options": analysis.option_count,
    }


def analysis_from_wire(payload: dict[str, Any]) -> ScriptAnalysis:
    script_id = str(payload.get("id") or "")
    edges = [
        Edge(script_id, str(item.get("target") or ""), str(item.get("kind") or "jump"),
             str(item.get("label") or ""))
        for item in payload.get("edges") or []
        if isinstance(item, dict)
    ]
    return ScriptAnalysis(
        id=str(payload.get("id") or ""),
        beats=list(beats_from_raw(payload.get("beats") or [])),
        edges=edges,
        reads=[str(item) for item in payload.get("reads") or []],
        dynamic=[str(item) for item in payload.get("dynamic") or []],
        warnings=[str(item) for item in payload.get("warnings") or []],
        say_count=int(payload.get("say") or 0),
        fx_count=int(payload.get("fx") or 0),
        option_count=int(payload.get("options") or 0),
    )
