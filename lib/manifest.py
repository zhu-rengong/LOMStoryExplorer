from __future__ import annotations

import hashlib
from pathlib import Path

from .paths import LOCALE_DIR, LUA_DIR


def file_fingerprint(path: Path) -> dict:
    stat = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1 << 20), b""):
            digest.update(chunk)
    return {
        "path": str(path),
        "size": stat.st_size,
        "mtime": int(stat.st_mtime),
        "sha256_16": digest.hexdigest()[:16],
    }


def manifest_matches(manifest: dict, assets: dict[str, dict], langs: tuple[str, ...]) -> bool:
    if not manifest or manifest.get("langs") != list(langs):
        return False
    prev = manifest.get("assets") or {}
    for key, fingerprint in assets.items():
        if prev.get(key, {}).get("sha256_16") != fingerprint["sha256_16"]:
            return False
    return LUA_DIR.is_dir() and all((LOCALE_DIR / f"{lang}.json").exists() for lang in langs)
