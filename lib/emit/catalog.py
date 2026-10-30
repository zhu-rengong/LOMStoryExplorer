from __future__ import annotations

from pathlib import Path
from typing import Any

from .jsout import write_assignment


def write_catalog(path: Path, payload: dict[str, Any]) -> int:
    return write_assignment(path, "__SR_CATALOG__", payload)
