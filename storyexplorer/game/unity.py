from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

from .profile import UNITY_VERSION


def unitypy() -> Any:
    import UnityPy

    return UnityPy


def available() -> bool:
    try:
        import TypeTreeGeneratorAPI
    except Exception:
        return False
    return True


def _tree_node_cls() -> Any:
    from UnityPy.helpers.TypeTreeNode import TypeTreeNode

    return TypeTreeNode


class Adapter:
    def __init__(self, generator: Any) -> None:
        self.generator = generator
        self.failures = 0

    def get_nodes_up(self, assembly: str, fullname: str) -> Any:
        try:
            flat = self.generator.get_nodes(assembly, fullname)
        except Exception:
            self.failures += 1
            return None
        node_cls = _tree_node_cls()
        root = None
        stack: list[Any] = []
        for item in flat:
            node = node_cls(m_Level=item.m_Level, m_Type=item.m_Type, m_Name=item.m_Name,
                            m_ByteSize=0, m_Version=1, m_MetaFlag=item.m_MetaFlag)
            while stack and stack[-1].m_Level >= node.m_Level:
                stack.pop()
            if stack:
                stack[-1].m_Children.append(node)
            else:
                root = node
            stack.append(node)
        return root


def build_generator(managed_dir: Path) -> tuple[Any, Adapter]:
    from TypeTreeGeneratorAPI import TypeTreeGenerator

    generator = TypeTreeGenerator(UNITY_VERSION, "AssetsTools")
    loaded = 0
    for dll in sorted(Path(managed_dir).glob("*.dll")):
        try:
            generator.load_dll(dll.read_bytes())
            loaded += 1
        except Exception:
            continue
    if not loaded:
        raise RuntimeError(f"no loadable assemblies under {managed_dir}")
    return generator, Adapter(generator)


def asset_files(base_dir: Path) -> list[Path]:
    base = Path(base_dir)
    return [path for path in sorted(base.iterdir())
            if path.is_file() and (path.suffix == ".assets" or path.name.startswith("level"))]


def fingerprint(base_dir: Path) -> str:
    parts = []
    for path in asset_files(base_dir):
        try:
            stat = path.stat()
        except OSError:
            continue
        parts.append(f"{path.name}:{stat.st_size}:{int(stat.st_mtime)}")
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


class Deref:
    def __init__(self, env: Any, local: dict[int, Any], serialized: Any,
                 base_dir: Path, adapter: Any, store: dict[str, Any] | None = None) -> None:
        self.env = env
        self.local = local
        self.serialized = serialized
        self.base_dir = Path(base_dir)
        self.adapter = adapter
        self.externals = list(getattr(serialized, "externals", []) or [])
        self.store: dict[str, Any] = store if store is not None else {}
        self.children: dict[str, Deref] = {}

    def _file(self, file_id: int) -> tuple[str, Any, Any, dict[int, Any]] | None:
        if not 1 <= file_id <= len(self.externals):
            return None
        try:
            name = Path(self.externals[file_id - 1].path).name
        except Exception:
            return None
        if not name:
            return None
        loaded = self.store[name] if name in self.store else self._load(name)
        if not isinstance(loaded, tuple):
            return None
        return name, *loaded

    def _load(self, name: str) -> tuple[Any, Any, dict[int, Any]] | None:
        entry = None
        target = self.base_dir / name
        if target.is_file():
            try:
                sub = unitypy().load(str(target))
                sub.typetree_generator = self.adapter
                serialized = getattr(sub, "file", None) or next(iter(sub.files.values()))
                entry = (sub, serialized, {obj.path_id: obj for obj in sub.objects})
            except Exception:
                entry = None
        self.store[name] = entry
        return entry

    def scope(self, ref: Any) -> tuple[Any, Deref]:
        if not isinstance(ref, dict):
            return None, self
        path_id = int(ref.get("m_PathID") or 0)
        if not path_id:
            return None, self
        file_id = int(ref.get("m_FileID") or 0)
        if file_id == 0:
            return self.local.get(path_id), self
        entry = self._file(file_id)
        if entry is None:
            return None, self
        name, env, serialized, table = entry
        obj = table.get(path_id)
        if obj is None:
            return None, self
        child = self.children.get(name)
        if child is None:
            child = Deref(env, table, serialized, self.base_dir, self.adapter, self.store)
            self.children[name] = child
        return obj, child

    def __call__(self, ref: Any) -> Any:
        return self.scope(ref)[0]


class Session:
    def __init__(self, base_dir: Path, adapter: Any, log: Callable[[str], None] = print) -> None:
        self.base_dir = Path(base_dir)
        self.adapter = adapter
        self.log = log
        self._envs: dict[str, Any] = {}
        self._externals: dict[str, list[str]] = {}
        self._scripts: dict[str, dict[int, str]] = {}
        self._names: list[str] | None = None
        self._known: set[str] | None = None
        self._failed: set[str] = set()
        self.warnings = 0

    def close(self) -> None:
        for env in self._envs.values():
            try:
                env.file.close()
            except Exception:
                continue
        self._envs.clear()

    def names(self) -> list[str]:
        if self._names is None:
            self._names = [path.name for path in asset_files(self.base_dir)]
        return self._names

    def _known_files(self) -> set[str]:
        if self._known is None:
            self._known = set(self.names())
        return self._known

    def _open(self, name: str) -> Any:
        cached = self._envs.get(name)
        if cached is not None:
            return cached
        if name in self._failed:
            raise LookupError(f"{name} failed to open earlier")
        try:
            env = unitypy().load(str(self.base_dir / name))
        except Exception:
            self._failed.add(name)
            raise
        env.typetree_generator = self.adapter
        serialized = getattr(env, "file", None) or next(iter(env.files.values()))
        self._externals[name] = [Path(ext.path).name
                                 for ext in (getattr(serialized, "externals", []) or [])]
        self._envs[name] = env
        return env

    def _script_table(self, name: str) -> dict[int, str]:
        table = self._scripts.get(name)
        if table is not None:
            return table
        table = {}
        if name in self._failed or name not in self._known_files():
            self._scripts[name] = table
            return table
        try:
            env = self._open(name)
        except Exception as exc:
            self._warn(f"failed to open {name}: {type(exc).__name__}")
            self._scripts[name] = table
            return table
        for obj in env.objects:
            if obj.type.name != "MonoScript":
                continue
            try:
                table[obj.path_id] = getattr(obj.read(), "m_ClassName", "") or ""
            except Exception:
                continue
        self._scripts[name] = table
        return table

    def _warn(self, message: str) -> None:
        self.warnings += 1
        self.log(f"      [warn] {message}")

    def class_of(self, name: str, ref: Any) -> str:
        file_id = int(getattr(ref, "m_FileID", 0) or 0)
        path_id = int(getattr(ref, "m_PathID", 0) or 0)
        if not path_id:
            return ""
        if file_id == 0:
            return self._script_table(name).get(path_id, "")
        externals = self._externals.get(name) or []
        if 1 <= file_id <= len(externals):
            return self._script_table(externals[file_id - 1]).get(path_id, "")
        return ""

    def iter_class(self, classes: set[str]) -> Iterator[tuple[str, Any, str]]:
        for name in self.names():
            try:
                env = self._open(name)
            except Exception as exc:
                self._warn(f"failed to open {name}: {type(exc).__name__}")
                continue
            for obj in env.objects:
                if obj.type.name != "MonoBehaviour":
                    continue
                try:
                    head = obj.parse_monobehaviour_head()
                except Exception:
                    continue
                cls = self.class_of(name, getattr(head, "m_Script", None))
                if cls in classes:
                    yield name, obj, cls

    def object_of(self, name: str, ref: Any) -> Any:
        if not isinstance(ref, dict):
            convert = getattr(ref, "as_dict", None)
            ref = convert() if callable(convert) else None
        if not isinstance(ref, dict):
            return None
        path_id = int(ref.get("m_PathID") or 0)
        if not path_id:
            return None
        file_id = int(ref.get("m_FileID") or 0)
        target = name
        if file_id:
            externals = self._externals.get(name) or []
            if not 1 <= file_id <= len(externals):
                return None
            target = externals[file_id - 1]
            if target not in self._known_files():
                return None
        try:
            env = self._open(target)
        except Exception as exc:
            self._warn(f"failed to open {target}: {type(exc).__name__}")
            return None
        for obj in env.objects:
            if obj.path_id == path_id:
                return obj
        return None

    def tree(self, name: str, obj: Any) -> dict | None:
        if obj is None:
            return None
        try:
            return obj.read_typetree()
        except Exception:
            self._warn(f"failed to read typetree of {name} {getattr(obj, 'path_id', '?')}")
            return None

    def ref_tree(self, name: str, ref: Any) -> dict | None:
        return self.tree(name, self.object_of(name, ref))
