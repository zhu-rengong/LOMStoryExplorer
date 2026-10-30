from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LUA_DIR = DATA_DIR / "lua"
LOCALE_DIR = DATA_DIR / "locale"
CACHE_DIR = DATA_DIR / "cache"
MANIFEST_PATH = DATA_DIR / "manifest.json"
CHECKPOINT_JSON = DATA_DIR / "checkpoints.json"
CHECKPOINT_CACHE = CACHE_DIR / "checkpoints.json"
ENTRIES_JSON = DATA_DIR / "entries.json"
ENTRIES_CACHE = CACHE_DIR / "entries.json"
WEB_DIR = ROOT / "docs"
WEB_DATA_DIR = WEB_DIR / "data"

DEFAULT_LANGS = ("zh-tw", "zh-cn")
DEFAULT_LANG = "zh-tw"

GAME_ENV = "MORTAL_GAME_DIR"
RESOURCES_ASSET = "resources.assets"
LOCALE_ASSET = "sharedassets0.assets"
MANAGERS_ASSET = "globalgamemanagers"
MANAGERS_SUBDIR = "Mortal_Data"

PRIMARY_PREFIX = "story/chinesetraditional/"
FALLBACK_PREFIX = "story/chinesesimplified/"


def game_root() -> Path | None:
    raw = os.environ.get(GAME_ENV, "").strip()
    return Path(raw).expanduser() if raw else None


def game_managers(root: Path) -> Path:
    return root / MANAGERS_SUBDIR / MANAGERS_ASSET


def steamapps_dir(root: Path) -> Path | None:
    for parent in Path(root).parents:
        if parent.name.lower() == "steamapps":
            return parent
    return None


def installdir(root: Path) -> str:
    return Path(root).name
