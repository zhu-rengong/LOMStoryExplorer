from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any

from ..cache import CacheKey, file_fingerprint, load_envelope, save_envelope, write_json
from ..config import (
    CACHE_DIR,
    CHECKPOINTS_PATH,
    CHECKPOINT_VERSION,
    DEFAULT_LANGS,
    ENTRIES_PATH,
    ENTRY_VERSION,
    GAME_ENV,
    LOCALE_DIR,
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
from ..game.scripts import extract_scripts
from ..game.unity import available as checkpoints_available
from ..game.unity import fingerprint as unity_fingerprint
from ..manifest import ExtractManifest, load_manifest, manifest_matches, save_manifest
from .common import EXIT_DATA, EXIT_OK, EXIT_USAGE, split_langs

CHECKPOINT_CACHE = CACHE_DIR / "checkpoints.json"
ENTRY_CACHE = CACHE_DIR / "entries.json"


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

    if not checkpoints_available():
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
    entry_stats: dict[str, Any],
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
        checkpoint_version=CHECKPOINT_VERSION,
        entry_version=ENTRY_VERSION,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract story Lua files and locale tables from the game assets (read only)")
    parser.add_argument("--game", default=None, help=f"game root directory (defaults to ${GAME_ENV})")
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS), help="languages to export")
    parser.add_argument("--force", action="store_true", help="ignore caches and extract again")
    parser.add_argument("--checkpoints", dest="checkpoints", action="store_true", default=True)
    parser.add_argument("--no-checkpoints", dest="checkpoints", action="store_false")
    parser.add_argument("--entries", dest="entries", action="store_true", default=True)
    parser.add_argument("--no-entries", dest="entries", action="store_false")
    args = parser.parse_args(argv)

    reporter = Reporter()
    root = Path(args.game).expanduser() if args.game else game_root()
    if root is None:
        reporter.error(f"no game directory given; use --game or set {GAME_ENV}")
        return EXIT_USAGE
    game = root
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
        redo_checkpoints = args.checkpoints and (
            not CHECKPOINTS_PATH.exists()
            or manifest.get("checkpoint_version") != CHECKPOINT_VERSION)
        redo_entries = args.entries and (
            not ENTRIES_PATH.exists()
            or manifest.get("entry_version") != ENTRY_VERSION)
        if redo_checkpoints or redo_entries:
            sources = {}
            for path in sorted(LUA_DIR.glob("*.lua")):
                sources[path.stem] = path.read_text(encoding="utf-8")
            if redo_checkpoints:
                manifest["checkpoint_stats"] = _extract_checkpoints(game, sources, args.force, reporter)
            if redo_entries:
                manifest["entry_stats"] = _extract_entries(game, set(sources), args.force, reporter)
            manifest["checkpoint_version"] = CHECKPOINT_VERSION
            manifest["entry_version"] = ENTRY_VERSION
            write_json(MANIFEST_PATH, manifest, indent=2)
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

    info = read_game_info(managers_path(game), None, game.name)
    if info.version:
        reporter.info(f"game version: v{info.version}")

    save_manifest(
        MANIFEST_PATH,
        _manifest(game, langs, assets, corpus, locale_keys, locale_stats, namespaces,
                  checkpoint_stats, entry_stats),
    )
    reporter.blank()
    reporter.write(f"[done] {len(corpus.scripts)} scripts -> {LUA_DIR}")
    for lang in langs:
        reporter.write(f"[done] {lang} locale table -> {LOCALE_DIR / (lang + '.json')}")
    reporter.write(f"[done] manifest -> {MANIFEST_PATH}")
    return EXIT_OK
