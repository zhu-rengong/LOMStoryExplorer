from __future__ import annotations


class LuaParseError(Exception):
    def __init__(self, message: str, line: int, source: str = "") -> None:
        super().__init__(f"line {line}: {message}" + (f" | {source}" if source else ""))
        self.line = line
