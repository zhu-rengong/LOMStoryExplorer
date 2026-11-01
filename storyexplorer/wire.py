from __future__ import annotations

from typing import Any

from .model import (
    Beat,
    BranchBeat,
    CheckRef,
    ChoiceBeat,
    ChoiceOption,
    Edge,
    JumpBeat,
    LoreBeat,
    MetaBeat,
    OptionCond,
    SayBeat,
    SceneBeat,
    ScriptAnalysis,
    TextRef,
)
from .vocab import (
    BEAT_BRANCH,
    BEAT_CHOICE,
    BEAT_JUMP,
    BEAT_LORE,
    BEAT_META,
    BEAT_SAY,
    BEAT_SCENE,
    EDGE_JUMP,
    SAY_MODES,
)


def check_to_wire(check: CheckRef | None) -> dict[str, Any] | None:
    if check is None:
        return None
    payload: dict[str, Any] = {"kind": check.kind, "key": check.key}
    if check.result is not None:
        payload["result"] = check.result
    return payload


def check_from_wire(raw: Any) -> CheckRef | None:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "")
    key = str(raw.get("key") or "")
    if not kind or not key:
        return None
    result = raw.get("result")
    return CheckRef(kind, key, result if isinstance(result, int) else None)


def cond_to_wire(cond: OptionCond | None) -> dict[str, Any] | None:
    if cond is None:
        return None
    return {"op": cond.op, "value": cond.value}


def cond_from_wire(raw: Any) -> OptionCond | None:
    if not isinstance(raw, dict):
        return None
    return OptionCond(str(raw.get("op") or ""), str(raw.get("value") or ""))


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
        return [BEAT_SAY, beat.speaker, _ref_to_raw(beat.ref), SAY_MODES.index(beat.mode)
                if beat.mode in SAY_MODES else 0]
    if isinstance(beat, ChoiceBeat):
        options = [
            [_ref_to_raw(option.ref), cond_to_wire(option.cond), beats_to_raw(option.beats),
             _ref_to_raw(option.lock), option.action, [cond_to_wire(item) for item in option.need]]
            for option in beat.options
        ]
        return [BEAT_CHOICE, options]
    if isinstance(beat, BranchBeat):
        return [BEAT_BRANCH, check_to_wire(beat.check), beat.cond, beat.text,
                beats_to_raw(beat.beats), beat.group]
    if isinstance(beat, JumpBeat):
        return [BEAT_JUMP, beat.target, beat.label]
    if isinstance(beat, MetaBeat):
        return [BEAT_META, beat.kind, beat.key, beat.value]
    if isinstance(beat, SceneBeat):
        return [BEAT_SCENE, beat.name, beat.key, beat.next]
    return [BEAT_LORE, beat.key]


def beat_from_raw(row: Any) -> Beat:
    tag = row[0] if isinstance(row, list) and row else ""
    if tag == BEAT_SAY:
        mode = SAY_MODES[row[3]] if len(row) > 3 and 0 <= row[3] < len(SAY_MODES) else SAY_MODES[0]
        return SayBeat(row[1], _ref_from_raw(row[2]) or TextRef(""), mode)
    if tag == BEAT_CHOICE:
        options = []
        for raw in row[1] or []:
            if not isinstance(raw, list):
                continue
            need = tuple(cond for cond in (cond_from_wire(item) for item in raw[5] or []) if cond)
            options.append(ChoiceOption(
                _ref_from_raw(raw[0]) or TextRef(""),
                cond_from_wire(raw[1]),
                _ref_from_raw(raw[3]),
                beats_from_raw(raw[2] if len(raw) > 2 else []),
                str(raw[4] or "") if len(raw) > 4 else "",
                need,
            ))
        return ChoiceBeat(tuple(options))
    if tag == BEAT_BRANCH:
        return BranchBeat(
            check_from_wire(row[1]),
            row[2] if isinstance(row[2], dict) else None,
            str(row[3] or ""),
            beats_from_raw(row[4] if len(row) > 4 else []),
            row[5] if len(row) > 5 and isinstance(row[5], int) else 0,
        )
    if tag == BEAT_JUMP:
        return JumpBeat(row[1] if len(row) > 1 else None, row[2] if len(row) > 2 else "")
    if tag == BEAT_META:
        return MetaBeat(str(row[1] or ""), str(row[2] or ""),
                        row[3] if len(row) > 3 and isinstance(row[3], int) else None)
    if tag == BEAT_SCENE:
        return SceneBeat(
            row[1] if len(row) > 1 else "",
            row[2] if len(row) > 2 else "",
            row[3] if len(row) > 3 else "",
        )
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
        "edges": [{"target": edge.target, "kind": edge.kind, "label": edge.label,
                   "data": edge.data} for edge in analysis.edges],
        "reads": list(analysis.reads),
        "dynamic": list(analysis.dynamic),
        "say": analysis.say_count,
        "fx": analysis.fx_count,
        "scenes": analysis.scene_count,
        "options": analysis.option_count,
    }


def analysis_from_wire(payload: dict[str, Any]) -> ScriptAnalysis:
    script_id = str(payload.get("id") or "")
    edges = [
        Edge(script_id, str(item.get("target") or ""), str(item.get("kind") or EDGE_JUMP),
             str(item.get("label") or ""),
             item.get("data") if isinstance(item.get("data"), dict) else None)
        for item in payload.get("edges") or []
        if isinstance(item, dict)
    ]
    return ScriptAnalysis(
        id=script_id,
        beats=list(beats_from_raw(payload.get("beats") or [])),
        edges=edges,
        reads=[str(item) for item in payload.get("reads") or []],
        dynamic=[str(item) for item in payload.get("dynamic") or []],
        say_count=int(payload.get("say") or 0),
        fx_count=int(payload.get("fx") or 0),
        scene_count=int(payload.get("scenes") or 0),
        option_count=int(payload.get("options") or 0),
    )
