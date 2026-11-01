(() => {
  "use strict";

  const SR = window.SR;

  SR.define("checkpoints", ["data", "ui"], ({ data, ui }) => {
    const loading = Object.create(null);

    const load = (index) => {
      if (index < 0) return Promise.resolve(false);
      if (!loading[index]) {
        loading[index] = ui.loadScript(data.asset("checkpoint", { index })).catch(() => false);
      }
      return loading[index];
    };

    const ensure = (key) => {
      const index = data.checkpointShards[key];
      if (typeof index !== "number" || index < 0) return Promise.resolve(false);
      return load(index);
    };

    const get = (key, method) => {
      const all = data.checkpoints();
      const model = all && key ? all[key] : null;
      if (!model) return null;
      if (!method || model.kind === method) return model;
      const variants = Array.isArray(model.variants) ? model.variants : [];
      for (const variant of variants) {
        if (variant && variant.kind === method) return variant;
      }
      return null;
    };

    return {
      ensure,
      get,
    };
  });
})();
