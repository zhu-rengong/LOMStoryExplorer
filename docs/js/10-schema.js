(() => {
  "use strict";

  const SR = window.SR;

  const EMPTY_FACETS = {
    speakers: [], flags: [], checks: [], stats: [], rels: [],
    options: 0, locks: 0, dice: 0,
  };

  const arrays = (value) => (Array.isArray(value) ? value : []);

  const number = (value, fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

  const normalizeFacets = (value) => {
    if (!value || typeof value !== "object") return { ...EMPTY_FACETS };
    return {
      speakers: arrays(value.speakers),
      flags: arrays(value.flags),
      checks: arrays(value.checks),
      stats: arrays(value.stats),
      rels: arrays(value.rels),
      options: number(value.options, 0),
      locks: number(value.locks, 0),
      dice: number(value.dice, 0),
    };
  };

  const normalizeChapter = (chapter) => ({
    id: chapter.id,
    kind: chapter.kind || "other",
    number: typeof chapter.number === "number" ? chapter.number : null,
    color: chapter.color || "#8A8578",
    count: number(chapter.count, 0),
  });

  const normalizeEdge = (edge) => ({
    id: number(edge.id, 0),
    from: edge.from,
    to: edge.to,
    kind: edge.kind || "jump",
    label: edge.label || "",
    data: edge.data && typeof edge.data === "object" ? edge.data : null,
  });

  const normalizeNode = (node) => ({
    id: node.id,
    chapter: number(node.chapter, 0),
    out: number(node.out, 0),
    in: number(node.in, 0),
    say: number(node.say, 0),
    systemIn: number(node.systemIn, 0),
    flags: node.flags || {},
    facets: normalizeFacets(node.facets),
    entry: typeof node.entry === "string" ? node.entry : "",
    time: typeof node.time === "number" ? node.time : null,
  });

  SR.define("schema", ["data"], ({ data }) => {
    const raw = data.meta;
    const meta = Object.assign({}, raw);
    meta.langs = arrays(meta.langs);
    meta.shards = arrays(meta.shards);
    meta.entries = arrays(meta.entries);
    meta.counts = meta.counts || {};
    meta.shardOf = meta.shardOf && typeof meta.shardOf === "object" ? meta.shardOf : {};
    meta.checkpointShards = meta.checkpointShards && typeof meta.checkpointShards === "object"
      ? meta.checkpointShards : {};
    meta.textSource = typeof meta.textSource === "string" && meta.textSource
      ? meta.textSource : (meta.langs[0] || "");
    meta.vocab = data.vocab;
    meta.assets = data.assets;
    meta.calendar = data.calendar;

    return {
      meta,
      chapters: data.chapters.map(normalizeChapter),
      nodes: data.nodes.map(normalizeNode),
      edges: data.edges.map(normalizeEdge),
    };
  });
})();
