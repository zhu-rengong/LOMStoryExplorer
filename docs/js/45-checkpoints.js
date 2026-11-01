(() => {
  "use strict";

  const SR = window.SR;

  SR.define("checkpoints", ["schema"], ({ schema }) => {
    const loading = Object.create(null);

    const load = (index) => {
      if (index < 0) return Promise.resolve(false);
      if (loading[index]) return loading[index];
      loading[index] = new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = `data/checkpoints-${index}.js`;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
      return loading[index];
    };

    const ensure = (key) => {
      const index = schema.checkpointShard(key);
      if (index < 0) return Promise.resolve(false);
      return load(index);
    };

    const get = (key, method) => {
      const all = window.SR_CHECKPOINTS;
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
