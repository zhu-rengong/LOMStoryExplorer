(() => {
  "use strict";

  const SR = window.SR;

  const LIB = window.i18next || null;

  const FALLBACK = "zh-tw";

  const PLACEHOLDER = /\{(\w+)\}/g;

  const CHAPTER_KEYS = {
    prologue: "chPrologue",
    chapter: "chN",
    act: "actN",
    event: "eventN",
    scene: "chScene",
    work: "chWork",
    travel: "chTravel",
    free: "chFree",
    section: "chSection",
    misc: "chMisc",
    other: "chOther",
  };

  SR.define("i18n", ["store", "graph", "lang", "settings", "globals", "data"],
    ({ store, graph, lang, settings, globals, data }) => {
      const state = store.state;

      const DICT = globals.dictionary();

      const META = globals.languageMeta();

      const LANGS = Object.keys(DICT).length ? Object.keys(DICT) : [FALLBACK];

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
        for (const id of LANGS) resources[id] = { translation: DICT[id] || {} };
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

      const translateOf = (id) => {
        if (!ENGINE) return null;
        let fn = fixed.get(id);
        if (!fn) {
          fn = ENGINE.getFixedT(id, "translation");
          fixed.set(id, fn);
        }
        return fn;
      };

      const rawOf = (id, key) => {
        const table = DICT[id] || {};
        if (table[key] !== undefined) return table[key];
        const base = DICT[FALLBACK] || {};
        return base[key];
      };

      const t = (key, vars) => {
        const translate = translateOf(state.lang);
        if (translate) {
          const hit = translate(key, vars);
          if (hit !== undefined && hit !== null && !(hit === key && vars && vars.defaultValue !== undefined)) {
            return hit;
          }
        }
        const text = rawOf(state.lang, key);
        if (text !== undefined) return vars ? format(text, vars) : text;
        if (vars && vars.defaultValue !== undefined) return String(vars.defaultValue);
        return key;
      };

      const has = (key) => {
        if (ENGINE) return ENGINE.exists(key, { lng: state.lang });
        return rawOf(state.lang, key) !== undefined;
      };

      const all = (key) => {
        const out = [];
        for (const id of LANGS) {
          const raw = DICT[id] && DICT[id][key];
          if (typeof raw !== "string") continue;
          for (const part of raw.split(",")) {
            const value = part.trim();
            if (value && out.indexOf(value) < 0) out.push(value);
          }
        }
        return out;
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

      const typeLabel = (typeId) => {
        const hit = settings.typeById(typeId);
        return hit ? t(hit.label) : String(typeId || "");
      };

      const chapterTitle = (chapter) => {
        if (!chapter) return t("chOther");
        const key = CHAPTER_KEYS[chapter.kind] || "chOther";
        if (chapter.kind === "chapter") return t(key, { n: chapter.number });
        if (chapter.kind === "act") return t(key, { n: chapter.number });
        if (chapter.kind === "event") {
          return t(key, { n: String(chapter.number === null ? 0 : chapter.number).padStart(2, "0") });
        }
        return t(key);
      };

      const calendar = data.calendar || {};

      const dateOf = (rounds) => {
        const perYear = calendar.roundsPerYear || 36;
        const perMonth = calendar.roundsPerMonth || 3;
        const index = Math.max(0, Math.floor(rounds) - 1);
        const year = Math.floor(index / perYear) + 1;
        const rest = index % perYear;
        return { y: year, m: Math.floor(rest / perMonth) + 1, s: (rest % perMonth) + 1 };
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

        const countsText = t("meta", {
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          chapters: graph.chapters.length,
        });
        const line = document.getElementById("metaLine");
        if (line) line.textContent = countsText;

        const meta = data.meta;
        const game = meta.game || {};
        const parts = [];
        if (graph.nodes.length && meta.generated) parts.push(meta.generated);
        if (game.version) parts.push(t("gameVersion", { ver: game.version }));
        if (game.build) parts.push(t("gameBuild", { build: game.build }));
        const buildText = parts.join(" · ");
        const build = document.getElementById("buildLine");
        if (build) build.textContent = buildText;
      };

      return {
        all,
        apply,
        chapterTitle,
        has,
        languages,
        syncLanguage,
        t,
        timeText,
        typeLabel,
      };
    });
})();
