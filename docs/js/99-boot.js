(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const FACETS = SR.data.FACETS;
  const applyFilterSource = SR.filter.applyFilterSource;
  const applyFilters = SR.rail.applyFilters;
  const applyI18n = SR.i18n.applyI18n;
  const applyLayout = SR.viewport.applyLayout;
  const back = SR.actions.back;
  const bindSettings = SR.settings.bindSettings;
  const bookmarkSet = SR.store.bookmarkSet;
  const clearFirstLineCache = SR.reader.clearFirstLineCache;
  const closeLookup = SR.panels.closeLookup;
  const closeOutline = SR.panels.closeOutline;
  const closeNav = SR.actions.closeNav;
  const closeRail = SR.viewport.closeRail;
  const computeVisibility = SR.data.computeVisibility;
  const ensureFacetSets = SR.panels.ensureFacetSets;
  const ensureLang = SR.text.ensureLang;
  const forward = SR.actions.forward;
  const hideBranchPreview = SR.panels.hideBranchPreview;
  const initFilterUi = SR.filter.initFilterUi;
  const initMoreMenu = SR.actions.initMoreMenu;
  const initReaderMore = SR.actions.initReaderMore;
  const loadSavedSets = SR.store.loadSavedSets;
  const lookup = SR.panels.lookup;
  const navBtn = SR.core.navBtn;
  const navMenu = SR.core.navMenu;
  const nodeById = SR.data.nodeById;
  const nodes = SR.data.nodes;
  const onSearchInput = SR.search.onSearchInput;
  const persist = SR.store.persist;
  const railScrim = SR.core.railScrim;
  const readHash = SR.actions.readHash;
  const readerBody = SR.core.readerBody;
  const rememberPosition = SR.store.rememberPosition;
  const renderNavMenu = SR.actions.renderNavMenu;
  const renderRail = SR.rail.renderRail;
  const renderReader = SR.reader.renderReader;
  const resetAllText = SR.text.resetAllText;
  const resetNameIndex = SR.panels.resetNameIndex;
  const restoreState = SR.store.restoreState;
  const runSearch = SR.search.runSearch;
  const scrollFraction = SR.reader.scrollFraction;
  const searchInput = SR.core.searchInput;
  const select = SR.actions.select;
  const setRailTab = SR.rail.setRailTab;
  const state = SR.core.state;
  const stepNext = SR.reader.stepNext;
  const syncBookmarkBtn = SR.store.syncBookmarkBtn;
  const syncQueryNames = SR.filter.syncQueryNames;
  const t = SR.i18n.t;
  const toTopBtn = SR.core.toTopBtn;
  const toast = SR.core.toast;
  const toggleBookmark = SR.store.toggleBookmark;
  const toggleNav = SR.actions.toggleNav;
  const toggleOutlinePanel = SR.panels.toggleOutlinePanel;
  const toggleRail = SR.viewport.toggleRail;
  const updateFilterUi = SR.filter.updateFilterUi;
  const updateRailCount = SR.rail.updateRailCount;
  const updateToTop = SR.reader.updateToTop;

  const setLang = (lang) => {
    if (!lang || lang === state.lang) return;
    ensureLang(lang).then(() => {
      state.lang = lang;
      state.searchIndex = null;
      resetAllText();
      resetNameIndex();
      state.texts = window.__STORY_TEXT__ || state.texts;
      clearFirstLineCache();
      document.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.classList.toggle("is-on", btn.dataset.lang === lang);
      });
      applyI18n();
      renderRail();
      renderNavMenu();
      syncBookmarkBtn();
      if (SR.stats) SR.stats.refresh();
      if (state.selected) renderReader(state.selected);
      syncQueryNames();
      if (state.filterSource.trim()) applyFilterSource(state.filterSource);
      else updateFilterUi();
      persist();
    });
  };

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
    });
  });

  const railReset = $("railReset");
  if (railReset) {
    railReset.addEventListener("click", () => {
      state.chapterFilter.clear();
      document.querySelectorAll(".chip").forEach((chip) => {
        chip.classList.remove("is-on");
      });
      updateRailCount();
      applyFilters();
    });
  }

  const bindShell = () => {
    const railToggle = $("railToggle");
    if (railToggle) railToggle.addEventListener("click", toggleRail);
    const railClose = $("railClose");
    if (railClose) railClose.addEventListener("click", closeRail);
    if (railScrim) railScrim.addEventListener("click", closeRail);

    const railSearch = $("railSearch");
    if (railSearch) railSearch.addEventListener("input", renderRail);

    document.querySelectorAll(".rail-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        setRailTab(tab.dataset.rail);
      });
    });

    const prevBtn = $("prevBtn");
    if (prevBtn) prevBtn.addEventListener("click", back);
    const nextBtn = $("nextBtn");
    if (nextBtn) {
      nextBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        stepNext();
      });
    }
    document.addEventListener("click", (event) => {
      const menu = $("nextMenu");
      if (!menu || menu.hidden) return;
      if (menu.contains(event.target) || (nextBtn && nextBtn.contains(event.target))) return;
      menu.hidden = true;
    });

    const bookmarkBtn = $("bookmarkBtn");
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener("click", () => {
        if (state.selected) toggleBookmark(state.selected.id);
      });
    }

    const footBookmark = $("footBookmark");
    if (footBookmark) {
      footBookmark.addEventListener("click", () => {
        if (state.selected) toggleBookmark(state.selected.id);
      });
    }

    const outlineBtn = $("outlineBtn");
    if (outlineBtn) outlineBtn.addEventListener("click", toggleOutlinePanel);
    const outlineClose = $("outlineClose");
    if (outlineClose) outlineClose.addEventListener("click", closeOutline);

    const lookupClose = $("lookupClose");
    if (lookupClose) lookupClose.addEventListener("click", closeLookup);

    document.addEventListener("click", hideBranchPreview, true);
    if (readerBody) readerBody.addEventListener("scroll", hideBranchPreview, { passive: true });

    document.addEventListener("click", (event) => {
      const panel = $("lookupPanel");
      if (!panel || panel.hidden) return;
      if (panel.contains(event.target)) return;
      if (lookup.trigger && lookup.trigger.contains && lookup.trigger.contains(event.target)) return;
      closeLookup();
    });

    if (navBtn) {
      navBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleNav();
      });
      document.addEventListener("click", (event) => {
        if (!navMenu || navMenu.hidden) return;
        if (navMenu.contains(event.target) || navBtn.contains(event.target)) return;
        closeNav();
      });
    }

    if (toTopBtn) {
      toTopBtn.addEventListener("click", () => {
        readerBody.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    if (readerBody) {
      readerBody.addEventListener("scroll", () => {
        if (state.readingNode) {
          state.scrollMemory.set(state.readingNode, readerBody.scrollTop);
          rememberPosition(state.readingNode, scrollFraction());
        }
        updateToTop();
      }, { passive: true });
    }
  };

  bindShell();

  const backBtn = $("backBtn");
  if (backBtn) backBtn.addEventListener("click", back);
  const forwardBtn = $("forwardBtn");
  if (forwardBtn) forwardBtn.addEventListener("click", forward);
  const copyBtn = $("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!state.selected) return;
      const id = state.selected.id;
      const done = () => {
        toast(t("toastCopied", { id: id }));
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(id).then(done, () => {
          toast(id);
        });
      } else {
        done();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", onSearchInput);
    searchInput.addEventListener("focus", () => {
      if (state.query) runSearch();
    });
  }

  const boot = () => {
    restoreState();
    document.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.lang === state.lang);
    });

    const entry = nodes.reduce((best, node) => (node.inc > (best ? best.inc : -1) ? node : best), null);
    state.entryId = entry ? entry.id : null;

    loadSavedSets();
    ensureFacetSets();
    applyLayout(true);
    bindSettings();
    initMoreMenu();
    initReaderMore();
    if (SR.extras) SR.extras.init();
    if (SR.stats) SR.stats.init();
    initFilterUi();
    renderRail();
    computeVisibility();
    applyI18n();
    syncBookmarkBtn();

    const hashId = readHash();
    const start = (hashId && nodeById.get(hashId))
      || (state.lastSelected ? nodeById.get(state.lastSelected) : null);
    if (start) {
      select(start, { history: false, center: false });
    }

    ensureLang(state.lang).then(() => {
      state.searchIndex = null;
      resetAllText();
      resetNameIndex();
      state.texts = window.__STORY_TEXT__ || state.texts;
      clearFirstLineCache();
      if (state.selected) renderReader(state.selected);
      syncQueryNames();
      if (state.filterSource.trim()) applyFilterSource(state.filterSource);
      else updateFilterUi();
    });
  };

  window.__storyReaderDebug = () => ({
    lang: state.lang,
    layout: state.layout,
    selected: state.selected ? state.selected.id : null,
    visible: state.visibleCount,
    hash: location.hash,
    settingsType: state.settingsType,
    fontCount: window.StorySettings ? window.StorySettings.families().length : 0,
    settings: window.StorySettings ? window.StorySettings.get() : null,
    filter: {
      source: state.filterSource,
      error: state.filterError,
      count: state.filterSet ? state.filterSet.size : null,
      facetCount: FACETS ? FACETS.length : 0,
    },
    text: window.StoryText
      ? window.StoryText.progress(state.lang)
      : { head: "legacy", loaded: 0, total: 0, done: true },
    bookmarks: bookmarkSet.size,
    railTab: state.railTab,
    outlineOpen: (() => {
      const panel = $("outlinePanel");
      return panel ? !panel.hidden : false;
    })(),
    next: (state.nextTargets || []).map((item) => item.node.id),
  });

  window.addEventListener("load", boot);

  SR.register("boot", {
    boot: boot,
    setLang: setLang,
  });
})();
