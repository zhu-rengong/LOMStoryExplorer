from __future__ import annotations

import gzip
import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def dump_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def atomic_write_text(path: Path, text: str) -> int:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as fp:
            fp.write(text)
        os.replace(temp_name, target)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise
    return len(text.encode("utf-8"))


def read_json(path: Path) -> Any | None:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_json(path: Path, payload: Any, indent: int | None = 2) -> int:
    text = json.dumps(payload, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))
    return atomic_write_text(path, text + "\n")


def read_gzip_json(path: Path) -> Any | None:
    try:
        with gzip.open(path, "rt", encoding="utf-8") as fp:
            return json.load(fp)
    except (OSError, ValueError, EOFError):
        return None


def write_gzip_json(path: Path, payload: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp")
    try:
        os.close(handle)
        with gzip.open(temp_name, "wt", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, separators=(",", ":"))
        os.replace(temp_name, target)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def file_fingerprint(path: Path) -> dict[str, Any]:
    target = Path(path)
    stat = target.stat()
    digest = hashlib.sha256()
    with target.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1 << 20), b""):
            digest.update(chunk)
    return {
        "path": str(target),
        "size": stat.st_size,
        "mtime": int(stat.st_mtime),
        "sha256_16": digest.hexdigest()[:16],
    }


@dataclass(frozen=True)
class CacheKey:
    version: int
    fingerprint: str


def load_envelope(path: Path, key: CacheKey) -> Any | None:
    payload = read_gzip_json(path) if Path(path).suffix == ".gz" else read_json(path)
    if not isinstance(payload, dict):
        return None
    if payload.get("version") != key.version:
        return None
    if payload.get("fingerprint") != key.fingerprint:
        return None
    return payload.get("data")


def save_envelope(path: Path, key: CacheKey, data: Any) -> None:
    envelope = {"version": key.version, "fingerprint": key.fingerprint, "data": data}
    if Path(path).suffix == ".gz":
        write_gzip_json(path, envelope)
    else:
        write_json(path, envelope, indent=None)
