from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .locale import detect_language, merge_tables, parse_locale_text
from .paths import FALLBACK_PREFIX, MANAGERS_ASSET, MANAGERS_SUBDIR, PRIMARY_PREFIX


@dataclass(slots=True)
class ScriptCorpus:
    scripts: dict[str, str] = field(default_factory=dict)
    stats: dict[str, int] = field(default_factory=dict)
    anomalies: dict[str, list[str]] = field(default_factory=dict)


def close_environment(environment: Any) -> None:
    try:
        environment.file.close()
    except (AttributeError, OSError):
        pass


def iter_text_assets(asset_path: Path, on_error: Callable[[str], None] | None = None) -> Iterator[tuple[int, str, str]]:
    import UnityPy

    environment = UnityPy.load(str(asset_path))
    try:
        for obj in environment.objects:
            if obj.type.name != "TextAsset":
                continue
            try:
                data = obj.read()
                name = str(getattr(data, "m_Name", "") or obj.peek_name() or "").strip()
                text = getattr(data, "m_Script", None)
                if text is None:
                    raw = getattr(data, "script", b"")
                    text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
            except Exception as exc:
                if on_error:
                    on_error(f"Failed to read TextAsset {getattr(obj, 'path_id', '?')}: {type(exc).__name__}")
                continue
            if name:
                yield obj.path_id, name, str(text).lstrip("\ufeff")
    finally:
        close_environment(environment)


def resource_map(game: Path) -> dict[str, int]:
    import UnityPy

    environment = UnityPy.load(str(game / MANAGERS_SUBDIR / MANAGERS_ASSET))
    try:
        for obj in environment.objects:
            if obj.type.name != "ResourceManager":
                continue
            container = obj.read_typetree().get("m_Container") or []
            return {str(path).lower(): int(info["m_PathID"]) for path, info in container}
    finally:
        close_environment(environment)
    return {}


def extract_scripts(game: Path, on_error: Callable[[str], None] | None = None) -> ScriptCorpus:
    corpus = ScriptCorpus()
    mapping = {path: pid for path, pid in resource_map(game).items() if path.startswith("story/")}
    assets: dict[int, tuple[str, str]] = {}
    total = 0
    resources = game / MANAGERS_SUBDIR / "resources.assets"
    for path_id, name, text in iter_text_assets(resources, on_error):
        assets[path_id] = (name, text)
        total += 1
    origin: dict[str, str] = {}
    missing: list[str] = []
    empty: list[str] = []
    for prefix, source in ((PRIMARY_PREFIX, "traditional"), (FALLBACK_PREFIX, "simplified")):
        for path, path_id in sorted(mapping.items()):
            if not path.startswith(prefix):
                continue
            if path_id not in assets:
                missing.append(path)
                continue
            asset_name, text = assets[path_id]
            name = asset_name or path.rsplit("/", 1)[-1]
            if source == "simplified" and (not text or name in corpus.scripts):
                continue
            corpus.scripts[name] = text
            origin[name] = source
            if not text:
                empty.append(name)
    fallback = sorted(name for name, source in origin.items() if source == "simplified")
    corpus.stats = {
        "text_assets": total,
        "resource_paths": len(mapping),
        "traditional": sum(source == "traditional" for source in origin.values()),
        "simplified_only": len(fallback),
    }
    corpus.anomalies = {"simplified_only": fallback, "empty": sorted(empty), "missing": sorted(missing)}
    return corpus


def extract_locales(asset_path: Path, langs: tuple[str, ...],
                    on_error: Callable[[str], None] | None = None) -> tuple[dict, dict]:
    tables: dict[str, dict[str, dict[str, str]]] = {lang: {} for lang in langs}
    stats: dict[str, Any] = {"shards": 0, "lines": 0, "continued": 0, "unknown_lang": 0, "skipped": 0}
    for name, text in ((name, text) for _, name, text in iter_text_assets(asset_path, on_error)):
        if " = " not in text:
            stats["skipped"] += 1
            continue
        table, matched, continued = parse_locale_text(text)
        if matched < 8:
            stats["skipped"] += 1
            continue
        language = detect_language(text, name)
        if language not in tables:
            stats["unknown_lang"] += 1
            continue
        stats["shards"] += 1
        stats["lines"] += matched
        stats["continued"] += continued
        merge_tables(tables[language], table)
    stats["namespaces"] = {lang: sorted(table) for lang, table in tables.items()}
    return tables, stats
