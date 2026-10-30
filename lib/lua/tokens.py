from __future__ import annotations

from dataclasses import dataclass

from .errors import LuaParseError

KEYWORDS = frozenset({
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
    "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
})
SYMBOLS = (
    "...", "..", "==", "~=", "<=", ">=", "//", "::", "+", "-", "*", "/", "%", "^", "#",
    "&", "~", "|", "<", ">", "=", "(", ")", "{", "}", "[", "]", ";", ":", ",", ".",
)
ESCAPES = {"a": "\a", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v",
           "\\": "\\", '"': '"', "'": "'", "\n": "\n"}


@dataclass(slots=True, frozen=True)
class Token:
    kind: str
    value: str
    line: int
    column: int
    offset: int


def read_string(source: str, start: int, line: int, column: int) -> tuple[str, int, int, int]:
    quote = source[start]
    value: list[str] = []
    index = start + 1
    current_column = column + 1
    while index < len(source):
        char = source[index]
        if char == quote:
            return "".join(value), index + 1, line, current_column + 1
        if char == "\\":
            if index + 1 >= len(source):
                break
            escaped = source[index + 1]
            if escaped.isdigit():
                cursor = index + 1
                digits = ""
                while cursor < len(source) and len(digits) < 3 and source[cursor].isdigit():
                    digits += source[cursor]
                    cursor += 1
                value.append(chr(int(digits)))
                current_column += cursor - index
                index = cursor
                continue
            value.append(ESCAPES.get(escaped, escaped))
            if escaped == "\n":
                line += 1
                current_column = 1
            else:
                current_column += 2
            index += 2
            continue
        if char == "\n":
            raise LuaParseError("unterminated string", line, current_column)
        value.append(char)
        index += 1
        current_column += 1
    raise LuaParseError("unterminated string", line, column)


def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    index = 0
    line = 1
    column = 1
    while index < len(source):
        char = source[index]
        if char in " \t\r":
            index += 1
            column += 1
            continue
        if char == "\n":
            index += 1
            line += 1
            column = 1
            continue
        if source.startswith("--", index):
            end = source.find("\n", index)
            if end < 0:
                break
            column += end - index
            index = end
            continue
        start, start_column = index, column
        if char in "\"'":
            value, index, line, column = read_string(source, index, line, column)
            tokens.append(Token("string", value, line, start_column, start))
            continue
        if char.isdigit() or (char == "." and index + 1 < len(source) and source[index + 1].isdigit()):
            cursor = index + 1
            while cursor < len(source) and (source[cursor].isalnum() or source[cursor] in ".+-"):
                if source[cursor] in "+-" and source[cursor - 1].lower() != "e":
                    break
                cursor += 1
            raw = source[index:cursor]
            try:
                float(raw)
            except ValueError as exc:
                raise LuaParseError(f"invalid number {raw!r}", line, column) from exc
            tokens.append(Token("number", raw, line, column, index))
            column += cursor - index
            index = cursor
            continue
        if char.isalpha() or char == "_":
            cursor = index + 1
            while cursor < len(source) and (source[cursor].isalnum() or source[cursor] == "_"):
                cursor += 1
            raw = source[index:cursor]
            tokens.append(Token("keyword" if raw in KEYWORDS else "name", raw, line, column, index))
            column += cursor - index
            index = cursor
            continue
        symbol = next((item for item in SYMBOLS if source.startswith(item, index)), None)
        if symbol is None:
            raise LuaParseError(f"unexpected character {char!r}", line, column)
        tokens.append(Token("symbol", symbol, line, column, index))
        index += len(symbol)
        column += len(symbol)
    tokens.append(Token("eof", "", line, column, len(source)))
    return tokens
