(() => {
  "use strict";

  const KEY = "legend-of-mortal.story-reader.settings.v1";

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
    { id: "cond", label: { tw: "條件", cn: "条件" }, base: 12 },
    { id: "label", label: { tw: "標籤", cn: "标签" }, base: 11.5 },
    { id: "lore", label: { tw: "劇情點", cn: "剧情点" }, base: 15 },
  ];

  const WEIGHTS = [400, 500, 600];

  const DEFAULT_TYPE = { font: "", scale: 100, weight: 400 };

  const TYPE_OVERRIDES = {
    speaker: { font: "kai", scale: 150 },
    narration: { scale: 150 },
    option: { font: "sans" },
    cond: { font: "sans" },
    label: { font: "sans" },
    lore: { font: "kai" },
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

  const DEFAULTS = {
    reading: "serif",
    readingCustom: "",
    ui: "system",
    uiCustom: "",
    scale: 130,
    leading: 1.85,
    types: defaultTypes(),
  };

  let state = {};

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  const restoreDefaults = () => {
    state = {
      reading: DEFAULTS.reading,
      readingCustom: DEFAULTS.readingCustom,
      ui: DEFAULTS.ui,
      uiCustom: DEFAULTS.uiCustom,
      scale: DEFAULTS.scale,
      leading: DEFAULTS.leading,
      types: defaultTypes(),
    };
  };

  const clampNumber = (value, min, max, fallback) => {
    const num = Number(value);
    if (!isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };

  const normalizeTypes = (raw) => {
    const types = defaultTypes();
    if (!raw || typeof raw !== "object") return types;
    for (const type of TYPES) {
      const item = raw[type.id];
      if (!item || typeof item !== "object") continue;
      types[type.id].font = typeof item.font === "string" ? item.font : "";
      types[type.id].scale = Math.round(clampNumber(item.scale, 70, 150, 100) / 5) * 5;
      const weight = Number(item.weight);
      types[type.id].weight = WEIGHTS.indexOf(weight) >= 0 ? weight : 400;
    }
    return types;
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
    if (direct) return `${direct},${fallback}`;
    return fallback;
  };

  const typeFontStack = (typeId) => {
    const item = state.types[typeId] || DEFAULT_TYPE;
    const font = item.font;
    if (!font) return "var(--font-reading)";
    const preset = presetById("reading", font);
    if (preset && font !== "custom") return preset.stack;
    const direct = normalizeFamily(font);
    if (direct) return `${direct},var(--font-reading)`;
    return "var(--font-reading)";
  };

  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--font-reading", stackFor("reading"));
    root.style.setProperty("--font-ui", stackFor("ui"));
    root.style.setProperty("--rd-scale", String(state.scale / 100));
    root.style.setProperty("--rd-leading", String(state.leading));

    for (const type of TYPES) {
      const item = state.types[type.id] || DEFAULT_TYPE;
      const px = type.base * (state.scale / 100) * (item.scale / 100);
      root.style.setProperty(`--rd-font-${type.id}`, typeFontStack(type.id));
      root.style.setProperty(`--rd-fs-${type.id}`, `${px.toFixed(2)}px`);
      root.style.setProperty(`--rd-w-${type.id}`, String(item.weight || 400));
    }
  };

  const snapshot = () => ({
    reading: state.reading,
    readingCustom: state.readingCustom,
    ui: state.ui,
    uiCustom: state.uiCustom,
    scale: state.scale,
    leading: state.leading,
    types: clone(state.types),
  });

  const restore = () => {
    restoreDefaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      if (typeof saved.reading === "string") state.reading = saved.reading;
      if (typeof saved.readingCustom === "string") state.readingCustom = saved.readingCustom;
      if (typeof saved.ui === "string") state.ui = saved.ui;
      if (typeof saved.uiCustom === "string") state.uiCustom = saved.uiCustom;
      state.scale = Math.round(clampNumber(saved.scale, 80, 200, 100) / 5) * 5;
      state.leading = clampNumber(saved.leading, 1.2, 2.6, 1.85);
      state.types = normalizeTypes(saved.types);
    } catch {
      return;
    }
  };

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      return;
    }
  };

  const FONT_CANDIDATES = [...new Set([
    "Microsoft YaHei", "Microsoft YaHei UI", "Microsoft JhengHei", "Microsoft JhengHei UI",
    "SimSun", "SimSun-ExtB", "NSimSun", "SimHei", "KaiTi", "FangSong", "DengXian",
    "YouYuan", "LiSu", "MingLiU", "MingLiU_HKSCS", "PMingLiU", "DFKai-SB", "BiauKai",
    "STKaiti", "STSong", "STXihei", "STZhongsong", "STFangsong", "STHupo", "STLiti",
    "STXingkai", "STXinwei", "STCaiyun", "Source Han Sans TC", "Source Han Sans SC",
    "Source Han Serif TC", "Source Han Serif SC", "Noto Sans TC", "Noto Sans SC",
    "Noto Serif TC", "Noto Serif SC", "Noto Sans CJK TC", "Noto Serif CJK TC",
    "LXGW WenKai", "LXGW WenKai TC", "Sarasa Mono TC", "Sarasa Gothic TC",
    "PingFang TC", "PingFang SC", "Songti TC", "Songti SC", "Kaiti TC", "Kaiti SC",
    "Yuanti TC", "Yuanti SC", "Heiti TC", "Heiti SC", "Hiragino Sans GB",
    "Lantinghei TC", "Lantinghei SC", "HanHei TC", "HanHei SC",
    "Yu Gothic", "Yu Mincho", "Meiryo", "MS Gothic", "MS Mincho",
    "Hiragino Kaku Gothic ProN", "Hiragino Mincho ProN", "Malgun Gothic",
    "Apple SD Gothic Neo", "NanumGothic",
    "Segoe UI", "Segoe UI Variable", "Segoe UI Variable Display", "Segoe UI Variable Text",
    "Arial", "Arial Black", "Tahoma", "Verdana", "Georgia", "Times New Roman",
    "Cambria", "Calibri", "Trebuchet MS", "Palatino Linotype", "Book Antiqua",
    "Franklin Gothic Medium", "Century Gothic", "Lucida Console", "Lucida Sans Unicode",
    "Helvetica Neue", "Helvetica", "Optima", "Baskerville", "Futura", "Gill Sans",
    "Rockwell", "Consolas", "Cascadia Mono", "Cascadia Code", "Courier New",
    "SF Mono", "Menlo", "Monaco", "JetBrains Mono", "Fira Code", "Hack",
    "IBM Plex Mono", "Roboto Mono", "Source Code Pro", "Ubuntu Mono",
    "DejaVu Sans Mono", "Liberation Mono", "Noto Sans Mono", "Inconsolata",
  ])];

  const FONT_PROBE_TEXT = "mmmmmmmmmmlli WWW 中文測試";

  const FONT_BASELINES = ["monospace", "serif", "sans-serif"];

  const FONT_NOISE = /Wingdings|Webdings|Marlett|Symbol|Segoe MDL2|Segoe Fluent|Segoe UI Emoji|Segoe UI Symbol|Bookshelf Symbol|MS Reference|MT Extra|MS Outlook/i;

  const FONT_CJK_HINT = /[\u3400-\u9fff]|YaHei|JhengHei|SimSun|SimHei|KaiTi|FangSong|DengXian|YouYuan|LiSu|MingLiU|Songti|Yuanti|Heiti|PingFang|Hiragino|Noto|Source Han|Sarasa|LXGW|STKaiti|STSong|STXihei|STZhongsong|DFKai|BiauKai|Yu Gothic|Yu Mincho|Meiryo|MS Gothic|MS Mincho|Malgun|Nanum/i;

  let detectedFamilies = null;

  let familiesPending = null;

  const measureWidth = (ctx, font) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(FONT_PROBE_TEXT).width;
  };

  const probeFamilies = () => {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return null;
      const baselines = FONT_BASELINES.map((base) => measureWidth(ctx, base));
      const found = [];
      for (const family of FONT_CANDIDATES) {
        const quoted = `"${family.replace(/"/g, "")}"`;
        let available = false;
        for (let i = 0; i < FONT_BASELINES.length && !available; i++) {
          if (measureWidth(ctx, `${quoted}, ${FONT_BASELINES[i]}`) !== baselines[i]) available = true;
        }
        if (available) found.push(family);
      }
      return found.length ? found : null;
    } catch {
      return null;
    }
  };

  const orderFamilies = (names) => {
    const seen = new Set();
    const unique = [];
    for (const name of names) {
      const clean = String(name || "").trim();
      if (!clean || clean.startsWith("@") || FONT_NOISE.test(clean)) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(clean);
    }
    const cjk = unique.filter((name) => FONT_CJK_HINT.test(name)).sort((a, b) => a.localeCompare(b));
    const rest = unique.filter((name) => !FONT_CJK_HINT.test(name)).sort((a, b) => a.localeCompare(b));
    return cjk.concat(rest);
  };

  const enumerateFamilies = async () => {
    if (typeof window.queryLocalFonts !== "function") return null;
    try {
      const fonts = await window.queryLocalFonts();
      const list = orderFamilies(fonts.map((font) => font.family));
      return list.length ? list : null;
    } catch {
      return null;
    }
  };

  const ensureFamilies = () => {
    if (detectedFamilies) return Promise.resolve(detectedFamilies);
    if (familiesPending) return familiesPending;
    familiesPending = (async () => {
      const found = (await enumerateFamilies()) || probeFamilies();
      if (found && found.length) {
        detectedFamilies = found;
        window.dispatchEvent(new CustomEvent("sr:fonts", { detail: { families: found } }));
      }
      familiesPending = null;
      return detectedFamilies || FONT_CANDIDATES;
    })();
    return familiesPending;
  };

  const families = () => detectedFamilies || FONT_CANDIDATES;

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

  window.StorySettings = {
    presets: { reading: READING, ui: UI, types: TYPES, weights: WEIGHTS },
    defaults: clone(DEFAULTS),
    get: snapshot,
    ensureFamilies: ensureFamilies,
    families: families,
    labelOf: labelOf,
    set: (patch) => {
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
      return snapshot();
    },
    apply: apply,
    reset: () => {
      restoreDefaults();
      apply();
      persist();
      return snapshot();
    },
    describe: (target) => {
      const lang = (document.documentElement.lang || "").toLowerCase().indexOf("cn") >= 0 ? "cn" : "tw";
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
      return label[lang] || label.tw;
    },
  };

  restore();
  apply();
})();
