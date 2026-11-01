from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .jsonio import read_gzip_json, read_json, write_gzip_json, write_json


@dataclass(frozen=True)
class CacheKey:
    version: int
    fingerprint: str


def _is_gzip(path: Path) -> bool:
    return Path(path).suffix == ".gz"


def load_envelope(path: Path, key: CacheKey) -> Any | None:
    target = Path(path)
    payload = read_gzip_json(target) if _is_gzip(target) else read_json(target)
    if not isinstance(payload, dict):
        return None
    if payload.get("version") != key.version:
        return None
    if payload.get("fingerprint") != key.fingerprint:
        return None
    return payload.get("data")


def save_envelope(path: Path, key: CacheKey, data: Any) -> None:
    target = Path(path)
    envelope = {"version": key.version, "fingerprint": key.fingerprint, "data": data}
    if _is_gzip(target):
        write_gzip_json(target, envelope)
    else:
        write_json(target, envelope, indent=None)
