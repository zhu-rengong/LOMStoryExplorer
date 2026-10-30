from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from ..config import MAX_EDGE_LABEL
from ..game.entries import summarize as summarize_probe
from ..model import Edge, Facets, NodeFlags, NodeRecord, ScriptAnalysis
from ..wire import EDGE_INFERRED, EDGE_POSITION, HARDCODED_ENTRIES

_LITERAL = re.compile(r'"([A-Za-z][A-Za-z0-9_]{2,60})"')
_POSITION_RE = re.compile(r'Position\(\s*"([^"]+)"\s*\)')


def collect_edges(models: Mapping[str, ScriptAnalysis],
                  sources: Mapping[str, str]) -> tuple[list[Edge], list[str], int]:
    ids = set(models)
    seen: dict[tuple[str, str, str], int] = {}
    edges: list[Edge] = []
    dynamic: list[str] = []

    for sid, model in models.items():
        for edge in model.edges:
            if edge.target not in ids:
                dynamic.append(f"{sid} -> {edge.target} (missing target)")
                continue
            key = (sid, edge.target, edge.kind)
            if key in seen:
                index = seen[key]
                label = edge.label
                if label and label not in edges[index].label:
                    merged = (edges[index].label + " / " + label)[:MAX_EDGE_LABEL]
                    edges[index] = Edge(edges[index].source, edges[index].target, edges[index].kind, merged)
                continue
            seen[key] = len(edges)
            edges.append(Edge(sid, edge.target, edge.kind, (edge.label or "")[:MAX_EDGE_LABEL]))

    inferred = 0
    adjacency: dict[str, set[str]] = {}
    for edge in edges:
        adjacency.setdefault(edge.source, set()).add(edge.target)
    for sid, source in sources.items():
        existing = adjacency.get(sid)
        if existing is None:
            existing = adjacency[sid] = set()
        for literal in sorted(set(_LITERAL.findall(source))):
            if literal == sid or literal not in ids or literal in existing:
                continue
            existing.add(literal)
            edges.append(Edge(sid, literal, EDGE_INFERRED, ""))
            inferred += 1
    for sid, model in models.items():
        for item in model.dynamic[:1]:
            dynamic.append(f"{sid} contains dynamic jumps: {item}")

    return edges, dynamic, inferred


def find_positions(sources: Mapping[str, str]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for sid in sorted(sources):
        names = sorted(set(_POSITION_RE.findall(sources[sid] or "")))
        if names:
            found[sid] = names
    return found


def _prefix_targets(name: str, ids: Sequence[str]) -> list[str]:
    prefix = name.lower() + "_"
    return [sid for sid in ids if sid.lower().startswith(prefix)]


def expand_positions(positions: Mapping[str, list[str]], ids: Sequence[str],
                     existing: set[tuple[str, str]],
                     exact: Mapping[str, Sequence[str]] | None = None) -> tuple[list[Edge], dict[str, Any]]:
    edges: list[Edge] = []
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
                edges.append(Edge(src, dst, EDGE_POSITION, f"場所事件「{name}」"))
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


@dataclass
class SystemEntries:
    entries: list[dict[str, str]]
    sources: dict[str, str]
    stats: dict[str, Any]


def build_system_entries(probe: Mapping[str, Any] | None, ids: Iterable[str]) -> SystemEntries:
    id_set = set(ids)
    payload = probe or {}
    entries = [dict(item) for item in HARDCODED_ENTRIES if item["id"] in id_set]
    sources = {sid: source for sid, source in (payload.get("entries") or {}).items() if sid in id_set}
    stats = {
        "hardcoded": len(entries),
        "hardcoded_missing": [item["id"] for item in HARDCODED_ENTRIES if item["id"] not in id_set],
        "entry_sources": sources,
        "asset_probe": summarize_probe(dict(payload)),
    }
    return SystemEntries(entries, sources, stats)


def assemble_nodes(node_ids: Sequence[str], models: Mapping[str, ScriptAnalysis],
                   chapter_of: Mapping[str, int], out_degree: Mapping[str, int],
                   in_degree: Mapping[str, int], system_in: Mapping[str, int],
                   facets: Mapping[str, Facets], empty: set[str], simplified: set[str],
                   entries: Mapping[str, str], times: Mapping[str, int]) -> list[NodeRecord]:
    nodes: list[NodeRecord] = []
    for sid in node_ids:
        flags = NodeFlags(
            empty=sid in empty,
            simplified_only=sid in simplified,
            no_out=out_degree.get(sid, 0) == 0,
            no_in=in_degree.get(sid, 0) == 0,
        )
        nodes.append(NodeRecord(
            id=sid,
            chapter=chapter_of.get(sid, 0),
            out_degree=out_degree.get(sid, 0),
            in_degree=in_degree.get(sid, 0),
            say=int(models[sid].stats.get("say", 0)),
            system_in=system_in.get(sid, 0),
            flags=flags,
            facets=facets.get(sid, Facets()),
            entry=entries.get(sid),
            time=times.get(sid),
        ))
    return nodes
