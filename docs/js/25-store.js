(() => {
  "use strict";

  const SR = window.SR;

  SR.define("store", ["schema", "graph", "storage"], ({ schema, graph, storage }) => {
    const meta = schema.meta;

    const state = {
      lang: meta.defaultLang,
      selectedId: "",
      history: [],
      hIndex: -1,
      chapterFilter: new Set(),
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
    const eventListeners = [];
    const pending = new Set();
    let restored = false;

    const emit = (type, payload) => {
      for (const listener of eventListeners.slice()) {
        try {
          listener({ type, payload });
        } catch {
          continue;
        }
      }
    };

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
        chapters: Array.from(state.chapterFilter),
        filter: state.filterSource,
      });
    };

    const commit = (...keys) => {
      for (const key of keys) pending.add(key);
      persist();
      notify();
    };

    const computeVisible = () => graph.computeVisibility(
      state.chapterFilter, state.filterSet, state.selectedId);

    const selected = () => (state.selectedId ? graph.nodeById.get(state.selectedId) || null : null);

    const ensureVisible = (node) => {
      if (!node) return;
      const index = graph.indexById.get(node.id);
      if (graph.visible[index]) return;
      if (!state.chapterFilter.size) return;
      state.chapterFilter.add(node.chapter);
      pending.add("filter");
      emit("chapterAutoAdded", graph.chapterOf(node));
    };

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
      ensureVisible(node);
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

    const stepPrev = () => {
      if (state.hIndex > 0) return back();
      const node = selected();
      if (!node) return null;
      const previous = graph.prevInChapter(node);
      if (!previous) return null;
      select(previous.id, { history: true });
      return previous;
    };

    const toggleOnlyChapter = (index) => {
      if (state.chapterFilter.size === 1 && state.chapterFilter.has(index)) {
        state.chapterFilter.clear();
      } else {
        state.chapterFilter = new Set([index]);
      }
      computeVisible();
      commit("filter", "visible");
    };

    const clearChapters = () => {
      if (!state.chapterFilter.size) return;
      state.chapterFilter.clear();
      computeVisible();
      commit("filter", "visible");
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
      if (session) {
        if (meta.langs.indexOf(session.lang) >= 0) state.lang = session.lang;
        if (typeof session.filter === "string") state.filterSource = session.filter;
        const chapters = new Set();
        for (const value of session.chapters) {
          if (Number.isInteger(value) && value >= 0 && value < schema.chapters.length) {
            chapters.add(value);
          }
        }
        state.chapterFilter = chapters;
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
      clearChapters,
      commit,
      count: () => graph.count(),
      emit,
      forward,
      get: (key) => state[key],
      history: () => ({ index: state.hIndex, items: state.history.slice() }),
      isBookmarked: (id) => storage.bookmarks.has(id),
      nextTargets: (node) => graph.nextTargets(node),
      on: (fn) => {
        eventListeners.push(fn);
        return () => {
          const index = eventListeners.indexOf(fn);
          if (index >= 0) eventListeners.splice(index, 1);
        };
      },
      persist,
      positionOf: (id) => storage.positionOf(id),
      refresh,
      rememberPosition: (id, fraction) => storage.rememberPosition(id, fraction),
      restore,
      selected,
      select,
      setLang: (lang) => {
        if (!lang || lang === state.lang || meta.langs.indexOf(lang) < 0) return false;
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
      stepPrev,
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
      toggleOnlyChapter,
      visible: graph.visible,
    };
  });
})();
