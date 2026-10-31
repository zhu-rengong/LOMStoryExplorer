from __future__ import annotations

from pathlib import Path

from ..console import Reporter

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_DATA = 3


def split_langs(raw: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def require_files(paths: tuple[Path, ...], reporter: Reporter) -> bool:
    ok = True
    for path in paths:
        if not path.exists():
            reporter.error(f"asset file not found: {path}")
            ok = False
    return ok
