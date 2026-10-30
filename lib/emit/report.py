from __future__ import annotations

import json
from pathlib import Path


def write_report(path: Path, report: dict) -> None:
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def fmt_bytes(size: int) -> str:
    if size >= 1 << 20:
        return f"{size / (1 << 20):.1f} MB"
    return f"{size / 1024:.0f} KB"
