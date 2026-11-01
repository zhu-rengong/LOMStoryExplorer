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
    { id: "serif", label: { tw: "宋體", cn: "宋体", en: "Serif" }, stack: SERIF },
    { id: "sans", label: { tw: "黑體", cn: "黑体", en: "Sans" }, stack: SANS },
    { id: "kai", label: { tw: "楷體", cn: "楷体", en: "Kai" }, stack: KAI },
    { id: "round", label: { tw: "圓體", cn: "圆体", en: "Rounded" }, stack: ROUND },
    { id: "mono", label: { tw: "等寬", cn: "等宽", en: "Monospace" }, stack: MONO },
  ];

  const LABELS = {
    followBase: { tw: "跟隨基準", cn: "跟随基准", en: "Follow base" },
    followGroup: { tw: "跟隨大類", cn: "跟随大类", en: "Follow group" },
    groupAll: { tw: "整組", cn: "整组", en: "Whole group" },
    weightInherit: { tw: "跟隨", cn: "跟随", en: "Inherit" },
    customFont: { tw: "自訂字體…", cn: "自定义字体…", en: "Custom font…" },
    systemFont: { tw: "系統字體", cn: "系统字体", en: "System font" },
  };

  const GROUPS = [
    { id: "prose", label: { tw: "正文", cn: "正文", en: "Prose" }, font: FOLLOW_BASE },
    { id: "choice", label: { tw: "選項與條件", cn: "选项与条件", en: "Choice" }, font: "sans" },
    { id: "mark", label: { tw: "標記", cn: "标记", en: "Marks" }, font: FOLLOW_BASE },
    { id: "heading", label: { tw: "標題與導航", cn: "标题与导航", en: "Headings" }, font: FOLLOW_BASE },
    { id: "ui", label: { tw: "介面", cn: "界面", en: "Interface" }, font: FOLLOW_BASE },
    { id: "status", label: { tw: "狀態", cn: "状态", en: "Status" }, font: FOLLOW_BASE },
  ];

  const TYPES = [
    { id: "dialog", group: "prose", label: { tw: "對白", cn: "对白", en: "Dialogue" }, font: FOLLOW_GROUP, weight: null },
    { id: "speaker", group: "prose", label: { tw: "說話人", cn: "说话人", en: "Speaker" }, font: "kai", weight: 500 },
    { id: "narration", group: "prose", label: { tw: "旁白", cn: "旁白", en: "Narration" }, font: FOLLOW_GROUP, weight: null },
    { id: "think", group: "prose", label: { tw: "心聲", cn: "心声", en: "Inner voice" }, font: FOLLOW_GROUP, weight: null },
    { id: "lore", group: "prose", label: { tw: "劇情點", cn: "剧情点", en: "Lore" }, font: "kai", weight: null },
    { id: "snippet", group: "prose", label: { tw: "摘要", cn: "摘要", en: "Snippet" }, font: FOLLOW_GROUP, weight: null },

    { id: "option", group: "choice", label: { tw: "選項", cn: "选项", en: "Option" }, font: FOLLOW_GROUP, weight: null },
    { id: "index", group: "choice", label: { tw: "選項序號", cn: "选项序号", en: "Option index" }, font: "mono", weight: null, noLeading: true },
    { id: "option-cond", group: "choice", label: { tw: "選項條件", cn: "选项条件", en: "Option condition" }, font: FOLLOW_GROUP, weight: null },
    { id: "branch-cond", group: "choice", label: { tw: "分支條件", cn: "分支条件", en: "Branch condition" }, font: FOLLOW_GROUP, weight: null },

    { id: "label", group: "mark", label: { tw: "標籤", cn: "标签", en: "Label" }, font: "sans", weight: null },
    { id: "jump", group: "mark", label: { tw: "跳轉按鈕", cn: "跳转按钮", en: "Jump button" }, font: FOLLOW_GROUP, weight: null, noLeading: true },
    { id: "badge", group: "mark", label: { tw: "徽章", cn: "徽章", en: "Badge" }, font: FOLLOW_GROUP, weight: null, noLeading: true },

    { id: "title", group: "heading", label: { tw: "劇本標題", cn: "剧本标题", en: "Story title" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "panel", group: "heading", label: { tw: "面板標題", cn: "面板标题", en: "Panel title" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "lookup", group: "heading", label: { tw: "浮層標題", cn: "浮层标题", en: "Overlay title" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "brand", group: "heading", label: { tw: "品牌標題", cn: "品牌标题", en: "Brand title" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "seal", group: "heading", label: { tw: "印章字", cn: "印章字", en: "Seal glyph" }, font: FOLLOW_GROUP, weight: 600, noLeading: true },
    { id: "rail", group: "heading", label: { tw: "側欄標題", cn: "侧栏标题", en: "Rail title" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "stat", group: "heading", label: { tw: "統計數值", cn: "统计数值", en: "Statistic value" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "empty-title", group: "heading", label: { tw: "空態標題", cn: "空态标题", en: "Empty title" }, font: FOLLOW_GROUP, weight: 600 },
    { id: "crumb", group: "heading", label: { tw: "章節路徑", cn: "章节路径", en: "Breadcrumb" }, font: "mono", weight: null },
    { id: "meta", group: "heading", label: { tw: "時間與計數", cn: "时间与计数", en: "Time & counts" }, font: "mono", weight: null },

    { id: "ui", group: "ui", label: { tw: "介面文字", cn: "界面文字", en: "Interface text" }, font: FOLLOW_GROUP, weight: null },
    { id: "ui-compact", group: "ui", label: { tw: "介面文字（緊湊）", cn: "界面文字（紧凑）", en: "Interface text (compact)" }, font: FOLLOW_GROUP, weight: null },
    { id: "ui-micro", group: "ui", label: { tw: "介面文字（微字）", cn: "界面文字（微字）", en: "Interface text (micro)" }, font: FOLLOW_GROUP, weight: null },
    { id: "caption", group: "ui", label: { tw: "小標籤與說明", cn: "小标签与说明", en: "Caption" }, font: "mono", weight: null },
    { id: "id", group: "ui", label: { tw: "編號與代碼", cn: "编号与代码", en: "Identifier" }, font: "mono", weight: null },

    { id: "status", group: "status", label: { tw: "狀態訊息", cn: "状态消息", en: "Status message" }, font: FOLLOW_GROUP, weight: null },
    { id: "loading", group: "status", label: { tw: "載入提示", cn: "加载提示", en: "Loading hint" }, font: "mono", weight: null },
    { id: "empty", group: "status", label: { tw: "空狀態", cn: "空状态", en: "Empty state" }, font: FOLLOW_GROUP, weight: null },
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
        font: group.font,
        scale: GROUP_DEFAULT.scale,
        leading: GROUP_DEFAULT.leading,
        weight: GROUP_DEFAULT.weight,
      };
    }
    return out;
  };

  const defaultTypes = () => {
    const out = {};
    for (const type of TYPES) {
      out[type.id] = {
        font: type.font,
        scale: TYPE_DEFAULT.scale,
        leading: TYPE_DEFAULT.leading,
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

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      return;
    }
  };

  const snapshot = () => clone(state);

  const notify = () => {
    document.dispatchEvent(new CustomEvent("sr:prefs", { detail: snapshot() }));
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
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      saved = null;
    }
    let source = saved && typeof saved === "object" ? saved : null;
    if (!source) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
        source = legacy && typeof legacy === "object" ? { measure: legacy.measure } : null;
      } catch {
        source = null;
      }
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
          if (next.weight !== undefined) current.weight = clampWeight(next.weight, current.weight);
        }
      }
    }
    apply();
    persist();
    notify();
    return snapshot();
  };

  const LABEL_KEYS = { "zh-cn": "cn", en: "en" };

  const pickLabel = (label, lang) => {
    if (!label) return "";
    return label[LABEL_KEYS[lang] || "tw"] || label.tw || "";
  };

  const fontLabel = (value) => {
    if (!value || value === FOLLOW_BASE) return LABELS.followBase;
    if (value === FOLLOW_GROUP) return LABELS.followGroup;
    const preset = fontById(value);
    if (preset) return preset.label;
    return { tw: value, cn: value, en: value };
  };

  const labelOf = (kind, id) => {
    if (kind === "group") {
      const group = groupById(id);
      return group ? group.label : { tw: id, cn: id, en: id };
    }
    const type = typeById(id);
    return type ? type.label : { tw: id, cn: id, en: id };
  };

  const parseTarget = (target) => {
    const value = String(target || "");
    if (value.indexOf("group:") === 0) return { scope: "group", id: value.slice(6) };
    if (value.indexOf("type:") === 0) return { scope: "type", id: value.slice(5) };
    return { scope: "type", id: value };
  };

  const describe = (target, lang) => {
    const parsed = parseTarget(target);
    if (parsed.scope === "group") {
      const group = state.groups[parsed.id];
      return pickLabel(fontLabel(group ? group.font : FOLLOW_BASE), lang);
    }
    const item = state.types[parsed.id];
    return pickLabel(fontLabel(item ? item.font : FOLLOW_GROUP), lang);
  };

  const api = {
    KEY: KEY,
    base: {
      font: BASE_FONT,
      size: BASE_SIZE,
      leading: BASE_LEADING,
      weight: BASE_WEIGHT,
    },
    labels: LABELS,
    presets: {
      fonts: FONTS,
      groups: GROUPS,
      types: TYPES,
      weights: WEIGHTS.slice(),
    },
    measureRange: { min: MEASURE_MIN, max: MEASURE_MAX, fallback: MEASURE_DEFAULT },
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
    apply: apply,
    describe: describe,
    labelOf: labelOf,
    pickLabel: pickLabel,
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
