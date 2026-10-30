from __future__ import annotations

import gzip
import hashlib
import json
import re
import time
from collections.abc import Iterable
from pathlib import Path

from . import flow
from .paths import CACHE_DIR


def log(message: str) -> None:
    print(message, flush=True)


_LITERAL = re.compile(r'"([A-Za-z][A-Za-z0-9_]{2,60})"')

MAX_EDGE_LABEL = 60

FACET_FIELDS = ("speakers", "flags", "checks", "stats", "rels", "options", "locks", "dice")

CHECK_RE = re.compile(r"(?:條件|分支判定|骰子判定|場所事件)「([^」]+)」")


def collect_facets(beats: list[list], reads: Iterable[str] | None = None) -> list:
    speakers: set[str] = set()
    flags: set[str] = set()
    checks: set[str] = set()
    stats: set[str] = set()
    rels: set[str] = set()
    options = locks = dice = 0

    def walk(rows: list[list]) -> None:
        nonlocal options, locks, dice
        for beat in rows:
            if not isinstance(beat, list) or not beat:
                continue
            tag = beat[0]
            if tag == "say":
                speaker = beat[1] if len(beat) > 1 else None
                if speaker:
                    speakers.add(speaker)
            elif tag == "meta":
                kind = beat[1] if len(beat) > 1 else ""
                key = beat[2] if len(beat) > 2 else ""
                if not key:
                    continue
                if kind == "flag":
                    flags.add(key)
                elif kind == "stat":
                    stats.add(key)
                elif kind == "rel":
                    rels.add(key)
                elif kind == "dice":
                    checks.add(key)
                    dice += 1
            elif tag == "branch":
                label = beat[1] if len(beat) > 1 else ""
                for found in CHECK_RE.findall(label or ""):
                    checks.add(found)
                if len(beat) > 2 and isinstance(beat[2], list):
                    walk(beat[2])
            elif tag in ("choice", "_choice"):
                branches = beat[1] if len(beat) > 1 and isinstance(beat[1], list) else []
                options += len(branches)
                for branch in branches:
                    if not isinstance(branch, list):
                        continue
                    if len(branch) > 1 and branch[1]:
                        dice += 1
                    if len(branch) > 3 and branch[3]:
                        locks += 1
                    if len(branch) > 2 and isinstance(branch[2], list):
                        walk(branch[2])

    walk(beats)
    if reads:
        checks.update(key for key in reads if key)
    return [
        ",".join(sorted(speakers)),
        ",".join(sorted(flags)),
        ",".join(sorted(checks)),
        ",".join(sorted(stats)),
        ",".join(sorted(rels)),
        options,
        locks,
        dice,
    ]


def load_cache(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with gzip.open(path, "rt", encoding="utf-8") as fp:
            return json.load(fp)
    except Exception:
        return {}


def save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as fp:
        json.dump(cache, fp, ensure_ascii=False)


def analyze_all(sources: dict[str, str], use_cache: bool) -> tuple[dict[str, dict], int, int]:
    cache_path = CACHE_DIR / "analysis.json.gz"
    cache = load_cache(cache_path) if use_cache else {}
    models: dict[str, dict] = {}
    reused = failed = 0
    started = time.time()
    for sid, source in sorted(sources.items()):
        sig = hashlib.sha1(f"{flow.FLOW_VERSION}:{source}".encode("utf-8")).hexdigest()[:16]
        hit = cache.get(sid)
        if hit and hit.get("sig") == sig:
            models[sid] = hit["model"]
            reused += 1
            continue
        try:
            models[sid] = flow.analyze(sid, source)
        except Exception as exc:
            failed += 1
            models[sid] = {"id": sid, "beats": [], "edges": [], "dynamic": [],
                           "warnings": [f"analysis failed: {exc}"], "reads": [],
                           "stats": {"say": 0, "choice": 0, "fx": 0, "beats": 0, "reads": 0}}
        cache[sid] = {"sig": sig, "model": models[sid]}
    if use_cache:
        save_cache(cache_path, cache)
    log(f"[1/4] semantic analysis: {len(sources)} scripts (reused {reused}, "
        f"analyzed {len(sources) - reused}, failed {failed}), {time.time() - started:.1f}s")
    return models, reused, failed


def collect_edges(models: dict[str, dict], sources: dict[str, str]) -> tuple[list[list], list[str]]:
    ids = set(models)
    seen: dict[tuple[str, str, str], int] = {}
    edges: list[list] = []
    dynamic: list[str] = []

    for sid, model in models.items():
        for target, kind, label in model["edges"]:
            if target not in ids:
                dynamic.append(f"{sid} -> {target} (missing target)")
                continue
            key = (sid, target, kind)
            if key in seen:
                index = seen[key]
                if label and label not in edges[index][3]:
                    edges[index][3] = (edges[index][3] + " / " + label)[:MAX_EDGE_LABEL]
                continue
            seen[key] = len(edges)
            edges.append([sid, target, kind, (label or "")[:MAX_EDGE_LABEL]])

    inferred = 0
    adjacency: dict[str, set[str]] = {}
    for edge in edges:
        adjacency.setdefault(edge[0], set()).add(edge[1])
    for sid, source in sources.items():
        existing = adjacency.get(sid)
        if existing is None:
            existing = adjacency[sid] = set()
        for literal in sorted(set(_LITERAL.findall(source))):
            if literal == sid or literal not in ids or literal in existing:
                continue
            existing.add(literal)
            edges.append([sid, literal, "inferred", ""])
            inferred += 1
    dynamic.extend(f"{sid} contains dynamic jumps" for sid, model in models.items() for _ in model["dynamic"][:1])
    temp = sum(1 for edge in edges if edge[2] in ("temp", "travel"))
    log(f"[2/4] edges: {len(edges) - inferred - temp} jumps + {temp} temp/travel"
        f" + {inferred} inferred ({len(dynamic)} dynamic jumps)")
    return edges, dynamic
