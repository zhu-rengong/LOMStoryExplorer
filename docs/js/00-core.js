window.SR = window.SR || {};

SR.register = (name, api) => {
  SR[name] = api;
  return api;
};

SR.fwd = (mod, name) => (...args) => {
  const api = SR[mod];
  if (!api || typeof api[name] !== "function") {
    throw new Error(`SR.${mod}.${name} is not ready: module load order is broken`);
  }
  return api[name](...args);
};

SR.events = (() => {
  const map = Object.create(null);
  return {
    on: (name, fn) => {
      (map[name] || (map[name] = [])).push(fn);
    },
    emit: (name, payload) => {
      const list = map[name];
      if (!list) return;
      for (const handler of list) {
        try {
          handler(payload);
        } catch (err) {
          continue;
        }
      }
    },
  };
})();

(() => {
  "use strict";
  const SR = window.SR;

  const G = window.__STORY_GRAPH__;
  if (!G) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">缺少 data/graph.js，請先執行 build.py。</p>';
    return;
  }

  const MOTION_OK = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const HOVER_OK = !(window.matchMedia && window.matchMedia("(hover: none)").matches);

  const state = {
    lang: G.meta.defaultLang,
    selected: null,
    chapterFilter: new Set(),
    history: [],
    hIndex: -1,
    query: "",
    texts: window.__STORY_TEXT__ || {},
    langLoaded: {},
    searchIndex: null,
    entryId: null,
    layout: "wide",
    searchActive: -1,
    readingNode: null,
    scrollMemory: new Map(),
    railTab: "chapters",
    settingsType: "dialog",
    filterSource: "",
    filterSet: null,
    filterError: null,
    visibleCount: 0,
  };

  const $ = (id) => document.getElementById(id);

  const readerBody = $("readerBody");
  const nodeTitle = $("nodeTitle");
  const readerPanel = $("reader");
  const searchInput = $("search");
  const searchResults = $("searchResults");
  const ioStatus = $("ioStatus");
  const railEl = $("chapterRail");
  const railScrim = $("railScrim");
  const settingsDrawer = $("settingsDrawer");
  const settingsScrim = $("settingsScrim");
  const toastEl = $("toast");
  const toTopBtn = $("toTopBtn");
  const navMenu = $("navMenu");
  const navBtn = $("navBtn");
  const picker = $("fontPicker");
  const pickerSearch = $("fontPickerSearch");
  const pickerList = $("fontPickerList");

  const progress = (text) => {
    if (!ioStatus) return;
    const next = text ? String(text) : "";
    if (next) ioStatus.textContent = next;
    ioStatus.hidden = !next;
    if (!next) ioStatus.textContent = "";
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let toastTimer = null;

  const toast = (text) => {
    if (!toastEl || !text) return;
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2400);
  };

  const activeOverlay = () => {
    const overlay = window.SR && window.SR.overlay;
    if (!overlay || !overlay.stack || !overlay.stack.length) return null;
    const top = overlay.defs[overlay.stack[overlay.stack.length - 1].key];
    if (!top || !top.id) return null;
    const node = $(top.id);
    return node && !node.hidden ? node : null;
  };

  const focusables = (root) => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(selector), (node) => node.offsetParent !== null);
  };

  const trapTab = (event) => {
    if (event.key !== "Tab") return;
    const root = activeOverlay();
    if (!root) return;
    const list = focusables(root);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  SR.register("core", {
    $: $,
    G: G,
    HOVER_OK: HOVER_OK,
    MOTION_OK: MOTION_OK,
    activeOverlay: activeOverlay,
    el: el,
    focusables: focusables,
    navBtn: navBtn,
    navMenu: navMenu,
    nodeTitle: nodeTitle,
    picker: picker,
    pickerList: pickerList,
    pickerSearch: pickerSearch,
    progress: progress,
    railEl: railEl,
    railScrim: railScrim,
    readerBody: readerBody,
    readerPanel: readerPanel,
    searchInput: searchInput,
    searchResults: searchResults,
    settingsDrawer: settingsDrawer,
    settingsScrim: settingsScrim,
    state: state,
    toTopBtn: toTopBtn,
    toast: toast,
    toastEl: toastEl,
    trapTab: trapTab,
  });
})();
