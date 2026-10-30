from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True, frozen=True)
class Expr:
    line: int

    def text(self) -> str:
        raise NotImplementedError


@dataclass(slots=True, frozen=True)
class Str(Expr):
    value: str

    def text(self) -> str:
        escaped = self.value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        return f'"{escaped}"'


@dataclass(slots=True, frozen=True)
class Num(Expr):
    value: float

    def text(self) -> str:
        return str(int(self.value)) if self.value.is_integer() else str(self.value)


@dataclass(slots=True, frozen=True)
class Literal(Expr):
    value: str

    def text(self) -> str:
        return self.value


@dataclass(slots=True, frozen=True)
class Name(Expr):
    id: str

    def text(self) -> str:
        return self.id


@dataclass(slots=True, frozen=True)
class Index(Expr):
    obj: Expr
    key: Expr

    def text(self) -> str:
        if isinstance(self.key, Str):
            return f"{self.obj.text()}.{self.key.value}"
        return f"{self.obj.text()}[{self.key.text()}]"


@dataclass(slots=True, frozen=True)
class Call(Expr):
    func: Expr
    args: list[Expr]

    def text(self) -> str:
        return f"{self.func.text()}({', '.join(arg.text() for arg in self.args)})"


@dataclass(slots=True, frozen=True)
class Table(Expr):
    fields: list[tuple[Expr | None, Expr]]

    def text(self) -> str:
        return "{" + ", ".join(
            f"{key.text()} = {value.text()}" if key else value.text() for key, value in self.fields
        ) + "}"


@dataclass(slots=True, frozen=True)
class Un(Expr):
    op: str
    operand: Expr

    def text(self) -> str:
        return f"{self.op} {self.operand.text()}" if self.op == "not" else f"{self.op}{self.operand.text()}"


@dataclass(slots=True, frozen=True)
class Bin(Expr):
    op: str
    left: Expr
    right: Expr

    def text(self) -> str:
        return f"{self.left.text()} {self.op} {self.right.text()}"


@dataclass(slots=True, frozen=True)
class Stmt:
    line: int


@dataclass(slots=True, frozen=True)
class Local(Stmt):
    names: list[str]
    values: list[Expr]


@dataclass(slots=True, frozen=True)
class Assign(Stmt):
    targets: list[Expr]
    values: list[Expr]


@dataclass(slots=True, frozen=True)
class CallStmt(Stmt):
    call: Call


@dataclass(slots=True, frozen=True)
class If(Stmt):
    clauses: list[tuple[Expr | None, list[Stmt]]]


@dataclass(slots=True, frozen=True)
class Do(Stmt):
    body: list[Stmt]
