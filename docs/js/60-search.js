(() => {
  "use strict";

  const SR = window.SR;

  SR.define("search", ["beat", "graph", "store", "text", "ui"], ({ beat, graph, store, text, ui }) => {
    const empty = () => ({ lang: "", seen: new Set(), entries: [], sorted: true });

    let index = empty();

    const passes = (nodeIndex) => graph.passes(nodeIndex, store.state.filterSet);

    const buildIndex = () => {
      const lang = store.textLang();
      if (index.lang !== lang) index = empty();
      index.lang = lang;
      const pack = text.pack(lang);
      const stories = (pack && pack.stories) || {};
      const ids = Object.keys(stories);
      let added = false;
      for (const id of ids) {
        if (index.seen.has(id)) continue;
        index.seen.add(id);
        added = true;
        const nodeIndex = graph.indexById.get(id);
        const node = nodeIndex === undefined ? null : graph.nodes[nodeIndex];
        index.entries.push({
          id,
          order: nodeIndex === undefined ? -1 : nodeIndex,
          chapter: node ? graph.chapterOf(node) : null,
          text: beat.textOf(stories[id]).toLowerCase(),
        });
      }
      if (added) index.sorted = false;
      if (!index.sorted) {
        index.entries.sort((a, b) => a.order - b.order);
        index.sorted = true;
      }
      return index;
    };

    const invalidate = () => {
      index = empty();
    };

    const search = (query) => {
      const lower = ui.normalizeQuery(query);
      const result = { hits: [], total: 0, outside: 0 };
      if (lower.length < 2) return result;
      const data = buildIndex();
      const hits = result.hits;
      let outside = 0;
      for (const entry of data.entries) {
        const position = entry.text.indexOf(lower);
        if (position < 0) continue;
        if (entry.order < 0) continue;
        if (!passes(entry.order)) {
          outside++;
          continue;
        }
        hits.push({
          id: entry.id,
          index: entry.order,
          chapter: entry.chapter,
          snippet: entry.text.slice(Math.max(0, position - 16), position + 46),
        });
      }
      result.total = hits.length + outside;
      result.outside = outside;
      return result;
    };

    return {
      invalidate,
      search,
    };
  });
})();
