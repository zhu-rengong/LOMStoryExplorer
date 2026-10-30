from __future__ import annotations


class LuaParseError(ValueError):
    def __init__(self, message: str, line: int, column: int = 0) -> None:
        self.message = message
        self.line = line
        self.column = column
        location = f"{line}:{column}" if column else str(line)
        super().__init__(f"line {location}: {message}")
