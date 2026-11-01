(() => {
  "use strict";

  const SR = window.SR;

  const GROUP_BITS = { inferred: 1, temp: 2, position: 4 };
  const FACET_FIELDS = {
    speaker: "speakers",
    flag: "flags",
    check: "checks",
    stat: "stats",
    rel: "rels",
  };

  SR.define("graph", ["schema", "data"], ({ schema, data }) => {
    const nodes = schema.nodes;
    const edges = schema.edges;
    const chapters = schema.chapters;
    const groups = data.vocab.edgeGroups || {};

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
      const bit = GROUP_BITS[groups[edge.kind]];
      if (bit) edgeKinds[from] |= bit;
    }
    for (const node of nodes) {
      if (node.systemIn > 0) {
        const index = indexById.get(node.id);
        edgeKinds[index] |= GROUP_BITS.position;
      }
    }

    const visible = new Uint8Array(nodes.length);

    const chapterOf = (node) => chapters[node.chapter] || {
      id: "", kind: "other", number: null, color: "#8A8578", count: 0,
    };

    const passes = (index, filterSet) => {
      if (filterSet && !filterSet.has(index)) return false;
      return true;
    };

    const computeVisibility = (filterSet, selectedId) => {
      const selectedIndex = selectedId ? indexById.get(selectedId) : undefined;
      let count = 0;
      for (let index = 0; index < nodes.length; index++) {
        let show = passes(index, filterSet);
        if (!show && index === selectedIndex) show = true;
        visible[index] = show ? 1 : 0;
        if (show) count++;
      }
      return count;
    };

    const hasEdgeGroup = (index, group) => {
      const bit = GROUP_BITS[group] || 0;
      return bit > 0 && (edgeKinds[index] & bit) !== 0;
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

    const facetMatches = (node, kind, key) => {
      if (!key) return false;
      const field = FACET_FIELDS[kind];
      if (!field) return false;
      const values = node.facets[field];
      return Array.isArray(values) && values.indexOf(key) >= 0;
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
      chapters,
      chapterOf,
      computeVisibility,
      edgeKinds,
      edges,
      flagGroups,
      hasEdgeGroup,
      inAdj,
      indexById,
      lookup,
      nextTargets,
      nodeById,
      nodes,
      nodesByChapter,
      outAdj,
      passes,
      visible,
    };
  });
})();
