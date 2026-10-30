from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from .entryprobe import summarize as summarize_probe

HARDCODED_ENTRIES: tuple[dict, ...] = (
    {"id": "ch1_1", "label": "新遊戲開場", "source": "SaveSystem.cs L174-175"},
    {"id": "act1", "label": "新篇章", "source": "SaveSystem.cs L209-210"},
)

_POSITION_RE = re.compile(r'Position\(\s*"([^"]+)"\s*\)')


def find_positions(sources: dict[str, str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for sid in sorted(sources):
        names = sorted(set(_POSITION_RE.findall(sources[sid] or "")))
        if names:
            found[sid] = names
    return found


def _prefix_targets(name: str, ids: Sequence[str]) -> list[str]:
    prefix = name.lower() + "_"
    return [sid for sid in ids if sid.lower().startswith(prefix)]


def expand_positions(positions: dict[str, list[str]], ids: Sequence[str],
                     existing: set[tuple[str, str]],
                     exact: dict[str, Sequence[str]] | None = None) -> tuple[list[list[str]], dict]:
    edges: list[list[str]] = []
    resolved: dict[str, int] = {}
    exact_names: list[str] = []
    prefix_names: list[str] = []
    unresolved: list[str] = []
    exact_map = exact or {}
    id_set = set(ids)
    for src in sorted(positions):
        for name in positions[src]:
            exact_targets = [sid for sid in exact_map.get(name, ()) if sid in id_set]
            if exact_targets:
                targets = exact_targets
                exact_names.append(name)
            else:
                targets = _prefix_targets(name, ids)
                if targets:
                    prefix_names.append(name)
            if not targets:
                unresolved.append(name)
                continue
            resolved[name] = resolved.get(name, 0) + len(targets)
            for dst in targets:
                if (src, dst) in existing:
                    continue
                existing.add((src, dst))
                edges.append([src, dst, "position", f"場所事件「{name}」"])
    stats = {
        "names": len({name for names in positions.values() for name in names}),
        "resolved_names": len(resolved),
        "exact_names": len(set(exact_names)),
        "prefix_names": len(set(prefix_names)),
        "targets": sum(resolved.values()),
        "edges": len(edges),
        "unresolved": sorted(set(unresolved))[:40],
    }
    return edges, stats


def build(sources: dict[str, str], ids: Iterable[str],
          existing: set[tuple[str, str]],
          probe: dict | None = None) -> tuple[list[list[str]], list[dict], dict]:
    id_list = list(ids)
    id_set = set(id_list)
    positions = find_positions(sources)
    exact = (probe or {}).get("positions") or None
    edges, position_stats = expand_positions(positions, id_list, existing, exact)
    entries = [dict(item) for item in HARDCODED_ENTRIES if item["id"] in id_set]
    entry_sources = {sid: source for sid, source in ((probe or {}).get("entries") or {}).items()
                     if sid in id_set}
    stats = {
        "hardcoded": len(entries),
        "missing_hardcoded": [item["id"] for item in HARDCODED_ENTRIES
                              if item["id"] not in id_set],
        "position": position_stats,
        "asset_probe": summarize_probe(probe or {}),
        "entry_sources": entry_sources,
    }
    return edges, entries, stats
