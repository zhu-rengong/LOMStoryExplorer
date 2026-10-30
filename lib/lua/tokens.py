from __future__ import annotations

from dataclasses import dataclass

from .errors import LuaParseError

KEYWORDS = frozenset({
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
    "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
    "until", "while",
})

_SYMBOLS = (
    "...", "..", "==", "~=", "<=", ">=", "//", "::",
    "+", "-", "*", "/", "%", "^", "#", "&", "~", "|", "<", ">", "=",
    "(", ")", "{", "}", "[", "]", ";", ":", ",", ".",
)

_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'", "0": "\0"}


@dataclass(frozen=True)
class Token:
    kind: str
    value: str
    line: int

    def __repr__(self) -> str:
        return f"Token({self.kind},{self.value!r},L{self.line})"


def _unescape(body: str) -> str:
    out: list[str] = []
    index = 0
    size = len(body)
    while index < size:
        ch = body[index]
        if ch != "\\" or index + 1 >= size:
            out.append(ch)
            index += 1
            continue
        nxt = body[index + 1]
        out.append(_ESCAPES.get(nxt, nxt))
        index += 2
    return "".join(out)


def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    index = 0
    line = 1
    size = len(source)
    while index < size:
        ch = source[index]
        if ch in " \t\r":
            index += 1
            continue
        if ch == "\n":
            line += 1
            index += 1
            continue
        if source.startswith("--", index):
            if source.startswith("--[[", index):
                end = source.find("]]", index + 4)
                end = size if end < 0 else end + 2
                line += source.count("\n", index, end)
                index = end
                continue
            end = source.find("\n", index)
            index = size if end < 0 else end
            continue
        if ch in "\"'":
            quote = ch
            cursor = index + 1
            buf: list[str] = []
            while cursor < size:
                current = source[cursor]
                if current == "\\" and cursor + 1 < size:
                    buf.append(current)
                    buf.append(source[cursor + 1])
                    cursor += 2
                    continue
                if current == quote:
                    break
                if current == "\n":
                    line += 1
                buf.append(current)
                cursor += 1
            if cursor >= size:
                raise LuaParseError("unterminated string", line)
            tokens.append(Token("string", _unescape("".join(buf)), line))
            index = cursor + 1
            continue
        if source.startswith("[[", index):
            end = source.find("]]", index + 2)
            if end < 0:
                raise LuaParseError("unterminated long string", line)
            body = source[index + 2:end]
            tokens.append(Token("string", body, line))
            line += body.count("\n")
            index = end + 2
            continue
        if ch.isdigit() or (ch == "." and index + 1 < size and source[index + 1].isdigit()):
            cursor = index
            while cursor < size and (source[cursor].isdigit() or source[cursor] == "."):
                cursor += 1
            tokens.append(Token("number", source[index:cursor], line))
            index = cursor
            continue
        if ch.isalpha() or ch == "_":
            cursor = index
            while cursor < size and (source[cursor].isalnum() or source[cursor] == "_"):
                cursor += 1
            word = source[index:cursor]
            tokens.append(Token("keyword" if word in KEYWORDS else "name", word, line))
            index = cursor
            continue
        for symbol in _SYMBOLS:
            if source.startswith(symbol, index):
                tokens.append(Token("symbol", symbol, line))
                index += len(symbol)
                break
        else:
            raise LuaParseError(f"unexpected character {ch!r}", line)

    tokens.append(Token("eof", "", line))
    return tokens
