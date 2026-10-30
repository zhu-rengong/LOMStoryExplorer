from __future__ import annotations

from collections.abc import Iterator, Sequence

from .ast import (
    Assign,
    Bin,
    Call,
    CallStmt,
    Do,
    Expr,
    If,
    Index,
    Literal,
    Local,
    Name,
    Num,
    Str,
    Stmt,
    Table,
    Un,
)
from .errors import LuaParseError
from .tokens import Token, tokenize

_BINARY_PRECEDENCE = {
    "or": (1, "left"),
    "and": (2, "left"),
    "<": (3, "left"), ">": (3, "left"), "<=": (3, "left"), ">=": (3, "left"),
    "~=": (3, "left"), "==": (3, "left"),
    "..": (4, "right"),
    "+": (5, "left"), "-": (5, "left"),
    "*": (6, "left"), "/": (6, "left"), "//": (6, "left"), "%": (6, "left"),
    "^": (8, "right"),
}

_UNARY_PRECEDENCE = 7

_UNSUPPORTED = ("while", "for", "repeat", "function", "return", "break")


class Parser:
    def __init__(self, source: str) -> None:
        self.tokens = tokenize(source)
        self.pos = 0

    @property
    def cur(self) -> Token:
        return self.tokens[self.pos]

    def peek(self, offset: int = 1) -> Token:
        index = min(self.pos + offset, len(self.tokens) - 1)
        return self.tokens[index]

    def at(self, kind: str, value: str | None = None) -> bool:
        tok = self.cur
        return tok.kind == kind and (value is None or tok.value == value)

    def at_symbol(self, value: str) -> bool:
        return self.at("symbol", value)

    def at_keyword(self, value: str) -> bool:
        return self.at("keyword", value)

    def error(self, message: str, token: Token | None = None) -> LuaParseError:
        tok = token or self.cur
        return LuaParseError(message, tok.line, tok.column)

    def advance(self) -> Token:
        tok = self.cur
        if tok.kind != "eof":
            self.pos += 1
        return tok

    def expect_symbol(self, value: str) -> Token:
        if not self.at_symbol(value):
            raise self.error(f"expected {value}, got {self.cur.value!r}")
        return self.advance()

    def expect_keyword(self, value: str) -> Token:
        if not self.at_keyword(value):
            raise self.error(f"expected {value}, got {self.cur.value!r}")
        return self.advance()

    def expect_name(self) -> str:
        if self.cur.kind != "name":
            raise self.error(f"expected identifier, got {self.cur.value!r}")
        return self.advance().value

    def parse_chunk(self) -> list[Stmt]:
        block = self.parse_block(end_keywords=())
        if self.cur.kind != "eof":
            raise self.error(f"unexpected token {self.cur.value!r}")
        return block

    def parse_block(self, end_keywords: Sequence[str]) -> list[Stmt]:
        body: list[Stmt] = []
        while True:
            tok = self.cur
            if tok.kind == "eof":
                if end_keywords:
                    raise self.error(f"missing {'/'.join(end_keywords)}", tok)
                return body
            if tok.kind == "keyword" and tok.value in end_keywords:
                return body
            body.append(self.parse_statement())

    def parse_statement(self) -> Stmt:
        tok = self.cur
        if tok.kind == "symbol" and tok.value == ";":
            self.advance()
            return self.parse_statement()
        if tok.kind == "keyword":
            if tok.value == "local":
                return self.parse_local()
            if tok.value == "if":
                return self.parse_if()
            if tok.value == "do":
                self.advance()
                body = self.parse_block(("end",))
                self.expect_keyword("end")
                return Do(body=body, line=tok.line)
            if tok.value in _UNSUPPORTED:
                raise self.error(f"unsupported syntax {tok.value}", tok)
        return self.parse_expr_statement()

    def parse_local(self) -> Stmt:
        line = self.advance().line
        names = [self.expect_name()]
        while self.at_symbol(","):
            self.advance()
            names.append(self.expect_name())
        values: list[Expr] = []
        if self.at_symbol("="):
            self.advance()
            values.append(self.parse_expr())
            while self.at_symbol(","):
                self.advance()
                values.append(self.parse_expr())
        return Local(names=names, values=values, line=line)

    def parse_if(self) -> Stmt:
        line = self.advance().line
        clauses: list[tuple[Expr | None, list[Stmt]]] = []
        cond = self.parse_expr()
        self.expect_keyword("then")
        clauses.append((cond, self.parse_block(("elseif", "else", "end"))))
        while self.at_keyword("elseif"):
            self.advance()
            cond = self.parse_expr()
            self.expect_keyword("then")
            clauses.append((cond, self.parse_block(("elseif", "else", "end"))))
        if self.at_keyword("else"):
            self.advance()
            clauses.append((None, self.parse_block(("end",))))
        self.expect_keyword("end")
        return If(clauses=clauses, line=line)

    def parse_expr_statement(self) -> Stmt:
        line = self.cur.line
        first = self.parse_suffixed()
        if self.at_symbol("=") or self.at_symbol(","):
            targets = [first]
            while self.at_symbol(","):
                self.advance()
                targets.append(self.parse_suffixed())
            self.expect_symbol("=")
            values = [self.parse_expr()]
            while self.at_symbol(","):
                self.advance()
                values.append(self.parse_expr())
            return Assign(targets=targets, values=values, line=line)
        if not isinstance(first, Call):
            raise self.error(f"unparsable statement ({first.text()})")
        return CallStmt(call=first, line=line)

    def parse_expr(self, min_prec: int = 0) -> Expr:
        left = self.parse_unary()
        while True:
            tok = self.cur
            if tok.kind not in ("symbol", "keyword") or tok.value not in _BINARY_PRECEDENCE:
                return left
            prec, assoc = _BINARY_PRECEDENCE[tok.value]
            if prec < min_prec:
                return left
            self.advance()
            next_min = prec + 1 if assoc == "left" else prec
            right = self.parse_expr(next_min)
            left = Bin(op=tok.value, left=left, right=right, line=tok.line)

    def parse_unary(self) -> Expr:
        tok = self.cur
        if (tok.kind == "keyword" and tok.value == "not") or (tok.kind == "symbol" and tok.value in ("-", "#")):
            self.advance()
            operand = self.parse_expr(_UNARY_PRECEDENCE)
            return Un(op=tok.value, operand=operand, line=tok.line)
        return self.parse_suffixed()

    def parse_suffixed(self) -> Expr:
        expr = self.parse_primary()
        while True:
            tok = self.cur
            if tok.kind == "symbol" and tok.value == ".":
                self.advance()
                key = self.expect_name()
                expr = Index(obj=expr, key=Str(value=key, line=tok.line), line=tok.line)
                continue
            if tok.kind == "symbol" and tok.value == "[":
                self.advance()
                key = self.parse_expr()
                self.expect_symbol("]")
                expr = Index(obj=expr, key=key, line=tok.line)
                continue
            if tok.kind == "symbol" and tok.value == ":":
                self.advance()
                method = self.expect_name()
                func = Index(obj=expr, key=Str(value=method, line=tok.line), line=tok.line)
                expr = Call(func=func, args=self.parse_call_args(), line=tok.line)
                continue
            if tok.kind == "symbol" and tok.value in ("(", "{"):
                expr = Call(func=expr, args=self.parse_call_args(), line=tok.line)
                continue
            if tok.kind == "string":
                expr = Call(func=expr, args=[self.parse_string()], line=tok.line)
                continue
            return expr

    def parse_call_args(self) -> list[Expr]:
        if self.at_symbol("("):
            self.advance()
            args: list[Expr] = []
            if not self.at_symbol(")"):
                args.append(self.parse_expr())
                while self.at_symbol(","):
                    self.advance()
                    args.append(self.parse_expr())
            self.expect_symbol(")")
            return args
        if self.at_symbol("{"):
            return [self.parse_table()]
        return [self.parse_string()]

    def parse_string(self) -> Expr:
        tok = self.cur
        if tok.kind != "string":
            raise self.error(f"expected string, got {tok.value!r}")
        self.advance()
        return Str(value=tok.value, line=tok.line)

    def parse_primary(self) -> Expr:
        tok = self.cur
        if tok.kind == "string":
            self.advance()
            return Str(value=tok.value, line=tok.line)
        if tok.kind == "number":
            self.advance()
            return Num(value=float(tok.value), line=tok.line)
        if tok.kind == "keyword":
            if tok.value in ("nil", "true", "false"):
                self.advance()
                return Literal(value=tok.value, line=tok.line)
            raise self.error(f"keyword {tok.value} not allowed in expression", tok)
        if tok.kind == "name":
            self.advance()
            return Name(id=tok.value, line=tok.line)
        if tok.kind == "symbol":
            if tok.value == "(":
                self.advance()
                inner = self.parse_expr()
                self.expect_symbol(")")
                return inner
            if tok.value == "{":
                return self.parse_table()
        raise self.error(f"unparsable expression starting at {tok.value!r}")

    def parse_table(self) -> Expr:
        line = self.expect_symbol("{").line
        fields: list[tuple[Expr | None, Expr]] = []
        while not self.at_symbol("}"):
            if self.at_symbol("["):
                self.advance()
                key = self.parse_expr()
                self.expect_symbol("]")
                self.expect_symbol("=")
                fields.append((key, self.parse_expr()))
            elif self.cur.kind == "name" and self.peek().kind == "symbol" and self.peek().value == "=":
                key = Str(value=self.cur.value, line=self.cur.line)
                self.advance()
                self.advance()
                fields.append((key, self.parse_expr()))
            else:
                fields.append((None, self.parse_expr()))
            if self.at_symbol(",") or self.at_symbol(";"):
                self.advance()
                continue
            break
        self.expect_symbol("}")
        return Table(fields=fields, line=line)


def parse(source: str) -> list[Stmt]:
    return Parser(source).parse_chunk()


def walk(stmts: Sequence[Stmt]) -> Iterator[Stmt]:
    for stmt in stmts:
        yield stmt
        if isinstance(stmt, If):
            for _, body in stmt.clauses:
                yield from walk(body)
        elif isinstance(stmt, Do):
            yield from walk(stmt.body)
