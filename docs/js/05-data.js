(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const G = SR.core.G;
  const state = SR.core.state;

  const entrySources = (G.meta && G.meta.entrySources) || {};

  const explicitTime = (G.meta && G.meta.explicitTime) || {};

  const nodes = G.nodes.map((row, i) => ({
    i: i,
    id: row[0],
    ch: row[1],
    out: row[2],
    inc: row[3],
    say: row[4],
    flags: row[5],
    sysIn: row[6] || 0,
    entry: entrySources[row[0]] || "",
  }));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const edges = G.edges.map((edge, i) => ({ i: i, a: edge[0], b: edge[1], kind: edge[2], label: edge[3] }));

  const outAdj = nodes.map(() => []);

  const inAdj = nodes.map(() => []);

  for (const edge of edges) {
    outAdj[edge.a].push(edge);
    inAdj[edge.b].push(edge);
  }

  const chapters = G.chapters;

  const FLAG_EMPTY = 1;
  const FLAG_SIMPLIFIED = 2;
  const FLAG_NO_IN = 8;

  const visible = new Uint8Array(nodes.length);

  const passesFilter = (i) => {
    const node = nodes[i];
    if (state.chapterFilter.size && !state.chapterFilter.has(node.ch)) return false;
    if (state.filterSet && !state.filterSet.has(i)) return false;
    return true;
  };

  const computeVisibility = () => {
    const selectedIndex = state.selected ? state.selected.i : -1;
    state.visibleCount = 0;
    for (let i = 0; i < nodes.length; i++) {
      let show = passesFilter(i);
      if (!show && i === selectedIndex) show = true;
      visible[i] = show ? 1 : 0;
      if (show) {
        state.visibleCount++;
      }
    }
  };

  const FACETS = G.facets || null;

  const edgeKinds = new Uint8Array(nodes.length);
  for (const edge of edges) {
    if (edge.kind === 1) edgeKinds[edge.a] |= 1;
    else if (edge.kind === 2) edgeKinds[edge.a] |= 2;
    else if (edge.kind === 3) edgeKinds[edge.a] |= 4;
  }

  const chapterOf = (node) => chapters[node.ch] || { title: "", color: "#8A8578" };

  const timeOf = (node) => {
    const rounds = explicitTime[node.id];
    return typeof rounds === "number" ? { rounds: rounds } : null;
  };

  SR.register("data", {
    FACETS: FACETS,
    FLAG_EMPTY: FLAG_EMPTY,
    FLAG_NO_IN: FLAG_NO_IN,
    FLAG_SIMPLIFIED: FLAG_SIMPLIFIED,
    chapterOf: chapterOf,
    chapters: chapters,
    computeVisibility: computeVisibility,
    edgeKinds: edgeKinds,
    edges: edges,
    entrySources: entrySources,
    explicitTime: explicitTime,
    inAdj: inAdj,
    nodeById: nodeById,
    nodes: nodes,
    outAdj: outAdj,
    passesFilter: passesFilter,
    timeOf: timeOf,
    visible: visible,
  });
})();
