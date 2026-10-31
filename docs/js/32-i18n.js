(() => {
  "use strict";

  const SR = window.SR;

  const LIB = window.i18next || null;

  const DICT = window.SR_I18N || { "zh-tw": {} };

  const META = window.SR_I18N_META || {};

  const EXTRA = {
    "zh-tw": {
      errorTitle: "資料載入失敗",
      errorMissing: "找不到 data/graph.js，請先執行 build.py 產生資料。",
      errorSchema: "資料版本不符，請重新執行 build.py。",
      errorReload: "重新載入",
      errorScript: "頁面腳本載入失敗：{name}",
      filterSyntax: "第 {column} 欄：{message}",
    },
    "zh-cn": {
      errorTitle: "数据加载失败",
      errorMissing: "找不到 data/graph.js，请先运行 build.py 生成数据。",
      errorSchema: "数据版本不符，请重新运行 build.py。",
      errorReload: "重新加载",
      errorScript: "页面脚本加载失败：{name}",
      filterSyntax: "第 {column} 栏：{message}",
    },
    "en": {
      errorTitle: "Failed to load data",
      errorMissing: "data/graph.js is missing. Run build.py to generate the data first.",
      errorSchema: "The data version does not match. Run build.py again.",
      errorReload: "Reload",
      errorScript: "Failed to load a page script: {name}",
      filterSyntax: "Column {column}: {message}",
    },
  };

  const FALLBACK = "zh-tw";

  const PLACEHOLDER = /\{(\w+)\}/g;

  for (const lang of Object.keys(EXTRA)) {
    if (!DICT[lang]) DICT[lang] = {};
    Object.assign(DICT[lang], EXTRA[lang]);
  }

  const LANGS = Object.keys(DICT);

  const ORDER = (() => {
    const out = [];
    for (const id of Object.keys(META)) if (LANGS.indexOf(id) >= 0) out.push(id);
    for (const id of LANGS) if (out.indexOf(id) < 0) out.push(id);
    return out;
  })();

  const format = (text, vars) => text.replace(PLACEHOLDER, (whole, name) => (
    vars[name] === undefined ? whole : String(vars[name])
  ));

  const ENGINE = (() => {
    if (!LIB || typeof LIB.init !== "function") return null;
    const resources = {};
    for (const lang of LANGS) resources[lang] = { translation: DICT[lang] };
    try {
      LIB.init({
        resources,
        lng: FALLBACK,
        fallbackLng: FALLBACK,
        supportedLngs: LANGS,
        lowerCaseLng: true,
        initAsync: false,
        keySeparator: false,
        nsSeparator: false,
        returnNull: false,
        returnEmptyString: false,
        interpolation: { prefix: "{", suffix: "}", escapeValue: false },
      });
    } catch {
      return null;
    }
    return LIB.isInitialized ? LIB : null;
  })();

  const fixed = new Map();

  const translateOf = (lang) => {
    if (!ENGINE) return null;
    let fn = fixed.get(lang);
    if (!fn) {
      fn = ENGINE.getFixedT(lang, "translation");
      fixed.set(lang, fn);
    }
    return fn;
  };

  const rawOf = (lang, key) => {
    const table = DICT[lang] || {};
    if (table[key] !== undefined) return table[key];
    const base = DICT[FALLBACK] || {};
    return base[key];
  };

  SR.define("i18n", ["store", "graph", "lang"], ({ store, graph, lang }) => {
    const state = store.state;

    const t = (key, vars) => {
      const translate = translateOf(state.lang);
      if (translate) return translate(key, vars);
      const text = rawOf(state.lang, key);
      if (text === undefined) return key;
      return vars ? format(text, vars) : text;
    };

    const has = (key) => {
      if (ENGINE) return ENGINE.exists(key, { lng: state.lang });
      return rawOf(state.lang, key) !== undefined;
    };

    const languages = () => ORDER
      .filter((id) => DICT[id] && Object.keys(DICT[id]).length)
      .map((id) => ({
        id,
        native: (META[id] && META[id].native) || id,
        label: (META[id] && META[id].label) || id,
        html: lang.htmlOf(id),
      }));

    const syncLanguage = () => {
      if (!ENGINE || ENGINE.language === state.lang) return;
      ENGINE.changeLanguage(state.lang);
    };

    const typeLabel = (typeId) => t({
      dialog: "typeDialog",
      speaker: "typeSpeaker",
      narration: "typeNarration",
      think: "typeThink",
      option: "typeOption",
      "branch-cond": "typeBranchCond",
      "option-cond": "typeOptionCond",
      label: "typeLabel",
      lore: "typeLore",
    }[typeId] || "typeDialog");

    const chapterTitle = (chapter) => {
      if (!chapter) return t("chOther");
      const id = chapter.id || "";
      if (id === "ch0") return t("chPrologue");
      let match = /^ch(\d+)$/.exec(id);
      if (match) return t("chN", { n: match[1] });
      match = /^act(\d+)$/.exec(id);
      if (match) return t("actN", { n: match[1] });
      match = /^s(\d+)$/.exec(id);
      if (match) return t("eventN", { n: match[1] });
      const fixedIds = {
        scene: "chScene", work: "chWork", travel: "chTravel",
        free: "chFree", section: "chSection", misc: "chMisc", other: "chOther",
      };
      if (fixedIds[id]) return t(fixedIds[id]);
      return chapter.title || t("chOther");
    };

    const dateOf = (rounds) => {
      const index = Math.max(0, Math.floor(rounds) - 1);
      const year = Math.floor(index / 36) + 1;
      const rest = index % 36;
      return { y: year, m: Math.floor(rest / 3) + 1, s: (rest % 3) + 1 };
    };

    const stageNames = () => String(t("timeStages")).split(",");

    const timeText = (rounds) => {
      const date = dateOf(rounds);
      return t("timeFull", { y: date.y, m: date.m, s: stageNames()[date.s - 1] || "" });
    };

    const apply = (root) => {
      const scope = root || document;
      syncLanguage();
      document.documentElement.lang = lang.htmlOf(state.lang);
      document.title = t("appTitle");
      for (const node of scope.querySelectorAll("[data-i18n]")) {
        const key = node.getAttribute("data-i18n");
        if (has(key)) node.textContent = t(key);
      }
      for (const node of scope.querySelectorAll("[data-i18n-title]")) {
        const key = node.getAttribute("data-i18n-title");
        if (has(key)) node.title = t(key);
      }
      for (const node of scope.querySelectorAll("[data-i18n-placeholder]")) {
        const key = node.getAttribute("data-i18n-placeholder");
        if (has(key)) node.placeholder = t(key);
      }
      for (const node of scope.querySelectorAll("[data-i18n-label]")) {
        const key = node.getAttribute("data-i18n-label");
        if (has(key)) node.setAttribute("aria-label", t(key));
      }
      const button = document.getElementById("langBtn");
      if (button) button.setAttribute("aria-label", t("langBtnTitle"));
      const menu = document.getElementById("langMenu");
      if (menu) menu.setAttribute("aria-label", t("moreLang"));

      const meta = graph.chapters.length;
      const counts = graph.nodes.length;
      const edges = graph.edges.length;
      let text = t("meta", {
        nodes: counts,
        edges: edges,
        chapters: meta,
        date: graph.nodes.length ? window.SR_DATA.meta.generated : "",
      });
      const game = window.SR_DATA.meta.game || {};
      const parts = [];
      if (game.version) parts.push(t("gameVersion", { ver: game.version }));
      if (game.build) parts.push(t("gameBuild", { build: game.build }));
      if (parts.length) text += ` · ${parts.join(" · ")}`;
      const line = document.getElementById("metaLine");
      if (line) {
        line.textContent = text;
        line.title = text;
      }
    };

    return {
      apply,
      chapterTitle,
      dateOf,
      has,
      languages,
      stageNames,
      syncLanguage,
      t,
      timeText,
      typeLabel,
    };
  });
})();
