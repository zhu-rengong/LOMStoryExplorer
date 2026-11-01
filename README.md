# StoryExplorer

Offline explorer and search tool for the story scripts of *Legend of Mortal*.

The repository contains two halves:

- `extract.py` reads the installed game assets (read only) and writes `data/lua`, `data/locale`, `data/checkpoints.json`, `data/entries.json`, `data/lore.json`, and `data/manifest.json`.
- `build.py` analyzes the scripts, renders the native traditional text, and writes the static payloads consumed by `docs/index.html`. The reader converts that text to simplified in the browser with the vendored `opencc-js` runtime.

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

`run.ps1` wraps both steps and opens the reader. `python extract.py --force` ignores caches and re-reads every asset. `python build.py --no-cache` re-analizes every Lua script. Script analysis runs in a process pool sized to `min(cpu cores / 2, 4)`; pass `--jobs N` to override the worker count and `--jobs 1` to analyze serially.

Simplified Chinese is produced at read time: `docs/vendor/opencc-t2cn.js` is loaded on demand and converts the loaded traditional text, so the build has no conversion stage and publishes no simplified files.

Generated data is ignored by git. Publish the site with `tools/publish-pages.ps1`, which pushes `docs/` to the `gh-pages` branch without a build step.

## Architecture

```text
extract.py / build.py        thin command line entry points
storyexplorer/
  config.py                  paths, versions, limits, game layout
  console.py                 reporter and exit codes
  cache.py                   atomic writes, JSON/gzip envelopes, fingerprints
  manifest.py                extraction manifest and freshness checks
  wire.py                    schema constants and data entry names
  model.py                   domain dataclasses and cache codecs
  emit.py                    wire payload writers for graph, text, checkpoints and word count
  lua/                       tree-sitter facade, clause walking and label rendering
  game/                      Unity asset access, scripts, locales, checkpoints, entries, lore, game info
  flow/                      story analyzer (statements, calls, expressions, state)
  build/                     chapters, facets, graph, sharding, rendering, metrics, report
  cli/                       extract and build commands
docs/
  index.html                 single page shell
  vendor/i18next.min.js      vendored i18next runtime, no CDN required
  vendor/opencc-t2cn.js      vendored opencc-js traditional to simplified runtime
  js/00-runtime.js           SR.define / SR.require / SR.start module runtime
  js/00-local.js             guarded local storage reads and writes
  js/01-prefs.js             first paint preferences (fonts, size, leading, measure)
  js/05-ui.js                DOM, timing, query and toggle primitives shared by every module
  js/10-schema.js            data validation and beat codec
  js/15-graph.js             indexes, adjacency, chapters, visibility
  js/20-storage.js           versioned local storage repositories
  js/25-store.js             application state, actions and content language
  js/30-i18n-data.js         interface dictionaries for every UI language
  js/31-lang.js              interface language resolution, first paint lang and title
  js/32-i18n.js              i18next wrapper, lookups and language metadata
  js/35-overlay.js           popover, menu, sheet and modal lifecycle
  js/40-text.js              lazy story shard loading, prefetch and per-language views
  js/41-convert.js           opencc-js wrapper that turns loaded text into simplified
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
  style/00-tokens.css        single light palette, type scale, spacing and motion tokens
  style/10-base.css          reset, document typography, scrollbars and focus rings
  style/20-shell.css         masthead, search field, catalog rail and reader page frame
  style/30-controls.css      buttons, inputs, segmented controls, rows, menus and popovers
  style/40-reader.css        reading column, beats, options, branches and conditions
  style/50-panels.css        filter, settings drawer, stats, shortcuts, lookup and toasts
  style/60-responsive.css    layout tiers driven by body[data-layout]
  style/90-motion.css        keyframes and reduced-motion fallbacks
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

`01-prefs.js` and `31-lang.js` run before the body exists. The first applies the stored font stacks, size, leading and reading measure to `documentElement`; the second resolves the interface language and writes `documentElement.lang` and `document.title`, so the first paint matches both the saved preferences and the browser language. The interface ships a single light theme declared by `color-scheme: light` and the tokens in `style/00-tokens.css`, so there is no theme switch and no stored theme state.

Interface strings live in `30-i18n-data.js` as plain globals so they load with a classic script tag in the head, which keeps the site working from `file://` without a fetch backend. `32-i18n.js` feeds those bundles to the vendored i18next runtime and exposes `t`, so call sites never touch the library directly. `31-lang.js` owns the interface language: it takes the first supported entry of `navigator.languages`, keeps English as English, maps Chinese tags to the nearest variant and falls back to the data default for everything else. A language picked in the menu is stored in `legend-of-mortal.explorer.lang.v1` and wins on later visits, while an untouched reader re-detects on every load, so a changed browser language takes effect the next time the page opens. The interface language and the content language are separate: `store.state.lang` selects the UI bundle, while `store.textLang()` picks the closest available pack from `SR_DATA.meta.langs`. Only the traditional text ships as files: `meta.textSource` names the physical pack, `40-text.js` loads every shard from it, and any other entry of `meta.langs` is served by converting the loaded text through `41-convert.js`. An interface language without an entry in `meta.langs` (English) therefore keeps rendering the default story data instead of requesting missing shards.

## Data contract

Four globals expose the generated data. Their schema version is `4`.

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

`SR_DATA.meta` contains `counts`, `shards`, `shardOf`, `checkpointShards`, `entries`, `langs`, `defaultLang`, `textSource`, `fullText`, and game build information. `shardOf` and `checkpointShards` are explicit maps produced by the builder, so the browser never re-implements the shard hash. `langs` lists every display language and `textSource` names the only language that ships text files.

`41-convert.js` serves the remaining display languages: it lazy-loads `vendor/opencc-t2cn.js` and runs the vendored `opencc-js` (`from: "tw"`, `to: "cn"`) over every string it hands back, plus a short variant table that normalises characters OpenCC keeps in their Taiwanese form (for example `妳` to `你`). Converted stories, name tables and edge labels are cached per script and per language, so re-rendering costs nothing. Only one word count pack is emitted because the character count does not change between variants, and `85-stats.js` falls back to the first available language.

Nodes and edges are named objects. Story beats are compact tuples because they are the highest-volume payload; only `docs/js/10-schema.js` reads tuple positions, and every other module uses its accessors (`schema.say`, `schema.choices`, `schema.branch`, `schema.jump`, `schema.walk`).

Checkpoint expressions are object trees with `tag` values `const`, `random`, `dice`, `var`, `group`, `compare`, and `logic`. `docs/js/62-condexpr.js` renders them and links variables back to the scripts that write or read them.

## Notes

- Legend entries use `LegendInfo/<key>` from the locale tables. When a story key has no locale value, `extract.py` reads the corresponding `StoryData._text` asset and writes it to `data/lore.json`; `build.py` uses that text as a fallback and skips entries that still have no text instead of printing the internal key.
- `extract.py` still writes both locale tables. `zh-tw` is rendered into the reader and `zh-cn` is kept as reference data, so no simplified text is published with the site.
- Caches live in `data/cache` and are keyed by analysis, checkpoint, entry and lore versions.
- `data/manifest.json` records asset fingerprints and stage statistics. `extract.py` skips unchanged assets unless `--force` is passed.
- `build.py` writes artifacts atomically, then removes every `*.js` under `docs/data` that was not produced by the current run.
- The extractor only reads the game installation. It never writes to the game directory.
