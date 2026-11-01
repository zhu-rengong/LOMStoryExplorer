(() => {
  "use strict";

  const SR = window.SR;

  SR.define("convert", ["ui"], ({ ui }) => {
    const tables = Object.create(null);
    const pending = Object.create(null);

    const parse = (raw) => {
      const map = new Map();
      const pairs = String(raw.pairs || "");
      for (let index = 0; index + 1 < pairs.length; index += 2) {
        map.set(pairs[index], pairs[index + 1]);
      }
      const phrases = raw.phrases || {};
      const index = Object.create(null);
      for (const key of Object.keys(phrases).sort((left, right) => right.length - left.length)) {
        (index[key[0]] || (index[key[0]] = [])).push(key);
      }
      return { map, phrases, index, overrides: raw.overrides || null };
    };

    const walk = (current, value) => {
      const phrases = current.phrases;
      const index = current.index;
      const map = current.map;
      let out = "";
      let cursor = 0;
      const size = value.length;
      while (cursor < size) {
        const bucket = index[value[cursor]];
        let hit = "";
        if (bucket) {
          for (const key of bucket) {
            if (value.startsWith(key, cursor)) {
              hit = key;
              break;
            }
          }
        }
        if (hit) {
          out += phrases[hit];
          cursor += hit.length;
          continue;
        }
        const char = value[cursor];
        out += map.get(char) || char;
        cursor += 1;
      }
      return out;
    };

    const apply = (current, value) => {
      const overrides = current.overrides;
      if (overrides && overrides[value] !== undefined) return overrides[value];
      return walk(current, value);
    };

    const convertRow = (current, value) => {
      if (typeof value === "string") return apply(current, value);
      if (!Array.isArray(value)) return value;
      const out = new Array(value.length);
      for (let index = 0; index < value.length; index++) {
        const item = value[index];
        if (Array.isArray(item)) out[index] = convertRow(current, item);
        else out[index] = typeof item === "string" ? apply(current, item) : item;
      }
      return out;
    };

    const convertGroup = (current, value) => {
      const out = {};
      for (const key of Object.keys(value)) {
        const item = value[key];
        if (typeof item === "string") out[key] = apply(current, item);
        else if (item && typeof item === "object") out[key] = convertGroup(current, item);
        else out[key] = item;
      }
      return out;
    };

    const ensure = (lang, url) => {
      if (tables[lang]) return Promise.resolve(tables[lang]);
      if (pending[lang]) return pending[lang];
      pending[lang] = ui.loadScript(url).then(() => {
        const raw = (window.SR_TEXT_CONV || {})[lang];
        if (!raw) throw new Error(`conversion table ${lang} is empty`);
        const built = parse(raw);
        tables[lang] = built;
        delete pending[lang];
        return built;
      }).catch((error) => {
        delete pending[lang];
        throw error;
      });
      return pending[lang];
    };

    const ready = (lang) => !!tables[lang];

    const string = (lang, value) => {
      const current = tables[lang];
      if (!current || typeof value !== "string" || !value) return value;
      return apply(current, value);
    };

    const rows = (lang, beats) => {
      const current = tables[lang];
      if (!current || !Array.isArray(beats)) return beats;
      return convertRow(current, beats);
    };

    const group = (lang, value) => {
      const current = tables[lang];
      if (!current || !value || typeof value !== "object") return value;
      return convertGroup(current, value);
    };

    return {
      ensure,
      group,
      ready,
      rows,
      string,
    };
  });
})();
