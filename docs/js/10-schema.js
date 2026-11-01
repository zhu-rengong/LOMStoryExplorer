(() => {
  "use strict";

  const SR = window.SR;

  const SCHEMA = 3;

  const SAY_MODES = ["dialog", "narration", "think"];

  const EMPTY_FACETS = {
    speakers: [], flags: [], checks: [], stats: [], rels: [],
    options: 0, locks: 0, dice: 0,
  };

  const raw = window.SR_DATA;

  if (!raw || typeof raw !== "object") {
    throw new Error("window.SR_DATA is missing; run build.py and load data/graph.js");
  }
  if (raw.schema !== SCHEMA) {
    throw new Error(`unsupported data schema ${raw.schema}; expected ${SCHEMA}, rebuild the data`);
  }

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

  const nodes = arrays(raw.nodes).map((node) => ({
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
  }));

  const edges = arrays(raw.edges).map((edge) => ({
    id: number(edge.id, 0),
    from: edge.from,
    to: edge.to,
    kind: edge.kind || "jump",
    label: edge.label || "",
  }));

  const chapters = arrays(raw.chapters).map((chapter) => ({
    id: chapter.id,
    title: chapter.title || "",
    color: chapter.color || "#8A8578",
    count: number(chapter.count, 0),
  }));

  const meta = Object.assign({}, raw.meta);
  meta.shardOf = meta.shardOf && typeof meta.shardOf === "object" ? meta.shardOf : {};
  meta.checkpointShards = meta.checkpointShards && typeof meta.checkpointShards === "object"
    ? meta.checkpointShards : {};
  meta.conv = meta.conv && typeof meta.conv === "object" ? meta.conv : {};
  meta.langs = arrays(meta.langs);
  meta.shards = arrays(meta.shards);
  meta.entries = arrays(meta.entries);
  meta.counts = meta.counts || {};
  meta.textSource = typeof meta.textSource === "string" && meta.textSource
    ? meta.textSource : (meta.langs[0] || "");

  const say = (beat) => ({
    speaker: beat[1] || "",
    text: beat[2] || "",
    mode: SAY_MODES[beat[3]] || SAY_MODES[0],
  });

  const choices = (beat) => {
    const options = [];
    for (const row of beat[1] || []) {
      options.push({
        text: row[0] || "",
        note: row[1] || "",
        beats: row[2] || [],
        lock: row[3] || "",
      });
    }
    return options;
  };

  const branch = (beat) => ({
    label: beat[1] || "",
    beats: beat[2] || [],
    kind: beat[3] || "if",
    group: typeof beat[4] === "number" ? beat[4] : 0,
  });

  const jump = (beat) => ({
    target: beat[1] || "",
    label: beat[2] || "",
  });

  const scene = (beat) => ({
    name: beat[1] || "",
    key: beat[2] || "",
    next: beat[3] || "",
  });

  const metaBeat = (beat) => ({
    text: beat[1] || "",
    method: typeof beat[2] === "string" ? beat[2] : "",
    key: typeof beat[3] === "string" ? beat[3] : "",
  });

  const walk = (rows, visit) => {
    for (const beat of rows || []) {
      if (!Array.isArray(beat) || !beat.length) continue;
      visit(beat);
      const kind = beat[0];
      if (kind === "c") {
        for (const option of beat[1] || []) {
          if (option && Array.isArray(option[2])) walk(option[2], visit);
        }
      } else if (kind === "br") {
        walk(beat[2], visit);
      }
    }
  };

  const RICH_TAG = /\{[^{}]*\}/g;

  const stripRich = (text) => (text ? String(text).replace(RICH_TAG, "") : "");

  const textOf = (rows) => {
    const parts = [];
    walk(rows, (beat) => {
      if (beat[0] === "s") {
        parts.push(stripRich(beat[2]));
      } else if (beat[0] === "c") {
        for (const option of beat[1] || []) parts.push(stripRich(option[0]));
      } else if (beat[0] === "lore") {
        parts.push(stripRich(beat[1]));
      }
    });
    return parts.join("\n");
  };

  const firstLine = (rows, nameOf) => {
    let text = "";
    walk(rows, (beat) => {
      if (text) return;
      if (beat[0] !== "s") return;
      const speaker = beat[1] ? `${nameOf(beat[1])}：` : "";
      text = speaker + stripRich(beat[2]);
    });
    return text;
  };

  const checkpointShard = (key) => {
    const index = meta.checkpointShards[key];
    return typeof index === "number" ? index : -1;
  };

  SR.define("schema", [], () => ({
    meta,
    chapters,
    nodes,
    edges,
    branch,
    checkpointShard,
    choices,
    firstLine,
    jump,
    metaBeat,
    say,
    scene,
    stripRich,
    textOf,
  }));
})();
