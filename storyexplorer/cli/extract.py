from __future__ import annotations

import argparse
import hashlib
import time
from pathlib import Path
from typing import Any

from ..cache import CacheKey, file_fingerprint, load_envelope, read_json, save_envelope, write_json
from ..config import (
    CACHE_DIR,
    CHECKPOINTS_PATH,
    CHECKPOINT_VERSION,
    ENTRIES_PATH,
    ENTRY_VERSION,
    GAME_ENV,
    LOCALE_DIR,
    LOCALE_LANGS,
    LORE_PATH,
    LORE_VERSION,
    LUA_DIR,
    MANAGERS_ASSET,
    MANIFEST_PATH,
    SCHEMA_VERSION,
    asset_dir,
    game_root,
    locale_path,
    managers_path,
    resources_path,
)
from ..console import Reporter
from ..game.checkpoints import (
    collect_key_methods,
    collect_keys,
    extract as extract_checkpoint_models,
    scan as scan_checkpoints,
    summarize as summarize_checkpoints,
)
from ..game.entries import probe as probe_entries, summarize as summarize_entries
from ..game.info import read_game_info
from ..game.locales import extract_locales
from ..game.lore import collect_story_keys, probe as probe_lore, summarize as summarize_lore
from ..game.scripts import extract_scripts
from ..game.unity import available as typetree_available
from ..game.unity import fingerprint as unity_fingerprint
from ..manifest import ExtractManifest, load_manifest, manifest_matches, save_manifest
from .common import EXIT_DATA, EXIT_OK, EXIT_USAGE, split_langs

CHECKPOINT_CACHE = CACHE_DIR / "checkpoints.json"
ENTRY_CACHE = CACHE_DIR / "entries.json"
LORE_CACHE = CACHE_DIR / "lore.json"


def _write_checkpoints(items: dict[str, Any], gaps: list[dict[str, Any]]) -> None:
    write_json(CHECKPOINTS_PATH, {"version": CHECKPOINT_VERSION, "items": items, "gaps": gaps}, indent=None)


def _write_entries(payload: dict[str, Any]) -> None:
    write_json(ENTRIES_PATH, payload, indent=None)


def _extract_checkpoints(game: Path, sources: dict[str, str], force: bool,
                         reporter: Reporter) -> dict[str, Any]:
    wanted = collect_keys(sources)
    hints = collect_key_methods(sources)
    if not wanted:
        reporter.stage(2, 4, "checkpoint conditions")
        reporter.warn("no checkpoint references in the corpus, skipping")
        _write_checkpoints({}, [])
        return {"enabled": True, "skipped": True, "wanted": 0, "resolved": 0,
                "missing": 0, "by_kind": {}, "elapsed": 0.0}

    if not typetree_available():
        reporter.stage(2, 4, "checkpoint conditions")
        reporter.warn(
            "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable;"
            " skipping checkpoint extraction, the reader will hide condition blocks"
        )
        _write_checkpoints({}, [])
        return {"enabled": True, "skipped": True, "wanted": len(wanted), "resolved": 0,
                "missing": len(wanted), "by_kind": {}, "elapsed": 0.0}

    assets = asset_dir(game)
    fingerprint = unity_fingerprint(assets)
    key = CacheKey(CHECKPOINT_VERSION, fingerprint)
    cached = None if force else load_envelope(CHECKPOINT_CACHE, key)
    if isinstance(cached, dict):
        items = cached.get("items") or {}
        gaps = cached.get("gaps") or []
        stats = summarize_checkpoints(items, len(wanted), gaps)
        reporter.stage(2, 4, "checkpoint conditions")
        reporter.info(
            f"{len(items)} from cache ({', '.join(f'{kind} {count}' for kind, count in stats['by_kind'].items())})"
        )
        _write_checkpoints(items, gaps)
        return {"enabled": True, "skipped": False, **stats}

    started = time.time()
    reporter.stage(2, 4, f"checkpoint conditions: scanning assets for {len(wanted)} configs")
    found = scan_checkpoints(assets, wanted, reporter)
    reporter.info(f"located {len(found)}/{len(wanted)}, reading fields...")
    items, gaps = extract_checkpoint_models(assets, found, reporter, hints)
    stats = summarize_checkpoints(items, len(wanted), gaps)
    stats["elapsed"] = round(time.time() - started, 1)
    reporter.info(f"resolved {len(items)} ({stats['missing']} missing), {stats['elapsed']}s")
    save_envelope(CHECKPOINT_CACHE, key, {"items": items, "gaps": gaps})
    _write_checkpoints(items, gaps)
    return {"enabled": True, "skipped": False, **stats}


def _extract_entries(game: Path, ids: set[str], force: bool,
                     reporter: Reporter) -> dict[str, Any]:
    if not ids:
        reporter.stage(3, 4, "system entries")
        reporter.warn("no scripts found, skipping the system entry probe")
        _write_entries({})
        return {"enabled": True, "skipped": True, "ok": False, "reason": "no scripts",
                "entries": 0, "positions": 0, "elapsed": 0.0}

    assets = asset_dir(game)
    fingerprint = unity_fingerprint(assets)
    key = CacheKey(ENTRY_VERSION, fingerprint)
    cached = None if force else load_envelope(ENTRY_CACHE, key)
    if isinstance(cached, dict):
        stats = summarize_entries(cached)
        reporter.stage(3, 4, "system entries")
        reporter.info(
            f"{stats['entries']} sources and {stats['positions']} position events from cache")
        _write_entries(cached)
        return {"enabled": True, "skipped": False, **stats}

    started = time.time()
    reporter.stage(3, 4, "system entries: scanning asset files")
    payload = probe_entries(assets, ids, reporter)
    stats = summarize_entries(payload)
    stats["elapsed"] = stats.get("elapsed") or round(time.time() - started, 1)
    if not stats["ok"]:
        reporter.warn(
            f"system entries unresolved: {stats['reason']};"
            " the reader shows hardcoded entries only and falls back to prefix expansion"
        )
    else:
        save_envelope(ENTRY_CACHE, key, payload)
    _write_entries(payload)
    return {"enabled": True, "skipped": False, **stats}


def _write_scripts(scripts: dict[str, str], reporter: Reporter) -> None:
    LUA_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in sorted(scripts.items()):
        (LUA_DIR / f"{name}.lua").write_text(text, encoding="utf-8", newline="")
    stale = 0
    for path in LUA_DIR.glob("*.lua"):
        if path.stem not in scripts:
            path.unlink()
            stale += 1
    if stale:
        reporter.info(f"removed {stale} stale scripts")


def _write_locales(tables: dict[str, dict[str, dict[str, str]]], langs: tuple[str, ...],
                   reporter: Reporter) -> tuple[dict[str, int], dict[str, int]]:
    LOCALE_DIR.mkdir(parents=True, exist_ok=True)
    keys: dict[str, int] = {}
    namespaces: dict[str, int] = {}
    for lang in langs:
        payload = {prefix: entries for prefix, entries in sorted(tables[lang].items())}
        write_json(LOCALE_DIR / f"{lang}.json", payload, indent=None)
        keys[lang] = len(payload.get("Story", {}))
        namespaces[lang] = len(payload)
        reporter.info(
            f"{lang}: {keys[lang]} Story keys / {namespaces[lang]} namespaces,"
            f" {len(payload.get('Character', {}))} Character keys"
        )
    return keys, namespaces


def _write_lore(items: dict[str, str]) -> None:
    write_json(LORE_PATH, {"version": LORE_VERSION, "items": items}, indent=None)


def _extract_lore(game: Path, sources: dict[str, str], tables: dict[str, dict],
                  langs: tuple[str, ...], force: bool, reporter: Reporter) -> dict[str, Any]:
    story_keys = collect_story_keys(sources)
    missing = {
        key for key in story_keys
        if any(key not in (tables[lang].get("LegendInfo") or {}) for lang in langs)
    }
    stats: dict[str, Any] = {
        "enabled": True, "skipped": False,
        "story_keys": len(story_keys), "wanted": len(missing),
        "resolved": 0, "unresolved": len(missing), "by_reason": {}, "elapsed": 0.0,
    }
    if not missing:
        _write_lore({})
        reporter.info("[lore] every AddStory key has a LegendInfo entry")
        return stats
    if not typetree_available():
        reporter.warn(
            "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable;"
            " skipping StoryData lore fallback"
        )
        _write_lore({})
        stats.update(skipped=True, by_reason={"unavailable": len(missing)})
        return stats

    assets = asset_dir(game)
    fingerprint = unity_fingerprint(assets)
    key_hash = hashlib.sha1("\n".join(sorted(missing)).encode("utf-8")).hexdigest()[:16]
    cache_key = CacheKey(LORE_VERSION, f"{fingerprint}:{key_hash}")
    cached = None if force else load_envelope(LORE_CACHE, cache_key)
    items: dict[str, str] = {}
    gaps: list[dict[str, str]] = []
    if isinstance(cached, dict):
        raw_items = cached.get("items")
        raw_gaps = cached.get("gaps")
        items = raw_items if isinstance(raw_items, dict) else {}
        gaps = raw_gaps if isinstance(raw_gaps, list) else []
        elapsed = float(cached.get("elapsed") or 0.0)
        reporter.info(f"[lore] StoryData fallback: {len(items)} from cache")
    else:
        started = time.time()
        reporter.info(f"[lore] scanning assets for {len(missing)} missing LegendInfo keys")
        try:
            items, gaps = probe_lore(assets, missing, reporter)
        except Exception as exc:
            reporter.warn(f"lore probe failed: {type(exc).__name__}: {exc}")
            items = {}
            gaps = [{"key": key, "reason": "probe_error"} for key in sorted(missing)]
        elapsed = time.time() - started
        save_envelope(
            LORE_CACHE, cache_key,
            {"items": items, "gaps": gaps, "elapsed": round(elapsed, 1)},
        )
    stats.update(summarize_lore(missing, items, gaps, elapsed))
    _write_lore(items)
    reporter.info(
        f"[lore] resolved {stats['resolved']}/{stats['wanted']} from StoryData"
        f" ({stats['unresolved']} unresolved, {stats['elapsed']}s)"
    )
    return stats


def _asset_fingerprints(game: Path) -> dict[str, dict[str, Any]]:
    return {
        resources_path(game).name: file_fingerprint(resources_path(game)),
        locale_path(game).name: file_fingerprint(locale_path(game)),
        MANAGERS_ASSET: file_fingerprint(managers_path(game)),
    }


def _manifest(
    game: Path, langs: tuple[str, ...], assets: dict[str, dict[str, Any]],
    corpus, locale_keys: dict[str, int], locale_stats: dict[str, Any],
    namespaces: dict[str, int], checkpoint_stats: dict[str, Any],
    entry_stats: dict[str, Any], lore_stats: dict[str, Any],
) -> ExtractManifest:
    return ExtractManifest(
        schema=SCHEMA_VERSION,
        generated_at=time.strftime("%Y-%m-%d %H:%M:%S"),
        game=str(game),
        langs=list(langs),
        assets=assets,
        script_count=len(corpus.scripts),
        script_stats=corpus.stats,
        anomalies=corpus.anomalies,
        locale_keys=locale_keys,
        locale_stats={**locale_stats, "namespaces": {
            lang: namespaces[lang] for lang in sorted(namespaces)}},
        checkpoint_stats=checkpoint_stats,
        entry_stats=entry_stats,
        lore_stats=lore_stats,
        checkpoint_version=CHECKPOINT_VERSION,
        entry_version=ENTRY_VERSION,
        lore_version=LORE_VERSION,
    )


def _rebuild_conditional(game: Path, langs: tuple[str, ...], manifest: dict[str, Any],
                         args: argparse.Namespace, reporter: Reporter) -> None:
    redo_checkpoints = args.checkpoints and (
        not CHECKPOINTS_PATH.exists()
        or manifest.get("checkpoint_version") != CHECKPOINT_VERSION)
    redo_entries = args.entries and (
        not ENTRIES_PATH.exists()
        or manifest.get("entry_version") != ENTRY_VERSION)
    redo_lore = args.lore and (
        not LORE_PATH.exists()
        or manifest.get("lore_version") != LORE_VERSION)
    if not (redo_checkpoints or redo_entries or redo_lore):
        return
    sources = {}
    for path in sorted(LUA_DIR.glob("*.lua")):
        sources[path.stem] = path.read_text(encoding="utf-8")
    if redo_checkpoints:
        manifest["checkpoint_stats"] = _extract_checkpoints(game, sources, args.force, reporter)
    if redo_entries:
        manifest["entry_stats"] = _extract_entries(game, set(sources), args.force, reporter)
    if redo_lore:
        tables = {}
        for lang in langs:
            payload = read_json(LOCALE_DIR / f"{lang}.json")
            tables[lang] = payload if isinstance(payload, dict) else {}
        manifest["lore_stats"] = _extract_lore(
            game, sources, tables, langs, args.force, reporter)
    manifest["checkpoint_version"] = CHECKPOINT_VERSION
    manifest["entry_version"] = ENTRY_VERSION
    if args.lore:
        manifest["lore_version"] = LORE_VERSION
    write_json(MANIFEST_PATH, manifest, indent=2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract story Lua files and locale tables from the game assets (read only)")
    parser.add_argument("--game", default=None, help=f"game root directory (defaults to ${GAME_ENV})")
    parser.add_argument("--langs", default=",".join(LOCALE_LANGS),
                        help="locale tables to export; every language is needed to derive conversion")
    parser.add_argument("--force", action="store_true", help="ignore caches and extract again")
    parser.add_argument("--checkpoints", dest="checkpoints", action="store_true", default=True)
    parser.add_argument("--no-checkpoints", dest="checkpoints", action="store_false")
    parser.add_argument("--entries", dest="entries", action="store_true", default=True,
                        help="also probe system entries (default on)")
    parser.add_argument("--no-entries", dest="entries", action="store_false",
                        help="skip the system entry probe")
    parser.add_argument("--lore", dest="lore", action="store_true", default=True,
                        help="also extract StoryData lore fallback texts (default on)")
    parser.add_argument("--no-lore", dest="lore", action="store_false",
                        help="skip the StoryData lore fallback extraction")
    args = parser.parse_args(argv)

    reporter = Reporter()
    game = Path(args.game).expanduser() if args.game else game_root()
    if game is None:
        reporter.error(f"no game directory given; use --game or set {GAME_ENV}")
        return EXIT_USAGE
    if not (resources_path(game).exists() and locale_path(game).exists() and managers_path(game).exists()):
        reporter.error(f"game assets not found under {asset_dir(game)}")
        return EXIT_USAGE

    langs = split_langs(args.langs)
    if not langs:
        reporter.error("no language selected; pass --langs zh-tw,zh-cn")
        return EXIT_USAGE

    assets = _asset_fingerprints(game)
    manifest = load_manifest(MANIFEST_PATH)
    if not args.force and manifest_matches(manifest, assets, langs, LUA_DIR, LOCALE_DIR):
        reporter.write("[skip] resources unchanged and outputs complete; use --force to rerun")
        reporter.write(
            f"       {manifest.get('script_count')} scripts, "
            + ", ".join(f"{lang} {count} keys"
                        for lang, count in (manifest.get("locale_keys") or {}).items()))
        _rebuild_conditional(game, langs, manifest, args, reporter)
        return EXIT_OK

    corpus = extract_scripts(game, reporter)
    if not corpus.scripts:
        reporter.error("no script extracted, check the game version or UnityPy compatibility")
        return EXIT_DATA
    _write_scripts(corpus.scripts, reporter)

    checkpoint_stats = (_extract_checkpoints(game, corpus.scripts, args.force, reporter)
                        if args.checkpoints else {"enabled": False, "skipped": True})
    entry_stats = (_extract_entries(game, set(corpus.scripts), args.force, reporter)
                   if args.entries else {"enabled": False, "skipped": True})

    tables, locale_stats = extract_locales(locale_path(game), langs, reporter)
    locale_keys, namespaces = _write_locales(tables, langs, reporter)
    lore_stats = (_extract_lore(game, corpus.scripts, tables, langs, args.force, reporter)
                  if args.lore else {"enabled": False, "skipped": True})

    info = read_game_info(managers_path(game), None, game.name)
    if info.version:
        reporter.info(f"game version: v{info.version}")

    save_manifest(
        MANIFEST_PATH,
        _manifest(game, langs, assets, corpus, locale_keys, locale_stats, namespaces,
                  checkpoint_stats, entry_stats, lore_stats),
    )
    reporter.blank()
    reporter.write(f"[done] {len(corpus.scripts)} scripts -> {LUA_DIR}")
    for lang in langs:
        reporter.write(f"[done] {lang} locale table -> {LOCALE_DIR / (lang + '.json')}")
    reporter.write(f"[done] manifest -> {MANIFEST_PATH}")
    return EXIT_OK
