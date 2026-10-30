from __future__ import annotations

import re
import struct
from datetime import datetime
from pathlib import Path

from ..model import GameInfo

_VERSION_RE = re.compile(r"^release_(\d+(?:\.\d+)+)$")
_MAX_STRING_BYTES = 64
_NEEDLE = b"release_"
_ACF_QUOTE = r'"{field}"\s+"([^"]*)"'


def _acf_value(text: str, field: str) -> str | None:
    match = re.search(_ACF_QUOTE.format(field=re.escape(field)), text)
    return match.group(1) if match else None


def read_bundle_version(managers_path: Path) -> str | None:
    try:
        data = Path(managers_path).read_bytes()
    except OSError:
        return None
    start = 0
    while True:
        index = data.find(_NEEDLE, start)
        if index < 0:
            return None
        start = index + 1
        if index < 4:
            continue
        length = struct.unpack("<i", data[index - 4:index])[0]
        if not 0 < length <= _MAX_STRING_BYTES:
            continue
        try:
            text = data[index:index + length].decode("utf-8")
        except UnicodeDecodeError:
            continue
        match = _VERSION_RE.match(text)
        if match:
            return match.group(1)


def read_steam_build(steamapps: Path, install_dir: str) -> dict[str, str | None]:
    found: dict[str, str | None] = {"build": None, "updated": None}
    try:
        manifests = sorted(Path(steamapps).glob("appmanifest_*.acf"))
    except OSError:
        return found
    for path in manifests:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if _acf_value(text, "installdir") != install_dir:
            continue
        build = _acf_value(text, "buildid")
        if build and build.isdigit():
            found["build"] = build
        stamp = _acf_value(text, "LastUpdated")
        if stamp and stamp.isdigit():
            try:
                found["updated"] = datetime.fromtimestamp(int(stamp)).strftime("%Y-%m-%d")
            except (OverflowError, OSError, ValueError):
                found["updated"] = None
        return found
    return found


def read_game_info(managers_path: Path, steamapps: Path | None, install_dir: str) -> GameInfo:
    version = read_bundle_version(managers_path)
    if steamapps is None:
        return GameInfo(version)
    steam = read_steam_build(steamapps, install_dir)
    return GameInfo(version, steam.get("build"), steam.get("updated"))
