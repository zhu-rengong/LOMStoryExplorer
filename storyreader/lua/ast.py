from __future__ import annotations

from dataclasses import dataclass


class Expr:
    line: int

    def text(self) -> str:
        raise NotImplementedError


@dataclass
class Str(Expr):
    value: str
    line: int = 0

    def text(self) -> str:
        return '"' + self.value.replace('"', '\\"') + '"'


@dataclass
class Num(Expr):
    value: float
    line: int = 0

    def text(self) -> str:
        return str(int(self.value)) if float(self.value).is_integer() else str(self.value)


@dataclass
class Literal(Expr):
    value: str
    line: int = 0

    def text(self) -> str:
        return self.value


@dataclass
class Name(Expr):
    id: str
    line: int = 0

    def text(self) -> str:
        return self.id


@dataclass
class Index(Expr):
    obj: Expr
    key: Expr
    line: int = 0

    def text(self) -> str:
        return f"{self.obj.text()}[{self.key.text()}]"


@dataclass
class Call(Expr):
    func: Expr
    args: list[Expr]
    line: int = 0

    def text(self) -> str:
        return f"{self.func.text()}({', '.join(arg.text() for arg in self.args)})"


@dataclass
class Table(Expr):
    fields: list[tuple[Expr | None, Expr]]
    line: int = 0

    def text(self) -> str:
        return "{...}"


@dataclass
class Un(Expr):
    op: str
    operand: Expr
    line: int = 0

    def text(self) -> str:
        return f"{self.op}{self.operand.text()}"


@dataclass
class Bin(Expr):
    op: str
    left: Expr
    right: Expr
    line: int = 0

    def text(self) -> str:
        return f"{self.left.text()} {self.op} {self.right.text()}"


class Stmt:
    line: int


@dataclass
class Local(Stmt):
    names: list[str]
    values: list[Expr]
    line: int = 0


@dataclass
class Assign(Stmt):
    targets: list[Expr]
    values: list[Expr]
    line: int = 0


@dataclass
class CallStmt(Stmt):
    call: Call
    line: int = 0


@dataclass
class If(Stmt):
    clauses: list[tuple[Expr | None, list[Stmt]]]
    line: int = 0


@dataclass
class Do(Stmt):
    body: list[Stmt]
    line: int = 0
