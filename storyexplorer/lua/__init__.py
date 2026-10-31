from __future__ import annotations

from dataclasses import dataclass

import tree_sitter_lua
from tree_sitter import Language, Node, Parser, Tree

_LANGUAGE = Language(tree_sitter_lua.language())
_PARSER = Parser(_LANGUAGE)

_ESCAPES = {
    "a": "\a",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
    "v": "\v",
    "\\": "\\",
    '"': '"',
    "'": "'",
}

@dataclass(frozen=True)
class Script:
    source: bytes
    tree: Tree
    statements: list[Node]


class LuaSyntaxError(Exception):
    def __init__(self, line: int, column: int) -> None:
        super().__init__(f"syntax error at line {line}, column {column}")
        self.line = line
        self.column = column


def parse(source: str) -> Script:
    data = source.encode("utf-8")
    tree = _PARSER.parse(data)
    root = tree.root_node
    if root.has_error:
        raise LuaSyntaxError(*_error_point(root))
    return Script(data, tree, statements(root))


def statements(node: Node | None) -> list[Node]:
    if node is None or node.type not in ("chunk", "block"):
        return []
    return [child for child in node.named_children
            if child.type not in ("comment", "hash_bang_line")]


def clauses(node: Node) -> list[tuple[Node | None, list[Node]]]:
    result: list[tuple[Node | None, list[Node]]] = [
        (node.child_by_field_name("condition"), statements(node.child_by_field_name("consequence"))),
    ]
    for alternative in node.children_by_field_name("alternative"):
        if alternative.type == "elseif_statement":
            result.append((alternative.child_by_field_name("condition"),
                           statements(alternative.child_by_field_name("consequence"))))
        else:
            result.append((None, statements(alternative.child_by_field_name("body"))))
    return result


def local_declaration(node: Node) -> tuple[list[Node], list[Node]]:
    for child in node.named_children:
        if child.type == "assignment_statement":
            return assignment(child)
        if child.type == "variable_list":
            return _items(child), []
    return [], []


def assignment(node: Node) -> tuple[list[Node], list[Node]]:
    targets: list[Node] = []
    values: list[Node] = []
    for child in node.named_children:
        if child.type == "variable_list":
            targets = _items(child)
        elif child.type == "expression_list":
            values = _items(child)
    return targets, values


def arguments(call: Node) -> list[Node]:
    return _items(call.child_by_field_name("arguments"))


def index_key(node: Node) -> str | None:
    field = node.child_by_field_name("field")
    if field is None:
        return None
    if node.type == "dot_index_expression":
        return _text(field)
    if field.type == "string":
        return string_value(field)
    return None


def field_has_key(field: Node) -> bool:
    return field.child_by_field_name("name") is not None


def field_key(field: Node) -> str | None:
    name = field.child_by_field_name("name")
    if name is None:
        return None
    if field.children and field.children[0].type == "[":
        return string_value(name) if name.type == "string" else None
    return _text(name)


def string_value(node: Node) -> str:
    content = node.child_by_field_name("content")
    if content is None:
        return ""
    start = node.child_by_field_name("start")
    raw = content.text
    if start is not None and start.type == "[[":
        value = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        return value[1:] if value.startswith("\n") else value
    return _unescape(raw.decode("utf-8"))


def number_value(node: Node) -> int | float:
    raw = _text(node).rstrip("iI")
    if raw[-2:].lower() == "ll":
        raw = raw[:-2]
    if raw[:2].lower() == "0x":
        try:
            return int(raw, 16)
        except ValueError:
            return float.fromhex(raw)
    if raw[:2].lower() == "0b":
        return int(raw[2:], 2)
    try:
        return int(raw, 10)
    except ValueError:
        return float(raw)


def operator(node: Node) -> str:
    token = node.child_by_field_name("operator")
    return token.type if token is not None else ""


def text(node: Node | None) -> str:
    if node is None:
        return ""
    kind = node.type
    if kind == "string":
        return '"' + string_value(node).replace('"', '\\"') + '"'
    if kind in ("number", "identifier", "true", "false", "nil"):
        return _text(node)
    if kind == "dot_index_expression":
        return f'{text(node.child_by_field_name("table"))}["{_text(node.child_by_field_name("field"))}"]'
    if kind == "bracket_index_expression":
        return f"{text(node.child_by_field_name('table'))}[{text(node.child_by_field_name('field'))}]"
    if kind == "method_index_expression":
        return f"{text(node.child_by_field_name('table'))}:{_text(node.child_by_field_name('method'))}"
    if kind == "function_call":
        return f"{text(node.child_by_field_name('name'))}({_arguments(node)})"
    if kind == "table_constructor":
        return "{...}"
    if kind == "binary_expression":
        return (f"{text(node.child_by_field_name('left'))} {operator(node)} "
                f"{text(node.child_by_field_name('right'))}")
    if kind == "unary_expression":
        return f"{operator(node)}{text(node.child_by_field_name('operand'))}"
    if kind == "parenthesized_expression":
        children = node.named_children
        return text(children[0]) if children else "()"
    if kind == "comment":
        return ""
    return _text(node)


def _arguments(call: Node) -> str:
    return ", ".join(text(arg) for arg in arguments(call))


def _items(node: Node | None) -> list[Node]:
    if node is None:
        return []
    return [child for child in node.named_children if child.type != "comment"]


def _text(node: Node | None) -> str:
    return node.text.decode("utf-8") if node is not None else ""


def _error_point(node: Node) -> tuple[int, int]:
    for child in node.children:
        if child.type == "ERROR" or child.is_missing:
            row, column = child.start_point
            return row + 1, column + 1
        if child.has_error:
            return _error_point(child)
    row, column = node.start_point
    return row + 1, column + 1


def _unescape(raw: str) -> str:
    out = bytearray()
    index = 0
    size = len(raw)
    while index < size:
        char = raw[index]
        if char != "\\" or index + 1 >= size:
            out.extend(char.encode("utf-8"))
            index += 1
            continue
        nxt = raw[index + 1]
        if nxt in _ESCAPES:
            out.extend(_ESCAPES[nxt].encode("utf-8"))
            index += 2
            continue
        if nxt.isdigit():
            cursor = index + 1
            while cursor < size and cursor < index + 4 and raw[cursor].isdigit():
                cursor += 1
            out.append(int(raw[index + 1:cursor]) & 0xFF)
            index = cursor
            continue
        if nxt == "x" and index + 3 < size:
            out.append(int(raw[index + 2:index + 4], 16))
            index += 4
            continue
        if nxt == "u" and raw.startswith("u{", index + 1):
            end = raw.find("}", index + 3)
            if end >= 0:
                out.extend(chr(int(raw[index + 3:end], 16)).encode("utf-8"))
                index = end + 1
                continue
        if nxt == "z":
            index += 2
            while index < size and raw[index].isspace():
                index += 1
            continue
        out.extend(nxt.encode("utf-8"))
        index += 2
    return out.decode("utf-8", "replace")


__all__ = [
    "LuaSyntaxError",
    "Node",
    "Script",
    "arguments",
    "assignment",
    "clauses",
    "field_has_key",
    "field_key",
    "index_key",
    "local_declaration",
    "number_value",
    "operator",
    "parse",
    "statements",
    "string_value",
    "text",
]
