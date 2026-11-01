from __future__ import annotations

import sys
from typing import TextIO


class Reporter:
    def __init__(self, stream: TextIO | None = None) -> None:
        self.stream = stream or sys.stdout
        self._indent = 6

    def write(self, message: str = "") -> None:
        print(message, file=self.stream, flush=True)

    def stage(self, index: int, total: int, title: str) -> None:
        self.write(f"[{index}/{total}] {title}")

    def info(self, message: str) -> None:
        self.write(" " * self._indent + message)

    def warn(self, message: str) -> None:
        self.write(" " * self._indent + f"[warn] {message}")

    def error(self, message: str) -> None:
        self.write(" " * self._indent + f"[error] {message}")

    def blank(self) -> None:
        self.write("")
