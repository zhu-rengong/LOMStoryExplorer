from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from ..model import BranchBeat, ChoiceBeat, Facets, MetaBeat, SayBeat
from ..vocab import COND_CHECK, COND_COMPARE, COND_GROUP, COND_LOGIC

_CHECK_TAGS = (COND_CHECK, COND_COMPARE, COND_LOGIC, COND_GROUP)


def _walk_checks(node: Any, out: set[str]) -> None:
    if not isinstance(node, dict):
        return
    if node.get("tag") == COND_CHECK:
        key = str(node.get("key") or "")
        if key:
            out.add(key)
        return
    if node.get("tag") not in _CHECK_TAGS:
        return
    for item in (node.get("left"), node.get("right")):
        _walk_checks(item, out)
    for item in node.get("items") or []:
        _walk_checks(item, out)


def collect_facets(beats: Sequence[object], reads: Iterable[str] | None = None) -> Facets:
    speakers: set[str] = set()
    flags: set[str] = set()
    checks: set[str] = set()
    stats: set[str] = set()
    rels: set[str] = set()
    options = 0
    locks = 0
    dice = 0

    def walk(rows: Sequence[object]) -> None:
        nonlocal options, locks, dice
        for beat in rows:
            if isinstance(beat, SayBeat):
                if beat.speaker:
                    speakers.add(beat.speaker)
            elif isinstance(beat, MetaBeat):
                if not beat.key:
                    continue
                if beat.kind == "flag":
                    flags.add(beat.key)
                elif beat.kind == "stat":
                    stats.add(beat.key)
                elif beat.kind == "rel":
                    rels.add(beat.key)
                elif beat.kind == "dice":
                    checks.add(beat.key)
                    dice += 1
            elif isinstance(beat, BranchBeat):
                if beat.check:
                    checks.add(beat.check.key)
                _walk_checks(beat.cond, checks)
                walk(beat.beats)
            elif isinstance(beat, ChoiceBeat):
                options += len(beat.options)
                for option in beat.options:
                    if option.cond:
                        dice += 1
                    if option.lock:
                        locks += 1
                    walk(option.beats)

    walk(beats)
    if reads:
        checks.update(key for key in reads if key)
    return Facets(
        speakers=tuple(sorted(speakers)),
        flags=tuple(sorted(flags)),
        checks=tuple(sorted(checks)),
        stats=tuple(sorted(stats)),
        rels=tuple(sorted(rels)),
        options=options,
        locks=locks,
        dice=dice,
    )
