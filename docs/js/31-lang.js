(() => {
  "use strict";

  const SR = window.SR;

  const KEY = "legend-of-mortal.explorer.lang.v1";

  const DEFAULT = "zh-tw";

  SR.define("lang", ["globals", "storage"], ({ globals, storage }) => {
    const META = globals.languageMeta();

    const DICT = globals.dictionary();

    const LANGS = (() => {
      const out = [];
      for (const id of Object.keys(META)) if (out.indexOf(id) < 0) out.push(id);
      for (const id of Object.keys(DICT)) if (out.indexOf(id) < 0) out.push(id);
      return out;
    })();

    const has = (id) => typeof id === "string" && LANGS.indexOf(id) >= 0;

    const match = (raw) => {
      const tag = String(raw || "").toLowerCase();
      if (!tag) return "";
      if (tag.indexOf("en") === 0) return "en";
      if (tag.indexOf("zh") !== 0) return "";
      return /hans|-cn|-sg|-my/.test(tag) ? "zh-cn" : "zh-tw";
    };

    const read = () => storage.get(KEY) || "";

    const pinned = () => {
      const id = read();
      return has(id) ? id : "";
    };

    const detect = () => {
      const tags = navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language || ""];
      for (const raw of tags) {
        const id = match(raw);
        if (has(id)) return id;
      }
      return has(DEFAULT) ? DEFAULT : (LANGS[0] || DEFAULT);
    };

    const initial = () => pinned() || detect();

    const pin = (id) => {
      if (!has(id)) return false;
      return storage.set(KEY, id);
    };

    const htmlOf = (id) => (META[id] && META[id].html) || String(id || DEFAULT);

    const titleOf = (id) => (DICT[id] && DICT[id].appTitle) || "";

    const applyDocument = () => {
      const id = initial();
      document.documentElement.lang = htmlOf(id);
      const title = titleOf(id);
      if (title) document.title = title;
      return id;
    };

    applyDocument();

    return {
      has,
      htmlOf,
      initial,
      pin,
    };
  });
})();
