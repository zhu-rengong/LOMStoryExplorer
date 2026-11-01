from __future__ import annotations

import gzip
import hashlib
import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

_COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def dump_json(payload: Any) -> str:
    return json.dumps(payload, **_COMPACT)


def _atomic(path: Path, write: Callable[[Path], None]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(
        dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp")
    os.close(handle)
    try:
        write(Path(temp_name))
        os.replace(temp_name, target)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def atomic_write_text(path: Path, text: str) -> int:
    def write(temp: Path) -> None:
        with open(temp, "w", encoding="utf-8", newline="\n") as fp:
            fp.write(text)

    _atomic(path, write)
    return len(text.encode("utf-8"))


def read_json(path: Path) -> Any | None:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_json(path: Path, payload: Any, indent: int | None = 2) -> int:
    text = json.dumps(payload, ensure_ascii=False, indent=indent,
                      separators=None if indent else (",", ":"))
    return atomic_write_text(path, text + "\n")


def read_gzip_json(path: Path) -> Any | None:
    try:
        with gzip.open(path, "rt", encoding="utf-8") as fp:
            return json.load(fp)
    except (OSError, ValueError, EOFError):
        return None


def write_gzip_json(path: Path, payload: Any) -> None:
    def write(temp: Path) -> None:
        with gzip.open(temp, "wt", encoding="utf-8") as fp:
            json.dump(payload, fp, **_COMPACT)

    _atomic(path, write)


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
