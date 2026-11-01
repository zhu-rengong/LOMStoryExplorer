(() => {
  "use strict";

  const SR = window.SR;

  const RUNTIME = "vendor/opencc-t2cn.js";

  SR.define("convert", ["data", "ui"], ({ data, ui }) => {
    const converters = Object.create(null);
    let runtime = null;

    const configOf = (lang) => {
      const entry = data.languageMeta()[lang];
      return entry && entry.opencc ? entry.opencc : null;
    };

    const load = () => {
      if (window.OpenCC) return Promise.resolve(window.OpenCC);
      if (runtime) return runtime;
      runtime = ui.loadScript(RUNTIME).then(() => {
        if (!window.OpenCC) throw new Error("OpenCC runtime is missing");
        return window.OpenCC;
      }).catch((error) => {
        runtime = null;
        throw error;
      });
      return runtime;
    };

    const build = (OpenCC, config) => {
      const base = OpenCC.Converter({ from: config.from, to: config.to });
      const variants = config.variants ? OpenCC.CustomConverter(config.variants) : null;
      return variants ? (text) => variants(base(text)) : base;
    };

    const ensure = (lang) => {
      if (converters[lang]) return Promise.resolve(true);
      const config = configOf(lang);
      if (!config) {
        converters[lang] = (text) => text;
        return Promise.resolve(true);
      }
      return load().then((OpenCC) => {
        converters[lang] = build(OpenCC, config);
        return true;
      }, () => false);
    };

    const ready = (lang) => !!converters[lang];

    const string = (lang, value) => {
      const converter = converters[lang];
      if (!converter || typeof value !== "string" || !value) return value;
      return converter(value);
    };

    const convertRow = (lang, value) => {
      if (typeof value === "string") return string(lang, value);
      if (Array.isArray(value)) {
        const out = new Array(value.length);
        for (let index = 0; index < value.length; index++) {
          out[index] = convertRow(lang, value[index]);
        }
        return out;
      }
      if (value && typeof value === "object") return convertGroup(lang, value);
      return value;
    };

    const rows = (lang, beats) => {
      if (!converters[lang] || !Array.isArray(beats)) return beats;
      return convertRow(lang, beats);
    };

    const convertGroup = (lang, value) => {
      const out = {};
      for (const key of Object.keys(value)) {
        const item = value[key];
        if (typeof item === "string") out[key] = string(lang, item);
        else if (item && typeof item === "object") out[key] = convertGroup(lang, item);
        else out[key] = item;
      }
      return out;
    };

    const group = (lang, value) => {
      if (!converters[lang] || !value || typeof value !== "object") return value;
      return convertGroup(lang, value);
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
