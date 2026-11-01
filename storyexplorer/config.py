from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = ROOT / "data"
LUA_DIR = DATA_DIR / "lua"
LOCALE_DIR = DATA_DIR / "locale"
CACHE_DIR = DATA_DIR / "cache"
MANIFEST_PATH = DATA_DIR / "manifest.json"
CHECKPOINTS_PATH = DATA_DIR / "checkpoints.json"
ENTRIES_PATH = DATA_DIR / "entries.json"
LORE_PATH = DATA_DIR / "lore.json"
REPORT_PATH = DATA_DIR / "report.json"

WEB_DIR = ROOT / "docs"
WEB_DATA_DIR = WEB_DIR / "data"

TEXT_SOURCE_LANG = "zh-tw"
DERIVED_LANGS = ("zh-cn",)
LOCALE_LANGS = (TEXT_SOURCE_LANG, *DERIVED_LANGS)
DEFAULT_LANGS = (TEXT_SOURCE_LANG,)
DEFAULT_LANG = TEXT_SOURCE_LANG
SUPPORTED_LANGS = ("zh-tw", "zh-cn", "kr")

GAME_ENV = "MORTAL_GAME_DIR"
MANAGERS_SUBDIR = "Mortal_Data"
RESOURCES_ASSET = "resources.assets"
LOCALE_ASSET = "sharedassets0.assets"
MANAGERS_ASSET = "globalgamemanagers"
SCRIPT_PREFIX = "story/"
PRIMARY_PREFIX = "story/chinesetraditional/"
FALLBACK_PREFIX = "story/chinesesimplified/"

SCHEMA_VERSION = 4
FLOW_VERSION = 13
CHECKPOINT_VERSION = 10
ENTRY_VERSION = 3
LORE_VERSION = 1
ANALYSIS_CACHE_VERSION = 4

MAX_EDGE_LABEL = 60
MAX_STORY_SHARD_BYTES = 700 * 1024
MAX_STORY_SHARDS = 24
CHECKPOINT_SHARDS = 8
MAX_BRANCH_DEPTH = 3

ROUNDS_PER_MONTH = 3
ROUNDS_PER_YEAR = 36

UNITY_VERSION = "2020.3.49f1"


def game_root() -> Path | None:
    raw = os.environ.get(GAME_ENV, "").strip()
    return Path(raw).expanduser() if raw else None


def asset_dir(game: Path) -> Path:
    return Path(game) / MANAGERS_SUBDIR


def managers_path(game: Path) -> Path:
    return asset_dir(game) / MANAGERS_ASSET


def resources_path(game: Path) -> Path:
    return asset_dir(game) / RESOURCES_ASSET


def locale_path(game: Path) -> Path:
    return asset_dir(game) / LOCALE_ASSET


def steamapps_dir(game: Path) -> Path | None:
    for parent in Path(game).parents:
        if parent.name.lower() == "steamapps":
            return parent
    return None


def install_dir(game: Path) -> str:
    return Path(game).name
