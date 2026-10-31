from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..config import FALLBACK_PREFIX, PRIMARY_PREFIX, SCRIPT_PREFIX, resources_path
from ..console import Reporter
from .resources import resource_map
from .unity import unitypy


@dataclass
class ScriptCorpus:
    scripts: dict[str, str] = field(default_factory=dict)
    origin: dict[str, str] = field(default_factory=dict)
    stats: dict[str, Any] = field(default_factory=dict)
    anomalies: dict[str, list[str]] = field(default_factory=dict)


def extract_scripts(game: Path, reporter: Reporter) -> ScriptCorpus:
    resources = resources_path(game)
    reporter.stage(1, 4, f"reading scripts: {resources.name}")
    started = time.time()
    mapping = {key: value for key, value in resource_map(game).items() if key.startswith(SCRIPT_PREFIX)}
    reporter.info(f"{len(mapping)} resource paths")

    by_id: dict[int, tuple[str, str]] = {}
    text_assets = 0
    env = unitypy().load(str(resources))
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        try:
            data = obj.read()
        except Exception as exc:
            reporter.warn(f"failed to read path_id={obj.path_id}: {type(exc).__name__}")
            continue
        text_assets += 1
        by_id[obj.path_id] = (
            str(getattr(data, "m_Name", "") or "").strip(),
            str(getattr(data, "m_Script", "") or "").lstrip("\ufeff"),
        )

    corpus = ScriptCorpus()
    missing: list[str] = []
    empty: list[str] = []

    for path, path_id in sorted(mapping.items()):
        if not path.startswith(PRIMARY_PREFIX):
            continue
        name, text = by_id.get(path_id, ("", ""))
        if not name:
            name = path.rsplit("/", 1)[-1]
        if path_id not in by_id:
            missing.append(path)
            continue
        if not text:
            empty.append(name)
        corpus.scripts[name] = text
        corpus.origin[name] = "traditional"

    fallback_only: list[str] = []
    for path, path_id in sorted(mapping.items()):
        if not path.startswith(FALLBACK_PREFIX):
            continue
        name, text = by_id.get(path_id, ("", ""))
        if not text or name in corpus.scripts:
            continue
        corpus.scripts[name] = text
        corpus.origin[name] = "simplified"
        fallback_only.append(name)

    corpus.stats = {
        "text_assets": text_assets,
        "traditional": sum(1 for value in corpus.origin.values() if value == "traditional"),
        "simplified_only": len(fallback_only),
    }
    corpus.anomalies = {"simplified_only": fallback_only, "empty": empty, "missing": missing}

    reporter.info(
        f"{text_assets} TextAssets -> {len(corpus.scripts)} scripts"
        f" (traditional {corpus.stats['traditional']}, simplified only {corpus.stats['simplified_only']}),"
        f" {time.time() - started:.1f}s"
    )
    if fallback_only:
        reporter.info(f"simplified only (unreachable in game): {', '.join(fallback_only[:6])}")
    if empty:
        reporter.info(f"{len(empty)} empty scripts: {', '.join(empty[:6])}")
    if missing:
        reporter.warn(f"{len(missing)} paths present but resources missing: {missing[:3]}")
    return corpus
