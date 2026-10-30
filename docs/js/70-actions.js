(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const applyFilters = SR.rail.applyFilters;
  const chapterOf = SR.data.chapterOf;
  const chapterTitle = SR.i18n.chapterTitle;
  const clearChapterFilter = SR.rail.clearChapterFilter;
  const computeVisibility = SR.data.computeVisibility;
  const edgeLabelOf = SR.reader.edgeLabelOf;
  const el = SR.core.el;
  const ensureLang = SR.text.ensureLang;
  const inAdj = SR.data.inAdj;
  const navBtn = SR.core.navBtn;
  const navMenu = SR.core.navMenu;
  const nextTargets = SR.reader.nextTargets;
  const overlay = SR.overlay;
  const nodeById = SR.data.nodeById;
  const nodes = SR.data.nodes;
  const outAdj = SR.data.outAdj;
  const persist = SR.store.persist;
  const renderReader = SR.reader.renderReader;
  const setLang = SR.fwd("boot", "setLang");
  const setOnlyChapter = SR.rail.setOnlyChapter;
  const state = SR.core.state;
  const stripRich = SR.reader.stripRich;
  const t = SR.i18n.t;
  const toast = SR.core.toast;
  const toggleBookmark = SR.store.toggleBookmark;
  const visible = SR.data.visible;

  const updateHistoryButtons = () => {
    const backBtn = $("backBtn");
    const forwardBtn = $("forwardBtn");
    if (backBtn) backBtn.disabled = state.hIndex <= 0;
    if (forwardBtn) forwardBtn.disabled = state.hIndex >= state.history.length - 1;
  };

  const updateHash = (id) => {
    if (!window.history || !history.replaceState) return;
    const target = `#/${id}`;
    if (location.hash !== target) history.replaceState(null, "", target);
  };

  const renderNavMenu = () => {
    if (!navMenu || !navBtn) return;
    const node = state.selected;
    navBtn.disabled = !node;
    navMenu.replaceChildren();
    if (!node) return;

    const list = el("div", "menu-list popover-list");

    const addGroup = (titleKey, edges, pick) => {
      list.appendChild(el("div", "menu-head", t(titleKey, { n: edges.length })));
      if (!edges.length) {
        list.appendChild(el("div", "menu-empty popover-empty", t("navEmpty")));
        return;
      }
      edges.forEach((edge) => {
        const target = pick(edge);
        if (!target) return;
        const item = el("button", "nav-item row");
        item.setAttribute("role", "menuitem");
        item.appendChild(el("span", "nav-id", target.id));
        const label = stripRich(edgeLabelOf(edge));
        if (label) item.appendChild(el("span", "nav-label", label));
        if (edge.kind === 1) item.appendChild(el("span", "nav-badge badge badge-cool", t("navInferred")));
        else if (edge.kind === 2) item.appendChild(el("span", "nav-badge badge badge-accent", t("navTemp")));
        else if (edge.kind === 3) item.appendChild(el("span", "nav-badge badge badge-cool", t("navPosition")));
        item.addEventListener("click", () => {
          closeNav();
          navigateTo(target.id);
        });
        list.appendChild(item);
      });
    };

    addGroup("navOut", outAdj[node.i], (edge) => nodes[edge.b]);
    list.appendChild(el("div", "menu-sep"));
    addGroup("navIn", inAdj[node.i], (edge) => nodes[edge.a]);

    navMenu.appendChild(list);
    navMenu.appendChild(el("div", "menu-sep"));

    const only = el("button", "menu-item row", t("navOnlyChapter"));
    only.addEventListener("click", () => {
      closeNav();
      if (state.chapterFilter.size === 1 && state.chapterFilter.has(node.ch)) clearChapterFilter();
      else setOnlyChapter(node.ch);
    });
    const clear = el("button", "menu-item row", t("navClearFilter"));
    clear.addEventListener("click", () => {
      closeNav();
      clearChapterFilter();
    });
    navMenu.appendChild(only);
    navMenu.appendChild(clear);
  };

  const hideNav = () => {
    if (!navMenu || !navBtn) return;
    navMenu.hidden = true;
    navMenu.classList.remove("is-floating");
    navMenu.style.left = "";
    navMenu.style.top = "";
    navMenu.style.width = "";
    navBtn.setAttribute("aria-expanded", "false");
  };

  const openNav = () => {
    if (!navMenu || !navBtn || !state.selected) return;
    renderNavMenu();
    navMenu.classList.add("is-floating");
    navBtn.setAttribute("aria-expanded", "true");
    overlay.open("navMenu", { trigger: navBtn });
  };

  const positionNavMenu = () => {
    overlay.reposition("navMenu");
  };

  const closeNav = () => {
    if (!overlay.close("navMenu")) hideNav();
  };

  const toggleNav = () => {
    if (!navMenu) return;
    if (navMenu.hidden) openNav();
    else closeNav();
  };

  const ensureSelectedVisible = (node) => {
    if (visible[node.i]) return;
    state.chapterFilter.add(node.ch);
    applyFilters();
    toast(t("chapterAutoAdded", { name: chapterTitle(chapterOf(node)) }));
  };

  const select = (node, options) => {
    options = options || {};
    if (!node) return;
    state.selected = node;
    computeVisibility();

    if (options.history !== false) {
      state.history = state.history.slice(0, state.hIndex + 1);
      if (state.history[state.history.length - 1] !== node.id) state.history.push(node.id);
      state.hIndex = state.history.length - 1;
    }
    updateHistoryButtons();

    ensureSelectedVisible(node);
    renderNavMenu();
    ensureLang(state.lang).then(() => {
      renderReader(node);
    });
    updateHash(node.id);
    persist();
  };

  const navigateTo = (id) => {
    const node = nodeById.get(id);
    if (!node) {
      toast(t("statusNotFound", { id: id }));
      return;
    }
    select(node, { history: true, animate: true });
  };

  const back = () => {
    if (state.hIndex <= 0) return;
    state.hIndex--;
    const node = nodeById.get(state.history[state.hIndex]);
    if (node) select(node, { history: false, animate: true });
    updateHistoryButtons();
  };

  const forward = () => {
    if (state.hIndex >= state.history.length - 1) return;
    state.hIndex++;
    const node = nodeById.get(state.history[state.hIndex]);
    if (node) select(node, { history: false, animate: true });
    updateHistoryButtons();
  };

  const stepPrev = () => {
    if (state.hIndex > 0) {
      back();
      return null;
    }
    const node = state.selected;
    if (!node) return null;
    let prev = null;
    for (const candidate of nodes) {
      if (candidate.ch !== node.ch || candidate.id >= node.id) continue;
      if (!prev || candidate.id > prev.id) prev = candidate;
    }
    if (!prev) return null;
    select(prev, { history: true, animate: true });
    return prev;
  };

  const toggleSelectedBookmark = () => {
    if (!state.selected) return null;
    const id = state.selected.id;
    toggleBookmark(id);
    return id;
  };

  const readHash = () => {
    const match = /^#\/(.+)$/.exec(location.hash || "");
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  };

  const hideMore = () => {
    const menu = $("moreMenu");
    const btn = $("moreBtn");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  };

  const closeMore = () => {
    if (!overlay.close("moreMenu")) hideMore();
  };

  const renderMoreMenu = () => {
    const menu = $("moreMenu");
    if (!menu) return;
    menu.replaceChildren();

    menu.appendChild(el("div", "menu-head", t("moreLang")));
    const langBtn = el("button", "menu-item row", state.lang === "zh-tw" ? "简体中文" : "繁體中文");
    langBtn.type = "button";
    langBtn.addEventListener("click", () => {
      closeMore();
      setLang(state.lang === "zh-tw" ? "zh-cn" : "zh-tw");
    });
    menu.appendChild(langBtn);

    menu.appendChild(el("div", "menu-sep"));
    const statsRow = el("button", "menu-item row", t("statsBtn"));
    statsRow.type = "button";
    statsRow.addEventListener("click", () => {
      closeMore();
      SR.fwd("stats", "open")($("statsBtn"));
    });
    const helpRow = el("button", "menu-item row", t("helpTitle"));
    helpRow.type = "button";
    helpRow.addEventListener("click", () => {
      closeMore();
      SR.fwd("extras", "toggleHelp")();
    });
    menu.appendChild(statsRow);
    menu.appendChild(helpRow);

    const targets = state.nextTargets || (state.selected ? nextTargets(state.selected) : []);
    if (targets.length) {
      menu.appendChild(el("div", "menu-sep"));
      menu.appendChild(el("div", "menu-head", t("recentChoices")));
      targets.slice(0, 6).forEach((item) => {
        const row = el("button", "nav-item row");
        row.type = "button";
        row.appendChild(el("span", "nav-id", item.node.id));
        row.appendChild(el("span", "nav-label",
          stripRich(edgeLabelOf(item.edge)) || chapterTitle(chapterOf(item.node))));
        row.addEventListener("click", () => {
          closeMore();
          navigateTo(item.node.id);
        });
        menu.appendChild(row);
      });
    }
  };

  const openMore = () => {
    const btn = $("moreBtn");
    if (!btn) return;
    renderMoreMenu();
    btn.setAttribute("aria-expanded", "true");
    overlay.open("moreMenu", { trigger: btn });
  };

  const initMoreMenu = () => {
    const btn = $("moreBtn");
    const menu = $("moreMenu");
    if (!btn || !menu) return;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu.hidden) {
        closeMore();
        return;
      }
      openMore();
    });
    document.addEventListener("click", (event) => {
      if (menu.hidden) return;
      if (menu.contains(event.target) || btn.contains(event.target)) return;
      closeMore();
    });
  };

  const hideReaderMore = () => {
    const menu = $("readerMore");
    const btn = $("readerMoreBtn");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  };

  const closeReaderMore = () => {
    if (!overlay.close("readerMore")) hideReaderMore();
  };

  const initReaderMore = () => {
    const btn = $("readerMoreBtn");
    const menu = $("readerMore");
    if (!btn || !menu) return;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu.hidden) {
        closeReaderMore();
        return;
      }
      btn.setAttribute("aria-expanded", "true");
      overlay.open("readerMore", { trigger: btn });
    });
    document.addEventListener("click", (event) => {
      if (menu.hidden) return;
      if (menu.contains(event.target) || btn.contains(event.target)) return;
      closeReaderMore();
    });
  };

  overlay.register("navMenu", {
    id: "navMenu",
    triggerId: "navBtn",
    group: "menu",
    hide: hideNav,
    placement: { align: "end", width: 340, fit: true },
  });
  overlay.register("moreMenu", {
    id: "moreMenu",
    triggerId: "moreBtn",
    group: "menu",
    hide: hideMore,
    placement: { align: "end", width: 268, fit: true },
  });
  overlay.register("readerMore", {
    id: "readerMore",
    triggerId: "readerMoreBtn",
    group: "menu",
    hide: hideReaderMore,
    placement: { align: "end", width: 212, fit: true },
  });

  SR.register("actions", {
    back: back,
    closeMore: closeMore,
    closeNav: closeNav,
    closeReaderMore: closeReaderMore,
    ensureSelectedVisible: ensureSelectedVisible,
    forward: forward,
    initMoreMenu: initMoreMenu,
    initReaderMore: initReaderMore,
    navigateTo: navigateTo,
    openMore: openMore,
    openNav: openNav,
    positionNavMenu: positionNavMenu,
    readHash: readHash,
    renderMoreMenu: renderMoreMenu,
    renderNavMenu: renderNavMenu,
    select: select,
    stepPrev: stepPrev,
    toggleNav: toggleNav,
    toggleSelectedBookmark: toggleSelectedBookmark,
    updateHash: updateHash,
    updateHistoryButtons: updateHistoryButtons,
  });
})();
