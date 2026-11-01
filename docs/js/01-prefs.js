(() => {
  "use strict";

  const SR = window.SR;

  const KEY = "legend-of-mortal.explorer.prefs.v2";
  const LEGACY_KEY = "legend-of-mortal.explorer.prefs.v1";

  const SERIF = '"Source Han Serif TC","Noto Serif TC","Songti TC","Songti SC","STSong",Georgia,"SimSun",serif';
  const SANS = '"PingFang TC","PingFang SC","Source Han Sans TC","Noto Sans TC","Microsoft JhengHei","Microsoft YaHei",system-ui,sans-serif';
  const KAI = `"Kaiti TC","KaiTi","STKaiti","BiauKai","DFKai-SB",${SERIF}`;
  const ROUND = '"Yuanti TC","Yuanti SC","YouYuan","PingFang TC","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = 'ui-monospace,"Sarasa Mono TC","Cascadia Mono",Consolas,"Courier New",monospace';

  const BASE_FONT = SERIF;
  const BASE_SIZE = 16;
  const BASE_LEADING = 1.6;
  const BASE_WEIGHT = 400;

  const FOLLOW_BASE = "@base";
  const FOLLOW_GROUP = "@group";

  const FONTS = [
    { id: "serif", label: "pref.font.serif", stack: SERIF },
    { id: "sans", label: "pref.font.sans", stack: SANS },
    { id: "kai", label: "pref.font.kai", stack: KAI },
    { id: "round", label: "pref.font.round", stack: ROUND },
    { id: "mono", label: "pref.font.mono", stack: MONO },
  ];

  const LABELS = {
    followBase: "pref.followBase",
    followGroup: "pref.followGroup",
    groupAll: "pref.groupAll",
    weightInherit: "pref.weightInherit",
    customFont: "pref.customFont",
    systemFont: "pref.systemFont",
  };

  const GROUPS = [
    { id: "prose", label: "pref.group.prose", font: "serif", scale: 130 },
    { id: "choice", label: "pref.group.choice", font: "sans", scale: 130 },
    { id: "mark", label: "pref.group.mark", font: FOLLOW_BASE, scale: 130 },
    { id: "heading", label: "pref.group.heading", font: FOLLOW_BASE },
    { id: "ui", label: "pref.group.ui", font: FOLLOW_BASE },
    { id: "status", label: "pref.group.status", font: FOLLOW_BASE },
  ];

  const TYPES = [
    { id: "dialog", group: "prose", label: "pref.type.dialog", font: FOLLOW_GROUP, weight: null },
    { id: "speaker", group: "prose", label: "pref.type.speaker", font: "kai", weight: 500, scale: 140 },
    { id: "narration", group: "prose", label: "pref.type.narration", font: FOLLOW_GROUP, weight: null, scale: 160 },
    { id: "think", group: "prose", label: "pref.type.think", font: FOLLOW_GROUP, weight: null },
    { id: "lore", group: "prose", label: "pref.type.lore", font: "kai", weight: null },
    { id: "snippet", group: "prose", label: "pref.type.snippet", font: FOLLOW_GROUP, weight: null },

    { id: "option", group: "choice", label: "pref.type.option", font: FOLLOW_GROUP, weight: null },
    { id: "index", group: "choice", label: "pref.type.index", font: "mono", weight: null, scale: 80, noLeading: true },
    { id: "option-cond", group: "choice", label: "pref.type.option-cond", font: FOLLOW_GROUP, weight: null, scale: 80 },
    { id: "branch-cond", group: "choice", label: "pref.type.branch-cond", font: FOLLOW_GROUP, weight: 400 },

    { id: "label", group: "mark", label: "pref.type.label", font: "sans", weight: null },
    { id: "jump", group: "mark", label: "pref.type.jump", font: FOLLOW_GROUP, weight: null, noLeading: true },
    { id: "badge", group: "mark", label: "pref.type.badge", font: FOLLOW_GROUP, weight: null, noLeading: true },

    { id: "title", group: "heading", label: "pref.type.title", font: FOLLOW_GROUP, weight: 600 },
    { id: "panel", group: "heading", label: "pref.type.panel", font: FOLLOW_GROUP, weight: 600 },
    { id: "lookup", group: "heading", label: "pref.type.lookup", font: FOLLOW_GROUP, weight: 600 },
    { id: "brand", group: "heading", label: "pref.type.brand", font: FOLLOW_GROUP, weight: 600 },
    { id: "seal", group: "heading", label: "pref.type.seal", font: FOLLOW_GROUP, weight: 600, noLeading: true },
    { id: "rail", group: "heading", label: "pref.type.rail", font: FOLLOW_GROUP, weight: 600 },
    { id: "stat", group: "heading", label: "pref.type.stat", font: FOLLOW_GROUP, weight: 600 },
    { id: "empty-title", group: "heading", label: "pref.type.empty-title", font: FOLLOW_GROUP, weight: 600 },
    { id: "crumb", group: "heading", label: "pref.type.crumb", font: "mono", weight: null },
    { id: "meta", group: "heading", label: "pref.type.meta", font: "mono", weight: null },

    { id: "ui", group: "ui", label: "pref.type.ui", font: FOLLOW_GROUP, weight: null },
    { id: "ui-compact", group: "ui", label: "pref.type.ui-compact", font: FOLLOW_GROUP, weight: null },
    { id: "ui-micro", group: "ui", label: "pref.type.ui-micro", font: FOLLOW_GROUP, weight: null },
    { id: "caption", group: "ui", label: "pref.type.caption", font: "mono", weight: null },
    { id: "id", group: "ui", label: "pref.type.id", font: "mono", weight: null },

    { id: "status", group: "status", label: "pref.type.status", font: FOLLOW_GROUP, weight: null },
    { id: "loading", group: "status", label: "pref.type.loading", font: "mono", weight: null },
    { id: "empty", group: "status", label: "pref.type.empty", font: FOLLOW_GROUP, weight: null },
  ];

  const WEIGHTS = [400, 500, 600];

  const MEASURE_MIN = 520;
  const MEASURE_MAX = 1400;
  const MEASURE_DEFAULT = 860;

  const GROUP_DEFAULT = { scale: 100, leading: 100, weight: BASE_WEIGHT };
  const TYPE_DEFAULT = { scale: 100, leading: 100, weight: null };

  let state = null;

  const clampNumber = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  };

  const clampScale = (value, fallback) => Math.round(clampNumber(value, 25, 300, fallback) / 5) * 5;

  const clampLeading = (value, fallback) => Math.round(clampNumber(value, 50, 250, fallback) / 5) * 5;

  const clampWeight = (value, fallback) => {
    if (value === null) return fallback;
    const weight = Number(value);
    return WEIGHTS.indexOf(weight) >= 0 ? weight : fallback;
  };

  const defaultGroups = () => {
    const out = {};
    for (const group of GROUPS) {
      out[group.id] = {
        font: typeof group.font === "string" ? group.font : FOLLOW_BASE,
        scale: typeof group.scale === "number" ? group.scale : GROUP_DEFAULT.scale,
        leading: typeof group.leading === "number" ? group.leading : GROUP_DEFAULT.leading,
        weight: typeof group.weight === "number" ? group.weight : GROUP_DEFAULT.weight,
      };
    }
    return out;
  };

  const defaultTypes = () => {
    const out = {};
    for (const type of TYPES) {
      out[type.id] = {
        font: type.font,
        scale: typeof type.scale === "number" ? type.scale : TYPE_DEFAULT.scale,
        leading: typeof type.leading === "number" ? type.leading : TYPE_DEFAULT.leading,
        weight: type.weight,
      };
    }
    return out;
  };

  const normalizeEntry = (raw, base, fallbackWeight) => {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      font: typeof item.font === "string" ? item.font : base.font,
      scale: clampScale(item.scale, base.scale),
      leading: clampLeading(item.leading, base.leading),
      weight: clampWeight(item.weight === undefined ? fallbackWeight : item.weight, fallbackWeight),
    };
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const groupById = (groupId) => {
    for (const group of GROUPS) if (group.id === groupId) return group;
    return null;
  };

  const typeById = (typeId) => {
    for (const type of TYPES) if (type.id === typeId) return type;
    return null;
  };

  const fontById = (fontId) => {
    for (const font of FONTS) if (font.id === fontId) return font;
    return null;
  };

  const normalizeFamily = (name) => {
    const value = String(name || "").trim();
    if (!value) return "";
    if (/^["']/.test(value)) return value;
    return value.split(",").map((part) => {
      const piece = part.trim();
      if (!piece) return "";
      return /\s/.test(piece) ? `"${piece.replace(/"/g, "")}"` : piece;
    }).filter(Boolean).join(",");
  };

  const stackOfValue = (value) => {
    if (!value || value === FOLLOW_BASE) return BASE_FONT;
    const preset = fontById(value);
    if (preset) return preset.stack;
    const direct = normalizeFamily(value);
    return direct ? `${direct},${BASE_FONT}` : BASE_FONT;
  };

  const groupStack = (groupId) => stackOfValue((state.groups[groupId] || GROUP_DEFAULT).font);

  const typeStack = (typeId) => {
    const type = typeById(typeId);
    if (!type) return BASE_FONT;
    const item = state.types[typeId];
    if (!item || !item.font || item.font === FOLLOW_GROUP) return groupStack(type.group);
    return stackOfValue(item.font);
  };

  const resolveWeight = (typeId) => {
    const type = typeById(typeId);
    if (!type) return BASE_WEIGHT;
    const item = state.types[typeId];
    const group = state.groups[type.group];
    if (item && item.weight !== null && item.weight !== undefined) return item.weight;
    if (group && group.weight !== null && group.weight !== undefined) return group.weight;
    return BASE_WEIGHT;
  };

  const computedOf = (scope, id) => {
    if (scope === "group") {
      const group = state.groups[id];
      if (!group) return null;
      return {
        scope: "group",
        id: id,
        scale: group.scale,
        leading: group.leading,
        px: BASE_SIZE * (group.scale / 100),
        lineHeight: BASE_LEADING * (group.leading / 100),
        weight: group.weight,
        font: group.font,
        fontStack: groupStack(id),
      };
    }
    const type = typeById(id);
    if (!type) return null;
    const item = state.types[id];
    const group = state.groups[type.group];
    return {
      scope: "type",
      id: id,
      group: type.group,
      scale: item.scale,
      leading: item.leading,
      px: BASE_SIZE * (group.scale / 100) * (item.scale / 100),
      lineHeight: BASE_LEADING * (group.leading / 100) * (item.leading / 100),
      weight: resolveWeight(id),
      font: item.font,
      fontStack: typeStack(id),
    };
  };

  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--font-base", BASE_FONT);
    root.style.setProperty("--reader-measure", `${state.measure}px`);
    for (const type of TYPES) {
      const item = computedOf("type", type.id);
      root.style.setProperty(`--rd-fs-${type.id}`, `${item.px.toFixed(2)}px`);
      root.style.setProperty(`--rd-lh-${type.id}`, item.lineHeight.toFixed(3));
      root.style.setProperty(`--rd-fw-${type.id}`, String(item.weight));
      root.style.setProperty(`--rd-ff-${type.id}`, item.fontStack);
    }
  };

  const LOCAL = window.SR_LOCAL;

  const persist = () => {
    LOCAL.setJson(KEY, state);
  };

  const snapshot = () => clone(state);

  const listeners = new Set();

  const notify = () => {
    const detail = snapshot();
    for (const listener of Array.from(listeners)) listener(detail);
  };

  const restoreDefaults = () => {
    state = {
      groups: defaultGroups(),
      types: defaultTypes(),
      measure: MEASURE_DEFAULT,
    };
  };

  const restore = () => {
    restoreDefaults();
    const saved = LOCAL.getJson(KEY);
    let source = saved && typeof saved === "object" ? saved : null;
    if (!source) {
      const legacy = LOCAL.getJson(LEGACY_KEY);
      source = legacy && typeof legacy === "object" ? { measure: legacy.measure } : null;
    }
    if (!source) return;
    state.measure = Math.round(clampNumber(source.measure, MEASURE_MIN, MEASURE_MAX, MEASURE_DEFAULT));
    const groups = source.groups && typeof source.groups === "object" ? source.groups : null;
    if (groups) {
      for (const group of GROUPS) {
        state.groups[group.id] = normalizeEntry(groups[group.id], state.groups[group.id], GROUP_DEFAULT.weight);
      }
    }
    const types = source.types && typeof source.types === "object" ? source.types : null;
    if (types) {
      for (const type of TYPES) {
        state.types[type.id] = normalizeEntry(types[type.id], state.types[type.id], null);
      }
    }
  };

  const set = (patch) => {
    if (patch && typeof patch === "object") {
      if (patch.measure !== undefined) {
        state.measure = Math.round(clampNumber(patch.measure, MEASURE_MIN, MEASURE_MAX, state.measure));
      }
      if (patch.groups && typeof patch.groups === "object") {
        for (const groupId of Object.keys(patch.groups)) {
          if (!state.groups[groupId]) continue;
          const next = patch.groups[groupId] || {};
          const current = state.groups[groupId];
          if (typeof next.font === "string") current.font = next.font;
          if (next.scale !== undefined) current.scale = clampScale(next.scale, current.scale);
          if (next.leading !== undefined) current.leading = clampLeading(next.leading, current.leading);
          if (next.weight !== undefined) current.weight = clampWeight(next.weight, current.weight);
        }
      }
      if (patch.types && typeof patch.types === "object") {
        for (const typeId of Object.keys(patch.types)) {
          if (!state.types[typeId]) continue;
          const next = patch.types[typeId] || {};
          const current = state.types[typeId];
          if (typeof next.font === "string") current.font = next.font;
          if (next.scale !== undefined) current.scale = clampScale(next.scale, current.scale);
          if (next.leading !== undefined) current.leading = clampLeading(next.leading, current.leading);
          if (next.weight !== undefined) {
            current.weight = next.weight === null ? null : clampWeight(next.weight, current.weight);
          }
        }
      }
    }
    apply();
    persist();
    notify();
    return snapshot();
  };

  const fontLabel = (value) => {
    if (!value || value === FOLLOW_BASE) return LABELS.followBase;
    if (value === FOLLOW_GROUP) return LABELS.followGroup;
    const preset = fontById(value);
    if (preset) return preset.label;
    return String(value);
  };

  const parseTarget = (target) => {
    const value = String(target || "");
    if (value.indexOf("group:") === 0) return { scope: "group", id: value.slice(6) };
    if (value.indexOf("type:") === 0) return { scope: "type", id: value.slice(5) };
    return { scope: "type", id: value };
  };

  const describe = (target) => {
    const parsed = parseTarget(target);
    if (parsed.scope === "group") {
      const group = state.groups[parsed.id];
      return fontLabel(group ? group.font : FOLLOW_BASE);
    }
    const item = state.types[parsed.id];
    return fontLabel(item ? item.font : FOLLOW_GROUP);
  };

  const api = {
    labels: LABELS,
    presets: {
      fonts: FONTS,
      groups: GROUPS,
      types: TYPES,
      weights: WEIGHTS.slice(),
    },
    measureRange: { min: MEASURE_MIN, max: MEASURE_MAX, fallback: MEASURE_DEFAULT },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    groupById: groupById,
    typeById: typeById,
    computed: computedOf,
    get: snapshot,
    set: set,
    reset: () => {
      restoreDefaults();
      apply();
      persist();
      notify();
      return snapshot();
    },
    describe: describe,
  };

  restore();
  apply();

  SR.define("prefs", [], () => api);
})();
