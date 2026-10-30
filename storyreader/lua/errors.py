from __future__ import annotations


class LuaParseError(Exception):
    def __init__(self, message: str, line: int = 0, column: int = 0) -> None:
        super().__init__(message)
        self.message = message
        self.line = line
        self.column = column

    def __str__(self) -> str:
        if self.line:
            return f"{self.message} (line {self.line}, column {self.column})"
        return self.message
