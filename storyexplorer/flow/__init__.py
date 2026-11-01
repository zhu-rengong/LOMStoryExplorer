from __future__ import annotations

from ..model import ScriptAnalysis
from .analyzer import analyze


def analyze_task(item: tuple[str, str]) -> tuple[str, bool, ScriptAnalysis]:
    sid, source = item
    try:
        return sid, False, analyze(sid, source)
    except Exception:
        return sid, True, ScriptAnalysis(id=sid)


__all__ = ["analyze_task"]
