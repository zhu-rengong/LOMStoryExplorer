from __future__ import annotations

from ..config import LUA_DIR

__all__ = ["load_sources"]


def load_sources() -> dict[str, str]:
    if not LUA_DIR.is_dir():
        return {}
    return {path.stem: path.read_text(encoding="utf-8") for path in sorted(LUA_DIR.glob("*.lua"))}
