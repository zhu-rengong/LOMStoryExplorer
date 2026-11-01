(() => {
  "use strict";

  const SR = window.SR;

  SR.define("convert", ["ui"], ({ ui }) => {
    const RUNTIME = "vendor/opencc-t2cn.js";
    const CONFIG = { from: "tw", to: "cn" };
    const VARIANTS = "妳 你|姪 侄|吶 呐|揹 背|拚 拼|薰 熏|搧 扇|炁 气|砲 炮";
    const converters = Object.create(null);
    let runtime = null;

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

    const build = (OpenCC) => {
      const base = OpenCC.Converter(CONFIG);
      const variants = VARIANTS ? OpenCC.CustomConverter(VARIANTS) : null;
      return variants ? (text) => variants(base(text)) : base;
    };

    const ensure = (lang) => {
      if (converters[lang]) return Promise.resolve(true);
      return load().then((OpenCC) => {
        converters[lang] = build(OpenCC);
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
      if (!Array.isArray(value)) return value;
      const out = new Array(value.length);
      for (let index = 0; index < value.length; index++) {
        const item = value[index];
        if (Array.isArray(item)) out[index] = convertRow(lang, item);
        else out[index] = typeof item === "string" ? string(lang, item) : item;
      }
      return out;
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
