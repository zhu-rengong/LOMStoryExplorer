(() => {
  "use strict";

  const SR = window.SR;

  const KEY = "legend-of-mortal.reader.prefs.v2";
  const LEGACY_SETTINGS = "legend-of-mortal.story-reader.settings.v1";
  const LEGACY_THEME = "legend-of-mortal.story-reader.theme.v1";

  const SERIF = '"Source Han Serif TC","Noto Serif TC","Songti TC","Songti SC","STSong",Georgia,"SimSun",serif';
  const SANS = '"PingFang TC","PingFang SC","Source Han Sans TC","Noto Sans TC","Microsoft JhengHei","Microsoft YaHei",system-ui,sans-serif';
  const KAI = `"Kaiti TC","KaiTi","STKaiti","BiauKai","DFKai-SB",${SERIF}`;
  const ROUND = '"Yuanti TC","Yuanti SC","YouYuan","PingFang TC","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = 'ui-monospace,"Sarasa Mono TC","Cascadia Mono",Consolas,"Courier New",monospace';
  const SYSTEM = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans TC",system-ui,sans-serif';

  const READING = [
    { id: "serif", label: { tw: "宋體（預設）", cn: "宋体（默认）" }, stack: SERIF },
    { id: "sans", label: { tw: "黑體", cn: "黑体" }, stack: SANS },
    { id: "kai", label: { tw: "楷體", cn: "楷体" }, stack: KAI },
    { id: "round", label: { tw: "圓體", cn: "圆体" }, stack: ROUND },
    { id: "mono", label: { tw: "等寬", cn: "等宽" }, stack: MONO },
    { id: "custom", label: { tw: "自訂字體…", cn: "自定义字体…" }, stack: SERIF },
  ];

  const UI = [
    { id: "system", label: { tw: "系統預設", cn: "系统默认" }, stack: SYSTEM },
    { id: "sans", label: { tw: "黑體", cn: "黑体" }, stack: SANS },
    { id: "round", label: { tw: "圓體", cn: "圆体" }, stack: ROUND },
    { id: "serif", label: { tw: "宋體", cn: "宋体" }, stack: SERIF },
    { id: "custom", label: { tw: "自訂字體…", cn: "自定义字体…" }, stack: SYSTEM },
  ];

  const TYPES = [
    { id: "dialog", label: { tw: "對白", cn: "对白" }, base: 16 },
    { id: "speaker", label: { tw: "說話人", cn: "说话人" }, base: 14 },
    { id: "narration", label: { tw: "旁白", cn: "旁白" }, base: 14.5 },
    { id: "think", label: { tw: "心聲", cn: "心声" }, base: 16 },
    { id: "option", label: { tw: "選項", cn: "选项" }, base: 14.5 },
    { id: "branch-cond", label: { tw: "分支條件", cn: "分支条件" }, base: 12 },
    { id: "option-cond", label: { tw: "選項條件", cn: "选项条件" }, base: 12 },
    { id: "label", label: { tw: "標籤", cn: "标签" }, base: 11.5 },
    { id: "lore", label: { tw: "劇情點", cn: "剧情点" }, base: 15 },
  ];

  const WEIGHTS = [400, 500, 600];
  const THEMES = ["paper", "night", "auto"];

  const DEFAULT_TYPE = { font: "", scale: 100, weight: 400 };

  const MEASURE_MIN = 520;
  const MEASURE_MAX = 1400;
  const MEASURE_DEFAULT = 860;

  const TYPE_OVERRIDES = {
    speaker: { font: "kai", scale: 150 },
    narration: { scale: 150 },
    option: { font: "sans" },
    "branch-cond": { font: "sans" },
    "option-cond": { font: "sans" },
    label: { font: "sans" },
    lore: { font: "kai" },
  };

  const DEFAULTS = {
    theme: "auto",
    reading: "serif",
    readingCustom: "",
    ui: "system",
    uiCustom: "",
    scale: 130,
    leading: 1.85,
    measure: MEASURE_DEFAULT,
    types: null,
  };

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  let state = null;

  const clampNumber = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  };

  const defaultTypes = () => {
    const out = {};
    for (const type of TYPES) {
      const patch = TYPE_OVERRIDES[type.id] || {};
      out[type.id] = {
        font: typeof patch.font === "string" ? patch.font : DEFAULT_TYPE.font,
        scale: patch.scale || DEFAULT_TYPE.scale,
        weight: patch.weight || DEFAULT_TYPE.weight,
      };
    }
    return out;
  };

  const normalizeTypes = (raw) => {
    const types = defaultTypes();
    if (!raw || typeof raw !== "object") return types;
    const legacyCond = raw.cond && typeof raw.cond === "object" ? raw.cond : null;
    for (const type of TYPES) {
      const fallback = type.id === "branch-cond" || type.id === "option-cond" ? legacyCond : null;
      const item = raw[type.id] && typeof raw[type.id] === "object" ? raw[type.id] : fallback;
      if (!item || typeof item !== "object") continue;
      types[type.id].font = typeof item.font === "string" ? item.font : "";
      types[type.id].scale = Math.round(clampNumber(item.scale, 70, 150, 100) / 5) * 5;
      const weight = Number(item.weight);
      types[type.id].weight = WEIGHTS.indexOf(weight) >= 0 ? weight : 400;
    }
    return types;
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

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

  const presetById = (kind, id) => {
    const list = kind === "reading" ? READING : UI;
    for (const item of list) if (item.id === id) return item;
    return null;
  };

  const stackFor = (kind) => {
    const id = kind === "reading" ? state.reading : state.ui;
    const custom = kind === "reading" ? state.readingCustom : state.uiCustom;
    const fallback = kind === "reading" ? SERIF : SYSTEM;
    if (id === "custom") {
      const family = normalizeFamily(custom);
      return family ? `${family},${fallback}` : fallback;
    }
    const preset = presetById(kind, id);
    if (preset && preset.stack) return preset.stack;
    const direct = normalizeFamily(id);
    return direct ? `${direct},${fallback}` : fallback;
  };

  const typeFontStack = (typeId) => {
    const item = state.types[typeId] || DEFAULT_TYPE;
    if (!item.font) return "var(--font-reading)";
    const preset = presetById("reading", item.font);
    if (preset && item.font !== "custom") return preset.stack;
    const direct = normalizeFamily(item.font);
    return direct ? `${direct},var(--font-reading)` : "var(--font-reading)";
  };

  const resolveTheme = (mode) => {
    if (mode === "auto") return media && media.matches ? "night" : "paper";
    return mode === "night" ? "night" : "paper";
  };

  const apply = () => {
    const root = document.documentElement;
    const theme = resolveTheme(state.theme);
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "night" ? "dark" : "light";
    root.style.setProperty("--font-reading", stackFor("reading"));
    root.style.setProperty("--font-ui", stackFor("ui"));
    root.style.setProperty("--rd-scale", String(state.scale / 100));
    root.style.setProperty("--rd-leading", String(state.leading));
    root.style.setProperty("--reader-measure", `${state.measure}px`);
    for (const type of TYPES) {
      const item = state.types[type.id] || DEFAULT_TYPE;
      const px = type.base * (state.scale / 100) * (item.scale / 100);
      root.style.setProperty(`--rd-font-${type.id}`, typeFontStack(type.id));
      root.style.setProperty(`--rd-fs-${type.id}`, `${px.toFixed(2)}px`);
      root.style.setProperty(`--rd-w-${type.id}`, String(item.weight || 400));
    }
    return theme;
  };

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      return;
    }
  };

  const snapshot = () => ({
    theme: state.theme,
    reading: state.reading,
    readingCustom: state.readingCustom,
    ui: state.ui,
    uiCustom: state.uiCustom,
    scale: state.scale,
    leading: state.leading,
    measure: state.measure,
    types: clone(state.types),
  });

  const notify = (detail) => {
    document.dispatchEvent(new CustomEvent("sr:prefs", { detail: detail || snapshot() }));
  };

  const restoreDefaults = () => {
    state = {
      theme: DEFAULTS.theme,
      reading: DEFAULTS.reading,
      readingCustom: DEFAULTS.readingCustom,
      ui: DEFAULTS.ui,
      uiCustom: DEFAULTS.uiCustom,
      scale: DEFAULTS.scale,
      leading: DEFAULTS.leading,
      measure: DEFAULTS.measure,
      types: defaultTypes(),
    };
  };

  const readLegacy = () => {
    const out = {};
    try {
      const raw = localStorage.getItem(LEGACY_SETTINGS);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === "object") {
        if (typeof saved.reading === "string") out.reading = saved.reading;
        if (typeof saved.readingCustom === "string") out.readingCustom = saved.readingCustom;
        if (typeof saved.ui === "string") out.ui = saved.ui;
        if (typeof saved.uiCustom === "string") out.uiCustom = saved.uiCustom;
        if (saved.scale !== undefined) out.scale = saved.scale;
        if (saved.leading !== undefined) out.leading = saved.leading;
        if (saved.measure !== undefined) out.measure = saved.measure;
        if (saved.types) out.types = saved.types;
      }
    } catch {
      out.broken = true;
    }
    try {
      const mode = localStorage.getItem(LEGACY_THEME);
      if (THEMES.indexOf(mode) >= 0) out.theme = mode;
    } catch {
      out.broken = true;
    }
    return out;
  };

  const restore = () => {
    restoreDefaults();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      saved = null;
    }
    const source = saved && typeof saved === "object" ? saved : readLegacy();
    if (typeof source.theme === "string" && THEMES.indexOf(source.theme) >= 0) state.theme = source.theme;
    if (typeof source.reading === "string") state.reading = source.reading;
    if (typeof source.readingCustom === "string") state.readingCustom = source.readingCustom;
    if (typeof source.ui === "string") state.ui = source.ui;
    if (typeof source.uiCustom === "string") state.uiCustom = source.uiCustom;
    state.scale = Math.round(clampNumber(source.scale, 80, 200, DEFAULTS.scale) / 5) * 5;
    state.leading = clampNumber(source.leading, 1.2, 2.6, DEFAULTS.leading);
    state.measure = Math.round(clampNumber(source.measure, MEASURE_MIN, MEASURE_MAX, MEASURE_DEFAULT));
    state.types = normalizeTypes(source.types);
  };

  const set = (patch) => {
    if (patch && typeof patch === "object") {
      if (typeof patch.theme === "string" && THEMES.indexOf(patch.theme) >= 0) state.theme = patch.theme;
      if (typeof patch.reading === "string") state.reading = patch.reading;
      if (typeof patch.readingCustom === "string") state.readingCustom = patch.readingCustom;
      if (typeof patch.ui === "string") state.ui = patch.ui;
      if (typeof patch.uiCustom === "string") state.uiCustom = patch.uiCustom;
      if (patch.scale !== undefined) {
        state.scale = Math.round(clampNumber(patch.scale, 80, 200, state.scale) / 5) * 5;
      }
      if (patch.leading !== undefined) {
        state.leading = clampNumber(patch.leading, 1.2, 2.6, state.leading);
      }
      if (patch.measure !== undefined) {
        state.measure = Math.round(clampNumber(patch.measure, MEASURE_MIN, MEASURE_MAX, state.measure));
      }
      if (patch.types && typeof patch.types === "object") {
        for (const typeId of Object.keys(patch.types)) {
          if (!state.types[typeId]) continue;
          const next = patch.types[typeId] || {};
          if (typeof next.font === "string") state.types[typeId].font = next.font;
          if (next.scale !== undefined) {
            state.types[typeId].scale = Math.round(clampNumber(next.scale, 70, 150, 100) / 5) * 5;
          }
          if (next.weight !== undefined) {
            const weight = Number(next.weight);
            if (WEIGHTS.indexOf(weight) >= 0) state.types[typeId].weight = weight;
          }
        }
      }
    }
    apply();
    persist();
    notify();
    return snapshot();
  };

  const labelOf = (kind, id, custom) => {
    if (kind === "type") {
      if (!id) return { tw: "跟隨正文", cn: "跟随正文" };
      const preset = presetById("reading", id);
      if (preset) return preset.label;
      return { tw: id, cn: id };
    }
    const hit = presetById(kind, id);
    if (hit) {
      if (hit.id === "custom" && custom) return { tw: custom, cn: custom };
      return hit.label;
    }
    if (id) return { tw: id, cn: id };
    return kind === "reading" ? READING[0].label : UI[0].label;
  };

  const describe = (target, lang) => {
    let label;
    if (target.indexOf("type:") === 0) {
      const typeId = target.slice(5);
      const item = state.types[typeId] || DEFAULT_TYPE;
      label = labelOf("type", item.font);
    } else if (target === "reading") {
      label = labelOf("reading", state.reading, state.readingCustom);
    } else {
      label = labelOf("ui", state.ui, state.uiCustom);
    }
    return label[lang === "zh-cn" ? "cn" : "tw"] || label.tw;
  };

  const api = {
    KEY: KEY,
    THEMES: THEMES.slice(),
    presets: { reading: READING, ui: UI, types: TYPES, weights: WEIGHTS.slice() },
    defaults: clone(DEFAULTS),
    measureRange: { min: MEASURE_MIN, max: MEASURE_MAX, fallback: MEASURE_DEFAULT },
    get: snapshot,
    set: set,
    reset: () => {
      restoreDefaults();
      apply();
      persist();
      notify();
      return snapshot();
    },
    apply: apply,
    describe: describe,
    labelOf: labelOf,
    theme: () => resolveTheme(state.theme),
    subscribe: (fn) => {
      const handler = (event) => fn(event.detail);
      document.addEventListener("sr:prefs", handler);
      return () => document.removeEventListener("sr:prefs", handler);
    },
  };

  if (media) {
    const onSystemChange = () => {
      if (state.theme !== "auto") return;
      apply();
      notify();
    };
    if (media.addEventListener) media.addEventListener("change", onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  restore();
  apply();

  SR.define("prefs", [], () => api);
})();
