(() => {
  "use strict";

  const SR = window.SR;

  const SHARD_TIMEOUT = 30000;

  SR.define("text", ["schema", "data", "ui", "i18n", "convert"],
    ({ schema, data, ui, i18n, convert }) => {
      const meta = schema.meta;
      const source = meta.textSource || meta.langs[0] || "";
      const legacy = !!meta.fullText || !Object.keys(meta.shardOf).length || meta.shards.length === 0;
      const keys = meta.shards.map((shard) => shard.key);

      const physical = {
        head: "idle",
        headPromise: null,
        shards: Object.create(null),
        pending: Object.create(null),
        headError: "",
        shardError: "",
      };
      const views = Object.create(null);
      const queue = [];
      let queueBusy = false;

      const rawPack = () => data.textPack()[source] || null;

      const rawStories = () => {
        const current = rawPack();
        return current && current.stories ? current.stories : null;
      };

      const viewOf = (lang) => {
        let view = views[lang];
        if (!view) {
          view = views[lang] = {
            pack: null,
            characters: null,
            titles: null,
            names: null,
            edgeLabels: null,
            stories: Object.create(null),
          };
        }
        return view;
      };

      const converted = (lang) => lang !== source && convert.ready(lang);

      const ensureConvert = (lang) => {
        if (lang === source) return Promise.resolve(true);
        if (convert.ready(lang)) return Promise.resolve(true);
        return convert.ensure(lang);
      };

      const loadHead = () => {
        physical.head = "loading";
        const src = legacy
          ? data.asset("textFull", { lang: source })
          : data.asset("textHead", { lang: source });
        physical.headPromise = ui.loadScript(src).then(() => {
          if (!rawPack()) throw new Error(`text pack ${source} is empty`);
          physical.head = "ready";
          physical.headError = "";
          if (legacy) {
            for (const key of keys) physical.shards[key] = "ready";
          }
          return true;
        }).catch((error) => {
          physical.head = "failed";
          physical.headError = error && error.message ? error.message : String(error);
          ui.toast(i18n.t("langFailed", { lang: source }));
          return false;
        });
        return physical.headPromise;
      };

      const ensureHead = (lang) => {
        const current = physical.head === "ready"
          ? Promise.resolve(true)
          : (physical.head === "loading" ? physical.headPromise : loadHead());
        return Promise.all([current, ensureConvert(lang)]).then(([headOk, convOk]) => {
          if (!headOk) return false;
          if (!convOk && lang !== source) {
            ui.toast(i18n.t("langFailed", { lang }));
            return false;
          }
          return true;
        });
      };

      const ensureShard = (lang, key) => {
        if (!key) return Promise.resolve(true);
        if (legacy) return Promise.resolve(true);
        if (physical.shards[key] === "ready") return Promise.resolve(true);
        if (physical.pending[key]) return physical.pending[key];
        physical.shards[key] = "loading";
        physical.pending[key] = ui.loadScript(data.asset("textShard", { lang: source, key }))
          .then(() => {
            physical.shards[key] = "ready";
            delete physical.pending[key];
            return true;
          }).catch((error) => {
            physical.shards[key] = "failed";
            physical.shardError = error && error.message ? error.message : String(error);
            delete physical.pending[key];
            return false;
          });
        return physical.pending[key];
      };

      const hasStory = (id) => {
        const stories = rawStories();
        return !!stories && Object.prototype.hasOwnProperty.call(stories, id);
      };

      const ensureStory = (lang, id) => ensureHead(lang).then(() => {
        if (hasStory(id)) return true;
        const key = meta.shardOf[id];
        if (!key) return false;
        return ensureShard(lang, key).then(() => hasStory(id));
      }).catch(() => false);

      const story = (lang, id) => {
        const stories = rawStories();
        if (!stories) return null;
        const beats = stories[id];
        if (beats === undefined) return null;
        if (!converted(lang)) return beats;
        const view = viewOf(lang);
        let hit = view.stories[id];
        if (hit === undefined) {
          hit = convert.rows(lang, beats);
          view.stories[id] = hit;
        }
        return hit;
      };

      const pack = (lang) => {
        const raw = rawPack();
        if (!raw) return null;
        if (!converted(lang)) return raw;
        const view = viewOf(lang);
        if (!view.pack) {
          view.pack = {
            schema: raw.schema,
            lang,
            source: raw.lang,
            missing: raw.missing,
            missingKeys: raw.missingKeys || [],
            shardKeys: raw.shardKeys || [],
            fullText: raw.fullText,
            characters: null,
            titles: null,
            names: null,
            edgeLabels: null,
            stories: view.stories,
          };
        }
        const result = view.pack;
        if (!result.characters) result.characters = convert.group(lang, raw.characters || {});
        if (!result.titles) result.titles = convert.group(lang, raw.titles || {});
        if (!result.names) result.names = convert.group(lang, raw.names || {});
        if (!result.edgeLabels) result.edgeLabels = convert.group(lang, raw.edgeLabels || {});
        const stories = raw.stories || {};
        for (const id of Object.keys(stories)) {
          if (view.stories[id] === undefined) view.stories[id] = convert.rows(lang, stories[id]);
        }
        return result;
      };

      const tableOf = (lang, field) => {
        const raw = rawPack();
        if (!raw) return {};
        const value = raw[field] || {};
        if (!converted(lang)) return value;
        const view = viewOf(lang);
        if (!view[field]) view[field] = convert.group(lang, value);
        return view[field];
      };

      const characters = (lang) => tableOf(lang, "characters");

      const titles = (lang) => tableOf(lang, "titles");

      const names = (lang) => tableOf(lang, "names");

      const edgeLabels = (lang) => tableOf(lang, "edgeLabels");

      const edgeLabel = (lang, edgeId, fallback) => {
        const table = edgeLabels(lang);
        return table[edgeId] || fallback || "";
      };

      const progress = (lang) => {
        const total = legacy ? 0 : keys.length;
        let loaded = 0;
        let failed = 0;
        for (const key of keys) {
          const status = physical.shards[key];
          if (status === "ready") loaded++;
          else if (status === "failed") failed++;
        }
        return {
          head: physical.head,
          loaded,
          total,
          done: total === 0 ? physical.head === "ready" : loaded + failed >= total,
          headError: physical.headError || "",
          shardError: physical.shardError || "",
        };
      };

      const settleShard = (lang, key) => new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (physical.shards[key] === "loading") {
            physical.shards[key] = "failed";
            physical.shardError = `timeout: ${key}`;
            delete physical.pending[key];
          }
          resolve(false);
        }, SHARD_TIMEOUT);
        ensureShard(lang, key).then(() => {
          clearTimeout(timer);
          resolve(true);
        }, () => {
          clearTimeout(timer);
          resolve(false);
        });
      });

      const ensureAll = (lang, onProgress) => ensureHead(lang).then(() => {
        if (legacy) {
          if (onProgress) onProgress(1, 1);
          return true;
        }
        let index = 0;
        const step = () => {
          if (index >= keys.length) return Promise.resolve(true);
          const key = keys[index++];
          return settleShard(lang, key).then(() => {
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
        const seen = Object.create(null);
        let queued = 0;
        for (const id of ids || []) {
          if (queued >= max) break;
          const key = meta.shardOf[id];
          if (!key || seen[key]) continue;
          if (physical.shards[key] === "ready" || physical.shards[key] === "loading") continue;
          if (physical.pending[key]) continue;
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
        return physical.shards[key] || "idle";
      };

      const retry = (lang, id) => {
        const key = meta.shardOf[id];
        if (key && physical.shards[key] === "failed") delete physical.shards[key];
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
        titles,
      };
    });
})();
