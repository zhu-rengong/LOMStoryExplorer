(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const G = SR.core.G;
  const chapters = SR.data.chapters;
  const renderNavMenu = SR.fwd("actions", "renderNavMenu");
  const state = SR.core.state;
  const syncSettingsUi = SR.fwd("settings", "syncSettingsUi");
  const updateRailCount = SR.fwd("rail", "updateRailCount");

  const I18N = window.__SR_I18N__ || { "zh-tw": {} };

  const dict = () => I18N[state.lang] || I18N["zh-tw"];

  const t = (key, vars) => {
    const table = dict();
    let text = table[key];
    if (text === undefined) text = I18N["zh-tw"][key];
    if (text === undefined) return key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] === undefined ? whole : String(vars[name])));
  };

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
    const fixed = {
      scene: "chScene", work: "chWork", travel: "chTravel",
      free: "chFree", section: "chSection", misc: "chMisc", other: "chOther",
    };
    if (fixed[id]) return t(fixed[id]);
    return chapter.title || t("chOther");
  };

  const TYPE_LABEL_KEY = {
    dialog: "typeDialog",
    speaker: "typeSpeaker",
    narration: "typeNarration",
    think: "typeThink",
    option: "typeOption",
    cond: "typeCond",
    label: "typeLabel",
    lore: "typeLore",
  };

  const has = (key) => dict()[key] !== undefined || I18N["zh-tw"][key] !== undefined;

  const applyI18n = () => {
    document.documentElement.lang = state.lang === "zh-cn" ? "zh-Hans" : "zh-Hant";
    document.title = t("appTitle");

    for (const node of document.querySelectorAll("[data-i18n]")) {
      const key = node.getAttribute("data-i18n");
      if (has(key)) node.textContent = t(key);
    }
    for (const node of document.querySelectorAll("[data-i18n-title]")) {
      const key = node.getAttribute("data-i18n-title");
      if (has(key)) node.title = t(key);
    }
    for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
      const key = node.getAttribute("data-i18n-placeholder");
      if (has(key)) node.placeholder = t(key);
    }

    const seg = $("langSeg");
    if (seg) seg.setAttribute("aria-label", state.lang === "zh-cn" ? "语言" : "語言");

    let metaText = t("meta", {
      nodes: G.meta.nodeCount,
      edges: G.meta.edgeCount,
      chapters: chapters.length,
      date: G.meta.generated,
    });
    const gameParts = [];
    if (G.meta.gameVersion) gameParts.push(t("gameVersion", { ver: G.meta.gameVersion }));
    if (G.meta.gameBuild) gameParts.push(t("gameBuild", { build: G.meta.gameBuild }));
    if (gameParts.length) metaText += ` · ${gameParts.join(" · ")}`;
    const metaLine = $("metaLine");
    if (metaLine) {
      metaLine.textContent = metaText;
      metaLine.title = metaText;
    }

    syncSettingsUi();
    updateRailCount();
    renderNavMenu();
  };

  const STAGE_CACHE = { lang: "", list: [] };

  const stageNames = () => {
    if (STAGE_CACHE.lang !== state.lang) {
      STAGE_CACHE.lang = state.lang;
      STAGE_CACHE.list = String(t("timeStages")).split(",");
    }
    return STAGE_CACHE.list;
  };

  const dateOf = (rounds) => {
    const index = Math.max(0, Math.floor(rounds) - 1);
    const year = Math.floor(index / 36) + 1;
    const rest = index % 36;
    return { y: year, m: Math.floor(rest / 3) + 1, s: (rest % 3) + 1 };
  };

  const timeText = (rounds) => {
    const date = dateOf(rounds);
    return t("timeFull", { y: date.y, m: date.m, s: stageNames()[date.s - 1] || "" });
  };

  SR.register("i18n", {
    I18N: I18N,
    TYPE_LABEL_KEY: TYPE_LABEL_KEY,
    applyI18n: applyI18n,
    chapterTitle: chapterTitle,
    dateOf: dateOf,
    dict: dict,
    t: t,
    timeText: timeText,
  });
})();
