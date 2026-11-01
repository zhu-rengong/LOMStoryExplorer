from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .cache import CacheKey, load_envelope, save_envelope
from .console import Reporter
from .game.checkpoints import extract as extract_checkpoints
from .game.checkpoints import scan as scan_checkpoints
from .game.checkpoints import summarize as summarize_checkpoints
from .game.entries import probe as probe_entries
from .game.entries import summarize as summarize_entries
from .game.info import read_game_info
from .game.locales import extract_locales
from .game.lore import probe as probe_lore
from .game.lore import summarize as summarize_lore
from .game.profile import (
    asset_dir,
    game_root,
    install_dir,
    locale_path,
    managers_path,
    resources_path,
)
from .game.scripts import extract_scripts
from .game.sources import collect_checkpoint_keys, collect_checkpoint_methods
from .game.sources import scan_story_keys
from .game.stats import extract as extract_stats
from .game.stats import summarize as summarize_stats
from .game.unity import available as typetree_available
from .game.unity import fingerprint as unity_fingerprint
from .jsonio import file_fingerprint, read_json, write_json
from .manifest import load_manifest, manifest_matches, save_manifest
from .paths import (
    CHECKPOINT_CACHE_PATH,
    CHECKPOINTS_PATH,
    ENTRY_CACHE_PATH,
    ENTRIES_PATH,
    LOCALE_DIR,
    LORE_CACHE_PATH,
    LORE_PATH,
    LUA_DIR,
    MANIFEST_PATH,
    STATS_CACHE_PATH,
    STATS_PATH,
)
from .versions import (
    CHECKPOINT_VERSION,
    ENTRY_VERSION,
    LORE_VERSION,
    SCHEMA_VERSION,
    STAT_VERSION,
)

OK = "ok"
USAGE = "usage"
DATA = "data"


@dataclass(frozen=True)
class ExtractRequest:
    game: Path | None
    langs: tuple[str, ...]
    force: bool = False
    checkpoints: bool = True
    entries: bool = True
    lore: bool = True
    stats: bool = True


@dataclass(frozen=True)
class ExtractResult:
    kind: str
    reason: str = ""
    scripts: int = 0
    langs: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return self.kind == OK


def _write_checkpoints(items: dict[str, Any], gaps: list[dict[str, Any]]) -> None:
    write_json(CHECKPOINTS_PATH, {"version": CHECKPOINT_VERSION, "items": items, "gaps": gaps},
               indent=None)


def _write_entries(payload: dict[str, Any]) -> None:
    write_json(ENTRIES_PATH, payload, indent=None)


def _write_stats(items: dict[str, Any]) -> None:
    write_json(STATS_PATH, {"version": STAT_VERSION, "items": items}, indent=None)


def _extract_checkpoints(game: Path, sources: dict[str, str], force: bool,
                         reporter: Reporter) -> dict[str, Any]:
    wanted = collect_checkpoint_keys(sources)
    hints = collect_checkpoint_methods(sources)
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

    finger = unity_fingerprint(asset_dir(game))
    key = CacheKey(CHECKPOINT_VERSION, finger)
    cached = None if force else load_envelope(CHECKPOINT_CACHE_PATH, key)
    if isinstance(cached, dict):
        items = cached.get("items") or {}
        gaps = cached.get("gaps") or []
        stats = summarize_checkpoints(items, len(wanted), gaps)
        reporter.stage(2, 4, "checkpoint conditions")
        reporter.info(
            f"{len(items)} from cache"
            f" ({', '.join(f'{kind} {count}' for kind, count in stats['by_kind'].items())})"
        )
        _write_checkpoints(items, gaps)
        return {"enabled": True, "skipped": False, **stats}

    started = time.time()
    reporter.stage(2, 4, f"checkpoint conditions: scanning assets for {len(wanted)} configs")
    found = scan_checkpoints(asset_dir(game), wanted, reporter)
    reporter.info(f"located {len(found)}/{len(wanted)}, reading fields...")
    items, gaps = extract_checkpoints(asset_dir(game), found, reporter, hints)
    stats = summarize_checkpoints(items, len(wanted), gaps)
    stats["elapsed"] = round(time.time() - started, 1)
    reporter.info(f"resolved {len(items)} ({stats['missing']} missing), {stats['elapsed']}s")
    save_envelope(CHECKPOINT_CACHE_PATH, key, {"items": items, "gaps": gaps})
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

    finger = unity_fingerprint(asset_dir(game))
    key = CacheKey(ENTRY_VERSION, finger)
    cached = None if force else load_envelope(ENTRY_CACHE_PATH, key)
    if isinstance(cached, dict):
        stats = summarize_entries(cached)
        reporter.stage(3, 4, "system entries")
        reporter.info(
            f"{stats['entries']} sources and {stats['positions']} position events from cache")
        _write_entries(cached)
        return {"enabled": True, "skipped": False, **stats}

    started = time.time()
    reporter.stage(3, 4, "system entries: scanning asset files")
    payload = probe_entries(asset_dir(game), ids, reporter)
    stats = summarize_entries(payload)
    if stats.get("elapsed") is None:
        stats["elapsed"] = round(time.time() - started, 1)
    if not stats["ok"]:
        reporter.warn(
            f"system entries unresolved: {stats['reason']};"
            " the reader shows hardcoded entries only and falls back to prefix expansion"
        )
    else:
        save_envelope(ENTRY_CACHE_PATH, key, payload)
    _write_entries(payload)
    return {"enabled": True, "skipped": False, **stats}


def _extract_stats(game: Path, force: bool, reporter: Reporter) -> dict[str, Any]:
    finger = unity_fingerprint(asset_dir(game))
    key = CacheKey(STAT_VERSION, finger)
    cached = None if force else load_envelope(STATS_CACHE_PATH, key)
    if isinstance(cached, dict):
        items = cached.get("items") or {}
        stats = summarize_stats(items, float(cached.get("elapsed") or 0.0))
        reporter.info(f"stat assets: {stats['assets']} from cache")
        _write_stats(items)
        return {"enabled": True, "skipped": False, **stats}
    if not typetree_available():
        reporter.warn(
            "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable;"
            " skipping stat asset extraction, stat names fall back to the locale table"
        )
        _write_stats({})
        return {"enabled": True, "skipped": True, "assets": 0, "with_note": 0, "elapsed": 0.0}
    try:
        items, stats = extract_stats(asset_dir(game), reporter)
    except Exception as exc:
        reporter.warn(f"stat asset extraction failed: {type(exc).__name__}: {exc}")
        _write_stats({})
        return {"enabled": True, "skipped": True, "assets": 0, "with_note": 0, "elapsed": 0.0}
    save_envelope(STATS_CACHE_PATH, key, {"items": items, "elapsed": stats["elapsed"]})
    _write_stats(items)
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
    story_keys = scan_story_keys(sources)
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

    finger = unity_fingerprint(asset_dir(game))
    key_hash = hashlib.sha1("\n".join(sorted(missing)).encode("utf-8")).hexdigest()[:16]
    cache_key = CacheKey(LORE_VERSION, f"{finger}:{key_hash}")
    cached = None if force else load_envelope(LORE_CACHE_PATH, cache_key)
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
            items, gaps = probe_lore(asset_dir(game), missing, reporter)
        except Exception as exc:
            reporter.warn(f"lore probe failed: {type(exc).__name__}: {exc}")
            items = {}
            gaps = [{"key": key, "reason": "probe_error"} for key in sorted(missing)]
        elapsed = time.time() - started
        save_envelope(
            LORE_CACHE_PATH, cache_key,
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
    resources = resources_path(game)
    locale = locale_path(game)
    managers = managers_path(game)
    return {
        resources.name: file_fingerprint(resources),
        locale.name: file_fingerprint(locale),
        managers.name: file_fingerprint(managers),
    }


def _manifest_payload(
    game: Path, langs: tuple[str, ...], assets: dict[str, dict[str, Any]],
    corpus, locale_keys: dict[str, int], locale_stats: dict[str, Any],
    namespaces: dict[str, int], checkpoint_stats: dict[str, Any],
    entry_stats: dict[str, Any], stat_stats: dict[str, Any],
    lore_stats: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "game": str(game),
        "langs": list(langs),
        "assets": assets,
        "script_count": len(corpus.scripts),
        "script_stats": corpus.stats,
        "anomalies": corpus.anomalies,
        "locale_keys": locale_keys,
        "locale_stats": {**locale_stats, "namespaces": {
            lang: namespaces[lang] for lang in sorted(namespaces)}},
        "checkpoint_stats": checkpoint_stats,
        "entry_stats": entry_stats,
        "stat_stats": stat_stats,
        "lore_stats": lore_stats,
        "checkpoint_version": CHECKPOINT_VERSION,
        "entry_version": ENTRY_VERSION,
        "stat_version": STAT_VERSION,
        "lore_version": LORE_VERSION,
    }


def _rebuild_conditional(game: Path, langs: tuple[str, ...], manifest: dict[str, Any],
                         request: ExtractRequest, reporter: Reporter) -> None:
    redo = {
        "checkpoints": request.checkpoints and (
            not CHECKPOINTS_PATH.exists()
            or manifest.get("checkpoint_version") != CHECKPOINT_VERSION),
        "entries": request.entries and (
            not ENTRIES_PATH.exists()
            or manifest.get("entry_version") != ENTRY_VERSION),
        "lore": request.lore and (
            not LORE_PATH.exists()
            or manifest.get("lore_version") != LORE_VERSION),
        "stat": request.stats and (
            not STATS_PATH.exists()
            or manifest.get("stat_version") != STAT_VERSION),
    }
    if not any(redo.values()):
        return
    sources = {path.stem: path.read_text(encoding="utf-8")
               for path in sorted(LUA_DIR.glob("*.lua"))}
    if redo["checkpoints"]:
        manifest["checkpoint_stats"] = _extract_checkpoints(game, sources, request.force, reporter)
    if redo["entries"]:
        manifest["entry_stats"] = _extract_entries(game, set(sources), request.force, reporter)
    if redo["stat"]:
        manifest["stat_stats"] = _extract_stats(game, request.force, reporter)
    if redo["lore"]:
        tables = {}
        for lang in langs:
            payload = read_json(LOCALE_DIR / f"{lang}.json")
            tables[lang] = payload if isinstance(payload, dict) else {}
        manifest["lore_stats"] = _extract_lore(
            game, sources, tables, langs, request.force, reporter)
    versions = {
        "checkpoints": CHECKPOINT_VERSION,
        "entries": ENTRY_VERSION,
        "lore": LORE_VERSION,
        "stat": STAT_VERSION,
    }
    for name, version in versions.items():
        if redo[name]:
            manifest[f"{name}_version"] = version
    write_json(MANIFEST_PATH, manifest, indent=2)


def run(request: ExtractRequest, reporter: Reporter) -> ExtractResult:
    game = request.game if request.game is not None else game_root()
    if game is None:
        reporter.error("no game directory given; pass --game or set the game directory env var")
        return ExtractResult(USAGE, "game directory missing")
    if not (resources_path(game).exists() and locale_path(game).exists()
            and managers_path(game).exists()):
        reporter.error(f"game assets not found under {asset_dir(game)}")
        return ExtractResult(USAGE, "game assets missing")
    langs = request.langs
    if not langs:
        reporter.error("no language selected; pass --langs zh-tw,zh-cn")
        return ExtractResult(USAGE, "no language")

    assets = _asset_fingerprints(game)
    manifest = load_manifest(MANIFEST_PATH)
    if not request.force and manifest_matches(manifest, assets, langs, LUA_DIR, LOCALE_DIR):
        reporter.write("[skip] resources unchanged and outputs complete; use --force to rerun")
        reporter.write(
            f"       {manifest.get('script_count')} scripts, "
            + ", ".join(f"{lang} {count} keys"
                        for lang, count in (manifest.get("locale_keys") or {}).items()))
        _rebuild_conditional(game, langs, manifest, request, reporter)
        return ExtractResult(OK, scripts=int(manifest.get("script_count") or 0), langs=langs)

    corpus = extract_scripts(game, reporter)
    if not corpus.scripts:
        reporter.error("no script extracted, check the game version or UnityPy compatibility")
        return ExtractResult(DATA, "no scripts")
    _write_scripts(corpus.scripts, reporter)

    checkpoint_stats = (_extract_checkpoints(game, corpus.scripts, request.force, reporter)
                        if request.checkpoints else {"enabled": False, "skipped": True})
    entry_stats = (_extract_entries(game, set(corpus.scripts), request.force, reporter)
                   if request.entries else {"enabled": False, "skipped": True})
    stat_stats = (_extract_stats(game, request.force, reporter)
                  if request.stats else {"enabled": False, "skipped": True})

    tables, locale_stats = extract_locales(locale_path(game), langs, reporter)
    locale_keys, namespaces = _write_locales(tables, langs, reporter)
    lore_stats = (_extract_lore(game, corpus.scripts, tables, langs, request.force, reporter)
                  if request.lore else {"enabled": False, "skipped": True})

    info = read_game_info(managers_path(game), None, install_dir(game))
    if info.version:
        reporter.info(f"game version: v{info.version}")

    save_manifest(
        MANIFEST_PATH,
        _manifest_payload(game, langs, assets, corpus, locale_keys, locale_stats, namespaces,
                          checkpoint_stats, entry_stats, stat_stats, lore_stats),
    )
    reporter.blank()
    reporter.write(f"[done] {len(corpus.scripts)} scripts -> {LUA_DIR}")
    reporter.write(f"[done] stat assets -> {STATS_PATH}")
    for lang in langs:
        reporter.write(f"[done] {lang} locale table -> {LOCALE_DIR / (lang + '.json')}")
    reporter.write(f"[done] manifest -> {MANIFEST_PATH}")
    return ExtractResult(OK, scripts=len(corpus.scripts), langs=langs)


__all__ = ["ExtractRequest", "ExtractResult", "run"]
