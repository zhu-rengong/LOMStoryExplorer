from __future__ import annotations

import argparse

from ..build.pipeline import run_build
from ..config import DEFAULT_LANG, DEFAULT_LANGS
from ..console import Reporter
from .common import EXIT_DATA, EXIT_OK, EXIT_USAGE, split_langs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build graph and reader data for the story corpus")
    parser.add_argument("--langs", default=",".join(DEFAULT_LANGS),
                        help="languages to export, comma separated")
    parser.add_argument("--lang", default=DEFAULT_LANG,
                        help="default language (also used for edge labels)")
    parser.add_argument("--no-cache", action="store_true", help="ignore the analysis cache")
    parser.add_argument("--full-text", action="store_true",
                        help="emit a single text-<lang>.js bundle (debugging only)")
    args = parser.parse_args(argv)

    langs = split_langs(args.langs)
    if not langs:
        Reporter().error("no language selected; pass --langs zh-tw,zh-cn")
        return EXIT_USAGE
    default_lang = args.lang if args.lang in langs else langs[0]

    result = run_build(
        langs=langs,
        default_lang=default_lang,
        use_cache=not args.no_cache,
        full_text=args.full_text,
        reporter=Reporter(),
    )
    return EXIT_OK if result.ok else EXIT_DATA
