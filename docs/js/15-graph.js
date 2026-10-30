(() => {
  "use strict";

  const SR = window.SR;

  const EDGE_INFERRED = 1;
  const EDGE_TEMP = 2;
  const EDGE_POSITION = 4;

  SR.define("graph", ["schema"], ({ schema }) => {
    const nodes = schema.nodes;
    const edges = schema.edges;
    const chapters = schema.chapters;

    const nodeById = new Map();
    const indexById = new Map();
    nodes.forEach((node, index) => {
      nodeById.set(node.id, node);
      indexById.set(node.id, index);
    });

    const outAdj = nodes.map(() => []);
    const inAdj = nodes.map(() => []);
    const edgeKinds = new Uint8Array(nodes.length);
    for (const edge of edges) {
      const from = indexById.get(edge.from);
      const to = indexById.get(edge.to);
      if (from === undefined || to === undefined) continue;
      outAdj[from].push(edge);
      inAdj[to].push(edge);
      if (edge.kind === "inferred") edgeKinds[from] |= EDGE_INFERRED;
      else if (edge.kind === "temp" || edge.kind === "travel") edgeKinds[from] |= EDGE_TEMP;
      else if (edge.kind === "position") edgeKinds[from] |= EDGE_POSITION;
    }
    for (const node of nodes) {
      if (node.systemIn > 0) {
        const index = indexById.get(node.id);
        edgeKinds[index] |= EDGE_POSITION;
      }
    }

    const visible = new Uint8Array(nodes.length);
    const state = { count: nodes.length };

    const chapterOf = (node) => chapters[node.chapter] || { id: "", title: "", color: "#8A8578", count: 0 };

    const passes = (index, chapterFilter, filterSet) => {
      const node = nodes[index];
      if (chapterFilter && chapterFilter.size && !chapterFilter.has(node.chapter)) return false;
      if (filterSet && !filterSet.has(index)) return false;
      return true;
    };

    const computeVisibility = (chapterFilter, filterSet, selectedId) => {
      const selectedIndex = selectedId ? indexById.get(selectedId) : undefined;
      let count = 0;
      for (let index = 0; index < nodes.length; index++) {
        let show = passes(index, chapterFilter, filterSet);
        if (!show && index === selectedIndex) show = true;
        visible[index] = show ? 1 : 0;
        if (show) count++;
      }
      state.count = count;
      return count;
    };

    let byChapter = null;

    const nodesByChapter = () => {
      if (byChapter) return byChapter;
      byChapter = chapters.map(() => []);
      nodes.forEach((node) => {
        if (byChapter[node.chapter]) byChapter[node.chapter].push(node);
      });
      return byChapter;
    };

    const edgeLabel = (edge) => edge.label || "";

    const nextTargets = (node) => {
      if (!node) return [];
      const seen = new Set();
      const targets = [];
      for (const edge of outAdj[indexById.get(node.id)] || []) {
        const target = nodeById.get(edge.to);
        if (!target || seen.has(target.id)) continue;
        seen.add(target.id);
        targets.push({ node: target, edge });
      }
      return targets;
    };

    const prevInChapter = (node) => {
      if (!node) return null;
      let previous = null;
      for (const candidate of nodesByChapter()[node.chapter] || []) {
        if (candidate.id >= node.id) continue;
        if (!previous || candidate.id > previous.id) previous = candidate;
      }
      return previous;
    };

    const idOrder = nodes.map((node) => node.id).sort();

    const nextInChapter = (node) => {
      if (!node) return null;
      for (const id of idOrder) {
        if (id > node.id && nodeById.get(id).chapter === node.chapter) return nodeById.get(id);
      }
      return null;
    };

    const facetMatches = (node, kind, key) => {
      if (!key) return false;
      const table = node.facets;
      if (kind === "speaker") return table.speakers.indexOf(key) >= 0;
      if (kind === "flag") return table.flags.indexOf(key) >= 0;
      if (kind === "check") return table.checks.indexOf(key) >= 0;
      if (kind === "stat") return table.stats.indexOf(key) >= 0;
      if (kind === "rel") return table.rels.indexOf(key) >= 0;
      return false;
    };

    const lookup = (kind, key) => {
      const out = [];
      for (const node of nodes) {
        if (facetMatches(node, kind, key)) out.push(node);
      }
      return out;
    };

    const flagGroups = (key) => {
      const writes = [];
      const reads = [];
      if (!key) return { writes, reads };
      for (const node of nodes) {
        if (node.facets.flags.indexOf(key) >= 0) {
          writes.push(node);
          continue;
        }
        if (node.facets.checks.some((check) => check === key || check.indexOf(`${key}_`) === 0)) {
          reads.push(node);
        }
      }
      return { writes, reads };
    };

    return {
      EDGE_INFERRED,
      EDGE_POSITION,
      EDGE_TEMP,
      chapters,
      chapterOf,
      computeVisibility,
      count: () => state.count,
      edgeKinds,
      edges,
      flagGroups,
      inAdj,
      indexById,
      lookup,
      nextInChapter,
      nextTargets,
      nodeById,
      nodes,
      nodesByChapter,
      outAdj,
      passes,
      prevInChapter,
      visible,
      edgeLabel,
    };
  });
})();
