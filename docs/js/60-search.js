(() => {
  "use strict";

  const SR = window.SR;

  SR.define("search", ["schema", "graph", "store", "text"], ({ schema, graph, store, text }) => {
    const ID_LIKE = /^[a-z]{1,8}[0-9_]*$/i;
    const ID_LIMIT = 12;
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
      if (!raw) return [];
      const lower = raw.toLowerCase();
      const hits = [];
      const taken = new Set();

      const byId = [];
      graph.nodes.forEach((node, nodeIndex) => {
        if (!passes(nodeIndex)) return;
        if (node.id.toLowerCase().indexOf(lower) < 0) return;
        byId.push(node);
      });
      byId.sort((a, b) => b.say - a.say);
      byId.sort((a, b) => {
        const ea = a.id.toLowerCase() === lower ? 0 : 1;
        const eb = b.id.toLowerCase() === lower ? 0 : 1;
        return ea - eb;
      });
      for (const node of byId.slice(0, ID_LIMIT)) {
        hits.push({ id: node.id, chapter: graph.chapterOf(node), snippet: "" });
        taken.add(node.id);
      }

      if (raw.length >= 2) {
        const data = buildIndex();
        for (const entry of data.entries) {
          if (hits.length >= TOTAL_LIMIT) break;
          if (taken.has(entry.id)) continue;
          const position = entry.text.indexOf(lower);
          if (position < 0) continue;
          const nodeIndex = graph.indexById.get(entry.id);
          if (nodeIndex === undefined || !passes(nodeIndex)) continue;
          hits.push({
            id: entry.id,
            chapter: graph.chapterOf(graph.nodes[nodeIndex]),
            snippet: entry.text.slice(Math.max(0, position - 16), position + 46),
          });
          taken.add(entry.id);
        }
      }
      return hits;
    };

    const countOutside = (query) => {
      const lower = String(query || "").trim().toLowerCase();
      if (!lower) return 0;
      const data = buildIndex();
      const byId = new Map(data.entries.map((entry) => [entry.id, entry.text]));
      let count = 0;
      for (const node of graph.nodes) {
        if (node.id.toLowerCase().indexOf(lower) >= 0) {
          count++;
          continue;
        }
        const entry = byId.get(node.id);
        if (entry && entry.indexOf(lower) >= 0) count++;
      }
      return count;
    };

    return {
      ID_LIKE,
      buildIndex,
      countOutside,
      invalidate,
      search,
    };
  });
})();
