(() => {
  "use strict";
  const SR = window.SR;
  const languagePromises = new Map();
  const storyPromises = new Map();
  const packOf = (lang) => window.__SR_STORIES__?.[lang] || null;
  const validate = (pack, lang) => {
    if (!pack || pack.version !== SR.VERSION || pack.lang !== lang) throw new Error(`Story data version mismatch: ${lang}`);
    return pack;
  };
  const loadLanguage = (lang) => {
    if (packOf(lang)) return Promise.resolve(validate(packOf(lang), lang));
    if (languagePromises.has(lang)) return languagePromises.get(lang);
    const promise = SR.core.loadScript(`data/stories-${lang}-index.js`).then(() => validate(packOf(lang), lang)).catch((error) => {
      languagePromises.delete(lang);
      throw error;
    });
    languagePromises.set(lang, promise);
    return promise;
  };
  const requireVersion = (actual, label) => {
    if (actual !== SR.VERSION) throw new Error(`Story payload version mismatch: ${label}`);
  };
  const loadStory = async (id, lang) => {
    const pack = await loadLanguage(lang);
    if (pack.stories[id]) return pack.stories[id];
    if (!SR.data.node(id)) throw new Error(`Unknown story: ${id}`);
    const key = `${lang}:${id}`;
    if (storyPromises.has(key)) return storyPromises.get(key);
    const promise = (async () => {
      if (pack.fullText) {
        if (!pack.fullTextLoaded) await SR.core.loadScript(`data/stories-${lang}.js`);
        requireVersion(pack.fullTextVersion, lang);
      } else {
        const shard = pack.storyShards[id];
        if (!shard) throw new Error(`No story shard assigned: ${id}`);
        if (!pack.loadedShards[shard]) await SR.core.loadScript(`data/stories-${lang}-${shard}.js`);
        requireVersion(pack.shardVersions[shard], `${lang}:${shard}`);
      }
      return pack.stories[id] || [];
    })().catch((error) => {
      storyPromises.delete(key);
      throw error;
    });
    storyPromises.set(key, promise);
    return promise;
  };
  const loadAll = async (lang, onProgress, cancelled = () => false) => {
    const pack = await loadLanguage(lang);
    const shards = pack.fullText ? [null] : pack.shards.map((shard) => shard.key);
    let loaded = 0;
    onProgress?.(0, shards.length);
    for (const shard of shards) {
      if (cancelled()) throw new DOMException("Search cancelled", "AbortError");
      if (shard === null) {
        if (!pack.fullTextLoaded) await SR.core.loadScript(`data/stories-${lang}.js`);
        requireVersion(pack.fullTextVersion, lang);
      } else {
        if (!pack.loadedShards[shard]) await SR.core.loadScript(`data/stories-${lang}-${shard}.js`);
        requireVersion(pack.shardVersions[shard], `${lang}:${shard}`);
      }
      loaded += 1;
      onProgress?.(loaded, shards.length);
    }
    return pack;
  };
  const get = (id, lang) => packOf(lang)?.stories[id] || null;
  const prefetch = (ids, lang) => {
    for (const id of ids.slice(0, 2)) loadStory(id, lang).catch(() => undefined);
  };
  SR.register("text", { loadLanguage, loadStory, loadAll, get, prefetch, packOf });
})();
