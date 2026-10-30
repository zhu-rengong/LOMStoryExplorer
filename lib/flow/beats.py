from __future__ import annotations

import re
from typing import Any

from .model import Locked, Ref, Unknown, _as_text

_LITERAL = re.compile(r'"([^"]*)"')


class BeatsMixin:
    def _branch_row(self, option: dict[str, Any], sub: list[list[Any]]) -> list[Any]:
        lock = option.get("lock")
        return [self._ref_pair(option["ref"]), option.get("cond"), sub,
                self._ref_pair(lock) if lock is not None else None]

    def _option_list(self, table: Any) -> list[dict[str, Any]]:
        options: list[dict[str, Any]] = []
        if not isinstance(table, dict):
            return options
        for key in sorted(table, key=lambda item: (len(item), item)):
            value = table[key]

            if isinstance(value, Locked):
                ref = value.available if isinstance(value.available, Ref) else Ref("text", _as_text(value.available) or "")
                if not ref.value or ref.value.startswith("~"):
                    continue
                lock = value.locked if isinstance(value.locked, Ref) else None
                options.append({"ref": ref, "cond": None, "lock": lock})
                continue

            if isinstance(value, Ref) and value.kind == "text":
                raw, cond = self._split_dice(value.value)
                if not raw or raw.startswith("~"):
                    continue
                options.append({"ref": Ref("text", raw), "cond": cond, "lock": None})
                continue

            if isinstance(value, Unknown):
                literal = self._literal_of(value.text)
                if literal and not literal.startswith("~"):
                    raw, cond = self._split_dice(literal)
                    options.append({"ref": Ref("text", raw), "cond": cond, "lock": None})
                continue

            text = _as_text(value)
            if text:
                raw, cond = self._split_dice(text)
                if raw and not raw.startswith("~"):
                    options.append({"ref": Ref("text", raw), "cond": cond, "lock": None})
        return options

    @staticmethod
    def _split_dice(raw: str) -> tuple[str, str | None]:
        if "|" in raw:
            head, tail = raw.split("|", 1)
            return head, tail
        return raw, None

    @staticmethod
    def _literal_of(text: str) -> str | None:
        matches = _LITERAL.findall(text)
        for candidate in matches:
            if not candidate.startswith("~"):
                return candidate
        return matches[0] if matches else None
