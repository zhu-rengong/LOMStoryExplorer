(() => {
  "use strict";

  const SR = window.SR;

  SR.define("search", ["schema", "graph", "store", "text"], ({ schema, graph, store, text }) => {
    const TOTAL_LIMIT = 24;

    let index = { lang: "", count: 0, entries: [] };

    const passes = (nodeIndex) => graph.passes(
      nodeIndex, store.state.chapterFilter, store.state.filterSet);

    const buildIndex = () => {
      const lang = store.state.lang;
      const pack = text.pack(lang);
      const stories = (pack && pack.stories) || {};
      const ids = Object.keys(stories);
      if (index.lang === lang && index.count === ids.length) return index;
      const entries = ids.map((id) => ({ id, text: schema.textOf(stories[id]).toLowerCase() }));
      index = { lang, count: ids.length, entries };
      return index;
    };

    const invalidate = () => {
      index = { lang: "", count: 0, entries: [] };
    };

    const search = (query) => {
      const raw = String(query || "").trim();
      if (raw.length < 2) return [];
      const lower = raw.toLowerCase();
      const hits = [];
      const data = buildIndex();
      for (const entry of data.entries) {
        if (hits.length >= TOTAL_LIMIT) break;
        const position = entry.text.indexOf(lower);
        if (position < 0) continue;
        const nodeIndex = graph.indexById.get(entry.id);
        if (nodeIndex === undefined || !passes(nodeIndex)) continue;
        hits.push({
          id: entry.id,
          chapter: graph.chapterOf(graph.nodes[nodeIndex]),
          snippet: entry.text.slice(Math.max(0, position - 16), position + 46),
        });
      }
      return hits;
    };

    const countOutside = (query) => {
      const lower = String(query || "").trim().toLowerCase();
      if (!lower) return 0;
      const data = buildIndex();
      let count = 0;
      for (const entry of data.entries) {
        if (entry.text.indexOf(lower) >= 0) count++;
      }
      return count;
    };

    return {
      buildIndex,
      countOutside,
      invalidate,
      search,
    };
  });
})();
