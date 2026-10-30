# StoryReader

StoryReader is a read-only story extractor and a static reading interface for Legend of Mortal. It turns the game's Lua story assets and locale tables into a versioned catalog, narrative graph, and chapter-aware text shards.

## Requirements

- Python 3.10 or later
- UnityPy 1.25.2 or later
- TypeTreeGeneratorAPI 0.0.10 or later for optional checkpoint and entry extraction
- A local installation of the game

The game installation is never modified. Set `MORTAL_GAME_DIR` to its root directory or pass the directory through `--game` and `-GameDir`.

## Setup

```powershell
python -m pip install -r requirements.txt
```

## Extract and build

```powershell
python extract.py --game "path/to/LegendOfMortal" --langs zh-tw,zh-cn
python build.py --langs zh-tw,zh-cn --lang zh-tw
```

Open `docs/index.html` directly after the build. No web server, package installation, compilation, CDN, or network connection is required by the reader.

The PowerShell entry point provides the same workflow:

```powershell
./run.ps1 -GameDir "path/to/LegendOfMortal" -Langs "zh-tw,zh-cn"
```

Use `-Force` to ignore extraction and analysis caches, or `-NoBrowser` to suppress opening the reader.

## Commands

### extract.py

- `--game PATH`: game root; defaults to `MORTAL_GAME_DIR`.
- `--langs LIST`: comma-separated locale identifiers; defaults to `zh-tw,zh-cn`.
- `--force`: ignore extraction caches.
- `--checkpoints` and `--no-checkpoints`: enable or disable checkpoint detail extraction.
- `--entries` and `--no-entries`: enable or disable system-entry probing.

The command writes the Lua corpus, locale tables, checkpoint data, entry data, and an asset manifest under `data/`. Optional Unity asset probes degrade without preventing core story extraction.

### build.py

- `--langs LIST`: languages to export.
- `--lang LANG`: default reader language; it must be present in `--langs`.
- `--no-cache`: reanalyze every Lua script.
- `--full-text`: emit one story bundle per language instead of chapter-aware shards.

The command writes static JavaScript data under `docs/data/` and a diagnostic report at `data/report.json`. Generated site data is not source-controlled.

## Reader

The interface provides chapter navigation, bookmarks, recent reading, reading progress, unified story and full-text search, branch exploration, incoming and outgoing story links, shareable story anchors, Traditional and Simplified Chinese, paper and night themes, and essential typography controls.

Browser state uses the versioned `storyreader:v2` LocalStorage key. Earlier local data formats are intentionally not imported.

## Architecture

The extraction and build commands are thin adapters around explicit pipelines:

1. Unity adapters read story assets and locale tables without modifying the game.
2. A positioned Lua parser produces an immutable syntax tree.
3. The story analyzer creates typed dialogue, choice, branch, metadata, and script-relation models.
4. The build pipeline constructs the narrative graph and serializes versioned static data.
5. Frontend repositories load and validate data, while a central store drives library, reader, navigation, and settings views.

Semantic analysis uses content hashes and a parser-versioned gzip cache. Output files are replaced atomically, stale generated shards are removed, and individual script diagnostics are included in the build report.

## Static data protocol

All generated bundles use protocol version 1.

- `catalog.js`: languages, chapters, story summaries, graph edges, entry metadata, and shard assignments.
- `stories-{lang}-index.js`: localized names, characters, shard metadata, and story-to-shard mapping.
- `stories-{lang}-{shard}.js`: on-demand rendered story beats.
- `stories-{lang}.js`: complete language data when `--full-text` is enabled.
- `conditions-{n}.js`: optional checkpoint models loaded by stable key hash.

Scripts must retain their relative paths. Story indexes load before their corresponding shards. Version mismatches and missing files produce visible reader errors rather than silent fallback to incompatible data.

## Publishing

`docs/` is the complete static site root. To stage and publish it to `gh-pages`:

```powershell
./tools/publish-pages.ps1
```

Use `-DryRun` to inspect staging without committing or pushing. Configure the repository's Pages source to the `gh-pages` branch.
