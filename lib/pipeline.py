from __future__ import annotations

import gzip
import hashlib
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import entries, gametime
from .chapters import build_chapters, classify
from .emit.catalog import write_catalog
from .emit.conditions import write_conditions
from .emit.jsout import cleanup_generated
from .emit.report import write_report
from .emit.shards import ShardPlan, plan_shards, story_bytes
from .emit.text import Renderer, write_language
from .manifest import read_json
from .model import BranchBeat, ChoiceBeat, SayBeat, StoryAnalysis, StoryEdge
from .paths import (
    CACHE_DIR, CHECKPOINT_JSON, DEFAULT_LANG, ENTRIES_JSON, LOCALE_DIR, LUA_DIR, MANIFEST_PATH,
    REPORT_PATH, WEB_DATA_DIR,
)
from . import flow

PROTOCOL_VERSION = 1
CACHE_VERSION = 2
EMPTY_FLAG = 1
SIMPLIFIED_FLAG = 2


class BuildError(RuntimeError):
    pass


@dataclass(slots=True, frozen=True)
class BuildOptions:
    langs: tuple[str, ...]
    default_lang: str = DEFAULT_LANG
    use_cache: bool = True
    full_text: bool = False


@dataclass(slots=True)
class AnalysisResult:
    models: dict[str, StoryAnalysis]
    reused: int
    failed: int


def load_cache(path: Path) -> dict[str, Any]:
    try:
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            payload = json.load(stream)
    except (OSError, ValueError, EOFError):
        return {}
    return payload if payload.get("version") == CACHE_VERSION else {}


def save_cache(path: Path, entries: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with gzip.open(temporary, "wt", encoding="utf-8") as stream:
            json.dump({"version": CACHE_VERSION, "entries": entries}, stream, ensure_ascii=False)
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def analyze_sources(sources: dict[str, str], use_cache: bool) -> AnalysisResult:
    path = CACHE_DIR / "analysis.json.gz"
    cached = load_cache(path).get("entries", {}) if use_cache else {}
    current: dict[str, Any] = {}
    models: dict[str, StoryAnalysis] = {}
    reused = 0
    for script_id, source in sorted(sources.items()):
        signature = hashlib.sha256(f"{flow.FLOW_VERSION}:{source}".encode("utf-8")).hexdigest()[:24]
        hit = cached.get(script_id) or {}
        if hit.get("signature") == signature:
            models[script_id] = StoryAnalysis.from_dict(hit["model"])
            reused += 1
        else:
            models[script_id] = flow.analyze(script_id, source)
        current[script_id] = {"signature": signature, "model": models[script_id].to_dict()}
    if use_cache:
        save_cache(path, current)
    failed = sum(bool(model.diagnostics) and not model.beats for model in models.values())
    return AnalysisResult(models, reused, failed)


def speakers_of(beats: list) -> set[str]:
    speakers: set[str] = set()
    for beat in beats:
        if isinstance(beat, SayBeat) and beat.speaker:
            speakers.add(beat.speaker)
        elif isinstance(beat, ChoiceBeat):
            for option in beat.options:
                speakers.update(speakers_of(option.body))
        elif isinstance(beat, BranchBeat):
            speakers.update(speakers_of(beat.body))
    return speakers


class BuildPipeline:
    def __init__(self, options: BuildOptions, log=print) -> None:
        self.options = options
        self.log = log

    def run(self) -> dict[str, Any]:
        self.validate_options()
        sources = self.read_sources()
        manifest = read_json(MANIFEST_PATH)
        started = time.time()
        analysis = analyze_sources(sources, self.options.use_cache)
        self.log(
            f"[1/4] Analyzed {len(sources)} scripts: {len(sources) - analysis.reused} changed, "
            f"{analysis.reused} cached, {analysis.failed} failed"
        )
        node_ids = sorted(analysis.models)
        chapters, chapter_indexes = build_chapters(node_ids)
        chapter_of = {script_id: classify(script_id)[0] for script_id in node_ids}
        edges, dynamic = self.collect_edges(analysis.models)
        probe = read_json(ENTRIES_JSON)
        position_edges, entry_list, entry_stats = entries.build(
            sources, node_ids, {(edge.source, edge.target) for edge in edges}, probe
        )
        edges.extend(position_edges)
        locales = {lang: self.read_locale(lang) for lang in self.options.langs}
        rendered: dict[str, dict[str, Any]] = {}
        shard_plans: dict[str, ShardPlan] = {}
        for lang, locale in locales.items():
            renderer = Renderer(locale, lang)
            stories = {script_id: renderer.render(analysis.models[script_id].beats) for script_id in node_ids}
            stories = {script_id: beats for script_id, beats in stories.items() if beats}
            sizes = {script_id: story_bytes(stories.get(script_id, [])) for script_id in node_ids}
            shard_plans[lang] = plan_shards(node_ids, sizes, chapter_of, [chapter.id for chapter in chapters])
            rendered[lang] = {"renderer": renderer, "stories": stories, "sizes": sizes}
            self.log(f"      {lang}: {len(stories)} nonempty stories, {renderer.missing_count} missing text keys")
        catalog = self.catalog(
            manifest, node_ids, chapters, chapter_indexes, chapter_of, analysis.models, edges, entry_list,
            entry_stats["entry_sources"], shard_plans,
        )
        WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
        keep = {"catalog.js"}
        output = {"catalogBytes": write_catalog(WEB_DATA_DIR / "catalog.js", catalog), "languages": {}}
        condition_payload = read_json(CHECKPOINT_JSON)
        condition_items = condition_payload.get("items") or {}
        condition_files = write_conditions(WEB_DATA_DIR, condition_items, PROTOCOL_VERSION)
        keep.update(condition_files)
        for lang in self.options.langs:
            bundle = rendered[lang]
            stats = write_language(
                WEB_DATA_DIR, lang, bundle["stories"], bundle["renderer"], shard_plans[lang],
                self.options.full_text, PROTOCOL_VERSION,
            )
            keep.update(stats.pop("files"))
            output["languages"][lang] = stats
        cleanup_generated(WEB_DATA_DIR, keep)
        diagnostics = [diagnostic.format() for model in analysis.models.values() for diagnostic in model.diagnostics]
        report = {
            "protocolVersion": PROTOCOL_VERSION,
            "generatedAt": catalog["generatedAt"],
            "scripts": len(node_ids),
            "edges": len(edges),
            "chapters": len(chapters),
            "analysis": {"reused": analysis.reused, "failed": analysis.failed, "diagnostics": diagnostics[:500]},
            "dynamic": dynamic,
            "entries": entry_stats,
            "output": output,
            "elapsed": round(time.time() - started, 2),
        }
        write_report(REPORT_PATH, report)
        self.log(f"[done] {len(node_ids)} scripts, {len(edges)} edges, {len(chapters)} chapters")
        self.log(f"       Data: {WEB_DATA_DIR}")
        return report

    def validate_options(self) -> None:
        if not self.options.langs:
            raise BuildError("No language selected; pass --langs zh-tw,zh-cn")
        if self.options.default_lang not in self.options.langs:
            raise BuildError("The default language must be included in --langs")
        if not LUA_DIR.is_dir():
            raise BuildError("data/lua not found; run extract.py first")

    def read_sources(self) -> dict[str, str]:
        sources = {path.stem: path.read_text(encoding="utf-8") for path in sorted(LUA_DIR.glob("*.lua"))}
        if not sources:
            raise BuildError("data/lua is empty; run extract.py first")
        return sources

    @staticmethod
    def read_locale(lang: str) -> dict:
        path = LOCALE_DIR / f"{lang}.json"
        if not path.is_file():
            raise BuildError(f"Missing {path}; run extract.py first")
        return read_json(path)

    @staticmethod
    def collect_edges(models: dict[str, StoryAnalysis]) -> tuple[list[StoryEdge], list[str]]:
        ids = set(models)
        edges: list[StoryEdge] = []
        dynamic: list[str] = []
        seen: set[tuple[str, str, str]] = set()
        for script_id, model in models.items():
            dynamic.extend(f"{script_id}: {item}" for item in model.dynamic)
            for edge in model.edges:
                if edge.target not in ids:
                    dynamic.append(f"{script_id}: missing target {edge.target}")
                    continue
                key = (edge.source, edge.target, edge.kind)
                if key not in seen:
                    seen.add(key)
                    edges.append(edge)
        return edges, dynamic

    def catalog(self, manifest: dict, node_ids: list[str], chapters: list, chapter_indexes: dict[str, int],
                chapter_of: dict[str, str], models: dict[str, StoryAnalysis], edges: list[StoryEdge],
                entry_list: list[dict], entry_sources: dict[str, str], shard_plans: dict[str, ShardPlan]) -> dict:
        anomalies = manifest.get("anomalies") or {}
        empty = set(anomalies.get("empty") or [])
        simplified = set(anomalies.get("simplified_only") or [])
        indexes = {script_id: index for index, script_id in enumerate(node_ids)}
        incoming = {script_id: 0 for script_id in node_ids}
        outgoing = {script_id: 0 for script_id in node_ids}
        for edge in edges:
            outgoing[edge.source] += 1
            incoming[edge.target] += 1
        dates = gametime.explicit_dates({script_id: (LUA_DIR / f"{script_id}.lua").read_text(encoding="utf-8")
                                         for script_id in node_ids})
        nodes = []
        for script_id in node_ids:
            model = models[script_id]
            flags = (EMPTY_FLAG if script_id in empty else 0) | (SIMPLIFIED_FLAG if script_id in simplified else 0)
            nodes.append({
                "id": script_id,
                "chapter": chapter_indexes[chapter_of[script_id]],
                "say": model.stats.get("say", 0),
                "in": incoming[script_id],
                "out": outgoing[script_id],
                "flags": flags,
                "entry": entry_sources.get(script_id) or next(
                    (entry["source"] for entry in entry_list if entry["id"] == script_id), ""
                ),
                "date": dates.get(script_id, 0),
                "speakers": sorted(speakers_of(model.beats)),
                "shards": {lang: shard_plans[lang].assignment[script_id] for lang in self.options.langs},
            })
        return {
            "version": PROTOCOL_VERSION,
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "defaultLang": self.options.default_lang,
            "languages": list(self.options.langs),
            "chapters": [{"id": chapter.id, "title": chapter.title, "color": chapter.color, "count": chapter.count}
                         for chapter in chapters],
            "nodes": nodes,
            "edges": [[indexes[edge.source], indexes[edge.target], edge.kind, edge.label] for edge in edges],
            "entries": entry_list,
            "conditionShards": 8,
            "game": manifest.get("game_info") or {},
        }
