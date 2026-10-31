(() => {
  "use strict";

  const SR = window.SR;

  SR.define("store", ["schema", "graph", "storage"], ({ schema, graph, storage }) => {
    const meta = schema.meta;

    const uiLangs = () => Object.keys(window.SR_I18N || {});

    const initialLang = () => {
      const available = uiLangs();
      if (available.indexOf(meta.defaultLang) >= 0) return meta.defaultLang;
      return available[0] || meta.defaultLang;
    };

    const detectLang = () => {
      const available = uiLangs();
      const tags = navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language || ""];
      for (const raw of tags) {
        const tag = String(raw || "").toLowerCase();
        if (!tag) continue;
        let id = "";
        if (tag.indexOf("en") === 0) id = "en";
        else if (tag.indexOf("zh") === 0) id = /hans|-cn|-sg|-my/.test(tag) ? "zh-cn" : "zh-tw";
        if (id && available.indexOf(id) >= 0) return id;
      }
      if (available.indexOf(meta.defaultLang) >= 0) return meta.defaultLang;
      return available[0] || meta.defaultLang;
    };

    const state = {
      lang: initialLang(),
      selectedId: "",
      history: [],
      hIndex: -1,
      filterSource: "",
      filterSet: null,
      filterError: "",
      filterLoading: false,
      layout: "wide",
      railTab: "outline",
      outlineChapter: undefined,
      settingsType: "dialog",
      query: "",
    };

    const listeners = [];
    const pending = new Set();
    let restored = false;

    const notify = () => {
      if (!pending.size) return;
      const keys = new Set(pending);
      pending.clear();
      for (const listener of listeners.slice()) {
        let hit = false;
        for (const key of keys) {
          if (listener.keys.has(key)) {
            hit = true;
            break;
          }
        }
        if (hit) listener.fn(keys);
      }
    };

    const persist = () => {
      storage.saveSession({
        lang: state.lang,
        selected: state.selectedId,
        filter: state.filterSource,
      });
    };

    const commit = (...keys) => {
      for (const key of keys) pending.add(key);
      persist();
      notify();
    };

    const computeVisible = () => graph.computeVisibility(
      state.filterSet, state.selectedId);

    const selected = () => (state.selectedId ? graph.nodeById.get(state.selectedId) || null : null);

    const select = (id, options) => {
      const node = graph.nodeById.get(id);
      if (!node) return false;
      const opts = options || {};
      state.selectedId = id;
      if (opts.history !== false) {
        state.history = state.history.slice(0, state.hIndex + 1);
        if (state.history[state.history.length - 1] !== id) state.history.push(id);
        state.hIndex = state.history.length - 1;
      }
      computeVisible();
      commit("selected", "history", "visible");
      return true;
    };

    const back = () => {
      if (state.hIndex <= 0) return null;
      state.hIndex -= 1;
      const id = state.history[state.hIndex];
      if (!graph.nodeById.has(id)) return null;
      state.selectedId = id;
      computeVisible();
      commit("selected", "history", "visible");
      return graph.nodeById.get(id);
    };

    const forward = () => {
      if (state.hIndex >= state.history.length - 1) return null;
      state.hIndex += 1;
      const id = state.history[state.hIndex];
      if (!graph.nodeById.has(id)) return null;
      state.selectedId = id;
      computeVisible();
      commit("selected", "history", "visible");
      return graph.nodeById.get(id);
    };

    const setFilter = (patch) => {
      if (!patch || typeof patch !== "object") return;
      if (patch.source !== undefined) state.filterSource = String(patch.source);
      if (patch.set !== undefined) state.filterSet = patch.set;
      if (patch.error !== undefined) state.filterError = String(patch.error);
      if (patch.loading !== undefined) state.filterLoading = !!patch.loading;
      computeVisible();
      commit("filter", "visible");
    };

    const refresh = () => {
      computeVisible();
      commit("visible");
    };

    const restore = () => {
      if (restored) return;
      restored = true;
      const session = storage.readSession();
      const available = uiLangs();
      state.lang = session && available.indexOf(session.lang) >= 0 ? session.lang : detectLang();
      if (session) {
        if (typeof session.filter === "string") state.filterSource = session.filter;
        if (session.selected && graph.nodeById.has(session.selected)) {
          state.selectedId = session.selected;
        }
      }
      computeVisible();
      commit("lang", "filter", "visible", "selected");
    };

    return {
      applyFilter: setFilter,
      back,
      clearBookmarks: () => {
        storage.clearBookmarks();
        commit("bookmarks");
      },
      commit,
      count: () => graph.count(),
      forward,
      get: (key) => state[key],
      history: () => ({ index: state.hIndex, items: state.history.slice() }),
      isBookmarked: (id) => storage.bookmarks.has(id),
      nextTargets: (node) => graph.nextTargets(node),
      persist,
      positionOf: (id) => storage.positionOf(id),
      refresh,
      rememberPosition: (id, fraction) => storage.rememberPosition(id, fraction),
      restore,
      selected,
      select,
      setLang: (lang) => {
        if (!lang || lang === state.lang || uiLangs().indexOf(lang) < 0) return false;
        state.lang = lang;
        commit("lang");
        return true;
      },
      setLayout: (layout) => {
        if (!layout || layout === state.layout) return;
        state.layout = layout;
        commit("layout");
      },
      setOutlineChapter: (value) => {
        state.outlineChapter = value;
        commit("outline");
      },
      setQuery: (value) => {
        state.query = value;
      },
      setRailTab: (tab) => {
        if (tab === state.railTab) return;
        state.railTab = tab;
        commit("railTab");
      },
      setSettingsType: (type) => {
        state.settingsType = type;
        commit("settingsType");
      },
      state,
      textLang: () => {
        if (meta.langs.indexOf(state.lang) >= 0) return state.lang;
        if (meta.langs.indexOf(meta.defaultLang) >= 0) return meta.defaultLang;
        return meta.langs[0] || meta.defaultLang || "";
      },
      subscribe: (keys, fn) => {
        const listener = { keys: new Set(keys), fn };
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      toggleBookmark: (id) => {
        if (!id) return false;
        const on = storage.toggleBookmark(id);
        commit("bookmarks");
        return on;
      },
    };
  });
})();
