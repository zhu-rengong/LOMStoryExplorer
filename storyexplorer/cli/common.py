from __future__ import annotations

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_DATA = 3


def split_langs(raw: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in raw.split(",") if item.strip())
