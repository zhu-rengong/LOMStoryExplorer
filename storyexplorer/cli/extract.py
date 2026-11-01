from __future__ import annotations

import argparse
from pathlib import Path

from ..console import Reporter
from ..extract import DATA, USAGE, ExtractRequest, run
from ..game.profile import GAME_ENV
from ..languages import LOCALE_LANGS
from .common import EXIT_DATA, EXIT_OK, EXIT_USAGE, split_langs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract story Lua files and locale tables from the game assets (read only)")
    parser.add_argument("--game", default=None, help=f"game root directory (defaults to ${GAME_ENV})")
    parser.add_argument("--langs", default=",".join(LOCALE_LANGS),
                        help="locale tables to export, comma separated")
    parser.add_argument("--force", action="store_true", help="ignore caches and extract again")
    parser.add_argument("--checkpoints", dest="checkpoints", action="store_true", default=True)
    parser.add_argument("--no-checkpoints", dest="checkpoints", action="store_false")
    parser.add_argument("--entries", dest="entries", action="store_true", default=True,
                        help="also probe system entries (default on)")
    parser.add_argument("--no-entries", dest="entries", action="store_false",
                        help="skip the system entry probe")
    parser.add_argument("--lore", dest="lore", action="store_true", default=True,
                        help="also extract StoryData lore fallback texts (default on)")
    parser.add_argument("--no-lore", dest="lore", action="store_false",
                        help="skip the StoryData lore fallback extraction")
    parser.add_argument("--stats", dest="stats", action="store_true", default=True,
                        help="also extract stat asset names and notes (default on)")
    parser.add_argument("--no-stats", dest="stats", action="store_false",
                        help="skip the stat asset extraction")
    args = parser.parse_args(argv)

    request = ExtractRequest(
        game=Path(args.game).expanduser() if args.game else None,
        langs=split_langs(args.langs),
        force=args.force,
        checkpoints=args.checkpoints,
        entries=args.entries,
        lore=args.lore,
        stats=args.stats,
    )
    result = run(request, Reporter())
    if result.kind == USAGE:
        return EXIT_USAGE
    if result.kind == DATA:
        return EXIT_DATA
    return EXIT_OK
