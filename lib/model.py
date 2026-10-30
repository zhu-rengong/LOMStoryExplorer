from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True, frozen=True)
class SourceScript:
    id: str
    text: str
    origin: str


@dataclass(slots=True, frozen=True)
class Diagnostic:
    code: str
    message: str
    script_id: str = ""
    line: int = 0

    def format(self) -> str:
        location = self.script_id
        if self.line:
            location = f"{location}:{self.line}"
        return f"{location}: {self.message}" if location else self.message


@dataclass(slots=True, frozen=True)
class TextRef:
    kind: str
    value: str

    def to_list(self) -> list[str]:
        return [self.kind, self.value]

    @classmethod
    def from_list(cls, row: list[str]) -> TextRef:
        return cls(row[0], row[1])


@dataclass(slots=True)
class SayBeat:
    speaker: str
    text: TextRef
    mode: str
    portrait: str = ""


@dataclass(slots=True)
class ChoiceOption:
    index: int
    text: TextRef
    body: list[Beat] = field(default_factory=list)
    availability: str = ""
    dice: str = ""
    locked: TextRef | None = None
    menu: str = "Options"
    raw: str = ""


@dataclass(slots=True)
class ChoiceBeat:
    options: list[ChoiceOption]
    menu: str = "Options"


@dataclass(slots=True)
class BranchBeat:
    label: str
    body: list[Beat]
    kind: str = "if"
    group: int = 0


@dataclass(slots=True)
class JumpBeat:
    target: str
    label: str = ""
    relation: str = "next"


@dataclass(slots=True)
class MetadataBeat:
    kind: str
    key: str
    value: Any = None
    operation: str = "add"


Beat = SayBeat | ChoiceBeat | BranchBeat | JumpBeat | MetadataBeat


@dataclass(slots=True, frozen=True)
class StoryEdge:
    source: str
    target: str
    kind: str = "next"
    label: str = ""


@dataclass(slots=True)
class StoryAnalysis:
    id: str
    beats: list[Beat] = field(default_factory=list)
    edges: list[StoryEdge] = field(default_factory=list)
    dynamic: list[str] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    reads: set[str] = field(default_factory=set)
    stats: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "beats": beats_to_data(self.beats),
            "edges": [[edge.source, edge.target, edge.kind, edge.label] for edge in self.edges],
            "dynamic": self.dynamic,
            "diagnostics": [{
                "code": diagnostic.code,
                "message": diagnostic.message,
                "script_id": diagnostic.script_id,
                "line": diagnostic.line,
            } for diagnostic in self.diagnostics],
            "reads": sorted(self.reads),
            "stats": self.stats,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StoryAnalysis:
        return cls(
            id=data["id"],
            beats=beats_from_data(data.get("beats", [])),
            edges=[StoryEdge(*row) for row in data.get("edges", [])],
            dynamic=list(data.get("dynamic", [])),
            diagnostics=[Diagnostic(**row) for row in data.get("diagnostics", [])],
            reads=set(data.get("reads", [])),
            stats=dict(data.get("stats", {})),
        )


@dataclass(slots=True, frozen=True)
class Chapter:
    id: str
    title: str
    color: str
    count: int = 0


def beats_to_data(beats: list[Beat]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for beat in beats:
        if isinstance(beat, SayBeat):
            rows.append(["say", beat.speaker, beat.text.to_list(), beat.mode, beat.portrait])
        elif isinstance(beat, ChoiceBeat):
            rows.append(["choice", beat.menu, [
                [option.index, option.text.to_list(), beats_to_data(option.body), option.availability,
                 option.dice, option.locked.to_list() if option.locked else None, option.raw]
                for option in beat.options
            ]])
        elif isinstance(beat, BranchBeat):
            rows.append(["branch", beat.label, beats_to_data(beat.body), beat.kind, beat.group])
        elif isinstance(beat, JumpBeat):
            rows.append(["jump", beat.target, beat.label, beat.relation])
        elif isinstance(beat, MetadataBeat):
            rows.append(["meta", beat.kind, beat.key, beat.value, beat.operation])
    return rows


def beats_from_data(rows: list[list[Any]]) -> list[Beat]:
    beats: list[Beat] = []
    for row in rows:
        tag = row[0]
        if tag == "say":
            beats.append(SayBeat(row[1], TextRef.from_list(row[2]), row[3], row[4] if len(row) > 4 else ""))
        elif tag == "choice":
            options = [ChoiceOption(
                index=option[0], text=TextRef.from_list(option[1]), body=beats_from_data(option[2]),
                availability=option[3], dice=option[4],
                locked=TextRef.from_list(option[5]) if option[5] else None,
                menu=row[1], raw=option[6] if len(option) > 6 else "",
            ) for option in row[2]]
            beats.append(ChoiceBeat(options, row[1]))
        elif tag == "branch":
            beats.append(BranchBeat(row[1], beats_from_data(row[2]), row[3], row[4]))
        elif tag == "jump":
            beats.append(JumpBeat(row[1], row[2], row[3] if len(row) > 3 else "next"))
        elif tag == "meta":
            beats.append(MetadataBeat(row[1], row[2], row[3], row[4] if len(row) > 4 else "add"))
    return beats
