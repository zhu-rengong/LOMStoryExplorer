from __future__ import annotations

from collections.abc import Iterator, Sequence

from .ast import Assign, Bin, Call, CallStmt, Do, Expr, If, Index, Literal, Local, Name, Num, Str, Stmt, Table, Un
from .errors import LuaParseError
from .tokens import Token, tokenize

PRECEDENCE = {
    "or": (1, "left"),
    "and": (2, "left"),
    "<": (3, "left"), ">": (3, "left"), "<=": (3, "left"), ">=": (3, "left"),
    "~=": (3, "left"), "==": (3, "left"),
    "..": (4, "right"),
    "+": (5, "left"), "-": (5, "left"),
    "*": (6, "left"), "/": (6, "left"), "//": (6, "left"), "%": (6, "left"),
    "^": (8, "right"),
}
UNARY_PRECEDENCE = 7
UNSUPPORTED = frozenset({"while", "for", "repeat", "function", "return", "break"})


class Parser:
    def __init__(self, source: str) -> None:
        self.tokens = tokenize(source)
        self.position = 0

    @property
    def current(self) -> Token:
        return self.tokens[self.position]

    def peek(self, offset: int = 1) -> Token:
        return self.tokens[min(self.position + offset, len(self.tokens) - 1)]

    def at(self, value: str) -> bool:
        return self.current.value == value and self.current.kind in ("symbol", "keyword")

    def advance(self) -> Token:
        token = self.current
        if token.kind != "eof":
            self.position += 1
        return token

    def expect(self, value: str) -> Token:
        if not self.at(value):
            token = self.current
            found = token.value or token.kind
            raise LuaParseError(f"expected {value!r}, found {found!r}", token.line, token.column)
        return self.advance()

    def expect_name(self) -> Token:
        if self.current.kind != "name":
            token = self.current
            raise LuaParseError(f"expected identifier, found {token.value!r}", token.line, token.column)
        return self.advance()

    def parse_chunk(self) -> list[Stmt]:
        body = self.parse_block(())
        if self.current.kind != "eof":
            token = self.current
            raise LuaParseError(f"unexpected token {token.value!r}", token.line, token.column)
        return body

    def parse_block(self, endings: Sequence[str]) -> list[Stmt]:
        body: list[Stmt] = []
        while self.current.kind != "eof" and not (
            self.current.kind == "keyword" and self.current.value in endings
        ):
            if self.at(";"):
                self.advance()
                continue
            body.append(self.parse_statement())
        if self.current.kind == "eof" and endings:
            token = self.current
            raise LuaParseError(f"expected {' or '.join(endings)} before end of input", token.line, token.column)
        return body

    def parse_statement(self) -> Stmt:
        token = self.current
        if token.value == "local":
            return self.parse_local()
        if token.value == "if":
            return self.parse_if()
        if token.value == "do":
            self.advance()
            body = self.parse_block(("end",))
            self.expect("end")
            return Do(line=token.line, body=body)
        if token.value in UNSUPPORTED:
            raise LuaParseError(f"unsupported statement {token.value!r}", token.line, token.column)
        return self.parse_expression_statement()

    def parse_local(self) -> Local:
        line = self.advance().line
        names = [self.expect_name().value]
        while self.at(","):
            self.advance()
            names.append(self.expect_name().value)
        values: list[Expr] = []
        if self.at("="):
            self.advance()
            values = self.parse_expression_list()
        return Local(line=line, names=names, values=values)

    def parse_if(self) -> If:
        line = self.advance().line
        clauses: list[tuple[Expr | None, list[Stmt]]] = []
        condition = self.parse_expression()
        self.expect("then")
        clauses.append((condition, self.parse_block(("elseif", "else", "end"))))
        while self.at("elseif"):
            self.advance()
            condition = self.parse_expression()
            self.expect("then")
            clauses.append((condition, self.parse_block(("elseif", "else", "end"))))
        if self.at("else"):
            self.advance()
            clauses.append((None, self.parse_block(("end",))))
        self.expect("end")
        return If(line=line, clauses=clauses)

    def parse_expression_statement(self) -> Stmt:
        line = self.current.line
        first = self.parse_suffixed()
        if self.at("=") or self.at(","):
            targets = [first]
            while self.at(","):
                self.advance()
                targets.append(self.parse_suffixed())
            self.expect("=")
            return Assign(line=line, targets=targets, values=self.parse_expression_list())
        if not isinstance(first, Call):
            raise LuaParseError(f"expected call or assignment, found {first.text()}", line, self.current.column)
        return CallStmt(line=line, call=first)

    def parse_expression_list(self) -> list[Expr]:
        values = [self.parse_expression()]
        while self.at(","):
            self.advance()
            values.append(self.parse_expression())
        return values

    def parse_expression(self, minimum: int = 0) -> Expr:
        left = self.parse_unary()
        while self.current.value in PRECEDENCE and self.current.kind in ("symbol", "keyword"):
            token = self.current
            precedence, associativity = PRECEDENCE[token.value]
            if precedence < minimum:
                break
            self.advance()
            right = self.parse_expression(precedence + 1 if associativity == "left" else precedence)
            left = Bin(line=token.line, op=token.value, left=left, right=right)
        return left

    def parse_unary(self) -> Expr:
        token = self.current
        if token.value == "not" or (token.kind == "symbol" and token.value in ("-", "#")):
            self.advance()
            return Un(line=token.line, op=token.value, operand=self.parse_expression(UNARY_PRECEDENCE))
        return self.parse_suffixed()

    def parse_suffixed(self) -> Expr:
        expression = self.parse_primary()
        while True:
            token = self.current
            if self.at("."):
                self.advance()
                key = self.expect_name()
                expression = Index(line=token.line, obj=expression, key=Str(line=key.line, value=key.value))
            elif self.at("["):
                self.advance()
                key = self.parse_expression()
                self.expect("]")
                expression = Index(line=token.line, obj=expression, key=key)
            elif self.at(":"):
                self.advance()
                method = self.expect_name()
                function = Index(line=token.line, obj=expression, key=Str(line=method.line, value=method.value))
                expression = Call(line=token.line, func=function, args=self.parse_call_arguments())
            elif self.at("(") or self.at("{"):
                expression = Call(line=token.line, func=expression, args=self.parse_call_arguments())
            elif token.kind == "string":
                expression = Call(line=token.line, func=expression, args=[self.parse_primary()])
            else:
                return expression

    def parse_call_arguments(self) -> list[Expr]:
        if self.at("{"):
            return [self.parse_table()]
        self.expect("(")
        arguments = [] if self.at(")") else self.parse_expression_list()
        self.expect(")")
        return arguments

    def parse_primary(self) -> Expr:
        token = self.current
        if token.kind == "string":
            self.advance()
            return Str(line=token.line, value=token.value)
        if token.kind == "number":
            self.advance()
            return Num(line=token.line, value=float(token.value))
        if token.kind == "name":
            self.advance()
            return Name(line=token.line, id=token.value)
        if token.value in ("nil", "true", "false"):
            self.advance()
            return Literal(line=token.line, value=token.value)
        if self.at("("):
            self.advance()
            expression = self.parse_expression()
            self.expect(")")
            return expression
        if self.at("{"):
            return self.parse_table()
        raise LuaParseError(f"expected expression, found {token.value or token.kind!r}", token.line, token.column)

    def parse_table(self) -> Table:
        line = self.expect("{").line
        fields: list[tuple[Expr | None, Expr]] = []
        while not self.at("}"):
            if self.at("["):
                self.advance()
                key = self.parse_expression()
                self.expect("]")
                self.expect("=")
                fields.append((key, self.parse_expression()))
            elif self.current.kind == "name" and self.peek().value == "=":
                key_token = self.advance()
                self.advance()
                fields.append((Str(line=key_token.line, value=key_token.value), self.parse_expression()))
            else:
                fields.append((None, self.parse_expression()))
            if self.at(",") or self.at(";"):
                self.advance()
            elif not self.at("}"):
                token = self.current
                raise LuaParseError("expected ',' or '}' in table", token.line, token.column)
        self.expect("}")
        return Table(line=line, fields=fields)


def parse(source: str) -> list[Stmt]:
    return Parser(source).parse_chunk()


def walk(statements: Sequence[Stmt]) -> Iterator[Stmt]:
    for statement in statements:
        yield statement
        if isinstance(statement, If):
            for _, body in statement.clauses:
                yield from walk(body)
        elif isinstance(statement, Do):
            yield from walk(statement.body)
