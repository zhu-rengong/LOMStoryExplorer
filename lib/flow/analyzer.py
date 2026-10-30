from __future__ import annotations

from .. import lua as L
from ..model import Diagnostic, StoryAnalysis
from .calls import CallProcessor
from .expr import ExpressionEvaluator
from .model import AnalysisContext, FlowState
from .stmt import BlockWalker


class Analyzer:
    def __init__(self, script_id: str) -> None:
        self.script_id = script_id

    def analyze(self, source: str) -> StoryAnalysis:
        context = AnalysisContext(self.script_id)
        try:
            statements = L.parse(source)
        except L.LuaParseError as exc:
            return StoryAnalysis(
                id=self.script_id,
                diagnostics=[Diagnostic("lua-parse", exc.message, self.script_id, exc.line)],
                stats={"say": 0, "choice": 0, "fx": 0, "beats": 0, "reads": 0},
            )
        evaluator = ExpressionEvaluator()
        calls = CallProcessor(context, evaluator)
        walker = BlockWalker(context, evaluator, calls)
        beats = []
        walker.walk(statements, FlowState(), beats)
        return StoryAnalysis(
            id=self.script_id,
            beats=beats,
            edges=context.edges,
            dynamic=context.dynamic,
            diagnostics=context.diagnostics,
            reads=context.reads,
            stats={
                "say": context.say_count,
                "choice": context.choice_count,
                "fx": context.fx_count,
                "beats": len(beats),
                "reads": len(context.reads),
            },
        )


def analyze(script_id: str, source: str) -> StoryAnalysis:
    return Analyzer(script_id).analyze(source)
