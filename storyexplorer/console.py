from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import TextIO


@dataclass(frozen=True)
class Diagnostic:
    level: str
    message: str


class Reporter:
    def __init__(self, stream: TextIO | None = None) -> None:
        self.stream = stream or sys.stdout
        self.warnings: list[Diagnostic] = []
        self.errors: list[Diagnostic] = []
        self._indent = 6

    def write(self, message: str = "") -> None:
        print(message, file=self.stream, flush=True)

    def stage(self, index: int, total: int, title: str) -> None:
        self.write(f"[{index}/{total}] {title}")

    def info(self, message: str) -> None:
        self.write(" " * self._indent + message)

    def detail(self, message: str) -> None:
        self.write(" " * (self._indent + 6) + message)

    def warn(self, message: str) -> None:
        self.warnings.append(Diagnostic("warn", message))
        self.write(" " * self._indent + f"[warn] {message}")

    def error(self, message: str) -> None:
        self.errors.append(Diagnostic("error", message))
        self.write(" " * self._indent + f"[error] {message}")

    def blank(self) -> None:
        self.write("")

    @property
    def failed(self) -> bool:
        return bool(self.errors)
