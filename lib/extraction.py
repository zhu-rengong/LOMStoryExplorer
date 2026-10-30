from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import checkpoints, entryprobe, gameinfo
from .assets import extract_locales, extract_scripts
from .manifest import EXTRACTION_VERSION, file_fingerprint, manifest_matches, read_json, write_json
from .paths import (
    CHECKPOINT_CACHE, CHECKPOINT_JSON, ENTRIES_CACHE, ENTRIES_JSON, LOCALE_ASSET, LOCALE_DIR, LUA_DIR,
    MANAGERS_ASSET, MANAGERS_SUBDIR, MANIFEST_PATH, RESOURCES_ASSET, asset_paths, game_root, installdir,
    steamapps_dir,
)

Logger = Callable[[str], None]


class ExtractionError(RuntimeError):
    pass


@dataclass(slots=True, frozen=True)
class ExtractionOptions:
    game: Path
    langs: tuple[str, ...]
    force: bool = False
    checkpoints: bool = True
    entries: bool = True


class ExtractionPipeline:
    def __init__(self, options: ExtractionOptions, log: Logger = print) -> None:
        self.options = options
        self.log = log

    def run(self) -> dict[str, Any]:
        paths = asset_paths(self.options.game)
        missing = [path for path in paths.values() if not path.is_file()]
        if missing:
            raise ExtractionError(f"Required game asset not found: {missing[0]}")
        fingerprints = {name: file_fingerprint(path) for name, path in paths.items()}
        manifest = read_json(MANIFEST_PATH)
        if not self.options.force and manifest_matches(manifest, fingerprints, self.options.langs):
            self.log("[skip] Game assets and requested outputs are unchanged")
            return self.refresh_optional(manifest, paths[RESOURCES_ASSET].parent)
        self.log(f"[1/4] Reading story resources from {paths[RESOURCES_ASSET].name}")
        corpus = extract_scripts(self.options.game, self.warn)
        if not corpus.scripts:
            raise ExtractionError("No story scripts were extracted; check the game version and UnityPy compatibility")
        self.log(
            f"      {len(corpus.scripts)} scripts: {corpus.stats['traditional']} traditional, "
            f"{corpus.stats['simplified_only']} simplified-only"
        )
        self.write_corpus(corpus.scripts)
        self.log(f"[2/4] Reading locales: {', '.join(self.options.langs)}")
        tables, locale_stats = extract_locales(paths[LOCALE_ASSET], self.options.langs, self.warn)
        empty_langs = [lang for lang in self.options.langs if not tables[lang].get("Story")]
        if empty_langs:
            raise ExtractionError(f"No Story locale entries found for: {', '.join(empty_langs)}")
        locale_keys: dict[str, int] = {}
        for lang, table in tables.items():
            write_json(LOCALE_DIR / f"{lang}.json", dict(sorted(table.items())))
            locale_keys[lang] = len(table.get("Story", {}))
            self.log(f"      {lang}: {locale_keys[lang]} Story keys, {len(table)} namespaces")
        checkpoint_stats = self.extract_checkpoints(paths[RESOURCES_ASSET].parent) if self.options.checkpoints else {
            "enabled": False, "skipped": True,
        }
        entry_stats = self.extract_entries(paths[RESOURCES_ASSET].parent, set(corpus.scripts)) if self.options.entries else {
            "enabled": False, "skipped": True,
        }
        managers = paths[MANAGERS_ASSET]
        info = gameinfo.read_game_info(managers, steamapps_dir(self.options.game), installdir(self.options.game))
        result = {
            "version": EXTRACTION_VERSION,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "game": str(self.options.game),
            "game_info": info,
            "langs": list(self.options.langs),
            "assets": fingerprints,
            "script_count": len(corpus.scripts),
            "script_stats": corpus.stats,
            "anomalies": corpus.anomalies,
            "locale_keys": locale_keys,
            "locale_stats": locale_stats,
            "checkpoint_stats": checkpoint_stats,
            "entry_stats": entry_stats,
            "checkpoint_version": checkpoints.CHECKPOINT_VERSION,
            "entry_version": entryprobe.ENTRY_VERSION,
        }
        write_json(MANIFEST_PATH, result, pretty=True)
        self.log(f"[done] {len(corpus.scripts)} scripts and {len(self.options.langs)} locales extracted")
        return result

    def refresh_optional(self, manifest: dict[str, Any], assets_dir: Path) -> dict[str, Any]:
        result = dict(manifest)
        changed = False
        if self.options.checkpoints and (
            not CHECKPOINT_JSON.is_file() or result.get("checkpoint_version") != checkpoints.CHECKPOINT_VERSION
        ):
            result["checkpoint_stats"] = self.extract_checkpoints(assets_dir)
            result["checkpoint_version"] = checkpoints.CHECKPOINT_VERSION
            changed = True
        if self.options.entries and (
            not ENTRIES_JSON.is_file() or result.get("entry_version") != entryprobe.ENTRY_VERSION
        ):
            ids = {path.stem for path in LUA_DIR.glob("*.lua")}
            result["entry_stats"] = self.extract_entries(assets_dir, ids)
            result["entry_version"] = entryprobe.ENTRY_VERSION
            changed = True
        if changed:
            write_json(MANIFEST_PATH, result, pretty=True)
        return result

    def write_corpus(self, scripts: dict[str, str]) -> None:
        from .manifest import atomic_write_text

        LUA_DIR.mkdir(parents=True, exist_ok=True)
        for name, text in sorted(scripts.items()):
            atomic_write_text(LUA_DIR / f"{name}.lua", text)
        for path in LUA_DIR.glob("*.lua"):
            if path.stem not in scripts:
                path.unlink()

    def extract_checkpoints(self, assets_dir: Path) -> dict[str, Any]:
        wanted = checkpoints.collect_keys(LUA_DIR)
        hints = checkpoints.collect_key_methods(LUA_DIR)
        if not wanted:
            write_json(CHECKPOINT_JSON, {"version": checkpoints.CHECKPOINT_VERSION, "items": {}, "gaps": []})
            return {"enabled": True, "skipped": True, "wanted": 0, "resolved": 0}
        if not checkpoints.available():
            self.warn("TypeTreeGeneratorAPI is unavailable; checkpoint details will be omitted")
            write_json(CHECKPOINT_JSON, {"version": checkpoints.CHECKPOINT_VERSION, "items": {}, "gaps": []})
            return {"enabled": True, "skipped": True, "wanted": len(wanted), "resolved": 0}
        fingerprint = checkpoints.fingerprint(assets_dir)
        cache = {} if self.options.force else read_json(CHECKPOINT_CACHE)
        if cache.get("version") == checkpoints.CHECKPOINT_VERSION and cache.get("fingerprint") == fingerprint:
            items = cache.get("items") or {}
            gaps = cache.get("gaps") or []
        else:
            self.log(f"[3/4] Resolving {len(wanted)} checkpoint configurations")
            found = checkpoints.scan(assets_dir, wanted, self.log)
            items, gaps = checkpoints.extract(assets_dir, found, self.log, hints)
            write_json(CHECKPOINT_CACHE, {
                "version": checkpoints.CHECKPOINT_VERSION, "fingerprint": fingerprint, "items": items, "gaps": gaps,
            })
        write_json(CHECKPOINT_JSON, {"version": checkpoints.CHECKPOINT_VERSION, "items": items, "gaps": gaps})
        stats = checkpoints.summarize(items, len(wanted), gaps)
        stats.update(enabled=True, skipped=False)
        self.log(f"      Checkpoints: {len(items)}/{len(wanted)} resolved")
        return stats

    def extract_entries(self, assets_dir: Path, ids: set[str]) -> dict[str, Any]:
        fingerprint = entryprobe.unityprobe.fingerprint(assets_dir)
        cached = None if self.options.force else entryprobe.load_cache(ENTRIES_CACHE, fingerprint)
        if cached is None:
            self.log(f"[4/4] Probing system entries for {len(ids)} scripts")
            try:
                cached = entryprobe.probe(assets_dir, ids, self.log)
            except Exception as exc:
                self.warn(f"System entry probe degraded: {type(exc).__name__}")
                cached = {"version": entryprobe.ENTRY_VERSION, "entries": {}, "positions": {}, "stats": {
                    "ok": False, "reason": type(exc).__name__,
                }}
            if cached.get("stats", {}).get("ok"):
                entryprobe.save_cache(ENTRIES_CACHE, cached)
        write_json(ENTRIES_JSON, cached)
        stats = entryprobe.summarize(cached)
        stats.update(enabled=True, skipped=not stats["ok"])
        return stats

    def warn(self, message: str) -> None:
        self.log(f"      [warn] {message}")


def run_extraction(game: Path | None, langs: tuple[str, ...], force: bool = False,
                   with_checkpoints: bool = True, with_entries: bool = True,
                   log: Logger = print) -> dict[str, Any]:
    root = game or game_root()
    if root is None:
        raise ExtractionError("No game directory given; use --game or set MORTAL_GAME_DIR")
    if not langs:
        raise ExtractionError("No language selected; pass --langs zh-tw,zh-cn")
    options = ExtractionOptions(root.expanduser().resolve(), langs, force, with_checkpoints, with_entries)
    return ExtractionPipeline(options, log).run()
