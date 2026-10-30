(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const back = SR.fwd("actions", "back");
  const chapterOf = SR.data.chapterOf;
  const chapterTitle = SR.i18n.chapterTitle;
  const chooseLookup = SR.panels.chooseLookup;
  const computeVisibility = SR.data.computeVisibility;
  const el = SR.core.el;
  const ensureAllText = SR.text.ensureAllText;
  const forward = SR.fwd("actions", "forward");
  const hideBranchPreview = SR.panels.hideBranchPreview;
  const langPack = SR.text.langPack;
  const lookup = SR.panels.lookup;
  const moveLookup = SR.panels.moveLookup;
  const navigateTo = SR.fwd("actions", "navigateTo");
  const nodeById = SR.data.nodeById;
  const nodes = SR.data.nodes;
  const overlay = SR.overlay;
  const passesFilter = SR.data.passesFilter;
  const persist = SR.store.persist;
  const progress = SR.core.progress;
  const searchInput = SR.core.searchInput;
  const searchResults = SR.core.searchResults;
  const state = SR.core.state;
  const stripRich = SR.reader.stripRich;
  const t = SR.i18n.t;
  const textDone = SR.text.textDone;
  const updateFilterUi = SR.filter.updateFilterUi;
  const updateRailCount = SR.rail.updateRailCount;

  const ID_LIKE = /^[a-z]{1,8}[0-9_]*$/i;

  let searchTimer = null;

  const buildSearchIndex = () => {
    const pack = langPack(state.lang);
    const stories = pack.stories || {};
    const count = Object.keys(stories).length;
    if (state.searchIndex && state.searchIndex.lang === state.lang
        && state.searchIndex.count === count) {
      return state.searchIndex;
    }
    const entries = [];
    Object.keys(stories).forEach((id) => {
      const texts = [];
      const collect = (beats) => {
        for (const beat of beats) {
          if (beat[0] === "s") texts.push(stripRich(beat[2]));
          else if (beat[0] === "c") {
            for (const branch of beat[1]) {
              texts.push(stripRich(branch[0]));
              collect(branch[2] || []);
            }
          } else if (beat[0] === "br") collect(beat[2] || []);
        }
      };
      collect(stories[id]);
      entries.push({ id: id, text: texts.join("\n") });
    });
    state.searchIndex = { lang: state.lang, count: count, entries: entries };
    return state.searchIndex;
  };

  const runSearch = () => {
    const query = searchInput.value.trim();
    state.query = query;
    if (!query) {
      searchResults.hidden = true;
      return 0;
    }

    const lower = query.toLowerCase();
    const scoped = searchScopeActive();
    const hits = [];
    const byId = [];
    nodes.forEach((node) => {
      if (!passesFilter(node.i)) return;
      if (node.id.toLowerCase().indexOf(lower) >= 0) byId.push(node);
    });
    byId.sort((a, b) => b.say - a.say);
    byId.sort((a, b) => {
      const ea = a.id.toLowerCase() === lower ? 0 : 1;
      const eb = b.id.toLowerCase() === lower ? 0 : 1;
      return ea - eb;
    });
    byId.slice(0, 12).forEach((node) => {
      hits.push({ id: node.id, chapter: chapterOf(node), snippet: "" });
    });

    if (query.length >= 2) {
      const index = buildSearchIndex();
      const taken = new Set(hits.map((hit) => hit.id));
      for (let i = 0; i < index.entries.length && hits.length < 24; i++) {
        const entry = index.entries[i];
        if (taken.has(entry.id)) continue;
        const pos = entry.text.toLowerCase().indexOf(lower);
        if (pos < 0) continue;
        const node = nodeById.get(entry.id);
        if (!node || !passesFilter(node.i)) continue;
        hits.push({
          id: entry.id,
          chapter: chapterOf(node),
          snippet: entry.text.slice(Math.max(0, pos - 16), pos + 46),
        });
        taken.add(entry.id);
      }
    }

    const frag = document.createDocumentFragment();

    if (scoped) {
      const scopeRow = el("div", "drop-scope");
      scopeRow.appendChild(el("span", null, t("searchScoped")));
      const clearBtn = el("button", "btn-link", t("searchClearFilters"));
      clearBtn.type = "button";
      clearBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        clearAllFilters();
        runSearch();
      });
      scopeRow.appendChild(clearBtn);
      frag.appendChild(scopeRow);
    }

    if (hits.length === 0) {
      frag.appendChild(el("div", "drop-empty popover-empty", scoped ? t("searchNoHit") : t("searchEmpty")));
      if (scoped && query.length >= 2) {
        const outside = countOutsideHits(query);
        if (outside > 0) {
          const more = el("div", "drop-empty popover-empty");
          const moreBtn = el("button", "drop-more btn-link", t("searchOutside", { n: outside }));
          moreBtn.type = "button";
          moreBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            clearAllFilters();
            runSearch();
          });
          more.appendChild(moreBtn);
          frag.appendChild(more);
        }
      }
      state.searchHits = [];
      state.searchActive = 0;
      searchResults.replaceChildren(frag);
      showSearch();
      return 0;
    }

    state.searchHits = hits;
    state.searchActive = 0;

    hits.forEach((hit, index) => {
      const item = el("div", "drop-item row row-tall row-accent");
      item.dataset.id = hit.id;
      if (index === 0) item.classList.add("is-active");
      item.appendChild(el("span", "did", hit.id));
      item.appendChild(el("span", "dmeta", hit.chapter ? chapterTitle(hit.chapter) : ""));
      if (hit.snippet) {
        const snippet = el("span", "dtext");
        const marked = hit.snippet.replace(
          new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"),
          "<mark>$1</mark>",
        );
        snippet.innerHTML = marked;
        item.appendChild(snippet);
      }
      item.addEventListener("click", () => {
        hideSearch();
        navigateTo(hit.id);
      });
      frag.appendChild(item);
    });
    searchResults.replaceChildren(frag);
    showSearch();
    return hits.length;
  };

  const searchScopeActive = () => state.chapterFilter.size > 0 || !!state.filterSet;

  const countOutsideHits = (query) => {
    const lower = query.toLowerCase();
    const index = buildSearchIndex();
    let count = 0;
    for (const entry of index.entries) {
      if (entry.id.toLowerCase().indexOf(lower) >= 0
          || entry.text.toLowerCase().indexOf(lower) >= 0) {
        count++;
      }
    }
    return count;
  };

  const performSearch = () => {
    const query = searchInput.value.trim();
    const hits = runSearch();
    if (query.length < 2 || textDone()) return;
    if (ID_LIKE.test(query) && hits > 0) return;
    progress(t("searchLoadingText", { loaded: 0, total: 0 }));
    ensureAllText().then(() => {
      if (searchInput.value.trim() === query) runSearch();
    });
  };

  const onSearchInput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(performSearch, 160);
  };

  const clearAllFilters = () => {
    state.chapterFilter.clear();
    state.filterSource = "";
    state.filterSet = null;
    state.filterError = null;
    const input = $("filterExpr");
    if (input) input.value = "";
    updateRailCount();
    computeVisibility();
    updateFilterUi();
    persist();
  };

  const paintSearchActive = () => {
    const items = searchResults.querySelectorAll(".drop-item");
    items.forEach((item, index) => {
      item.classList.toggle("is-active", index === state.searchActive);
    });
    const active = items[state.searchActive];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  };

  const moveSearchActive = (delta) => {
    const hits = state.searchHits || [];
    if (!hits.length) return;
    state.searchActive = (state.searchActive + delta + hits.length) % hits.length;
    paintSearchActive();
  };

  const chooseSearchActive = () => {
    const hits = state.searchHits || [];
    const hit = hits[state.searchActive] || hits[0];
    if (!hit) return false;
    hideSearch();
    navigateTo(hit.id);
    return true;
  };

  const showSearch = () => {
    searchInput.setAttribute("aria-expanded", "true");
    overlay.open("searchResults", {
      trigger: searchInput,
      placement: { align: "start", gap: 8, matchWidth: true, fit: true },
    });
  };

  const hideSearchRaw = () => {
    searchResults.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
  };

  const hideSearch = () => {
    if (!overlay.close("searchResults")) hideSearchRaw();
  };

  const dismissTransient = () => {
    if (!searchResults.hidden) hideSearch();
    hideBranchPreview();
  };

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSearch();
      searchInput.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSearchActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSearchActive(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseSearchActive();
    }
  });
  document.addEventListener("click", (event) => {
    if (!searchResults.hidden && !searchResults.contains(event.target) && event.target !== searchInput) {
      hideSearch();
    }
  });

  document.addEventListener("keydown", (event) => {
    const tag = (event.target.tagName || "").toLowerCase();
    const isField = tag === "input" || tag === "textarea" || tag === "select";
    if (event.key === "Escape") {
      dismissTransient();
      return;
    }
    if (isField) return;
    if (lookup.open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveLookup(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveLookup(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        chooseLookup();
        return;
      }
    }
    if (event.key === "/") {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      back();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      forward();
    }
  });

  overlay.register("searchResults", {
    id: "searchResults",
    triggerId: "search",
    group: "menu",
    hide: hideSearchRaw,
    placement: { align: "start", gap: 8, matchWidth: true, fit: true },
  });

  SR.register("search", {
    ID_LIKE: ID_LIKE,
    buildSearchIndex: buildSearchIndex,
    chooseSearchActive: chooseSearchActive,
    clearAllFilters: clearAllFilters,
    countOutsideHits: countOutsideHits,
    hideSearch: hideSearch,
    moveSearchActive: moveSearchActive,
    onSearchInput: onSearchInput,
    paintSearchActive: paintSearchActive,
    performSearch: performSearch,
    runSearch: runSearch,
    searchScopeActive: searchScopeActive,
  });
})();
