(() => {
  "use strict";
  const SR = window.SR;
  let catalog;
  let nodes = [];
  let nodeMap = new Map();
  let outgoing = [];
  let incoming = [];
  const requireArray = (value, name) => {
    if (!Array.isArray(value)) throw new Error(`Invalid catalog field: ${name}`);
  };
  const init = () => {
    catalog = window.__SR_CATALOG__;
    if (!catalog || catalog.version !== SR.VERSION) throw new Error("Catalog version mismatch; run build.py again");
    requireArray(catalog.nodes, "nodes");
    requireArray(catalog.edges, "edges");
    requireArray(catalog.chapters, "chapters");
    nodes = catalog.nodes.map((node, index) => ({ ...node, index }));
    nodeMap = new Map(nodes.map((node) => [node.id, node]));
    outgoing = nodes.map(() => []);
    incoming = nodes.map(() => []);
    for (const [source, target, kind, label] of catalog.edges) {
      if (!nodes[source] || !nodes[target]) continue;
      const edge = { source: nodes[source], target: nodes[target], kind, label };
      outgoing[source].push(edge);
      incoming[target].push(edge);
    }
  };
  const node = (id) => nodeMap.get(id) || null;
  const chapter = (idOrIndex) => typeof idOrIndex === "number" ? catalog.chapters[idOrIndex] : catalog.chapters.find((item) => item.id === idOrIndex);
  SR.register("data", {
    init,
    get catalog() { return catalog; },
    get nodes() { return nodes; },
    get chapters() { return catalog?.chapters || []; },
    node,
    chapter,
    outgoing: (id) => node(id) ? outgoing[node(id).index] : [],
    incoming: (id) => node(id) ? incoming[node(id).index] : [],
    inChapter: (chapterId) => nodes.filter((item) => chapter(item.chapter)?.id === chapterId),
    isEntry: (id) => catalog.entries.some((entry) => entry.id === id),
  });
})();
