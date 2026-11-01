from __future__ import annotations

from pathlib import Path
from typing import Any

from .jsonio import read_json, write_json


def load_manifest(path: Path) -> dict[str, Any]:
    payload = read_json(path)
    return payload if isinstance(payload, dict) else {}


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    write_json(path, manifest, indent=2)


def manifest_matches(manifest: dict[str, Any], assets: dict[str, dict[str, Any]],
                     langs: tuple[str, ...], lua_dir: Path, locale_dir: Path) -> bool:
    if not manifest or manifest.get("langs") != list(langs):
        return False
    previous = manifest.get("assets") or {}
    for name, fingerprint in assets.items():
        if (previous.get(name) or {}).get("sha256_16") != fingerprint["sha256_16"]:
            return False
    if not lua_dir.is_dir() or not any(lua_dir.glob("*.lua")):
        return False
    return all((locale_dir / f"{lang}.json").exists() for lang in langs)
