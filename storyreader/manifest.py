from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .cache import read_json, write_json


@dataclass(frozen=True)
class ExtractManifest:
    schema: int
    generated_at: str
    game: str
    langs: list[str]
    assets: dict[str, dict[str, Any]]
    script_count: int
    script_stats: dict[str, Any]
    anomalies: dict[str, Any]
    locale_keys: dict[str, int]
    locale_stats: dict[str, Any]
    checkpoint_stats: dict[str, Any]
    entry_stats: dict[str, Any]
    checkpoint_version: int
    entry_version: int

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def load_manifest(path: Path) -> dict[str, Any]:
    payload = read_json(path)
    return payload if isinstance(payload, dict) else {}


def save_manifest(path: Path, manifest: ExtractManifest) -> None:
    write_json(path, manifest.to_json(), indent=2)


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
