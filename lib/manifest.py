from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .paths import LOCALE_DIR, LUA_DIR

EXTRACTION_VERSION = 2


def file_fingerprint(path: Path) -> dict[str, Any]:
    stat = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return {"size": stat.st_size, "mtime": int(stat.st_mtime), "sha256": digest.hexdigest()[:24]}


def manifest_matches(manifest: dict[str, Any], assets: dict[str, dict[str, Any]],
                     langs: tuple[str, ...]) -> bool:
    if manifest.get("version") != EXTRACTION_VERSION or manifest.get("langs") != list(langs):
        return False
    previous = manifest.get("assets") or {}
    if any(previous.get(name, {}).get("sha256") != fingerprint["sha256"] for name, fingerprint in assets.items()):
        return False
    return LUA_DIR.is_dir() and any(LUA_DIR.glob("*.lua")) and all(
        (LOCALE_DIR / f"{lang}.json").is_file() for lang in langs
    )


def read_json(path: Path, fallback: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {} if fallback is None else fallback


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(text, encoding="utf-8", newline="\n")
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def write_json(path: Path, payload: Any, pretty: bool = False) -> None:
    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    )
    atomic_write_text(path, text + ("\n" if pretty else ""))
