from __future__ import annotations

import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from . import unityprobe

ENTRY_VERSION = 2

POSITION_CLASS = "PositionResultData"

ENTRY_FIELDS: dict[str, tuple[str, str]] = {
    "FreePositionData": ("_defaultScript", "free"),
    "PositionController": ("_scriptName", "free"),
    "CombatEventActionSetStoryScript": ("_name", "combat"),
}
SOURCE_ORDER = {"combat": 0, "free": 1}

PROGRESS_EVERY = 200


def _resolve(value: Any, exact: set[str], folded: dict[str, str]) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""
    if text in exact:
        return text
    return folded.get(text.lower(), "")


def probe(assets_dir: Path, ids: set[str], log: Callable[[str], None] = print) -> dict:
    base = Path(assets_dir)
    started = time.time()
    exact = set(ids)
    folded = {sid.lower(): sid for sid in sorted(exact)}
    result: dict[str, Any] = {
        "version": ENTRY_VERSION,
        "fingerprint": unityprobe.fingerprint(base),
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "entries": {},
        "positions": {},
        "stats": {"ok": False, "reason": "", "classes": {}, "entries": 0, "entries_unmatched": 0,
                  "positions": 0, "position_targets": 0, "positions_unresolved": 0,
                  "warnings": 0, "elapsed": 0.0},
    }
    stats = result["stats"]

    if not unityprobe.available():
        stats["reason"] = "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable"
        log(f"      [warn] {stats['reason']}")
        return result

    try:
        _generator, adapter = unityprobe.build_generator(base / "Managed")
    except Exception as exc:
        stats["reason"] = f"typetree generator init failed: {type(exc).__name__}"
        log(f"      [warn] {stats['reason']}")
        return result

    entries: dict[str, str] = {}
    unmatched: list[str] = []
    positions: dict[str, list[str]] = {}
    unresolved: list[str] = []
    classes: dict[str, int] = {}
    wanted = set(ENTRY_FIELDS) | {POSITION_CLASS}
    seen = 0

    session = unityprobe.Session(base, adapter, log)
    try:
        for file_name, obj, cls in session.iter_class(wanted):
            seen += 1
            if seen % PROGRESS_EVERY == 0:
                log(f"      scanned {seen} entry objects...")
            classes[cls] = classes.get(cls, 0) + 1
            tree = session.tree(file_name, obj)
            if not tree:
                continue
            if cls == POSITION_CLASS:
                name = (tree.get("m_Name") or "").strip()
                if not name:
                    continue
                positions[name] = _position_targets(session, file_name, tree, exact, folded)
                if not positions[name]:
                    unresolved.append(name)
                continue
            field, source = ENTRY_FIELDS[cls]
            target = _resolve(tree.get(field), exact, folded)
            if not target:
                value = tree.get(field)
                if isinstance(value, str) and value.strip():
                    unmatched.append(f"{cls}.{field}={value.strip()}")
                continue
            current = entries.get(target)
            if current is None or SOURCE_ORDER[source] < SOURCE_ORDER[current]:
                entries[target] = source
    finally:
        stats["warnings"] = session.warnings
        session.close()

    stats.update({
        "ok": True,
        "reason": "",
        "classes": classes,
        "entries": len(entries),
        "entries_unmatched": len(unmatched),
        "positions": len(positions),
        "position_targets": sum(len(targets) for targets in positions.values()),
        "positions_unresolved": len(unresolved),
        "elapsed": round(time.time() - started, 1),
    })
    result["entries"] = dict(sorted(entries.items()))
    result["positions"] = {name: positions[name] for name in sorted(positions)}
    result["unmatched"] = unmatched[:60]
    result["positions_unresolved"] = sorted(unresolved)[:60]

    log(f"      system entries: {len(entries)} scripts have a source ("
        + ", ".join(f"{cls} {count}" for cls, count in sorted(classes.items()))
        + f"); position events {len(positions)} names -> {stats['position_targets']} targets,"
        f" {stats['elapsed']}s")
    return result


def _position_targets(session: unityprobe.Session, file_name: str, tree: dict,
                      exact: set[str], folded: dict[str, str]) -> list[str]:
    prefix = (tree.get("_scriptPrefix") or "").strip()
    if not prefix:
        return []
    found: set[str] = set()
    for ref in tree.get("_list") or []:
        event = session.ref_tree(file_name, ref)
        if not event:
            continue
        mapping = session.ref_tree(file_name, event.get("_config"))
        if not mapping:
            continue
        value = mapping.get("Value")
        if value is None:
            continue
        target = _resolve(f"{prefix}_{str(value).strip()}", exact, folded)
        if target:
            found.add(target)
    return sorted(found)


def load_cache(path: Path, fingerprint: str) -> dict | None:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return None
    if (payload.get("version") == ENTRY_VERSION
            and payload.get("fingerprint") == fingerprint):
        return payload
    return None


def save_cache(path: Path, payload: dict) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                      encoding="utf-8")


def summarize(payload: dict) -> dict:
    stats = dict((payload or {}).get("stats") or {})
    summary = {
        "ok": bool(stats.get("ok")),
        "reason": stats.get("reason", ""),
        "version": (payload or {}).get("version"),
        "classes": stats.get("classes") or {},
        "entries": stats.get("entries", 0),
        "entries_unmatched": stats.get("entries_unmatched", 0),
        "positions": stats.get("positions", 0),
        "position_targets": stats.get("position_targets", 0),
        "positions_unresolved": stats.get("positions_unresolved", 0),
        "elapsed": stats.get("elapsed", 0.0),
    }
    if not payload:
        summary["ok"] = False
        summary["reason"] = "asset probe not run (missing data/entries.json)"
    return summary
