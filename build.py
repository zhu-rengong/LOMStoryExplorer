#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

from lib import emit, entries, gameinfo, gametime, paths, wordcount
from lib.chapters import build_chapters, classify
from lib.paths import (CHECKPOINT_JSON, DATA_DIR, DEFAULT_LANG, DEFAULT_LANGS, ENTRIES_JSON,
                       LOCALE_DIR, LUA_DIR, MANIFEST_PATH, WEB_DATA_DIR)
from lib.pipeline import (FACET_FIELDS, MAX_EDGE_LABEL, analyze_all, collect_edges,
                          collect_facets, log)

EMPTY_FLAG = 1
SIMPLIFIED_FLAG = 2
NO_OUT_FLAG = 4
NO_IN_FLAG = 8

KIND_CODE = {"explicit": 0, "temp": 2, "travel": 2, "inferred": 1, "position": 3}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build graph and reader data for the story corpus")
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS),
                        help="languages to export, comma separated")
    parser.add_argument("--lang", default=DEFAULT_LANG,
                        help="default language (also used for edge labels)")
    parser.add_argument("--no-cache", action="store_true", help="ignore the analysis cache")
    parser.add_argument("--full-text", action="store_true",
                        help="emit a single text-<lang>.js bundle (debugging only)")
    args = parser.parse_args(argv)

    langs = tuple(item.strip() for item in args.langs.split(",") if item.strip())
    if not langs:
        log("[error] no language selected; pass --langs zh-tw,zh-cn")
        return 2
    if not LUA_DIR.is_dir():
        log("[error] data/lua not found, run extract.py first")
        return 2

    sources: dict[str, str] = {}
    for path in sorted(LUA_DIR.glob("*.lua")):
        sources[path.stem] = path.read_text(encoding="utf-8")
    if not sources:
        log("[error] data/lua is empty, run extract.py first")
        return 2

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {}
    anomalies = manifest.get("anomalies") or {}
    simplified_only = set(anomalies.get("simplified_only") or [])
    empty_scripts = set(anomalies.get("empty") or [])

    models, reused, failed = analyze_all(sources, use_cache=not args.no_cache)
    edges, dynamic = collect_edges(models, sources)

    node_ids = sorted(models)
    chapter_list, chapter_index = build_chapters(node_ids)

    out_deg: dict[str, int] = {sid: 0 for sid in node_ids}
    in_deg: dict[str, int] = {sid: 0 for sid in node_ids}
    for src, dst, _kind, _label in edges:
        out_deg[src] += 1
        in_deg[dst] += 1

    facet_rows: list[list] = [
        collect_facets(models[sid]["beats"], models[sid].get("reads")) for sid in node_ids
    ]

    explicit_time = gametime.explicit_dates(sources)
    log(f"[3/4] chapters: {len(chapter_list)}; scripts with a fixed date: {len(explicit_time)}"
        f" (others show no date)")
    if explicit_time:
        first, last = min(explicit_time.values()), max(explicit_time.values())
        log(f"       time range: {gametime.format_date(first)} -> {gametime.format_date(last)}")

    locales: dict[str, dict] = {}
    for lang in langs:
        path = LOCALE_DIR / f"{lang}.json"
        if not path.exists():
            log(f"[error] missing {path}, run extract.py first")
            return 2
        locales[lang] = json.loads(path.read_text(encoding="utf-8"))

    existing_pairs = {(edge[0], edge[1]) for edge in edges}
    probe: dict = {}
    if ENTRIES_JSON.exists():
        try:
            probe = json.loads(ENTRIES_JSON.read_text(encoding="utf-8"))
        except Exception as exc:
            log(f"      [warn] failed to read system entry data: {type(exc).__name__}")
    system_edges, entry_list, entry_stats = entries.build(sources, node_ids, existing_pairs, probe)
    entry_sources: dict[str, str] = entry_stats["entry_sources"]
    sys_in: dict[str, int] = {sid: 0 for sid in node_ids}
    for _src, _dst, _kind, _label in system_edges:
        sys_in[_dst] += 1
    edges.extend(system_edges)
    probe_summary = entry_stats["asset_probe"]
    position_stats = entry_stats["position"]
    log(f"       system entries: {len(entry_list)} hardcoded, {len(entry_sources)} from assets,"
        f" {len(system_edges)} position edges"
        f" (exact {position_stats['exact_names']} + prefix {position_stats['prefix_names']}"
        f"/{position_stats['names']})")
    if not probe_summary["ok"]:
        log(f"       system entry probe: {probe_summary['reason']}")

    index = {sid: position for position, sid in enumerate(node_ids)}
    chapter_of_id = {sid: classify(sid)[0] for sid in node_ids}
    node_rows: list[list] = []
    for sid in node_ids:
        flags = 0
        if sid in empty_scripts:
            flags |= EMPTY_FLAG
        if sid in simplified_only:
            flags |= SIMPLIFIED_FLAG
        if out_deg[sid] == 0:
            flags |= NO_OUT_FLAG
        if in_deg[sid] == 0:
            flags |= NO_IN_FLAG
        node_rows.append([
            sid,
            chapter_index[chapter_of_id[sid]],
            out_deg[sid], in_deg[sid],
            models[sid]["stats"].get("say", 0),
            flags,
            sys_in[sid],
        ])

    used = {
        "flags": {key for row in facet_rows for key in row[1].split(",") if key},
        "checks": {key for row in facet_rows for key in row[2].split(",") if key},
        "stats": {key for row in facet_rows for key in row[3].split(",") if key},
        "rels": {key for row in facet_rows for key in row[4].split(",") if key},
        "speakers": {key for row in facet_rows for key in row[0].split(",") if key},
    }
    read_keys = {key for sid in node_ids for key in models[sid].get("reads") or ()}
    read_prefixes: set[str] = set()
    for key in used["checks"]:
        read_prefixes.add(key)
        read_prefixes.update(key[:position] for position, ch in enumerate(key) if ch == "_" and position)
    read_covered = len(used["flags"] & read_prefixes)
    log(f"       flag reads: {len(read_keys)} checkpoints read,"
        f" {read_covered}/{len(used['flags'])} flags traceable to a read")

    edge_rows: list[list] = []
    for src, dst, kind, label in edges:
        edge_rows.append([index[src], index[dst], KIND_CODE.get(kind, 0), (label or "")[:MAX_EDGE_LABEL]])

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

    node_chapter = {sid: chapter_index[chapter_of_id[sid]] for sid in node_ids}
    chapter_ids = [chapter["id"] for chapter in chapter_list]
    shard_of: dict[str, str] = {}
    shards: list[dict] = []

    char_sets: dict[str, dict[str, str]] = {}
    language_stats: dict[str, dict] = {}
    wordcount_by_lang: dict[str, dict] = {}
    parts: list[tuple[str, int]] = []
    for lang in langs:
        started = time.time()
        renderer = emit.Renderer(locales[lang], lang)
        stories: dict[str, list] = {}
        for sid in node_ids:
            beats = renderer.beats(models[sid]["beats"])
            if beats:
                stories[sid] = beats
        characters = renderer.character_table()
        wordcount_by_lang[lang] = wordcount.build(stories, chapter_of_id, node_ids)

        edge_labels: dict[str, str] = {}
        for position, edge in enumerate(edges):
            if not edge[3]:
                continue
            label = renderer.edge_label(edge[3])
            if label:
                edge_labels[str(position)] = label[:MAX_EDGE_LABEL]

        locale = locales[lang]

        def names_of(namespace: str, keys: set[str]) -> dict[str, str]:
            table = locale.get(namespace) or {}
            return {key: table[key] for key in sorted(keys) if key in table}

        char_sets[lang] = characters
        extra = {
            "missing": renderer.missing_count,
            "missingKeys": renderer.missing[:200],
            "edgeLabels": edge_labels,
            "names": {
                "flags": names_of("Flag", used["flags"]),
                "checks": names_of("DiceHeader", used["checks"]),
                "stats": names_of("PlayerStat", used["stats"]),
                "rels": names_of("Character", used["rels"]),
            },
        }

        if lang == langs[0] and not args.full_text:
            sizes = {sid: emit.story_bytes(stories.get(sid, [])) for sid in node_ids}
            shard_of, shards = emit.pack_shards(node_ids, sizes, node_chapter, chapter_ids)
        shard_keys = [shard["key"] for shard in shards]

        if args.full_text:
            size = emit.write_text_js(WEB_DATA_DIR / f"text-{lang}.js", lang, stories,
                                      characters, extra)
            parts.append((f"text-{lang}.js", size))
            head_size = size
            shard_total = size
        else:
            head_size = emit.write_text_head_js(
                WEB_DATA_DIR / f"text-{lang}-head.js", lang, characters, extra, shard_keys)
            parts.append((f"text-{lang}-head.js", head_size))
            buckets: dict[str, dict[str, list]] = {key: {} for key in shard_keys}
            for sid in node_ids:
                key = shard_of.get(sid)
                if key in buckets and sid in stories:
                    buckets[key][sid] = stories[sid]
            shard_total = 0
            for shard in shards:
                path = WEB_DATA_DIR / f"text-{lang}-{shard['key']}.js"
                written = emit.write_text_shard_js(path, lang, buckets[shard["key"]])
                parts.append((path.name, written))
                shard_total += written

        language_stats[lang] = {
            "stories": len(stories),
            "characters": len(characters),
            "options": renderer.option_count,
            "locked_options": renderer.locked_count,
            "rich_text": renderer.rich_count,
            "think": renderer.think_count,
            "think_named": renderer.think_named_count,
            "lore": renderer.lore_count,
            "edge_labels": len(edge_labels),
            "missing_keys": renderer.missing_count,
            "missing_samples": renderer.missing[:40],
            "head_bytes": head_size,
            "shard_count": len(shards),
            "shard_bytes": shard_total,
            "seconds": round(time.time() - started, 1),
        }
        log(f"      rendered {lang}: {len(stories)} scripts, {renderer.option_count} options"
            f" ({renderer.locked_count} locked), {renderer.rich_count} rich text,"
            f" {renderer.missing_count} missing keys -> head {emit.fmt_bytes(head_size)}"
            + ("" if args.full_text else
               f" + {len(shards)} shards {emit.fmt_bytes(shard_total)}"))
        log(f"            inner monologue {renderer.think_count}"
            f" ({renderer.think_named_count} with a speaker), lore {renderer.lore_count}")

    keep = {name for name, _ in parts}
    removed = 0
    for old in WEB_DATA_DIR.glob("text-*.js"):
        if old.name not in keep:
            old.unlink()
            removed += 1
    if removed:
        log(f"      removed {removed} stale text files")

    shard_map = "".join(shard_of.get(sid, "") for sid in node_ids) if shards else ""
    for shard in shards:
        shard["bytes_kb"] = round(shard["bytes"] / 1024)

    game: dict[str, str | None] = {"version": None, "build": None, "updated": None}
    root = paths.game_root()
    if root is not None:
        game = gameinfo.read_game_info(paths.game_managers(root), paths.steamapps_dir(root),
                                       paths.installdir(root))
    if game["version"] or game["build"]:
        log("      game version: " + " · ".join(
            piece for piece in (
                f"v{game['version']}" if game["version"] else "",
                f"build {game['build']}" if game["build"] else "",
                f"updated {game['updated']}" if game["updated"] else "",
            ) if piece))
    else:
        log("      game version: [warn] unavailable (normal on other machines or when not installed)")

    graph_payload = {
        "meta": {
            "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "nodeCount": len(node_ids),
            "edgeCount": len(edge_rows),
            "langs": list(langs),
            "defaultLang": args.lang,
            "dynamicJumps": len(dynamic),
            "analysisFailed": failed,
            "facetFields": list(FACET_FIELDS),
            "shardOf": shard_map,
            "shards": shards,
            "fullText": bool(args.full_text),
            "entries": entry_list,
            "entrySources": entry_sources,
            "gameVersion": game["version"],
            "gameBuild": game["build"],
            "gameUpdated": game["updated"],
            "explicitTime": explicit_time,
        },
        "chapters": chapter_list,
        "nodes": node_rows,
        "edges": edge_rows,
        "facets": facet_rows,
    }
    graph_size = emit.write_graph_js(WEB_DATA_DIR / "graph.js", graph_payload)
    parts.append(("graph.js", graph_size))

    checkpoint_items: dict[str, dict] = {}
    checkpoint_gaps: list[dict] = []
    if CHECKPOINT_JSON.exists():
        try:
            blob = json.loads(CHECKPOINT_JSON.read_text(encoding="utf-8"))
            checkpoint_items = blob.get("items") or {}
            checkpoint_gaps = blob.get("gaps") or []
        except Exception as exc:
            log(f"      [warn] failed to read checkpoint data: {type(exc).__name__}")
    checkpoint_file = WEB_DATA_DIR / "checkpoints.js"
    checkpoint_kinds: dict[str, int] = {}
    expr_branches = expr_resolved = 0
    for model in checkpoint_items.values():
        kind = (model or {}).get("kind", "?")
        checkpoint_kinds[kind] = checkpoint_kinds.get(kind, 0) + 1
        for branch in (model or {}).get("branches") or []:
            expr_branches += 1
            if branch.get("expr"):
                expr_resolved += 1
    checkpoint_parts: list[dict] = []
    checkpoint_size = 0
    if checkpoint_items:
        payload = emit.slim_checkpoints(checkpoint_items)
        if emit.checkpoints_ascii(payload):
            checkpoint_parts = emit.write_checkpoint_shards(WEB_DATA_DIR, payload)
            checkpoint_size = sum(item["bytes"] for item in checkpoint_parts)
            largest = max((item["bytes"] for item in checkpoint_parts), default=0)
            parts.extend((item["name"], item["bytes"]) for item in checkpoint_parts)
            log(f"       checkpoint conditions: {len(checkpoint_items)} in"
                f" {len(checkpoint_parts)} shards, {emit.fmt_bytes(checkpoint_size)} total"
                f" (largest {emit.fmt_bytes(largest)}, 1-2 shards injected on demand)")
        else:
            checkpoint_size = emit.write_checkpoints_js(checkpoint_file, payload)
            parts.append((checkpoint_file.name, checkpoint_size))
            log(f"       checkpoint conditions: {len(checkpoint_items)} in a single bundle,"
                f" {emit.fmt_bytes(checkpoint_size)} (non-ASCII keys)")
        log(f"       expression coverage: {expr_resolved}/{expr_branches} branches"
            f" ({', '.join(f'{key} {value}' for key, value in sorted(checkpoint_kinds.items()))})")
    else:
        log("       checkpoint conditions: none (not extracted or dependency missing)")

    stale = 0
    if checkpoint_parts:
        if checkpoint_file.exists():
            checkpoint_file.unlink()
            stale += 1
    else:
        for old in WEB_DATA_DIR.glob("checkpoints-*.js"):
            old.unlink()
            stale += 1
        if not checkpoint_items and checkpoint_file.exists():
            checkpoint_file.unlink()
            stale += 1
    if stale:
        log(f"      removed {stale} stale checkpoint files")

    wordcount_payload = {
        "version": 1,
        "kinds": list(wordcount.KINDS),
        "langs": wordcount_by_lang,
    }
    wordcount_size = emit.write_wordcount_js(WEB_DATA_DIR / "wordcount.js", wordcount_payload)
    parts.append(("wordcount.js", wordcount_size))
    wordcount_report: dict[str, dict] = {}
    for lang in langs:
        data = wordcount_by_lang.get(lang) or {"chapters": {}, "stories": {}}
        sums = wordcount.totals(data["chapters"])
        wordcount_report[lang] = {
            "chapters": len(data["chapters"]),
            "stories": len(data["stories"]),
            "by_kind": {kind: {"zh": pair[0], "en": pair[1], "sum": pair[0] + pair[1]}
                        for kind, pair in zip(wordcount.KINDS, sums)},
            "total": {
                "zh": sum(pair[0] for pair in sums),
                "en": sum(pair[1] for pair in sums),
                "sum": sum(pair[0] + pair[1] for pair in sums),
            },
        }
    log("       word count: " + ", ".join(
        f"{lang} {wordcount_report[lang]['total']['sum']} chars"
        f" ({wordcount_report[lang]['stories']} scripts)" for lang in langs)
        + f" -> {emit.fmt_bytes(wordcount_size)}")

    report: dict[str, Any] = {
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "scripts": len(node_ids),
        "edges": {"total": len(edge_rows),
                  "jump": sum(1 for edge in edge_rows if edge[2] == 0),
                  "inferred": sum(1 for edge in edge_rows if edge[2] == 1),
                  "temp_or_travel": sum(1 for edge in edge_rows if edge[2] == 2),
                  "position": sum(1 for edge in edge_rows if edge[2] == 3),
                  "dynamic": len(dynamic)},
        "nodes": {"empty": len(empty_scripts), "simplified_only": len(simplified_only),
                  "no_incoming": sum(1 for sid in node_ids if in_deg[sid] == 0),
                  "no_incoming_after_system": sum(1 for sid in node_ids
                                                  if in_deg[sid] == 0 and sys_in[sid] == 0),
                  "no_incoming_after_entries": sum(
                      1 for sid in node_ids
                      if in_deg[sid] == 0 and sid not in entry_sources),
                  "system_in": sum(1 for sid in node_ids if sys_in[sid] > 0),
                  "entry_sources": len(entry_sources),
                  "no_outgoing": sum(1 for sid in node_ids if out_deg[sid] == 0)},
        "entries": {
            "hardcoded": entry_list,
            "hardcoded_missing": entry_stats["missing_hardcoded"],
            "position": entry_stats["position"],
            "asset_probe": entry_stats["asset_probe"],
            "asset_sources": {source: sum(1 for value in entry_sources.values() if value == source)
                              for source in sorted(set(entry_sources.values()))},
        },
        "facets": {
            "fields": list(FACET_FIELDS),
            "speakers": len(used["speakers"]),
            "flags": len(used["flags"]),
            "checks": len(used["checks"]),
            "stats": len(used["stats"]),
            "rels": len(used["rels"]),
            "scripts_with_flag": sum(1 for row in facet_rows if row[1]),
            "scripts_with_check": sum(1 for row in facet_rows if row[2]),
            "read_keys": len(read_keys),
            "flags_with_reads": read_covered,
            "scripts_with_lock": sum(1 for row in facet_rows if row[6]),
            "scripts_with_dice": sum(1 for row in facet_rows if row[7]),
            "scripts_with_options": sum(1 for row in facet_rows if row[5]),
        },
        "checkpoints": {
            "resolved": len(checkpoint_items),
            "bytes": checkpoint_size,
            "mode": "shards" if checkpoint_parts else ("single" if checkpoint_size else "none"),
            "shards": {
                "count": len(checkpoint_parts),
                "largest_kb": round(max((item["bytes"] for item in checkpoint_parts), default=0) / 1024),
                "bytes": [item["bytes"] for item in checkpoint_parts],
            },
            "by_kind": checkpoint_kinds,
            "expr": {"branches": expr_branches, "resolved": expr_resolved},
            "gaps": {
                "total": len(checkpoint_gaps),
                "by_reason": {reason: sum(1 for gap in checkpoint_gaps
                                          if gap.get("reason") == reason)
                              for reason in sorted({gap.get("reason", "?")
                                                    for gap in checkpoint_gaps})},
                "items": checkpoint_gaps,
            },
        },
        "wordcount": {"bytes": wordcount_size, "langs": wordcount_report},
        "time": {"explicit": len(explicit_time),
                 "scripts": sorted(explicit_time)},
        "chapters": chapter_list,
        "text": {
            "mode": "full" if args.full_text else "shards",
            "shard_count": len(shards),
            "shard_of": len(shard_map),
            "largest_shard_kb": max((shard["bytes_kb"] for shard in shards), default=0),
            "shards": shards,
        },
        "languages": language_stats,
        "dynamic_jumps": dynamic[:200],
        "analysis_failed": failed,
        "cache_reused": reused,
        "artifacts": [{"name": name, "size": size} for name, size in parts],
    }
    emit.write_report(DATA_DIR / "report.json", report)

    log(f"[4/4] output: graph.js {emit.fmt_bytes(graph_size)}, "
        + ", ".join(f"{name} {emit.fmt_bytes(size)}" for name, size in parts
                    if name != "graph.js" and not name.startswith("checkpoints-")))
    log(f"       nodes {len(node_ids)} / edges {len(edge_rows)} / chapters {len(chapter_list)}")
    log(f"       report -> {DATA_DIR / 'report.json'}")

    if failed:
        log(f"[warn] {failed} scripts failed to parse and were degraded to empty text (see report.json)")
    if not any(language_stats[lang]["stories"] for lang in langs):
        log("[error] all scripts rendered empty, check the extraction output")
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
