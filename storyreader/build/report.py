from __future__ import annotations

from pathlib import Path
from typing import Any

from ..cache import write_json
from ..config import SCHEMA_VERSION


def compose(*, generated: str, scripts: int, edge_counts: dict[str, int],
            node_counts: dict[str, int], entries: dict[str, Any], facets: dict[str, Any],
            checkpoints: dict[str, Any], wordcount: dict[str, Any], times: dict[str, Any],
            chapters: list[dict[str, Any]], text: dict[str, Any],
            languages: dict[str, Any], dynamic: list[str], analysis: dict[str, Any],
            artifacts: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "generated": generated,
        "scripts": scripts,
        "edges": edge_counts,
        "nodes": node_counts,
        "entries": entries,
        "facets": facets,
        "checkpoints": checkpoints,
        "wordcount": wordcount,
        "time": times,
        "chapters": chapters,
        "text": text,
        "languages": languages,
        "dynamic_jumps": dynamic[:200],
        "analysis": analysis,
        "artifacts": artifacts,
    }


def write_report(path: Path, payload: dict[str, Any]) -> int:
    return write_json(path, payload, indent=2)


def fmt_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.2f} MB"
