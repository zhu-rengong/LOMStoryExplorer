(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const G = SR.core.G;
  const nodeById = SR.data.nodeById;
  const renderRail = SR.fwd("rail", "renderRail");
  const state = SR.core.state;
  const t = SR.i18n.t;
  const toast = SR.core.toast;

  const STORE_KEY = "legend-of-mortal.story-graph.v1";

  const PROGRESS_KEY = "legend-of-mortal.story-reader.progress.v1";

  const BOOKMARK_KEY = "legend-of-mortal.story-reader.bookmarks.v1";

  const bookmarkSet = new Set();

  const positionMap = new Map();

  let positionSaveTimer = null;

  const POSITION_LIMIT = 500;

  const persist = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lang: state.lang,
        selected: state.selected ? state.selected.id : null,
        chapters: Array.from(state.chapterFilter),
        filter: state.filterSource,
      }));
    } catch {
      return;
    }
  };

  const loadSavedSets = () => {
    try {
      const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (progress && progress.pos && typeof progress.pos === "object") {
        for (const id of Object.keys(progress.pos)) {
          const value = progress.pos[id];
          if (nodeById.has(id) && typeof value === "number" && value >= 0 && value <= 1) {
            positionMap.set(id, value);
          }
        }
      }
    } catch {
      positionMap.clear();
    }
    try {
      const marks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "null");
      if (marks && Array.isArray(marks.ids)) {
        for (const id of marks.ids) if (nodeById.has(id)) bookmarkSet.add(id);
      }
    } catch {
      bookmarkSet.clear();
    }
  };

  const writeProgress = () => {
    try {
      const pos = {};
      for (const id of Array.from(positionMap.keys()).slice(-POSITION_LIMIT)) {
        pos[id] = Math.round(positionMap.get(id) * 1000) / 1000;
      }
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ pos: pos }));
    } catch {
      return;
    }
  };

  const rememberPosition = (id, fraction) => {
    if (!id || typeof fraction !== "number" || !isFinite(fraction)) return;
    positionMap.set(id, Math.max(0, Math.min(1, fraction)));
    clearTimeout(positionSaveTimer);
    positionSaveTimer = setTimeout(writeProgress, 300);
  };

  const positionOf = (id) => (positionMap.has(id) ? positionMap.get(id) : 0);

  const saveBookmarks = () => {
    try {
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify({ ids: Array.from(bookmarkSet) }));
    } catch {
      return;
    }
  };

  const syncBookmarkBtn = () => {
    const on = !!(state.selected && bookmarkSet.has(state.selected.id));
    for (const id of ["bookmarkBtn", "footBookmark"]) {
      const btn = $(id);
      if (!btn) continue;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.title = on ? t("bookmarkRemove") : t("bookmarkAdd");
    }
  };

  const toggleBookmark = (id) => {
    if (!id) return;
    if (bookmarkSet.has(id)) {
      bookmarkSet.delete(id);
      toast(t("bookmarkRemoved"));
    } else {
      bookmarkSet.add(id);
      toast(t("bookmarkAdded"));
    }
    saveBookmarks();
    syncBookmarkBtn();
    if (state.railTab === "bookmarks") renderRail();
  };

  const restoreState = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.lang && (G.meta.langs || []).indexOf(saved.lang) >= 0) state.lang = saved.lang;
      if (Array.isArray(saved.chapters)) state.chapterFilter = new Set(saved.chapters);
      if (typeof saved.filter === "string") state.filterSource = saved.filter;
      if (saved.selected && SR.data.nodeById.has(saved.selected)) state.lastSelected = saved.selected;
    } catch {
      return;
    }
  };

  SR.register("store", {
    BOOKMARK_KEY: BOOKMARK_KEY,
    PROGRESS_KEY: PROGRESS_KEY,
    STORE_KEY: STORE_KEY,
    bookmarkSet: bookmarkSet,
    loadSavedSets: loadSavedSets,
    persist: persist,
    positionOf: positionOf,
    rememberPosition: rememberPosition,
    restoreState: restoreState,
    saveBookmarks: saveBookmarks,
    syncBookmarkBtn: syncBookmarkBtn,
    toggleBookmark: toggleBookmark,
    writeProgress: writeProgress,
  });
})();
