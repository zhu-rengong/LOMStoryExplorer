(() => {
  "use strict";

  const SR = window.SR;

  const DICT = window.SR_I18N || { "zh-tw": {} };

  const EXTRA = {
    "zh-tw": {
      errorTitle: "資料載入失敗",
      errorMissing: "找不到 data/graph.js，請先執行 build.py 產生資料。",
      errorSchema: "資料版本不符，請重新執行 build.py。",
      errorReload: "重新載入",
      errorScript: "頁面腳本載入失敗：{name}",
      filterSyntax: "第 {column} 欄：{message}",
      langZhTw: "繁體中文",
      langZhCn: "简体中文",
    },
    "zh-cn": {
      errorTitle: "数据加载失败",
      errorMissing: "找不到 data/graph.js，请先运行 build.py 生成数据。",
      errorSchema: "数据版本不符，请重新运行 build.py。",
      errorReload: "重新加载",
      errorScript: "页面脚本加载失败：{name}",
      filterSyntax: "第 {column} 栏：{message}",
      langZhTw: "繁體中文",
      langZhCn: "简体中文",
    },
  };

  for (const lang of Object.keys(EXTRA)) {
    if (!DICT[lang]) DICT[lang] = {};
    Object.assign(DICT[lang], EXTRA[lang]);
  }

  SR.define("i18n", ["store", "graph"], ({ store, graph }) => {
    const state = store.state;

    const dict = () => DICT[state.lang] || DICT["zh-tw"];

    const has = (key) => dict()[key] !== undefined || DICT["zh-tw"][key] !== undefined;

    const t = (key, vars) => {
      let text = dict()[key];
      if (text === undefined) text = DICT["zh-tw"][key];
      if (text === undefined) return key;
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, (whole, name) => (
        vars[name] === undefined ? whole : String(vars[name])
      ));
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
      const fixed = {
        scene: "chScene", work: "chWork", travel: "chTravel",
        free: "chFree", section: "chSection", misc: "chMisc", other: "chOther",
      };
      if (fixed[id]) return t(fixed[id]);
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
      document.documentElement.lang = state.lang === "zh-cn" ? "zh-Hans" : "zh-Hant";
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
      const seg = document.getElementById("langSeg");
      if (seg) seg.setAttribute("aria-label", state.lang === "zh-cn" ? "语言" : "語言");

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
      DICT,
      apply,
      chapterTitle,
      dateOf,
      dict,
      has,
      stageNames,
      t,
      timeText,
      typeLabel,
    };
  });
})();
