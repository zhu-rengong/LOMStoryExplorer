(() => {
  "use strict";

  const SR = window.SR;

  SR.define("checkpoints", ["schema"], ({ schema }) => {
    const mapping = schema.meta.checkpointShards || {};
    const count = Object.keys(mapping).reduce((max, key) => Math.max(max, mapping[key] + 1), 0);
    const loading = Object.create(null);
    let allPending = null;

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

    const ensureAll = () => {
      if (!count) return Promise.resolve(false);
      if (allPending) return allPending;
      const jobs = [];
      for (let index = 0; index < count; index++) jobs.push(load(index));
      allPending = Promise.all(jobs).then((list) => list.some(Boolean));
      return allPending;
    };

    return {
      count,
      ensure,
      ensureAll,
      get: schema.checkpoint,
      has: (key) => !!schema.checkpoint(key),
      shardOf: schema.checkpointShard,
    };
  });
})();
