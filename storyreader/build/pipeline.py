from __future__ import annotations

import hashlib
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import flow
from ..cache import CacheKey, dump_json, load_envelope, read_json, save_envelope, write_json
from ..config import (
    ANALYSIS_CACHE_VERSION,
    CACHE_DIR,
    CHECKPOINTS_PATH,
    CHECKPOINT_SHARDS,
    ENTRIES_PATH,
    FLOW_VERSION,
    LOCALE_DIR,
    LORE_PATH,
    LORE_VERSION,
    LUA_DIR,
    MANIFEST_PATH,
    REPORT_PATH,
    SCHEMA_VERSION,
    WEB_DATA_DIR,
    game_root,
    install_dir,
    managers_path,
    steamapps_dir,
)
from ..console import Reporter
from ..emit import (
    write_checkpoint_shards,
    write_graph,
    write_text_full,
    write_text_head,
    write_text_shard,
    write_wordcount,
)
from ..game.entries import summarize as summarize_probe
from ..game.info import read_game_info
from ..model import Edge, Facets, GameInfo, ScriptAnalysis, analysis_from_wire, analysis_to_wire
from ..wire import EDGE_KINDS, FACET_FIELDS
from .chapters import build_chapters, classify
from .facets import collect_facets
from .graph import (
    assemble_nodes,
    build_system_entries,
    collect_edges,
    expand_positions,
    find_positions,
)
from .render import Renderer
from .report import compose, fmt_bytes, write_report
from .sharding import assign_checkpoints, pack_stories
from .times import explicit_times, format_rounds
from .wordcount import KINDS, WordCounter, add_row, totals, zero_row


@dataclass
class BuildResult:
    ok: bool
    scripts: int
    edges: int
    chapters: int
    languages: dict[str, Any]
    report_path: Path


@dataclass
class LanguageRender:
    lang: str
    stories: dict[str, list]
    rows: dict[str, list[list[int]]]
    chapters: dict[str, list[list[int]]]
    characters: dict[str, str]
    names: dict[str, dict[str, str]]
    edge_labels: dict[str, str]
    metrics: dict[str, Any]
    missing: list[str]
    seconds: float


def _load_sources(reporter: Reporter) -> dict[str, str]:
    if not LUA_DIR.is_dir():
        reporter.error("data/lua not found, run extract.py first")
        return {}
    sources = {}
    for path in sorted(LUA_DIR.glob("*.lua")):
        sources[path.stem] = path.read_text(encoding="utf-8")
    if not sources:
        reporter.error("data/lua is empty, run extract.py first")
    return sources


def _analyze_all(sources: dict[str, str], use_cache: bool,
                 reporter: Reporter) -> tuple[dict[str, ScriptAnalysis], int, int]:
    cache_path = CACHE_DIR / "analysis.json.gz"
    cached = load_envelope(cache_path, CacheKey(FLOW_VERSION, "per-script")) if use_cache else None
    entries: dict[str, Any] = cached if isinstance(cached, dict) else {}
    models: dict[str, ScriptAnalysis] = {}
    reused = 0
    failed = 0
    started = time.time()
    for sid, source in sorted(sources.items()):
        signature = hashlib.sha1(
            f"{ANALYSIS_CACHE_VERSION}:{FLOW_VERSION}:{source}".encode("utf-8")).hexdigest()[:16]
        hit = entries.get(sid)
        if isinstance(hit, dict) and hit.get("sig") == signature:
            try:
                models[sid] = analysis_from_wire(hit.get("payload") or {})
                reused += 1
                continue
            except (KeyError, TypeError, ValueError):
                pass
        try:
            models[sid] = flow.analyze(sid, source)
        except Exception as exc:
            failed += 1
            models[sid] = ScriptAnalysis(
                id=sid, warnings=[f"analysis failed: {type(exc).__name__}: {exc}"])
        entries[sid] = {"sig": signature, "payload": analysis_to_wire(models[sid])}
    if use_cache:
        save_envelope(cache_path, CacheKey(FLOW_VERSION, "per-script"), entries)
    reporter.stage(1, 4, "semantic analysis")
    reporter.info(
        f"{len(sources)} scripts (reused {reused}, analyzed {len(sources) - reused},"
        f" failed {failed}), {time.time() - started:.1f}s"
    )
    return models, reused, failed


def _load_locales(langs: tuple[str, ...], reporter: Reporter) -> dict[str, dict] | None:
    locales: dict[str, dict] = {}
    for lang in langs:
        payload = read_json(LOCALE_DIR / f"{lang}.json")
        if not isinstance(payload, dict):
            reporter.error(f"missing or invalid locale table for {lang}, run extract.py first")
            return None
        locales[lang] = payload
    return locales


def _names_of(locale: dict, namespace: str, keys: set[str]) -> dict[str, str]:
    table = locale.get(namespace) or {}
    return {key: table[key] for key in sorted(keys) if key in table}


def _load_lore(reporter: Reporter) -> dict[str, str]:
    payload = read_json(LORE_PATH)
    if not isinstance(payload, dict):
        reporter.warn("data/lore.json missing; lore entries fall back to LegendInfo only")
        return {}
    if payload.get("version") != LORE_VERSION:
        reporter.warn(
            f"data/lore.json version {payload.get('version')} does not match {LORE_VERSION};"
            " rerun extract.py"
        )
        return {}
    items = payload.get("items")
    if not isinstance(items, dict):
        return {}
    return {
        key: value for key, value in items.items()
        if isinstance(key, str) and isinstance(value, str) and value
    }


def render_language(lang: str, locale: dict, node_ids: list[str],
                    models: dict[str, ScriptAnalysis], chapter_of_id: dict[str, str],
                    chapters, facets: dict[str, Facets], edges: list[Edge],
                    lore: dict[str, str] | None = None) -> LanguageRender:
    started = time.time()
    renderer = Renderer(locale, lang, lore_fallback=lore)
    stories: dict[str, list] = {}
    rows: dict[str, list[list[int]]] = {}
    for sid in node_ids:
        counter = WordCounter()
        renderer.counter = counter
        beats = renderer.render(models[sid].beats)
        if beats:
            stories[sid] = beats
        rows[sid] = counter.row()

    chapter_totals = {chapter.id: zero_row() for chapter in chapters}
    for sid in node_ids:
        chapter_id = chapter_of_id[sid]
        if chapter_id in chapter_totals:
            add_row(chapter_totals[chapter_id], rows[sid])

    used_flags = {key for row in facets.values() for key in row.flags}
    used_checks = {key for row in facets.values() for key in row.checks}
    used_stats = {key for row in facets.values() for key in row.stats}
    used_rels = {key for row in facets.values() for key in row.rels}

    names = {
        "flags": _names_of(locale, "Flag", used_flags),
        "checks": _names_of(locale, "DiceHeader", used_checks),
        "stats": _names_of(locale, "PlayerStat", used_stats),
        "rels": _names_of(locale, "Character", used_rels),
    }

    edge_labels: dict[str, str] = {}
    for index, edge in enumerate(edges):
        if not edge.label:
            continue
        label = renderer.edge_label(edge.label)
        if label:
            edge_labels[str(index)] = label

    metrics = {
        "options": renderer.option_count,
        "locked": renderer.locked_count,
        "rich": renderer.rich_count,
        "think": renderer.think_count,
        "think_named": renderer.think_named_count,
        "lore": renderer.lore_count,
        "lore_fallback": renderer.lore_fallback_count,
        "lore_missing": renderer.lore_missing_count,
        "lore_missing_samples": renderer.lore_missing[:40],
        "missing": renderer.missing_count,
    }
    return LanguageRender(
        lang=lang,
        stories=stories,
        rows=rows,
        chapters=chapter_totals,
        characters=renderer.character_table(),
        names=names,
        edge_labels=edge_labels,
        metrics=metrics,
        missing=renderer.missing,
        seconds=round(time.time() - started, 1),
    )


def _write_language(render: LanguageRender, shard_of: dict[str, str],
                    shards: list[dict], full_text: bool) -> tuple[list[tuple[str, int]], dict[str, Any]]:
    lang = render.lang
    parts: list[tuple[str, int]] = []
    if full_text:
        payload = {
            "schema": SCHEMA_VERSION,
            "lang": lang,
            "characters": render.characters,
            "names": render.names,
            "edgeLabels": render.edge_labels,
            "missing": render.metrics["missing"],
            "missingKeys": render.missing[:200],
            "stories": render.stories,
            "shardKeys": [],
            "fullText": True,
        }
        size = write_text_full(WEB_DATA_DIR / f"text-{lang}.js", lang, payload)
        parts.append((f"text-{lang}.js", size))
        head_size = size
        shard_bytes = 0
    else:
        shard_keys = [shard["key"] for shard in shards]
        payload = {
            "schema": SCHEMA_VERSION,
            "lang": lang,
            "characters": render.characters,
            "names": render.names,
            "edgeLabels": render.edge_labels,
            "missing": render.metrics["missing"],
            "missingKeys": render.missing[:200],
            "stories": {},
            "shardKeys": shard_keys,
            "fullText": False,
        }
        head_size = write_text_head(WEB_DATA_DIR / f"text-{lang}-head.js", lang, payload)
        parts.append((f"text-{lang}-head.js", head_size))
        buckets: dict[str, dict[str, list]] = {key: {} for key in shard_keys}
        for sid in render.stories:
            key = shard_of.get(sid)
            if key in buckets:
                buckets[key][sid] = render.stories[sid]
        shard_bytes = 0
        for shard in shards:
            written = write_text_shard(
                WEB_DATA_DIR / f"text-{lang}-{shard['key']}.js", lang, buckets[shard["key"]])
            parts.append((f"text-{lang}-{shard['key']}.js", written))
            shard_bytes += written

    report = {
        "stories": len(render.stories),
        "characters": len(render.characters),
        "options": render.metrics["options"],
        "locked_options": render.metrics["locked"],
        "rich_text": render.metrics["rich"],
        "think": render.metrics["think"],
        "think_named": render.metrics["think_named"],
        "lore": render.metrics["lore"],
        "lore_fallback": render.metrics["lore_fallback"],
        "lore_missing": render.metrics["lore_missing"],
        "lore_missing_samples": render.metrics["lore_missing_samples"],
        "edge_labels": len(render.edge_labels),
        "missing_keys": render.metrics["missing"],
        "missing_samples": render.missing[:40],
        "head_bytes": head_size,
        "shard_count": len(shards),
        "shard_bytes": shard_bytes,
        "seconds": render.seconds,
    }
    return parts, report


def _count_checkpoint_kinds(items: dict[str, Any]) -> dict[str, int]:
    kinds: dict[str, int] = {}
    for model in items.values():
        if not isinstance(model, dict):
            continue
        kind = model.get("kind", "?")
        kinds[kind] = kinds.get(kind, 0) + 1
    return kinds


def _sanitize_model(model: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(model)
    branches = []
    for branch in model.get("branches") or []:
        if not isinstance(branch, dict):
            continue
        item = dict(branch)
        expr = item.get("expr")
        if expr is not None and not (isinstance(expr, dict) and "tag" in expr):
            item.pop("expr", None)
        branches.append(item)
    sanitized["branches"] = branches
    variants = model.get("variants")
    if isinstance(variants, list):
        cleaned = [_sanitize_model(variant) for variant in variants if isinstance(variant, dict)]
        if cleaned:
            sanitized["variants"] = cleaned
        else:
            sanitized.pop("variants", None)
    return sanitized


def _sanitize_checkpoints(items: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, model in items.items():
        if not isinstance(model, dict):
            continue
        out[key] = _sanitize_model(model)
    return out


DICE_NAMESPACE = {0: "PlayerStat", 1: "Character", 2: "PlayerTalent", 3: "Flag"}
DICE_NAME_PREFIX = {2: "Name/", 3: "Name/"}

_SEGMENT_SPLIT = re.compile(r"[^0-9A-Za-z]+")
_TOKEN_SPLIT = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+")


def _name_segments(name: str) -> list[str]:
    segments: list[str] = []
    for chunk in _SEGMENT_SPLIT.split(name or ""):
        if not chunk:
            continue
        tokens: list[str] = []
        for token in _TOKEN_SPLIT.findall(chunk):
            if token.isdigit() and tokens:
                tokens[-1] += token
            else:
                tokens.append(token.lower())
        segments.extend(tokens)
    return segments


def _dice_label(addition: dict[str, Any], locale: dict[str, Any]) -> str:
    kind = addition.get("type")
    namespace = DICE_NAMESPACE.get(kind)
    if namespace is None:
        return ""
    table = locale.get(namespace) or {}
    if not isinstance(table, dict):
        return ""
    prefix = DICE_NAME_PREFIX.get(kind, "")
    name = str(addition.get("name") or "")
    keys: list[str] = []
    if kind == 3:
        keys.append(prefix + name)
    else:
        ident = str(addition.get("id") or "")
        if kind == 2 and ident:
            keys.append(prefix + ident)
        segments = _name_segments(name)
        for index in range(len(segments)):
            keys.append(prefix + "-".join(segments[index:]))
    for key in keys:
        value = table.get(key)
        if value:
            return str(value)
    return ""


def _localize_model(model: dict[str, Any], locales: dict[str, dict[str, Any]]) -> None:
    for addition in model.get("additions") or []:
        if not isinstance(addition, dict):
            continue
        labels: dict[str, str] = {}
        for lang, locale in locales.items():
            label = _dice_label(addition, locale)
            if label:
                labels[lang] = label
        if labels:
            addition["label"] = labels
    for variant in model.get("variants") or []:
        if isinstance(variant, dict):
            _localize_model(variant, locales)


def _localize_checkpoints(items: dict[str, Any], locales: dict[str, dict[str, Any]]) -> None:
    for model in items.values():
        if isinstance(model, dict):
            _localize_model(model, locales)


def _game_info() -> GameInfo:
    root = game_root()
    if root is None:
        manifest = read_json(MANIFEST_PATH)
        raw = (manifest or {}).get("game") if isinstance(manifest, dict) else None
        if isinstance(raw, str) and raw.strip():
            root = Path(raw)
    if root is None or not managers_path(root).exists():
        return GameInfo()
    return read_game_info(managers_path(root), steamapps_dir(root), install_dir(root))


def _gap_report(blob: dict[str, Any]) -> dict[str, Any]:
    gaps = blob.get("gaps") or []
    by_reason: dict[str, int] = {}
    for gap in gaps:
        if isinstance(gap, dict):
            reason = str(gap.get("reason") or "?")
            by_reason[reason] = by_reason.get(reason, 0) + 1
    return {"total": len(gaps), "by_reason": by_reason}


def run_build(*, langs: tuple[str, ...], default_lang: str,
              use_cache: bool = True, full_text: bool = False,
              reporter: Reporter | None = None) -> BuildResult:
    reporter = reporter or Reporter()
    if not langs:
        reporter.error("no language selected; pass --langs zh-tw,zh-cn")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)

    sources = _load_sources(reporter)
    if not sources:
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)

    manifest = read_json(MANIFEST_PATH)
    anomalies = (manifest or {}).get("anomalies") or {}
    simplified = set(anomalies.get("simplified_only") or [])
    empty = set(anomalies.get("empty") or [])

    models, reused, failed = _analyze_all(sources, use_cache, reporter)

    edges, dynamic, inferred = collect_edges(models, sources)
    scene_total = sum(model.scene_count for model in models.values())
    node_ids = sorted(models)
    chapters, chapter_index = build_chapters(node_ids)
    chapter_of_id = {sid: classify(sid)[0] for sid in node_ids}
    chapter_index_map = {sid: chapter_index[chapter_of_id[sid]] for sid in node_ids}

    out_degree: dict[str, int] = {sid: 0 for sid in node_ids}
    in_degree: dict[str, int] = {sid: 0 for sid in node_ids}
    for edge in edges:
        out_degree[edge.source] += 1
        in_degree[edge.target] += 1

    facets = {sid: collect_facets(models[sid].beats, models[sid].reads) for sid in node_ids}
    times = explicit_times(sources)

    probe = read_json(ENTRIES_PATH) or {}
    system = build_system_entries(probe, node_ids)
    existing_pairs = {(edge.source, edge.target) for edge in edges}
    position_edges, position_stats = expand_positions(
        find_positions(sources), node_ids, existing_pairs, probe.get("positions") or {})
    edges.extend(position_edges)
    system_in: dict[str, int] = {sid: 0 for sid in node_ids}
    for edge in position_edges:
        system_in[edge.target] += 1

    reporter.stage(2, 4, "graph")
    reporter.info(
        f"{len(edges)} edges ({inferred} inferred, {len(position_edges)} position),"
        f" {len(dynamic)} dynamic jumps"
    )
    reporter.info(f"{scene_total} scene switches")
    reporter.info(f"{len(chapters)} chapters; {len(times)} scripts with a fixed date")
    if times:
        reporter.info(
            f"time range: {format_rounds(min(times.values()))} -> {format_rounds(max(times.values()))}")
    reporter.info(
        f"system entries: {len(system.entries)} hardcoded, {len(system.sources)} from assets,"
        f" positions exact {position_stats['exact_names']} + prefix {position_stats['prefix_names']}"
        f"/{position_stats['names']}"
    )
    probe_summary = summarize_probe(dict(probe))
    if not probe_summary["ok"]:
        reporter.info(f"system entry probe: {probe_summary['reason']}")

    nodes = assemble_nodes(
        node_ids, models, chapter_index_map, out_degree, in_degree, system_in, facets,
        empty, simplified, system.sources, times,
    )

    locales = _load_locales(langs, reporter)
    if locales is None:
        return BuildResult(False, len(node_ids), len(edges), len(chapters), {}, REPORT_PATH)
    lore = _load_lore(reporter)

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    reporter.stage(3, 4, "render")
    renders: dict[str, LanguageRender] = {}
    for lang in langs:
        renders[lang] = render_language(
            lang, locales[lang], node_ids, models, chapter_of_id, chapters, facets, edges, lore)
        metrics = renders[lang].metrics
        reporter.info(
            f"rendered {lang}: {len(renders[lang].stories)} scripts, {metrics['options']} options"
            f" ({metrics['locked']} locked), {metrics['rich']} rich text,"
            f" {metrics['missing']} missing keys"
        )
        reporter.info(
            f"inner monologue {metrics['think']} ({metrics['think_named']} with a speaker),"
            f" lore {metrics['lore']} (fallback {metrics['lore_fallback']},"
            f" unresolved {metrics['lore_missing']})"
        )

    if full_text:
        shard_of: dict[str, str] = {}
        shards: list[dict] = []
    else:
        sizes = {
            sid: len(dump_json(renders[langs[0]].stories.get(sid, [])).encode("utf-8"))
            for sid in node_ids
        }
        shard_of, shards = pack_stories(
            node_ids, sizes, chapter_index_map, [chapter.id for chapter in chapters])
        largest = max((shard["bytes"] for shard in shards), default=0)
        reporter.info(
            f"story shards: {len(shards)} (largest {fmt_bytes(largest)},"
            f" budget {fmt_bytes(sum(shard['bytes'] for shard in shards))})"
        )

    parts: list[tuple[str, int]] = []
    languages: dict[str, Any] = {}
    wordcount_langs: dict[str, Any] = {}
    for lang in langs:
        written, language_report = _write_language(renders[lang], shard_of, shards, full_text)
        parts.extend(written)
        languages[lang] = language_report
        wordcount_langs[lang] = {"chapters": renders[lang].chapters, "stories": renders[lang].rows}
        reporter.info(
            f"wrote {lang}: head {fmt_bytes(language_report['head_bytes'])}"
            + ("" if full_text else
               f", {language_report['shard_count']} shards {fmt_bytes(language_report['shard_bytes'])}")
        )

    wordcount_payload = {"schema": SCHEMA_VERSION, "kinds": list(KINDS), "langs": wordcount_langs}
    wordcount_size = write_wordcount(WEB_DATA_DIR / "wordcount.js", wordcount_payload)
    parts.append(("wordcount.js", wordcount_size))

    checkpoint_blob = read_json(CHECKPOINTS_PATH)
    if not isinstance(checkpoint_blob, dict):
        checkpoint_blob = {}
    raw_items = checkpoint_blob.get("items")
    checkpoint_items = _sanitize_checkpoints(raw_items if isinstance(raw_items, dict) else {})
    _localize_checkpoints(checkpoint_items, locales)
    checkpoint_variants = sum(
        len(model.get("variants") or []) for model in checkpoint_items.values())
    checkpoint_parts: list[dict[str, Any]] = []
    checkpoint_mapping: dict[str, int] = {}
    if checkpoint_items:
        checkpoint_mapping = assign_checkpoints(sorted(checkpoint_items), CHECKPOINT_SHARDS)
        checkpoint_parts = write_checkpoint_shards(WEB_DATA_DIR, checkpoint_items, checkpoint_mapping)
        parts.extend((item["name"], item["bytes"]) for item in checkpoint_parts)
        reporter.info(
            f"checkpoint conditions: {len(checkpoint_items)} in {len(checkpoint_parts)} shards,"
            f" {checkpoint_variants} variants,"
            f" {fmt_bytes(sum(item['bytes'] for item in checkpoint_parts))} total"
        )
    else:
        reporter.info("checkpoint conditions: none")

    game = _game_info()
    if game.version or game.build:
        reporter.info("game version: " + " · ".join(piece for piece in (
            f"v{game.version}" if game.version else "",
            f"build {game.build}" if game.build else "",
            f"updated {game.updated}" if game.updated else "",
        ) if piece))
    else:
        reporter.info("game version: unavailable (normal when the game is not installed)")

    graph_payload = {
        "schema": SCHEMA_VERSION,
        "meta": {
            "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "game": game.to_wire(),
            "langs": list(langs),
            "defaultLang": default_lang,
            "counts": {
                "scripts": len(node_ids),
                "edges": len(edges),
                "chapters": len(chapters),
                "dynamicJumps": len(dynamic),
            },
            "fullText": bool(full_text),
            "shards": shards,
            "shardOf": shard_of,
            "checkpointShards": checkpoint_mapping,
            "entries": system.entries,
        },
        "chapters": [chapter.to_wire() for chapter in chapters],
        "nodes": [node.to_wire() for node in nodes],
        "edges": [edge.to_wire(index) for index, edge in enumerate(edges)],
    }
    graph_size = write_graph(WEB_DATA_DIR / "graph.js", graph_payload)
    parts.append(("graph.js", graph_size))

    keep = {name for name, _ in parts}
    removed = 0
    for path in sorted(WEB_DATA_DIR.glob("*.js")):
        if path.name not in keep:
            path.unlink()
            removed += 1
    if removed:
        reporter.info(f"removed {removed} stale artifacts")
    write_json(CACHE_DIR / "artifacts.json", {"files": sorted(keep)}, indent=2)

    edge_counts = {kind: sum(1 for edge in edges if edge.kind == kind) for kind in EDGE_KINDS}
    node_counts = {
        "empty": len(empty),
        "simplified_only": len(simplified),
        "no_incoming": sum(1 for sid in node_ids if in_degree[sid] == 0),
        "no_incoming_after_system": sum(
            1 for sid in node_ids if in_degree[sid] == 0 and system_in[sid] == 0),
        "no_incoming_after_entries": sum(
            1 for sid in node_ids if in_degree[sid] == 0 and sid not in system.sources),
        "system_in": sum(1 for sid in node_ids if system_in[sid] > 0),
        "entry_sources": len(system.sources),
        "no_outgoing": sum(1 for sid in node_ids if out_degree[sid] == 0),
    }
    facet_report = {
        "fields": list(FACET_FIELDS),
        "speakers": len({key for row in facets.values() for key in row.speakers}),
        "flags": len({key for row in facets.values() for key in row.flags}),
        "checks": len({key for row in facets.values() for key in row.checks}),
        "stats": len({key for row in facets.values() for key in row.stats}),
        "rels": len({key for row in facets.values() for key in row.rels}),
        "scripts_with_flag": sum(1 for row in facets.values() if row.flags),
        "scripts_with_check": sum(1 for row in facets.values() if row.checks),
        "scripts_with_lock": sum(1 for row in facets.values() if row.locks),
        "scripts_with_dice": sum(1 for row in facets.values() if row.dice),
        "scripts_with_options": sum(1 for row in facets.values() if row.options),
    }
    checkpoint_report = {
        "resolved": len(checkpoint_items),
        "variants": checkpoint_variants,
        "bytes": sum(item["bytes"] for item in checkpoint_parts),
        "mode": "shards" if checkpoint_parts else "none",
        "shards": len(checkpoint_parts),
        "by_kind": _count_checkpoint_kinds(checkpoint_items),
        "gaps": _gap_report(checkpoint_blob),
    }
    wordcount_report: dict[str, Any] = {}
    for lang in langs:
        data = wordcount_langs[lang]
        sums = totals(data["chapters"])
        wordcount_report[lang] = {
            "chapters": len(data["chapters"]),
            "stories": len(data["stories"]),
            "by_kind": {
                kind: {"zh": pair[0], "en": pair[1], "sum": pair[0] + pair[1]}
                for kind, pair in zip(KINDS, sums)
            },
            "total": {
                "zh": sum(pair[0] for pair in sums),
                "en": sum(pair[1] for pair in sums),
                "sum": sum(pair[0] + pair[1] for pair in sums),
            },
        }
        reporter.info(
            f"word count {lang}: {wordcount_report[lang]['total']['sum']} chars"
            f" ({wordcount_report[lang]['stories']} scripts)"
        )

    default_metrics = (renders[default_lang].metrics
                       if default_lang in renders else renders[langs[0]].metrics)
    lore_manifest = (manifest or {}).get("lore_stats") or {}
    lore_report = {
        "items": len(lore),
        "wanted": lore_manifest.get("wanted", 0),
        "resolved": lore_manifest.get("resolved", 0),
        "unresolved": lore_manifest.get("unresolved", 0),
        "fallback": default_metrics.get("lore_fallback", 0),
        "missing": default_metrics.get("lore_missing", 0),
        "samples": default_metrics.get("lore_missing_samples", []),
    }
    report_payload = compose(
        generated=time.strftime("%Y-%m-%d %H:%M:%S"),
        scripts=len(node_ids),
        edge_counts=edge_counts,
        node_counts=node_counts,
        entries={
            "hardcoded": system.entries,
            "hardcoded_missing": system.stats.get("hardcoded_missing", []),
            "position": position_stats,
            "asset_probe": probe_summary,
        },
        facets=facet_report,
        checkpoints=checkpoint_report,
        lore=lore_report,
        wordcount={"bytes": wordcount_size, "langs": wordcount_report},
        times={"explicit": len(times), "scripts": sorted(times)},
        chapters=[chapter.to_wire() for chapter in chapters],
        text={
            "mode": "full" if full_text else "shards",
            "shard_count": len(shards),
            "largest_shard_kb": max((round(shard["bytes"] / 1024) for shard in shards), default=0),
            "shards": shards,
        },
        languages=languages,
        dynamic=dynamic,
        analysis={
            "failed": failed,
            "cache_reused": reused,
            "inferred_edges": inferred,
            "scene_switches": scene_total,
        },
        artifacts=[{"name": name, "size": size} for name, size in parts],
    )
    write_report(REPORT_PATH, report_payload)

    reporter.stage(4, 4, "output")
    reporter.info("graph.js " + fmt_bytes(graph_size) + ", " + ", ".join(
        f"{name} {fmt_bytes(size)}" for name, size in parts
        if name != "graph.js" and not name.startswith("checkpoints-")))
    reporter.info(f"{len(node_ids)} nodes / {len(edges)} edges / {len(chapters)} chapters")
    reporter.info(f"report -> {REPORT_PATH}")
    if failed:
        reporter.warn(
            f"{failed} scripts failed to parse and were degraded to empty text (see report.json)")
    if not any(languages[lang]["stories"] for lang in langs):
        reporter.error("all scripts rendered empty, check the extraction output")
        return BuildResult(False, len(node_ids), len(edges), len(chapters), languages, REPORT_PATH)
    return BuildResult(True, len(node_ids), len(edges), len(chapters), languages, REPORT_PATH)
