(() => {
  "use strict";

  const G = window.__STORY_GRAPH__ || {};
  const META = G.meta || {};
  const SHARDS = META.shards || [];
  const SHARD_OF = META.shardOf || "";
  const KEYS = SHARDS.map((shard) => shard.key);
  const LEGACY = !!META.fullText || !SHARD_OF || KEYS.length === 0;

  const langs = {};
  let idIndex = null;

  const state = (lang) => {
    let current = langs[lang];
    if (!current) {
      current = langs[lang] = {
        head: "idle",
        headPromise: null,
        shards: {},
        pending: {},
      };
    }
    return current;
  };

  const pack = (lang) => (window.__STORY_TEXT__ || {})[lang] || null;

  const indexOfId = (id) => {
    if (!idIndex) {
      idIndex = new Map();
      (G.nodes || []).forEach((row, i) => idIndex.set(row[0], i));
    }
    return idIndex.has(id) ? idIndex.get(id) : -1;
  };

  const shardOf = (lang, id) => {
    if (LEGACY) return "";
    const index = indexOfId(id);
    if (index < 0) return "";
    return SHARD_OF.charAt(index) || "";
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });

  const ensureHead = (lang) => {
    const current = state(lang);
    if (current.head === "ready") return Promise.resolve();
    if (current.head === "loading") return current.headPromise;
    current.head = "loading";
    const src = LEGACY ? `data/text-${lang}.js` : `data/text-${lang}-head.js`;
    current.headPromise = loadScript(src)
      .then(() => {
        if (!pack(lang)) throw new Error(`language pack ${lang} is empty`);
        current.head = "ready";
        if (LEGACY) KEYS.forEach((key) => {
          current.shards[key] = "ready";
        });
      })
      .catch((err) => {
        current.head = "failed";
        current.headError = err && err.message ? err.message : String(err);
        throw err;
      });
    return current.headPromise;
  };

  const ensureShard = (lang, key) => {
    const current = state(lang);
    if (!key) return Promise.resolve(true);
    if (LEGACY) return Promise.resolve(true);
    if (current.shards[key] === "ready") return Promise.resolve(true);
    if (current.pending[key]) return current.pending[key];
    current.shards[key] = "loading";
    current.pending[key] = loadScript(`data/text-${lang}-${key}.js`)
      .then(() => {
        current.shards[key] = "ready";
        delete current.pending[key];
        return true;
      })
      .catch((err) => {
        current.shards[key] = "failed";
        current.shardError = err && err.message ? err.message : String(err);
        delete current.pending[key];
        return false;
      });
    return current.pending[key];
  };

  const hasStory = (lang, id) => {
    const current = pack(lang);
    return !!(current && current.stories && Object.prototype.hasOwnProperty.call(current.stories, id));
  };

  const ensureStory = (lang, id) => ensureHead(lang).then(() => {
    if (hasStory(lang, id)) return true;
    const key = shardOf(lang, id);
    if (!key) return false;
    return ensureShard(lang, key).then(() => hasStory(lang, id));
  }).catch(() => false);

  const progress = (lang) => {
    const current = state(lang);
    const total = LEGACY ? 0 : KEYS.length;
    let loaded = 0;
    KEYS.forEach((key) => {
      if (current.shards[key] === "ready") loaded++;
    });
    return {
      head: current.head,
      loaded: loaded,
      total: total,
      done: total === 0 ? current.head === "ready" : loaded >= total,
    };
  };

  const ensureAll = (lang, onProgress) => ensureHead(lang).then(() => {
    if (LEGACY) {
      if (onProgress) onProgress(1, 1);
      return;
    }
    let index = 0;
    const step = () => {
      if (index >= KEYS.length) return Promise.resolve();
      const key = KEYS[index++];
      return ensureShard(lang, key).then(() => {
        if (onProgress) onProgress(index, KEYS.length);
        return step();
      });
    };
    return step();
  });

  const prefetchQueue = [];

  let prefetchBusy = false;

  const pumpPrefetch = () => {
    if (prefetchBusy || !prefetchQueue.length) return;
    prefetchBusy = true;
    const job = prefetchQueue.shift();
    ensureHead(job.lang)
      .then(() => ensureShard(job.lang, job.key))
      .catch(() => false)
      .then(() => {
        prefetchBusy = false;
        pumpPrefetch();
      });
  };

  const prefetch = (lang, ids, limit) => {
    if (LEGACY) return 0;
    const max = typeof limit === "number" ? limit : 2;
    if (max <= 0) return 0;
    const current = state(lang);
    const seen = {};
    let queued = 0;
    (ids || []).forEach((id) => {
      if (queued >= max) return;
      const key = shardOf(lang, id);
      if (!key || seen[key]) return;
      if (current.shards[key] === "ready" || current.shards[key] === "loading" || current.pending[key]) return;
      seen[key] = 1;
      prefetchQueue.push({ lang: lang, key: key });
      queued++;
    });
    pumpPrefetch();
    return queued;
  };

  window.StoryText = {
    legacy: LEGACY,
    keys: KEYS,
    ensureHead: ensureHead,
    prefetch: prefetch,
    prefetchPending: () => prefetchQueue.length,
    hasStory: hasStory,
    ensureStory: ensureStory,
    ensureAll: ensureAll,
    progress: progress,
    shardOf: (id) => shardOf(META.defaultLang || "zh-tw", id),
    shardState: (lang, id) => {
      const key = shardOf(lang, id);
      if (!key) return LEGACY ? "ready" : "missing";
      return state(lang).shards[key] || "idle";
    },
    retry: (lang, id) => {
      const current = state(lang);
      const key = shardOf(lang, id);
      if (key && current.shards[key] === "failed") delete current.shards[key];
      return ensureStory(lang, id);
    },
    state: (lang) => {
      const current = state(lang);
      return { head: current.head, shards: Object.assign({}, current.shards), headError: current.headError || null };
    },
  };
})();
