(() => {
  "use strict";

  const SR = window.SR;

  const SCHEMA = 5;

  const NAMES = {
    text: "SR_TEXT",
    checkpoints: "SR_CHECKPOINTS",
    wordcount: "SR_WORDCOUNT",
    dictionary: "SR_I18N",
    languageMeta: "SR_I18N_META",
  };

  const read = (name) => window[name] || {};

  SR.define("globals", [], () => ({
    dictionary: () => read(NAMES.dictionary),
    languageMeta: () => read(NAMES.languageMeta),
    text: () => read(NAMES.text),
    checkpoints: () => read(NAMES.checkpoints),
    wordcount: () => read(NAMES.wordcount),
  }));

  SR.define("data", ["globals"], ({ globals }) => {
    const graph = window.SR_DATA;
    if (!graph || typeof graph !== "object") {
      throw new Error("window.SR_DATA is missing; run build.py and load data/graph.js");
    }
    if (graph.schema !== SCHEMA) {
      throw new Error(`unsupported data schema ${graph.schema}; expected ${SCHEMA}, rebuild the data`);
    }

    const meta = graph.meta || {};
    const vocab = meta.vocab || {};
    const assets = meta.assets || {};

    const asset = (key, vars) => {
      const template = assets[key] || "";
      return template.replace(/\{(\w+)\}/g, (whole, name) => (
        vars && vars[name] !== undefined ? String(vars[name]) : whole
      ));
    };

    return {
      schema: SCHEMA,
      meta,
      vocab,
      assets,
      calendar: meta.calendar || {},
      graph,
      nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
      edges: Array.isArray(graph.edges) ? graph.edges : [],
      chapters: Array.isArray(graph.chapters) ? graph.chapters : [],
      entries: Array.isArray(meta.entries) ? meta.entries : [],
      shardOf: meta.shardOf || {},
      checkpointShards: meta.checkpointShards || {},
      langs: Array.isArray(meta.langs) ? meta.langs : [],
      asset,
      textPack: globals.text,
      checkpoints: globals.checkpoints,
      wordcount: globals.wordcount,
      dictionary: globals.dictionary,
      languageMeta: globals.languageMeta,
    };
  });
})();
