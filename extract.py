from __future__ import annotations

import argparse
import sys
from pathlib import Path

from lib.extraction import ExtractionError, run_extraction
from lib.paths import DEFAULT_LANGS, GAME_ENV


def parse_langs(value: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract story scripts and locale tables from read-only game assets")
    parser.add_argument("--game", type=Path, help=f"Game root directory; defaults to ${GAME_ENV}")
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS), help="Comma-separated languages")
    parser.add_argument("--force", action="store_true", help="Ignore all extraction caches")
    parser.add_argument("--checkpoints", dest="checkpoints", action="store_true", default=True)
    parser.add_argument("--no-checkpoints", dest="checkpoints", action="store_false")
    parser.add_argument("--entries", dest="entries", action="store_true", default=True)
    parser.add_argument("--no-entries", dest="entries", action="store_false")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    try:
        run_extraction(args.game, parse_langs(args.langs), args.force, args.checkpoints, args.entries)
    except (ExtractionError, OSError) as exc:
        print(f"[error] {exc}", file=sys.stderr, flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
