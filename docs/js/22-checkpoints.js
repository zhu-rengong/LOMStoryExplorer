(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const SHARD_COUNT = 8;
  let mode = "shards";
  const loading = {};
  let fallbackTried = false;
  let allPending = null;

  const shardOf = (key) => {
    let hashValue = 0;
    for (let i = 0; i < key.length; i++) hashValue = (hashValue * 31 + key.charCodeAt(i)) & 0xFFFF;
    return hashValue % SHARD_COUNT;
  };

  const inject = (src) => new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  const loadShard = (index) => {
    if (mode === "single") return Promise.resolve(true);
    if (loading[index]) return loading[index];
    loading[index] = inject(`data/checkpoints-${index}.js`).then((ok) => {
      if (ok) return true;
      if (fallbackTried) return false;
      fallbackTried = true;
      return inject("data/checkpoints.js").then((done) => {
        if (done) mode = "single";
        return done;
      });
    });
    return loading[index];
  };

  const ensureAll = () => {
    if (mode === "single") return Promise.resolve(true);
    if (allPending) return allPending;
    const jobs = [];
    for (let i = 0; i < SHARD_COUNT; i++) jobs.push(loadShard(i));
    allPending = Promise.all(jobs).then((list) => {
      for (const ok of list) if (ok) return true;
      return mode === "single";
    });
    return allPending;
  };

  const ensure = (key) => {
    if (!key) return ensureAll();
    return loadShard(shardOf(key));
  };

  const get = (key) => {
    const all = window.__STORY_CHECKPOINTS__;
    return (all && key && all[key]) || null;
  };

  SR.register("checkpoints", {
    shardOf: shardOf,
    shards: SHARD_COUNT,
    ensure: ensure,
    ensureAll: ensureAll,
    get: get,
    has: (key) => !!get(key),
  });
})();
