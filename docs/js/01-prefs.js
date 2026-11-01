(() => {
  "use strict";

  const SR = window.SR;

  const KEY = "legend-of-mortal.explorer.prefs.v1";

  const SERIF = '"Source Han Serif TC","Noto Serif TC","Songti TC","Songti SC","STSong",Georgia,"SimSun",serif';
  const SANS = '"PingFang TC","PingFang SC","Source Han Sans TC","Noto Sans TC","Microsoft JhengHei","Microsoft YaHei",system-ui,sans-serif';
  const KAI = `"Kaiti TC","KaiTi","STKaiti","BiauKai","DFKai-SB",${SERIF}`;
  const ROUND = '"Yuanti TC","Yuanti SC","YouYuan","PingFang TC","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = 'ui-monospace,"Sarasa Mono TC","Cascadia Mono",Consolas,"Courier New",monospace';
  const SYSTEM = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans TC",system-ui,sans-serif';

  const READING = [
    { id: "serif", label: { tw: "宋體（預設）", cn: "宋体（默认）", en: "Serif (default)" }, stack: SERIF },
    { id: "sans", label: { tw: "黑體", cn: "黑体", en: "Sans" }, stack: SANS },
    { id: "kai", label: { tw: "楷體", cn: "楷体", en: "Kai" }, stack: KAI },
    { id: "round", label: { tw: "圓體", cn: "圆体", en: "Rounded" }, stack: ROUND },
    { id: "mono", label: { tw: "等寬", cn: "等宽", en: "Monospace" }, stack: MONO },
    { id: "custom", label: { tw: "自訂字體…", cn: "自定义字体…", en: "Custom font…" }, stack: SERIF },
  ];

  const UI = [
    { id: "system", label: { tw: "系統預設", cn: "系统默认", en: "System default" }, stack: SYSTEM },
    { id: "sans", label: { tw: "黑體", cn: "黑体", en: "Sans" }, stack: SANS },
    { id: "round", label: { tw: "圓體", cn: "圆体", en: "Rounded" }, stack: ROUND },
    { id: "serif", label: { tw: "宋體", cn: "宋体", en: "Serif" }, stack: SERIF },
    { id: "custom", label: { tw: "自訂字體…", cn: "自定义字体…", en: "Custom font…" }, stack: SYSTEM },
  ];

  const FOLLOW_READING = "";
  const FOLLOW_UI = "@ui";

  const GROUPS = [
    { id: "prose", label: { tw: "正文", cn: "正文", en: "Prose" } },
    { id: "choice", label: { tw: "選項", cn: "选项", en: "Choice" } },
    { id: "mark", label: { tw: "標記", cn: "标记", en: "Marks" } },
    { id: "heading", label: { tw: "標題", cn: "标题", en: "Headings" } },
    { id: "ui", label: { tw: "介面", cn: "界面", en: "Interface" } },
    { id: "status", label: { tw: "狀態", cn: "状态", en: "Status" } },
  ];

  const TYPES = [
    { id: "dialog", group: "prose", label: { tw: "對白", cn: "对白", en: "Dialogue" }, font: FOLLOW_READING, weight: 400 },
    { id: "speaker", group: "prose", label: { tw: "說話人", cn: "说话人", en: "Speaker" }, font: "kai", weight: 500, scale: 150 },
    { id: "narration", group: "prose", label: { tw: "旁白", cn: "旁白", en: "Narration" }, font: FOLLOW_READING, weight: 400, scale: 150 },
    { id: "think", group: "prose", label: { tw: "心聲", cn: "心声", en: "Inner voice" }, font: FOLLOW_READING, weight: 400 },
    { id: "lore", group: "prose", label: { tw: "劇情點", cn: "剧情点", en: "Lore" }, font: "kai", weight: 400 },
    { id: "snippet", group: "prose", label: { tw: "摘要", cn: "摘要", en: "Snippet" }, font: "serif", weight: 400 },
    { id: "option", group: "choice", label: { tw: "選項", cn: "选项", en: "Option" }, font: "sans", weight: 400 },
    { id: "index", group: "choice", label: { tw: "選項序號", cn: "选项序号", en: "Option index" }, font: "mono", weight: 400 },
    { id: "option-cond", group: "choice", label: { tw: "選項條件", cn: "选项条件", en: "Option condition" }, font: "sans", weight: 400 },
    { id: "branch-cond", group: "choice", label: { tw: "分支條件", cn: "分支条件", en: "Branch condition" }, font: "sans", weight: 400 },
    { id: "label", group: "mark", label: { tw: "標籤", cn: "标签", en: "Label" }, font: "sans", weight: 400 },
    { id: "badge", group: "mark", label: { tw: "徽章", cn: "徽章", en: "Badge" }, font: FOLLOW_UI, weight: 400 },
    { id: "crumb", group: "mark", label: { tw: "章節路徑", cn: "章节路径", en: "Breadcrumb" }, font: "mono", weight: 400 },
    { id: "meta", group: "mark", label: { tw: "時間與計數", cn: "时间与计数", en: "Time & counts" }, font: "mono", weight: 400 },
    { id: "title", group: "heading", label: { tw: "劇本標題", cn: "剧本标题", en: "Story title" }, font: "serif", weight: 600 },
    { id: "heading", group: "heading", label: { tw: "區塊標題", cn: "区块标题", en: "Section heading" }, font: "serif", weight: 600 },
    { id: "ui", group: "ui", label: { tw: "介面文字", cn: "界面文字", en: "Interface text" }, font: FOLLOW_UI, weight: 400 },
    { id: "caption", group: "ui", label: { tw: "小標籤與說明", cn: "小标签与说明", en: "Caption" }, font: "mono", weight: 400 },
    { id: "id", group: "ui", label: { tw: "編號與代碼", cn: "编号与代码", en: "Identifier" }, font: "mono", weight: 400 },
    { id: "status", group: "status", label: { tw: "狀態訊息", cn: "状态消息", en: "Status message" }, font: FOLLOW_UI, weight: 400 },
    { id: "loading", group: "status", label: { tw: "載入提示", cn: "加载提示", en: "Loading hint" }, font: "mono", weight: 400 },
    { id: "empty", group: "status", label: { tw: "空狀態", cn: "空状态", en: "Empty state" }, font: FOLLOW_UI, weight: 400 },
  ];

  const WEIGHTS = [400, 500, 600];

  const DEFAULT_TYPE = { font: FOLLOW_READING, scale: 100, weight: 400, leading: 100 };

  const MEASURE_MIN = 520;
  const MEASURE_MAX = 1400;
  const MEASURE_DEFAULT = 860;

  const DEFAULTS = {
    reading: "serif",
    readingCustom: "",
    ui: "serif",
    uiCustom: "",
    uiV2: true,
    scale: 130,
    leading: 1.85,
    measure: MEASURE_DEFAULT,
    types: null,
  };

  let state = null;

  const clampNumber = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  };

  const defaultTypes = () => {
    const out = {};
    for (const type of TYPES) {
      out[type.id] = {
        font: typeof type.font === "string" ? type.font : FOLLOW_READING,
        scale: type.scale || DEFAULT_TYPE.scale,
        weight: type.weight || DEFAULT_TYPE.weight,
        leading: type.leading || DEFAULT_TYPE.leading,
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
      types[type.id].font = typeof item.font === "string" ? item.font : FOLLOW_READING;
      types[type.id].scale = Math.round(clampNumber(item.scale, 70, 150, 100) / 5) * 5;
      types[type.id].leading = Math.round(clampNumber(item.leading, 80, 150, 100) / 5) * 5;
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

  const typeById = (typeId) => {
    for (const type of TYPES) if (type.id === typeId) return type;
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
    if (item.font === FOLLOW_UI) return "var(--font-ui)";
    const preset = presetById("reading", item.font);
    if (preset && item.font !== "custom") return preset.stack;
    const direct = normalizeFamily(item.font);
    return direct ? `${direct},var(--font-reading)` : "var(--font-reading)";
  };

  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--font-reading", stackFor("reading"));
    root.style.setProperty("--font-ui", stackFor("ui"));
    root.style.setProperty("--rd-scale", String(state.scale / 100));
    root.style.setProperty("--rd-leading", String(state.leading));
    root.style.setProperty("--reader-measure", `${state.measure}px`);
    for (const type of TYPES) {
      const item = state.types[type.id] || DEFAULT_TYPE;
      root.style.setProperty(`--rd-ff-${type.id}`, typeFontStack(type.id));
      root.style.setProperty(`--rd-ts-${type.id}`, String((item.scale || 100) / 100));
      root.style.setProperty(`--rd-fw-${type.id}`, String(item.weight || 400));
      root.style.setProperty(`--rd-lh-${type.id}`, String((item.leading || 100) / 100));
    }
  };

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      return;
    }
  };

  const snapshot = () => ({
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
      reading: DEFAULTS.reading,
      readingCustom: DEFAULTS.readingCustom,
      ui: DEFAULTS.ui,
      uiCustom: DEFAULTS.uiCustom,
      uiV2: true,
      scale: DEFAULTS.scale,
      leading: DEFAULTS.leading,
      measure: DEFAULTS.measure,
      types: defaultTypes(),
    };
  };

  const restore = () => {
    restoreDefaults();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      saved = null;
    }
    const source = saved && typeof saved === "object" ? saved : {};
    if (typeof source.reading === "string") state.reading = source.reading;
    if (typeof source.readingCustom === "string") state.readingCustom = source.readingCustom;
    if (typeof source.ui === "string") state.ui = source.ui;
    if (typeof source.uiCustom === "string") state.uiCustom = source.uiCustom;
    if (source.uiV2 !== true && state.ui === "system") state.ui = "serif";
    state.uiV2 = true;
    state.scale = Math.round(clampNumber(source.scale, 80, 200, DEFAULTS.scale) / 5) * 5;
    state.leading = clampNumber(source.leading, 1.2, 2.6, DEFAULTS.leading);
    state.measure = Math.round(clampNumber(source.measure, MEASURE_MIN, MEASURE_MAX, MEASURE_DEFAULT));
    state.types = normalizeTypes(source.types);
  };

  const set = (patch) => {
    if (patch && typeof patch === "object") {
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
          if (next.leading !== undefined) {
            state.types[typeId].leading = Math.round(clampNumber(next.leading, 80, 150, 100) / 5) * 5;
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
      if (!id) return { tw: "跟隨正文", cn: "跟随正文", en: "Follow body font" };
      if (id === FOLLOW_UI) return { tw: "跟隨介面", cn: "跟随界面", en: "Follow interface font" };
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

  const LABEL_KEYS = { "zh-cn": "cn", en: "en" };

  const pickLabel = (label, lang) => label[LABEL_KEYS[lang] || "tw"] || label.tw || "";

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
    return pickLabel(label, lang);
  };

  const api = {
    KEY: KEY,
    presets: { reading: READING, ui: UI, types: TYPES, groups: GROUPS, weights: WEIGHTS.slice() },
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
    pickLabel: pickLabel,
    typeById: typeById,
    subscribe: (fn) => {
      const handler = (event) => fn(event.detail);
      document.addEventListener("sr:prefs", handler);
      return () => document.removeEventListener("sr:prefs", handler);
    },
  };

  restore();
  apply();

  SR.define("prefs", [], () => api);
})();
