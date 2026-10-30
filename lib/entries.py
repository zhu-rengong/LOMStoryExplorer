from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from .entryprobe import summarize as summarize_probe
from .model import StoryEdge

HARDCODED_ENTRIES = (
    {"id": "ch1_1", "label": "New game", "source": "new-game"},
    {"id": "act1", "label": "New chapter", "source": "new-chapter"},
)
POSITION_CALL = re.compile(r'checkpointmanager\.Position\(\s*"([^"]+)"\s*\)')


def find_positions(sources: dict[str, str]) -> dict[str, set[str]]:
    return {script_id: set(POSITION_CALL.findall(source)) for script_id, source in sources.items()
            if POSITION_CALL.search(source)}


def build(sources: dict[str, str], ids: Iterable[str], existing: set[tuple[str, str]],
          probe: dict[str, Any] | None = None) -> tuple[list[StoryEdge], list[dict], dict[str, Any]]:
    id_list = sorted(ids)
    id_set = set(id_list)
    probe = probe or {}
    exact = probe.get("positions") or {}
    positions = find_positions(sources)
    edges: list[StoryEdge] = []
    stats = {"names": 0, "exact_names": 0, "prefix_names": 0, "targets": 0, "unresolved": []}
    names_seen: set[str] = set()
    for source, names in sorted(positions.items()):
        for name in sorted(names):
            names_seen.add(name)
            targets = [target for target in exact.get(name, ()) if target in id_set]
            mode = "exact"
            if not targets:
                prefix = name.lower() + "_"
                targets = [target for target in id_list if target.lower().startswith(prefix)]
                mode = "prefix"
            if not targets:
                stats["unresolved"].append(name)
                continue
            stats[f"{mode}_names"] += 1
            stats["targets"] += len(targets)
            for target in targets:
                if (source, target) in existing:
                    continue
                existing.add((source, target))
                edges.append(StoryEdge(source, target, "position", f"Position event: {name}"))
    entries = [dict(item) for item in HARDCODED_ENTRIES if item["id"] in id_set]
    entry_sources = {script_id: source for script_id, source in (probe.get("entries") or {}).items()
                     if script_id in id_set}
    stats["names"] = len(names_seen)
    stats["unresolved"] = sorted(set(stats["unresolved"]))[:60]
    return edges, entries, {
        "hardcoded": len(entries),
        "position": stats,
        "asset_probe": summarize_probe(probe),
        "entry_sources": entry_sources,
    }
