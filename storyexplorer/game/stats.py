from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from ..console import Reporter
from .unity import Session, build_generator

TARGET_CLASS = "GameStat"


def _clean(text: Any) -> str:
    if not isinstance(text, str):
        return ""
    return " ".join(text.replace("\r\n", "\n").replace("\r", "\n").split())


def extract(assets_dir: Path, reporter: Reporter) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    started = time.time()
    base = Path(assets_dir)
    _generator, adapter = build_generator(base / "Managed")
    session = Session(base, adapter, reporter.info)
    items: dict[str, dict[str, Any]] = {}
    try:
        for name, obj, _cls in session.iter_class({TARGET_CLASS}):
            tree = session.tree(name, obj)
            if not isinstance(tree, dict):
                continue
            key = _clean(tree.get("m_Name"))
            if not key:
                continue
            entry: dict[str, Any] = {"type": int(tree.get("_type") or 0)}
            note = _clean(tree.get("_name"))
            if note:
                entry["note"] = note
            items[key] = entry
    finally:
        session.close()
    elapsed = round(time.time() - started, 1)
    stats = summarize(items, elapsed)
    reporter.info(
        f"stat assets: {stats['assets']} assets, {stats['with_note']} with notes, {elapsed}s")
    if session.warnings:
        reporter.warn(f"stat assets: {session.warnings} read warnings")
    return dict(sorted(items.items())), stats


def summarize(items: dict[str, dict[str, Any]], elapsed: float = 0.0) -> dict[str, Any]:
    with_note = sum(1 for entry in items.values() if entry.get("note"))
    return {"assets": len(items), "with_note": with_note, "elapsed": round(elapsed, 1)}
