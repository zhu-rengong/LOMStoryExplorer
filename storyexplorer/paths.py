from __future__ import annotations

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
WEB_JS_DIR = WEB_DIR / "js"
WEB_VENDOR_DIR = WEB_DIR / "vendor"

ANALYSIS_CACHE_PATH = CACHE_DIR / "analysis.json.gz"
ARTIFACT_CACHE_PATH = CACHE_DIR / "artifacts.json"
CHECKPOINT_CACHE_PATH = CACHE_DIR / "checkpoints.json"
ENTRY_CACHE_PATH = CACHE_DIR / "entries.json"
LORE_CACHE_PATH = CACHE_DIR / "lore.json"
