#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from lib import checkpoints, entryprobe, unityprobe
from lib.assets import extract_locales, resource_map
from lib.manifest import file_fingerprint, manifest_matches
from lib.paths import (CACHE_DIR, CHECKPOINT_CACHE, CHECKPOINT_JSON, DEFAULT_LANGS, ENTRIES_CACHE,
                       ENTRIES_JSON, FALLBACK_PREFIX, GAME_ENV, LOCALE_ASSET, LOCALE_DIR, LUA_DIR,
                       MANAGERS_ASSET, MANAGERS_SUBDIR, MANIFEST_PATH, PRIMARY_PREFIX,
                       RESOURCES_ASSET, game_root)


def log(message: str) -> None:
    print(message, flush=True)


def extract_checkpoints(assets_dir: Path, force: bool) -> dict:
    wanted = checkpoints.collect_keys(LUA_DIR)
    hints = checkpoints.collect_key_methods(LUA_DIR)
    stats = {"enabled": True, "skipped": False, "wanted": len(wanted), "resolved": 0,
             "missing": 0, "by_kind": {}, "elapsed": 0.0}

    def write_output(items: dict, gaps: list[dict] | None = None) -> None:
        CHECKPOINT_JSON.write_text(
            json.dumps({"version": checkpoints.CHECKPOINT_VERSION, "items": items,
                        "gaps": gaps or []},
                       ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    if not wanted:
        log("[warn] no checkpoint references in the corpus, skipping condition extraction")
        stats["skipped"] = True
        write_output({})
        return stats

    if not checkpoints.available():
        log("[warn] TypeTreeGeneratorAPI is not installed (or its .NET runtime is unavailable); "
            "skipping checkpoint extraction, the reader will hide condition blocks")
        stats["skipped"] = True
        write_output({})
        return stats

    fingerprint = checkpoints.fingerprint(assets_dir)
    if not force and CHECKPOINT_CACHE.exists():
        try:
            cache = json.loads(CHECKPOINT_CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
        if (cache.get("version") == checkpoints.CHECKPOINT_VERSION
                and cache.get("fingerprint") == fingerprint):
            items = cache.get("items") or {}
            gaps = cache.get("gaps") or []
            stats.update(checkpoints.summarize(items, len(wanted), gaps))
            log(f"[2/4] checkpoint conditions: {len(items)} from cache"
                f" ({', '.join(f'{kind} {count}' for kind, count in stats['by_kind'].items())})")
            write_output(items, gaps)
            return stats

    started = time.time()
    log(f"[2/4] checkpoint conditions: scanning assets for {len(wanted)} configs...")
    found = checkpoints.scan(assets_dir, wanted, log)
    log(f"      located {len(found)}/{len(wanted)}, reading fields...")
    items, gaps = checkpoints.extract(assets_dir, found, log, hints)
    stats.update(checkpoints.summarize(items, len(wanted), gaps))
    stats["elapsed"] = round(time.time() - started, 1)
    log(f"      resolved {len(items)} ({stats['missing']} missing), {stats['elapsed']}s")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_CACHE.write_text(json.dumps(
        {"version": checkpoints.CHECKPOINT_VERSION, "fingerprint": fingerprint,
         "items": items, "gaps": gaps},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_output(items, gaps)
    return stats


def extract_entries(assets_dir: Path, ids: set[str], force: bool) -> dict:
    stats = {"enabled": True, "skipped": False, "ok": False, "reason": "", "entries": 0,
             "positions": 0, "elapsed": 0.0}

    def write_output(payload: dict) -> None:
        ENTRIES_JSON.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    if not ids:
        log("[warn] no scripts found, skipping the system entry probe")
        stats.update(skipped=True, reason="no scripts")
        write_output({})
        return stats

    fingerprint = unityprobe.fingerprint(assets_dir)
    cached = None if force else entryprobe.load_cache(ENTRIES_CACHE, fingerprint)
    if cached:
        stats.update(entryprobe.summarize(cached))
        log(f"[3/4] system entries: {stats['entries']} sources and"
            f" {stats['positions']} position events from cache")
        write_output(cached)
        return stats

    started = time.time()
    log(f"[3/4] system entries: scanning {len(unityprobe.asset_files(assets_dir))} asset files...")
    payload = entryprobe.probe(assets_dir, ids, log)
    stats.update(entryprobe.summarize(payload))
    stats["elapsed"] = stats.get("elapsed") or round(time.time() - started, 1)
    if not stats["ok"]:
        stats["skipped"] = True
        log(f"[warn] system entries unresolved: {stats['reason']};"
            " the reader shows hardcoded entries only and falls back to prefix expansion")
    else:
        entryprobe.save_cache(ENTRIES_CACHE, payload)
    write_output(payload)
    return stats


def extract_scripts(game: Path) -> tuple[dict[str, str], dict[str, int], dict[str, list]]:
    resources = game / MANAGERS_SUBDIR / RESOURCES_ASSET
    log(f"[1/3] reading scripts: {resources.name}")
    started = time.time()

    mapping = {key: value for key, value in resource_map(game).items() if key.startswith("story/")}
    log(f"      {len(mapping)} resource paths")

    by_id: dict[int, tuple[str, str]] = {}
    total_text_assets = 0

    import UnityPy
    env = UnityPy.load(str(resources))
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        try:
            data = obj.read()
        except Exception as exc:
            log(f"  [warn] failed to read path_id={obj.path_id}: {exc}")
            continue
        total_text_assets += 1
        by_id[obj.path_id] = (
            str(getattr(data, "m_Name", "") or "").strip(),
            str(getattr(data, "m_Script", "") or "").lstrip("\ufeff"),
        )

    scripts: dict[str, str] = {}
    origin: dict[str, str] = {}
    missing: list[str] = []
    empty: list[str] = []

    for path, pid in sorted(mapping.items()):
        if not path.startswith(PRIMARY_PREFIX):
            continue
        name, text = by_id.get(pid, ("", ""))
        if not name:
            name = path.rsplit("/", 1)[-1]
        if pid not in by_id:
            missing.append(path)
            continue
        if not text:
            empty.append(name)
        scripts[name] = text
        origin[name] = "traditional"

    fallback_only: list[str] = []
    for path, pid in sorted(mapping.items()):
        if not path.startswith(FALLBACK_PREFIX):
            continue
        name, text = by_id.get(pid, ("", ""))
        if not text or name in scripts:
            continue
        scripts[name] = text
        origin[name] = "simplified"
        fallback_only.append(name)

    stats = {
        "text_assets": total_text_assets,
        "traditional": sum(1 for value in origin.values() if value == "traditional"),
        "simplified_only": len(fallback_only),
    }
    log(f"      {total_text_assets} TextAssets -> {len(scripts)} scripts"
        f" (traditional {stats['traditional']}, simplified only {stats['simplified_only']}),"
        f" {time.time() - started:.1f}s")
    if fallback_only:
        log(f"      simplified only (unreachable in game, kept for completeness):"
            f" {', '.join(fallback_only[:6])}")
    if empty:
        log(f"      {len(empty)} empty scripts: {', '.join(empty[:6])}")
    if missing:
        log(f"      [warn] {len(missing)} paths present but resources missing: {missing[:3]}")
    return scripts, stats, {"simplified_only": fallback_only, "empty": empty, "missing": missing}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract story Lua files and locale tables from the game assets (read only)")
    parser.add_argument("--game", default=None,
                        help=f"game root directory (defaults to ${GAME_ENV})")
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS),
                        help="languages to export, comma separated (zh-tw,zh-cn,kr)")
    parser.add_argument("--force", action="store_true", help="ignore caches and extract again")
    parser.add_argument("--checkpoints", dest="checkpoints", action="store_true", default=True,
                        help="also resolve checkpoint conditions (default on)")
    parser.add_argument("--no-checkpoints", dest="checkpoints", action="store_false",
                        help="skip checkpoint condition extraction")
    parser.add_argument("--entries", dest="entries", action="store_true", default=True,
                        help="also probe system entries (default on)")
    parser.add_argument("--no-entries", dest="entries", action="store_false",
                        help="skip the system entry probe")
    args = parser.parse_args(argv)

    root = Path(args.game).expanduser() if args.game else game_root()
    if root is None:
        log("[error] no game directory given; use --game or set MORTAL_GAME_DIR")
        return 2
    game = root
    assets_dir = game / MANAGERS_SUBDIR
    resources = assets_dir / RESOURCES_ASSET
    locale_asset = assets_dir / LOCALE_ASSET
    managers = assets_dir / MANAGERS_ASSET
    for path in (resources, locale_asset, managers):
        if not path.exists():
            log(f"[error] asset file not found: {path}")
            return 2

    langs = tuple(item.strip() for item in args.langs.split(",") if item.strip())
    if not langs:
        log("[error] no language selected; pass --langs zh-tw,zh-cn")
        return 2

    assets = {
        RESOURCES_ASSET: file_fingerprint(resources),
        LOCALE_ASSET: file_fingerprint(locale_asset),
        MANAGERS_ASSET: file_fingerprint(managers),
    }

    if not args.force and MANIFEST_PATH.exists():
        try:
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}
        if manifest_matches(manifest, assets, langs):
            log("[skip] resources unchanged and outputs complete; use --force to rerun")
            log(f"       {manifest.get('script_count')} scripts, "
                + ", ".join(f"{lang} {count} keys"
                            for lang, count in (manifest.get("locale_keys") or {}).items()))
            redo_cp = args.checkpoints and (
                not CHECKPOINT_JSON.exists()
                or manifest.get("checkpoint_version") != checkpoints.CHECKPOINT_VERSION)
            redo_entries = args.entries and (
                not ENTRIES_JSON.exists()
                or manifest.get("entry_version") != entryprobe.ENTRY_VERSION)
            if redo_cp:
                log("[+] checkpoint version changed or not extracted yet, rerunning...")
                manifest["checkpoint_stats"] = extract_checkpoints(assets_dir, force=args.force)
            if redo_entries:
                log("[+] entry version changed or not extracted yet, rerunning...")
                manifest["entry_stats"] = extract_entries(
                    assets_dir, {path.stem for path in LUA_DIR.glob("*.lua")},
                    force=args.force)
            if redo_cp or redo_entries:
                manifest["checkpoint_version"] = checkpoints.CHECKPOINT_VERSION
                manifest["entry_version"] = entryprobe.ENTRY_VERSION
                MANIFEST_PATH.write_text(
                    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            return 0

    LUA_DIR.mkdir(parents=True, exist_ok=True)
    LOCALE_DIR.mkdir(parents=True, exist_ok=True)

    scripts, script_stats, anomalies = extract_scripts(game)
    if not scripts:
        log("[error] no script extracted, check the game version or UnityPy compatibility")
        return 3

    for name, text in sorted(scripts.items()):
        (LUA_DIR / f"{name}.lua").write_text(text, encoding="utf-8", newline="")

    stale = 0
    for old in LUA_DIR.glob("*.lua"):
        if old.stem not in scripts:
            old.unlink()
            stale += 1
    if stale:
        log(f"      removed {stale} stale scripts")

    checkpoint_stats = (extract_checkpoints(assets_dir, force=args.force)
                        if args.checkpoints else {"enabled": False, "skipped": True})
    entry_stats = (extract_entries(assets_dir, set(scripts), force=args.force)
                   if args.entries else {"enabled": False, "skipped": True})

    log(f"[4/4] locale tables: {', '.join(langs)} ({locale_asset.name})")
    tables, locale_stats = extract_locales(locale_asset, langs)
    locale_keys: dict[str, int] = {}
    for lang in langs:
        payload = {prefix: entries for prefix, entries in sorted(tables[lang].items())}
        (LOCALE_DIR / f"{lang}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        locale_keys[lang] = len(payload.get("Story", {}))
        log(f"      {lang}: {locale_keys[lang]} Story keys / {len(payload)} namespaces,"
            f" {len(payload.get('Character', {}))} Character keys")

    manifest = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "game": str(game),
        "langs": list(langs),
        "assets": assets,
        "script_count": len(scripts),
        "script_stats": script_stats,
        "anomalies": anomalies,
        "locale_keys": locale_keys,
        "locale_stats": {**locale_stats,
                         "namespaces": {lang: sorted(tables[lang]) for lang in langs}},
        "checkpoint_stats": checkpoint_stats,
        "entry_stats": entry_stats,
        "checkpoint_version": checkpoints.CHECKPOINT_VERSION,
        "entry_version": entryprobe.ENTRY_VERSION,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    log("")
    log(f"[done] {len(scripts)} scripts -> {LUA_DIR}")
    for lang in langs:
        log(f"[done] {lang} locale table -> {LOCALE_DIR / (lang + '.json')}")
    log(f"[done] manifest -> {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
