from __future__ import annotations

from luaparser import ast
from luaparser.astnodes import (
    Assign,
    BinaryOp,
    Block,
    Call,
    Comment,
    Do,
    ElseIf,
    Expression,
    FalseExpr,
    Field,
    If,
    Index,
    IndexNotation,
    Invoke,
    LocalAssign,
    Name,
    Nil,
    Node,
    Number,
    SemiColon,
    Statement,
    String,
    Table,
    TrueExpr,
    UMinusOp,
    UnaryOp,
)

_OPERATORS = {
    "AddOp": "+",
    "SubOp": "-",
    "MultOp": "*",
    "FloatDivOp": "/",
    "FloorDivOp": "//",
    "ModOp": "%",
    "ExpoOp": "^",
    "Concat": "..",
    "EqToOp": "==",
    "NotEqToOp": "~=",
    "LessThanOp": "<",
    "GreaterThanOp": ">",
    "LessOrEqThanOp": "<=",
    "GreaterOrEqThanOp": ">=",
    "AndLoOp": "and",
    "OrLoOp": "or",
    "BAndOp": "&",
    "BOrOp": "|",
    "BXorOp": "~",
    "BShiftLOp": "<<",
    "BShiftROp": ">>",
    "UMinusOp": "-",
    "UBNotOp": "~",
    "ULNotOp": "not",
    "ULengthOP": "#",
}


def parse(source: str) -> list[Statement]:
    return statements(ast.parse(source).body)


def statements(block: Block | None) -> list[Statement]:
    if block is None:
        return []
    return [stmt for stmt in block.body if not isinstance(stmt, (SemiColon, Comment))]


def clauses(node: If | ElseIf) -> list[tuple[Expression | None, list[Statement]]]:
    result: list[tuple[Expression | None, list[Statement]]] = []
    current: Node | None = node
    while isinstance(current, If | ElseIf):
        result.append((current.test, statements(current.body)))
        current = current.orelse
    if isinstance(current, Block):
        result.append((None, statements(current)))
    return result


def index_key(node: Index) -> str | None:
    if isinstance(node.idx, Name) and node.notation == IndexNotation.DOT:
        return node.idx.id
    if isinstance(node.idx, String):
        return string_value(node.idx)
    return None


def field_key(field: Field) -> str | None:
    key = field.key
    if isinstance(key, Name) and not field.between_brackets:
        return key.id
    if isinstance(key, String):
        return string_value(key)
    return None


def string_value(node: String) -> str:
    value = node.s
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return node.raw
    return value


def operator(node: BinaryOp | UnaryOp) -> str:
    return _OPERATORS.get(type(node).__name__, "")


def text(node: Node | None) -> str:
    if node is None:
        return ""
    if isinstance(node, String):
        return '"' + string_value(node).replace('"', '\\"') + '"'
    if isinstance(node, Number):
        return _number_text(node.n)
    if isinstance(node, Nil):
        return "nil"
    if isinstance(node, TrueExpr):
        return "true"
    if isinstance(node, FalseExpr):
        return "false"
    if isinstance(node, Name):
        return node.id
    if isinstance(node, Index):
        key = index_key(node)
        if key is not None and isinstance(node.idx, Name):
            return f'{text(node.value)}["{key}"]'
        return f"{text(node.value)}[{text(node.idx)}]"
    if isinstance(node, Invoke):
        return f"{text(node.source)}:{text(node.func)}({_arguments(node.args)})"
    if isinstance(node, Call):
        return f"{text(node.func)}({_arguments(node.args)})"
    if isinstance(node, Table):
        return "{...}"
    if isinstance(node, UnaryOp):
        op = operator(node)
        return f"{op}{text(node.operand)}" if op else type(node).__name__
    if isinstance(node, BinaryOp):
        op = operator(node)
        return f"{text(node.left)} {op} {text(node.right)}" if op else type(node).__name__
    return type(node).__name__


def _arguments(args: list[Expression]) -> str:
    return ", ".join(text(arg) for arg in args)


def _number_text(value: int | float) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number)


__all__ = [
    "Assign",
    "BinaryOp",
    "Block",
    "Call",
    "Comment",
    "Do",
    "ElseIf",
    "Expression",
    "FalseExpr",
    "Field",
    "If",
    "Index",
    "IndexNotation",
    "Invoke",
    "LocalAssign",
    "Name",
    "Nil",
    "Node",
    "Number",
    "SemiColon",
    "Statement",
    "String",
    "Table",
    "TrueExpr",
    "UMinusOp",
    "UnaryOp",
    "clauses",
    "field_key",
    "index_key",
    "operator",
    "parse",
    "statements",
    "string_value",
    "text",
]
