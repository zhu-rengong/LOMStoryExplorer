(() => {
  "use strict";
  const SR = window.SR;
  const { dom } = SR.core;
  const state = SR.store.state;
  const storyButton = (id, detail = "") => {
    const node = SR.data.node(id);
    if (!node) return null;
    const chapter = SR.data.chapter(node.chapter);
    return dom.h("button", { class: `story-row${state.selectedId === id ? " is-active" : ""}`, type: "button", dataset: { story: id } },
      dom.h("span", { class: "story-row-mark", style: `--chapter-color:${chapter?.color || "var(--jade)"}` }),
      dom.h("span", { class: "story-row-copy" },
        dom.h("span", { class: "story-row-id", text: id }),
        dom.h("span", { class: "story-row-meta", text: detail || `${SR.i18n.chapterTitle(chapter)} · ${node.say}` })),
      dom.icon("chevron"));
  };
  const empty = (key) => dom.h("div", { class: "library-empty" }, dom.h("span", { class: "empty-glyph", text: "卷" }), dom.h("p", { text: SR.i18n.t(key) }));
  const renderChapters = (fragment) => {
    for (const chapter of SR.data.chapters) {
      const expanded = state.expanded.includes(chapter.id) || (state.selectedId && SR.data.chapter(SR.data.node(state.selectedId)?.chapter)?.id === chapter.id);
      const section = dom.h("section", { class: `chapter${expanded ? " is-expanded" : ""}` });
      const button = dom.h("button", { class: "chapter-heading", type: "button", dataset: { chapter: chapter.id }, "aria-expanded": expanded },
        dom.h("span", { class: "chapter-dot", style: `--chapter-color:${chapter.color}` }),
        dom.h("span", { class: "chapter-name", text: SR.i18n.chapterTitle(chapter) }),
        dom.h("span", { class: "chapter-count", text: chapter.count }),
        dom.icon("chevron"));
      section.append(button);
      if (expanded) {
        const list = dom.h("div", { class: "chapter-stories" });
        for (const node of SR.data.inChapter(chapter.id)) list.append(storyButton(node.id));
        section.append(list);
      }
      fragment.append(section);
    }
  };
  const render = () => {
    const root = dom.byId("libraryContent");
    if (!root || state.status !== "ready") return;
    const fragment = document.createDocumentFragment();
    if (state.view === "chapters") renderChapters(fragment);
    else {
      const ids = state.view === "bookmarks" ? state.bookmarks : state.recents.map((item) => item.id);
      if (!ids.length) fragment.append(empty(state.view === "bookmarks" ? "emptyBookmarks" : "emptyRecent"));
      else for (const id of ids) {
        const button = storyButton(id);
        if (button) fragment.append(button);
      }
    }
    dom.clear(root).append(fragment);
    const chapterSelect = dom.byId("searchChapter");
    for (const option of chapterSelect.options) {
      option.textContent = option.value ? SR.i18n.chapterTitle(SR.data.chapter(option.value)) : SR.i18n.t("allChapters");
    }
    for (const tab of dom.all("[data-library-view]")) {
      const active = tab.dataset.libraryView === state.view;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }
  };
  const renderSearch = () => {
    const panel = dom.byId("searchPanel");
    const root = dom.byId("searchResults");
    const status = dom.byId("searchStatus");
    const search = state.search;
    panel.hidden = !search.query && document.activeElement !== dom.byId("globalSearch");
    root.hidden = !search.results.length;
    status.textContent = search.status === "loading" ? `${SR.i18n.t("indexing")} ${search.loaded}/${search.total}` :
      search.status === "error" ? SR.i18n.t("dataError") : search.query && search.status === "done" ? `${search.results.length} ${SR.i18n.t("results")}` : "";
    dom.clear(root);
    const fragment = document.createDocumentFragment();
    for (const result of search.results.slice(0, 80)) {
      const node = SR.data.node(result.id);
      fragment.append(dom.h("button", { class: "search-result", type: "button", dataset: { story: result.id } },
        dom.h("span", { class: "search-result-top" },
          dom.h("strong", { text: result.id }),
          dom.h("span", { text: SR.i18n.chapterTitle(SR.data.chapter(node.chapter)) })),
        result.snippet ? dom.h("span", { class: "search-snippet", text: result.snippet }) : null));
    }
    if (search.status === "done" && search.query && !search.results.length) fragment.append(empty("emptySearch"));
    root.append(fragment);
    root.hidden = !search.query;
  };
  let runId = 0;
  const executeSearch = async () => {
    const query = dom.byId("globalSearch").value.trim();
    const chapter = dom.byId("searchChapter").value;
    const current = ++runId;
    if (!query) {
      SR.search.cancel();
      SR.store.actions.search({ query: "", results: [], status: "idle", loaded: 0, total: 0 });
      return;
    }
    SR.store.actions.search({ query, chapter, status: "loading", results: [], loaded: 0, total: 0 });
    try {
      const results = await SR.search.search(query, state.lang, chapter, (loaded, total) => {
        if (current === runId) SR.store.actions.search({ loaded, total });
      });
      if (current === runId) SR.store.actions.search({ results, status: "done" });
    } catch (error) {
      if (error.name !== "AbortError" && current === runId) SR.store.actions.search({ status: "error", results: [] });
    }
  };
  const delayedSearch = SR.core.debounce(executeSearch, 320);
  const init = () => {
    const select = dom.byId("searchChapter");
    select.append(dom.h("option", { value: "", text: SR.i18n.t("allChapters") }));
    for (const chapter of SR.data.chapters) select.append(dom.h("option", { value: chapter.id, text: SR.i18n.chapterTitle(chapter) }));
    dom.byId("globalSearch").addEventListener("input", delayedSearch);
    dom.byId("globalSearch").addEventListener("focus", () => {
      dom.byId("searchPanel").hidden = false;
    });
    dom.byId("searchChapter").addEventListener("change", executeSearch);
    dom.byId("searchForm").addEventListener("submit", (event) => {
      event.preventDefault();
      executeSearch();
    });
    document.addEventListener("click", (event) => {
      const story = event.target.closest("[data-story]");
      if (story) {
        SR.router.go(story.dataset.story);
        dom.byId("searchPanel").hidden = true;
        dom.byId("globalSearch").blur();
        if (matchMedia("(max-width: 760px)").matches) SR.store.actions.mobileView("read");
        return;
      }
      const chapter = event.target.closest("[data-chapter]");
      if (chapter) SR.store.actions.chapter(chapter.dataset.chapter);
      const view = event.target.closest("[data-library-view]");
      if (view) SR.store.actions.view(view.dataset.libraryView);
      if (!event.target.closest(".search-command")) dom.byId("searchPanel").hidden = true;
    });
  };
  SR.register("library", { init, render, renderSearch });
})();
