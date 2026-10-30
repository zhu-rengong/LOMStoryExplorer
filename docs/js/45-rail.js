(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const bookmarkSet = SR.store.bookmarkSet;
  const chapterOf = SR.data.chapterOf;
  const chapterTitle = SR.i18n.chapterTitle;
  const chapters = SR.data.chapters;
  const computeVisibility = SR.data.computeVisibility;
  const el = SR.core.el;
  const navigateTo = SR.fwd("actions", "navigateTo");
  const nodeById = SR.data.nodeById;
  const nodes = SR.data.nodes;
  const persist = SR.store.persist;
  const saveBookmarks = SR.store.saveBookmarks;
  const state = SR.core.state;
  const syncBookmarkBtn = SR.store.syncBookmarkBtn;
  const t = SR.i18n.t;
  const toast = SR.core.toast;
  const toggleBookmark = SR.store.toggleBookmark;

  const ENTRY_KEYS = { combat: "entryCombat", free: "entryFree" };

  const RAIL_TABS = ["bookmarks", "outline"];

  let nodesByChapter = null;

  const updateRailCount = () => {
    const node = $("railCount");
    if (!node) return;
    const count = state.chapterFilter.size;
    node.textContent = count ? t("railSelected", { n: count }) : "";
  };

  const applyFilters = () => {
    computeVisibility();
    persist();
  };

  const railRow = (id, extras) => {
    const node = nodeById.get(id);
    const row = el("div", "rail-item");
    row.setAttribute("role", "option");
    row.tabIndex = 0;
    if (!node) {
      row.appendChild(el("span", "ri-id", id));
      return row;
    }
    if (state.selected && state.selected.id === id) row.classList.add("is-on");
    row.appendChild(el("span", "ri-id", id));
    if (node.entry && ENTRY_KEYS[node.entry]) {
      const mark = el("span", `ri-entry is-${node.entry}`);
      mark.title = t(ENTRY_KEYS[node.entry]);
      row.appendChild(mark);
    }
    row.appendChild(el("span", "ri-meta", extras || chapterTitle(chapterOf(node))));
    row.addEventListener("click", () => {
      navigateTo(id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateTo(id);
      }
    });
    return row;
  };

  const renderBookmarks = () => {
    const list = $("chapterList");
    if (!list) return;
    const frag = document.createDocumentFragment();
    const ids = Array.from(bookmarkSet);
    if (!ids.length) {
      frag.appendChild(el("p", "rail-empty", t("bookmarkEmpty")));
    } else {
      frag.appendChild(el("p", "rail-group", `${t("railTabBookmarks")} · ${ids.length}`));
      ids.forEach((id) => {
        const row = railRow(id);
        const del = el("button", "ri-del");
        del.type = "button";
        del.title = t("bookmarkRemove");
        del.innerHTML = '<svg><use href="#i-close"/></svg>';
        del.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleBookmark(id);
        });
        row.appendChild(del);
        frag.appendChild(row);
      });
      const clear = el("button", "link-btn", t("bookmarkClear"));
      clear.type = "button";
      clear.addEventListener("click", () => {
        bookmarkSet.clear();
        saveBookmarks();
        syncBookmarkBtn();
        renderRail();
        toast(t("bookmarkCleared"));
      });
      frag.appendChild(clear);
    }
    list.replaceChildren(frag);
    updateRailCount();
  };

  const chapterNodes = (index) => {
    if (!nodesByChapter) {
      nodesByChapter = chapters.map(() => []);
      nodes.forEach((node) => {
        if (nodesByChapter[node.ch]) nodesByChapter[node.ch].push(node);
      });
    }
    return nodesByChapter[index] || [];
  };

  const renderOutlineRail = () => {
    const list = $("chapterList");
    if (!list) return;
    const search = $("railSearch");
    const query = search ? search.value.trim().toLowerCase() : "";
    let open = state.outlineChapter;
    if (open === undefined) open = state.selected ? state.selected.ch : -1;
    const frag = document.createDocumentFragment();

    chapters.forEach((chapter, index) => {
      let members = chapterNodes(index);
      if (query) {
        const title = chapterTitle(chapter).toLowerCase();
        if (title.indexOf(query) < 0 && chapter.id.toLowerCase().indexOf(query) < 0) {
          members = members.filter((node) => node.id.toLowerCase().indexOf(query) >= 0);
        }
        if (!members.length) return;
      }

      const head = el("div", `rail-item rail-chap${index === open ? " is-open" : ""}`);
      head.setAttribute("role", "button");
      head.tabIndex = 0;
      head.appendChild(el("span", "ri-id", chapterTitle(chapter)));
      head.appendChild(el("span", "ri-meta", String(members.length)));
      head.appendChild(el("span", "rail-caret", "›"));
      head.addEventListener("click", () => {
        state.outlineChapter = state.outlineChapter === index ? -1 : index;
        renderOutlineRail();
      });
      head.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.outlineChapter = state.outlineChapter === index ? -1 : index;
          renderOutlineRail();
        }
      });
      frag.appendChild(head);

      if (index === open || query) {
        const body = el("div", "rail-body");
        members.slice(0, query ? 200 : members.length).forEach((node) => {
          const row = railRow(node.id, t("tagSay", { n: node.say }));
          row.classList.add("is-card");
          body.appendChild(row);
        });
        frag.appendChild(body);
      }
    });

    if (!frag.childNodes.length) frag.appendChild(el("p", "rail-empty", t("searchEmpty")));
    list.replaceChildren(frag);
    updateRailCount();
  };

  const syncRailSearch = () => {
    const box = $("railSearchBox");
    if (box) box.hidden = state.railTab === "bookmarks";
    document.querySelectorAll(".rail-tab").forEach((tab) => {
      const on = tab.dataset.rail === state.railTab;
      tab.classList.toggle("is-on", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
  };

  const renderRail = () => {
    if (state.railTab === "bookmarks") renderBookmarks();
    else renderOutlineRail();
    syncRailSearch();
  };

  const setRailTab = (tab) => {
    if (RAIL_TABS.indexOf(tab) < 0 || tab === state.railTab) return;
    state.railTab = tab;
    const search = $("railSearch");
    if (search) search.value = "";
    renderRail();
  };

  const setOnlyChapter = (index) => {
    state.chapterFilter = new Set([index]);
    updateRailCount();
    applyFilters();
    toast(t("chapterOnly", { name: chapterTitle(chapters[index]) }));
  };

  const clearChapterFilter = () => {
    if (!state.chapterFilter.size) return;
    state.chapterFilter.clear();
    updateRailCount();
    applyFilters();
  };

  SR.register("rail", {
    applyFilters: applyFilters,
    chapterNodes: chapterNodes,
    clearChapterFilter: clearChapterFilter,
    railRow: railRow,
    renderBookmarks: renderBookmarks,
    renderOutlineRail: renderOutlineRail,
    renderRail: renderRail,
    setOnlyChapter: setOnlyChapter,
    setRailTab: setRailTab,
    updateRailCount: updateRailCount,
  });
})();
