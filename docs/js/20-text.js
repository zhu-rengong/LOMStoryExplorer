(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const applyFilterSource = SR.fwd("filter", "applyFilterSource");
  const clearFirstLineCache = SR.fwd("reader", "clearFirstLineCache");
  const progress = SR.core.progress;
  const resetNameIndex = SR.fwd("panels", "resetNameIndex");
  const resetTextCaches = SR.fwd("filter", "resetTextCaches");
  const state = SR.core.state;
  const t = SR.i18n.t;
  const toast = SR.core.toast;

  let allTextPromise = null;

  const langPack = (lang) => state.texts[lang] || { stories: {}, characters: {}, edgeLabels: {} };

  const resetAllText = () => {
    allTextPromise = null;
  };

  const ensureLang = (lang) => {
    if (state.langLoaded[lang] && state.texts[lang]) return Promise.resolve(lang);
    if (window.StoryText) {
      return window.StoryText.ensureHead(lang).then(() => {
        state.texts = window.__STORY_TEXT__ || state.texts;
        state.langLoaded[lang] = true;
        return lang;
      }).catch(() => {
        toast(t("langFailed", { lang: lang }));
        return lang;
      });
    }
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `data/text-${lang}.js`;
      script.onload = () => {
        state.texts = window.__STORY_TEXT__ || state.texts;
        state.langLoaded[lang] = true;
        resolve(lang);
      };
      script.onerror = () => {
        toast(t("langFailed", { lang: lang }));
        resolve(lang);
      };
      document.head.appendChild(script);
    });
  };

  const storyLoaded = (id) => {
    const pack = langPack(state.lang);
    return !!pack && !!pack.stories && pack.stories[id] !== undefined;
  };

  const ensureStoryText = (id) => {
    if (storyLoaded(id)) return Promise.resolve(true);
    if (!window.StoryText) return Promise.resolve(false);
    return window.StoryText.ensureStory(state.lang, id).then((ok) => {
      if (ok) resetTextCaches();
      return ok;
    });
  };

  const textDone = () => {
    if (!window.StoryText) return true;
    return window.StoryText.progress(state.lang).done;
  };

  const ensureAllText = () => {
    if (textDone()) return Promise.resolve();
    if (allTextPromise) return allTextPromise;
    if (!window.StoryText) return Promise.resolve();
    const lang = state.lang;
    allTextPromise = window.StoryText.ensureAll(lang, (loaded, total) => {
      progress(t("loadTextProgress", { loaded: loaded, total: total }));
    }).then(() => {
      resetAllText();
      resetTextCaches();
      resetNameIndex();
      state.texts = window.__STORY_TEXT__ || state.texts;
      clearFirstLineCache();
      if (state.filterSource.trim()) applyFilterSource(state.filterSource);
      progress("");
    });
    return allTextPromise;
  };

  const storyShardReady = (id) => {
    if (!window.StoryText) return true;
    return window.StoryText.shardState(state.lang, id) === "ready";
  };

  const prefetchText = (ids, limit) => {
    if (!window.StoryText || !window.StoryText.prefetch) return 0;
    return window.StoryText.prefetch(state.lang, ids, limit);
  };

  SR.register("text", {
    ensureAllText: ensureAllText,
    ensureLang: ensureLang,
    ensureStoryText: ensureStoryText,
    langPack: langPack,
    prefetchText: prefetchText,
    resetAllText: resetAllText,
    storyLoaded: storyLoaded,
    storyShardReady: storyShardReady,
    textDone: textDone,
  });
})();
