from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from ..console import Reporter
from ..versions import ENTRY_VERSION
from .profile import ENTRY_FIELDS, ENTRY_SOURCE_ORDER, POSITION_CLASS
from .unity import Session, available, build_generator, fingerprint

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


def probe(assets_dir: Path, ids: set[str], reporter: Reporter) -> dict[str, Any]:
    base = Path(assets_dir)
    started = time.time()
    exact = set(ids)
    folded = {sid.lower(): sid for sid in sorted(exact)}
    payload: dict[str, Any] = {
        "version": ENTRY_VERSION,
        "fingerprint": fingerprint(base),
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "entries": {},
        "positions": {},
        "unmatched": [],
        "unresolved": [],
        "stats": {"ok": False, "reason": "", "classes": {}, "entries": 0, "entries_unmatched": 0,
                  "positions": 0, "position_targets": 0, "positions_unresolved": 0,
                  "warnings": 0, "elapsed": 0.0},
    }
    stats = payload["stats"]

    if not available():
        stats["reason"] = "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable"
        reporter.warn(stats["reason"])
        return payload

    try:
        _generator, adapter = build_generator(base / "Managed")
    except Exception as exc:
        stats["reason"] = f"typetree generator init failed: {type(exc).__name__}"
        reporter.warn(stats["reason"])
        return payload

    entries: dict[str, str] = {}
    unmatched: list[str] = []
    positions: dict[str, list[str]] = {}
    unresolved: list[str] = []
    classes: dict[str, int] = {}
    wanted = set(ENTRY_FIELDS) | {POSITION_CLASS}
    seen = 0

    session = Session(base, adapter, reporter.info)
    try:
        for file_name, obj, cls in session.iter_class(wanted):
            seen += 1
            if seen % PROGRESS_EVERY == 0:
                reporter.info(f"scanned {seen} entry objects...")
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
            if current is None or ENTRY_SOURCE_ORDER[source] < ENTRY_SOURCE_ORDER[current]:
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
    payload["entries"] = dict(sorted(entries.items()))
    payload["positions"] = {name: positions[name] for name in sorted(positions)}
    payload["unmatched"] = unmatched[:60]
    payload["unresolved"] = sorted(unresolved)[:60]

    reporter.info(
        f"system entries: {len(entries)} scripts have a source ("
        + ", ".join(f"{cls} {count}" for cls, count in sorted(classes.items()))
        + f"); position events {len(positions)} names -> {stats['position_targets']} targets,"
        f" {stats['elapsed']}s"
    )
    return payload


def _position_targets(session: Session, file_name: str, tree: dict[str, Any],
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


def summarize(payload: dict[str, Any] | None) -> dict[str, Any]:
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
