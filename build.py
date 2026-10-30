from __future__ import annotations

import argparse
import sys

from lib.paths import DEFAULT_LANG, DEFAULT_LANGS
from lib.pipeline import BuildError, BuildOptions, BuildPipeline


def parse_langs(value: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build the versioned static story catalog and reading data")
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS), help="Comma-separated languages to export")
    parser.add_argument("--lang", default=DEFAULT_LANG, help="Default reader language")
    parser.add_argument("--no-cache", action="store_true", help="Ignore the semantic analysis cache")
    parser.add_argument("--full-text", action="store_true", help="Emit one story bundle per language")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)
    options = BuildOptions(parse_langs(args.langs), args.lang, not args.no_cache, args.full_text)
    try:
        BuildPipeline(options).run()
    except (BuildError, OSError, ValueError) as exc:
        print(f"[error] {exc}", file=sys.stderr, flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
