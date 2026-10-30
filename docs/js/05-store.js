(() => {
  "use strict";
  const SR = window.SR;
  const defaults = {
    status: "loading",
    lang: "zh-tw",
    selectedId: null,
    storyStatus: "idle",
    storyError: "",
    view: "chapters",
    search: { query: "", chapter: "", status: "idle", results: [], loaded: 0, total: 0 },
    settings: { theme: "system", font: "serif", fontSize: 19, lineHeight: 1.9, width: 720 },
    bookmarks: [],
    recents: [],
    progress: {},
    expanded: [],
    overlay: null,
    contextOpen: false,
    mobileView: "read",
  };
  const state = structuredClone(defaults);
  const listeners = new Set();
  const emit = (reason) => {
    for (const listener of listeners) listener(state, reason);
  };
  const persist = () => SR.storage?.schedule();
  const patch = (section, values, reason = section) => {
    Object.assign(state[section], values);
    emit(reason);
  };
  const actions = {
    hydrate(saved) {
      if (!saved) return;
      for (const key of ["bookmarks", "recents", "expanded"]) state[key] = saved[key] || [];
      state.progress = saved.progress || {};
      Object.assign(state.settings, saved.settings || {});
      state.lang = saved.lang || state.lang;
    },
    ready(language, languages) {
      state.status = "ready";
      if (!languages.includes(state.lang)) state.lang = language;
      emit("ready");
    },
    fail(message) {
      state.status = "error";
      state.storyError = message;
      emit("error");
    },
    select(id) {
      if (state.selectedId === id) return;
      state.selectedId = id;
      state.storyStatus = id ? "loading" : "idle";
      state.storyError = "";
      emit("select");
    },
    story(status, error = "") {
      state.storyStatus = status;
      state.storyError = error;
      emit("story");
    },
    invalidRoute(message) {
      state.selectedId = null;
      state.storyStatus = "error";
      state.storyError = message;
      emit("routeError");
    },
    language(lang) {
      if (state.lang === lang) return;
      state.lang = lang;
      state.storyStatus = state.selectedId ? "loading" : "idle";
      state.search = structuredClone(defaults.search);
      persist();
      emit("language");
    },
    view(view) {
      state.view = view;
      state.mobileView = "library";
      emit("view");
    },
    mobileView(view) {
      state.mobileView = view;
      if (view === "bookmarks") state.view = "bookmarks";
      if (view === "settings") state.overlay = "settings";
      emit("mobile");
    },
    search(values) {
      patch("search", values, "search");
    },
    settings(values) {
      Object.assign(state.settings, values);
      persist();
      emit("settings");
    },
    bookmark(id) {
      const index = state.bookmarks.indexOf(id);
      if (index >= 0) state.bookmarks.splice(index, 1);
      else if (id) state.bookmarks.unshift(id);
      persist();
      emit("bookmark");
    },
    record(id) {
      if (!id) return;
      state.recents = [{ id, at: Date.now() }, ...state.recents.filter((item) => item.id !== id)].slice(0, 60);
      persist();
      emit("recents");
    },
    progress(id, value) {
      if (!id) return;
      state.progress[id] = SR.core.clamp(value, 0, 1);
      persist();
    },
    chapter(id) {
      const index = state.expanded.indexOf(id);
      if (index >= 0) state.expanded.splice(index, 1);
      else state.expanded.push(id);
      persist();
      emit("chapters");
    },
    overlay(name) {
      state.overlay = name;
      if (!name && state.mobileView === "settings") state.mobileView = "read";
      emit("overlay");
    },
    context(open) {
      state.contextOpen = open;
      emit("context");
    },
  };
  SR.register("store", {
    state,
    actions,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit,
  });
})();
