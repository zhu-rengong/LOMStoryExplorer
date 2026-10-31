from __future__ import annotations

from ..config import FLOW_VERSION
from ..model import ScriptAnalysis
from .analyzer import Analyzer, analyze


def analyze_task(item: tuple[str, str]) -> tuple[str, bool, ScriptAnalysis]:
    sid, source = item
    try:
        return sid, False, analyze(sid, source)
    except Exception as exc:
        return sid, True, ScriptAnalysis(
            id=sid, warnings=[f"analysis failed: {type(exc).__name__}: {exc}"])


__all__ = ["Analyzer", "FLOW_VERSION", "analyze", "analyze_task"]
