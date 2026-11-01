from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

from ..game.profile import HARDCODED_ENTRIES
from ..model import Edge, Facets, NodeFlags, NodeRecord, ScriptAnalysis
from ..versions import MAX_EDGE_LABEL
from ..vocab import EDGE_INFERRED, EDGE_POSITION


@dataclass(frozen=True)
class CollectedEdges:
    edges: list[Edge]
    dynamic: list[str]
    inferred: int
    adjacency: dict[str, set[str]]
    out_degree: dict[str, int]
    in_degree: dict[str, int]


def collect_edges(models: Mapping[str, ScriptAnalysis],
                  literals: Mapping[str, Sequence[str]]) -> CollectedEdges:
    ids = set(models)
    seen: dict[tuple[str, str, str], int] = {}
    edges: list[Edge] = []
    dynamic: list[str] = []
    adjacency: dict[str, set[str]] = {}
    out_degree: dict[str, int] = {sid: 0 for sid in sorted(models)}
    in_degree: dict[str, int] = {sid: 0 for sid in sorted(models)}

    for sid, model in models.items():
        for edge in model.edges:
            if edge.target not in ids:
                dynamic.append(f"{sid} -> {edge.target} (missing target)")
                continue
            key = (sid, edge.target, edge.kind)
            index = seen.get(key)
            if index is not None:
                label = edge.label
                if label and label not in edges[index].label:
                    merged = (edges[index].label + " / " + label)[:MAX_EDGE_LABEL]
                    edges[index] = replace(edges[index], label=merged)
                continue
            seen[key] = len(edges)
            edges.append(Edge(sid, edge.target, edge.kind, (edge.label or "")[:MAX_EDGE_LABEL]))
            adjacency.setdefault(sid, set()).add(edge.target)
            out_degree[sid] += 1
            in_degree[edge.target] += 1

    inferred = 0
    for sid, candidates in literals.items():
        existing = adjacency.setdefault(sid, set())
        for literal in candidates:
            if literal == sid or literal not in ids or literal in existing:
                continue
            existing.add(literal)
            edges.append(Edge(sid, literal, EDGE_INFERRED, ""))
            out_degree[sid] += 1
            in_degree[literal] += 1
            inferred += 1
    for sid, model in models.items():
        for item in model.dynamic[:1]:
            dynamic.append(f"{sid} contains dynamic jumps: {item}")

    return CollectedEdges(edges, dynamic, inferred, adjacency, out_degree, in_degree)


def _prefix_targets(name: str, ids: Sequence[str]) -> list[str]:
    prefix = name.lower() + "_"
    return [sid for sid in ids if sid.lower().startswith(prefix)]


def expand_positions(positions: Mapping[str, list[str]], ids: Sequence[str],
                     adjacency: dict[str, set[str]],
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
            existing = adjacency.setdefault(src, set())
            for dst in targets:
                if dst in existing:
                    continue
                existing.add(dst)
                edges.append(Edge(src, dst, EDGE_POSITION, name,
                                  {"kind": EDGE_POSITION, "name": name}))
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
    missing: list[str]


def build_system_entries(probe: Mapping[str, Any] | None, ids: Iterable[str]) -> SystemEntries:
    id_set = set(ids)
    payload = probe or {}
    entries = [dict(item) for item in HARDCODED_ENTRIES if item["id"] in id_set]
    sources = {sid: source for sid, source in (payload.get("entries") or {}).items() if sid in id_set}
    missing = [item["id"] for item in HARDCODED_ENTRIES if item["id"] not in id_set]
    return SystemEntries(entries, sources, missing)


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
            say=models[sid].say_count,
            system_in=system_in.get(sid, 0),
            flags=flags,
            facets=facets.get(sid, Facets()),
            entry=entries.get(sid),
            time=times.get(sid),
        ))
    return nodes
