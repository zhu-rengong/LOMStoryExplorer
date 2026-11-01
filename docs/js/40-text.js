(() => {
  "use strict";

  const SR = window.SR;

  SR.define("text", ["schema", "ui", "i18n"], ({ schema, ui, i18n }) => {
    const meta = schema.meta;
    const legacy = !!meta.fullText || !Object.keys(meta.shardOf).length || meta.shards.length === 0;
    const keys = meta.shards.map((shard) => shard.key);

    const langs = Object.create(null);
    const queue = [];
    let queueBusy = false;

    const state = (lang) => {
      let current = langs[lang];
      if (!current) {
        current = langs[lang] = {
          head: "idle",
          headPromise: null,
          shards: Object.create(null),
          pending: Object.create(null),
          headError: "",
          shardError: "",
        };
      }
      return current;
    };

    const pack = (lang) => (window.SR_TEXT || {})[lang] || null;

    const ensureHead = (lang) => {
      const current = state(lang);
      if (current.head === "ready") return Promise.resolve(true);
      if (current.head === "loading") return current.headPromise;
      current.head = "loading";
      const src = legacy ? `data/text-${lang}.js` : `data/text-${lang}-head.js`;
      current.headPromise = ui.loadScript(src).then(() => {
        if (!pack(lang)) throw new Error(`language pack ${lang} is empty`);
        current.head = "ready";
        current.headError = "";
        if (legacy) {
          for (const key of keys) current.shards[key] = "ready";
        }
        return true;
      }).catch((error) => {
        current.head = "failed";
        current.headError = error && error.message ? error.message : String(error);
        ui.toast(i18n.t("langFailed", { lang }));
        return false;
      });
      return current.headPromise;
    };

    const ensureShard = (lang, key) => {
      const current = state(lang);
      if (!key) return Promise.resolve(true);
      if (legacy) return Promise.resolve(true);
      if (current.shards[key] === "ready") return Promise.resolve(true);
      if (current.pending[key]) return current.pending[key];
      current.shards[key] = "loading";
      current.pending[key] = ui.loadScript(`data/text-${lang}-${key}.js`).then(() => {
        current.shards[key] = "ready";
        delete current.pending[key];
        return true;
      }).catch((error) => {
        current.shards[key] = "failed";
        current.shardError = error && error.message ? error.message : String(error);
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
      const key = meta.shardOf[id];
      if (!key) return false;
      return ensureShard(lang, key).then(() => hasStory(lang, id));
    }).catch(() => false);

    const story = (lang, id) => {
      const current = pack(lang);
      if (!current || !current.stories) return null;
      return current.stories[id] === undefined ? null : current.stories[id];
    };

    const characters = (lang) => (pack(lang) || {}).characters || {};

    const names = (lang) => (pack(lang) || {}).names || {};

    const edgeLabels = (lang) => (pack(lang) || {}).edgeLabels || {};

    const edgeLabel = (lang, edgeId, fallback) => {
      const table = edgeLabels(lang);
      return table[edgeId] || fallback || "";
    };

    const progress = (lang) => {
      const current = state(lang);
      const total = legacy ? 0 : keys.length;
      let loaded = 0;
      for (const key of keys) if (current.shards[key] === "ready") loaded++;
      return {
        head: current.head,
        loaded,
        total,
        done: total === 0 ? current.head === "ready" : loaded >= total,
        headError: current.headError || "",
        shardError: current.shardError || "",
      };
    };

    const ensureAll = (lang, onProgress) => ensureHead(lang).then(() => {
      if (legacy) {
        if (onProgress) onProgress(1, 1);
        return true;
      }
      let index = 0;
      const step = () => {
        if (index >= keys.length) return Promise.resolve(true);
        const key = keys[index++];
        return ensureShard(lang, key).then(() => {
          if (onProgress) onProgress(index, keys.length);
          return step();
        });
      };
      return step();
    });

    const pump = () => {
      if (queueBusy || !queue.length) return;
      queueBusy = true;
      const job = queue.shift();
      ensureHead(job.lang)
        .then(() => ensureShard(job.lang, job.key))
        .catch(() => false)
        .then(() => {
          queueBusy = false;
          pump();
        });
    };

    const prefetch = (lang, ids, limit) => {
      if (legacy) return 0;
      const max = typeof limit === "number" ? limit : 2;
      if (max <= 0) return 0;
      const current = state(lang);
      const seen = Object.create(null);
      let queued = 0;
      for (const id of ids || []) {
        if (queued >= max) break;
        const key = meta.shardOf[id];
        if (!key || seen[key]) continue;
        if (current.shards[key] === "ready" || current.shards[key] === "loading") continue;
        if (current.pending[key]) continue;
        seen[key] = 1;
        queue.push({ lang, key });
        queued++;
      }
      pump();
      return queued;
    };

    const shardState = (lang, id) => {
      const key = meta.shardOf[id];
      if (!key) return legacy ? "ready" : "missing";
      return state(lang).shards[key] || "idle";
    };

    const retry = (lang, id) => {
      const current = state(lang);
      const key = meta.shardOf[id];
      if (key && current.shards[key] === "failed") delete current.shards[key];
      return ensureStory(lang, id);
    };

    return {
      characters,
      edgeLabel,
      ensureAll,
      ensureHead,
      ensureStory,
      names,
      pack,
      prefetch,
      progress,
      retry,
      shardState,
      story,
    };
  });
})();
