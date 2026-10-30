from __future__ import annotations

from pathlib import Path
from typing import Any

from ..manifest import write_json


def write_report(path: Path, report: dict[str, Any]) -> None:
    write_json(path, report, pretty=True)


def fmt_bytes(size: int) -> str:
    return f"{size / (1 << 20):.1f} MB" if size >= 1 << 20 else f"{size / 1024:.0f} KB"
