# StoryReader

Offline reader and search tool for the story scripts of *Legend of Mortal*.

The repository contains two halves:

- `extract.py` reads the installed game assets (read only) and writes `data/lua`, `data/locale`, `data/checkpoints.json`, `data/entries.json`, `data/lore.json`, and `data/manifest.json`.
- `build.py` analyzes the scripts, renders localized text, and writes the static payloads consumed by `docs/index.html`.

The site is a zero-build static bundle. `docs/index.html` works when opened directly from disk (`file://`), and it also works when served from any static host.

## Requirements

- Python 3.10 or newer
- `UnityPy`, `TypeTreeGeneratorAPI`, `tree-sitter` and `tree-sitter-lua` (see `requirements.txt`) for asset extraction and script analysis
- A local copy of the game for extraction (`MORTAL_GAME_DIR` or `--game`)
- Node.js is only useful for `node --check` syntax checks during development

## Usage

```powershell
python -m pip install -r requirements.txt
$env:MORTAL_GAME_DIR = "G:\SteamLibrary\steamapps\common\LegendOfMortal"

python extract.py --game $env:MORTAL_GAME_DIR
python build.py
```

`run.ps1` wraps both steps and opens the reader. `python extract.py --force` ignores caches and re-reads every asset. `python build.py --no-cache` re-analyzes every Lua script.

Generated data is ignored by git. Publish the site with `tools/publish-pages.ps1`, which pushes `docs/` to the `gh-pages` branch without a build step.

## Architecture

```text
extract.py / build.py        thin command line entry points
storyreader/
  config.py                  paths, versions, limits, game layout
  console.py                 reporter, diagnostics, exit codes
  cache.py                   atomic writes, JSON/gzip envelopes, fingerprints
  manifest.py                extraction manifest and freshness checks
  wire.py                    schema constants and data entry names
  model.py                   domain dataclasses and cache codecs
  lua/                       tree-sitter facade, clause walking and label rendering
  game/                      Unity asset access, scripts, locales, checkpoints, entries, lore, game info
  flow/                      story analyzer (statements, calls, expressions, state)
  build/                     chapters, facets, graph, sharding, rendering, word count, report
  emit/                      wire payload writers
  cli/                       extract and build commands
docs/
  index.html                 single page shell
  js/00-runtime.js           SR.define / SR.require / SR.start module runtime
  js/01-prefs.js             first paint preferences (theme, fonts, measure)
  js/10-schema.js            data validation and beat codec
  js/15-graph.js             indexes, adjacency, chapters, visibility
  js/20-storage.js           versioned local storage repositories
  js/25-store.js             application state and actions
  js/32-i18n.js              interface dictionary access
  js/35-overlay.js           popover, menu, sheet and modal lifecycle
  js/40-text.js              lazy story shard loading and prefetch
  js/45-checkpoints.js       lazy checkpoint shard loading
  js/50-settings.js          font enumeration and preference facade
  js/55-query.js             filter language parser and evaluator
  js/60-search.js            full text search index for story text
  js/62-condexpr.js          checkpoint expression rendering
  js/65-beats.js             story beat rendering and preview models
  js/70-reader.js            reader surface, footer, loading and retry states
  js/75-rail.js              catalog and bookmark rail
  js/80-panels.js            lookup and condition panels
  js/85-stats.js             word count panel
  js/88-search-ui.js         top bar search surface
  js/90-filter-ui.js         filter panel, suggestions and results
  js/92-settings-ui.js       settings drawer and font picker
  js/94-shortcuts.js         keyboard shortcuts and help panel
  js/96-app.js               shell bindings, routing, language and layout
  js/99-boot.js              fatal error surface and runtime start
  style/                     token, theme, base, component, layout and feature layers
```

## Frontend module contract

Scripts are classic `<script>` tags loaded in numeric order. Load order does not affect instantiation:

```js
SR.define("graph", ["schema"], ({ schema }) => {
  return { nodes: schema.nodes };
});

const app = SR.start("app");
```

Each module declares its dependencies and receives them as an object. `SR.require` resolves modules lazily, reports the exact dependency chain when a module is missing, and rejects cycles at startup. Modules never read each other through implicit globals.

`01-prefs.js` is the only script that runs before the body exists. It applies the stored theme, font stacks, size, leading and reading measure to `documentElement` so the first paint matches the saved preferences.

## Data contract

Four globals expose the generated data. Their schema version is `2`.

```text
window.SR_DATA
  schema, meta, chapters, nodes, edges

window.SR_TEXT[lang]
  schema, lang, characters, names, edgeLabels, stories, shardKeys, fullText

window.SR_CHECKPOINTS[key]
  kind, note, branches, fallback, additions, countItems, candidates, prefix, default

window.SR_WORDCOUNT
  schema, kinds, langs
```

`SR_DATA.meta` contains `counts`, `shards`, `shardOf`, `checkpointShards`, `entries`, `langs`, `defaultLang`, `fullText`, and game build information. `shardOf` and `checkpointShards` are explicit maps produced by the builder, so the browser never re-implements the shard hash.

Nodes and edges are named objects. Story beats are compact tuples because they are the highest-volume payload; only `docs/js/10-schema.js` reads tuple positions, and every other module uses its accessors (`schema.say`, `schema.choices`, `schema.branch`, `schema.jump`, `schema.walk`).

Checkpoint expressions are object trees with `tag` values `const`, `random`, `dice`, `var`, `group`, `compare`, and `logic`. `docs/js/62-condexpr.js` renders them and links variables back to the scripts that write or read them.

## Notes

- Legend entries use `LegendInfo/<key>` from the locale tables. When a story key has no locale value, `extract.py` reads the corresponding `StoryData._text` asset and writes it to `data/lore.json`; `build.py` uses that text as a fallback and skips entries that still have no text instead of printing the internal key.
- Caches live in `data/cache` and are keyed by analysis, checkpoint, entry and lore versions.
- `data/manifest.json` records asset fingerprints and stage statistics. `extract.py` skips unchanged assets unless `--force` is passed.
- `build.py` writes artifacts atomically, then removes every `*.js` under `docs/data` that was not produced by the current run.
- The extractor only reads the game installation. It never writes to the game directory.
