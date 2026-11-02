(() => {
  "use strict";

  const SR = window.SR;

  SR.define("names", ["text", "store"], ({ text, store }) => {
    const tables = () => text.names(store.textLang()) || {};

    const table = (kind) => tables()[kind] || {};

    const of = (kind, key) => (key ? table(kind)[key] || "" : "");

    const label = (kind, key, fallback) => of(kind, key) || fallback || key || "";

    const speaker = (id) => {
      if (!id) return "";
      return text.characters(store.textLang())[id] || id;
    };

    const title = (id) => (id ? text.titles(store.textLang())[id] || "" : "");

    return {
      label,
      of,
      speaker,
      table,
      title,
    };
  });
})();
