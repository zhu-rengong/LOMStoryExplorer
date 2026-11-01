from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .profile import MANAGERS_ASSET, MANAGERS_SUBDIR
from ..console import Reporter
from .unity import unitypy


def iter_text_assets(asset_path: Path, reporter: Reporter) -> Iterator[tuple[str, str]]:
    env = unitypy().load(str(asset_path))
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        try:
            data = obj.read()
        except Exception as exc:
            reporter.warn(f"failed to read TextAsset: {type(exc).__name__}")
            continue
        name = str(getattr(data, "m_Name", "") or obj.peek_name() or "").strip()
        text = getattr(data, "m_Script", None)
        if text is None:
            raw = getattr(data, "script", b"")
            text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
        if not name:
            continue
        yield name, text.lstrip("\ufeff")


def resource_map(game: Path) -> dict[str, int]:
    env = unitypy().load(str(Path(game) / MANAGERS_SUBDIR / MANAGERS_ASSET))
    for obj in env.objects:
        if obj.type.name != "ResourceManager":
            continue
        container = obj.read_typetree().get("m_Container") or []
        return {str(path).lower(): int(info["m_PathID"]) for path, info in container}
    return {}
