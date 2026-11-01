from __future__ import annotations

from pathlib import Path

from ..paths import LUA_DIR

__all__ = ["load_sources"]


def load_sources(lua_dir: Path = LUA_DIR) -> dict[str, str]:
    base = Path(lua_dir)
    if not base.is_dir():
        return {}
    return {path.stem: path.read_text(encoding="utf-8") for path in sorted(base.glob("*.lua"))}
