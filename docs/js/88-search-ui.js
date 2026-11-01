(() => {
  "use strict";

  const SR = window.SR;

  SR.define("searchUi", ["store", "graph", "i18n", "text", "search", "overlay", "ui", "reader"],
    ({ store, graph, i18n, text, search, overlay, ui, reader }) => {
      const $ = ui.$;

      const PAGE = 50;
      const SCROLL_GAP = 96;

      let hits = [];
      let total = 0;
      let outside = 0;
      let rendered = 0;
      let active = 0;
      let lastQuery = "";
      let warming = null;
      let warmingLang = "";
      let statusCount = null;
      let statusNote = null;
      let outsideRow = null;
      let outsideBtn = null;
      let message = null;

      const scoped = () => !!store.state.filterSet;

      const markSnippet = (snippet, query) => {
        const node = ui.el("span", "dtext");
        const lower = snippet.toLowerCase();
        const needle = query.toLowerCase();
        const position = needle ? lower.indexOf(needle) : -1;
        if (position < 0 || !needle) {
          node.textContent = snippet;
          return node;
        }
        node.appendChild(document.createTextNode(snippet.slice(0, position)));
        node.appendChild(ui.el("mark", null, snippet.slice(position, position + needle.length)));
        node.appendChild(document.createTextNode(snippet.slice(position + needle.length)));
        return node;
      };

      const hide = () => {
        if (!overlay.close("searchResults")) {
          const box = $("searchResults");
          if (box) box.hidden = true;
          ui.setExpanded($("search"), false);
        }
      };

      const show = () => {
        const input = $("search");
        overlay.open("searchResults", {
          trigger: input,
          placement: { align: "start", gap: 8, matchWidth: true, fit: true },
        });
        ui.setExpanded(input, true);
      };

      const loadingText = () => {
        const progress = text.progress(store.textLang());
        if (progress.done) return "";
        return i18n.t("searchLoadingText", { loaded: progress.loaded, total: progress.total });
      };

      const noteText = () => {
        const loading = loadingText();
        if (loading) return loading;
        return scoped() ? i18n.t("searchScoped") : "";
      };

      const messageText = (query) => {
        if (query.length < 2) return i18n.t("searchTooShort");
        if (hits.length) return "";
        if (!text.progress(store.textLang()).done) return "";
        return i18n.t(scoped() ? "searchNoHit" : "searchEmpty");
      };

      const clearFilter = (event) => {
        event.stopPropagation();
        store.applyFilter({ source: "", set: null, error: "", loading: false });
        run();
      };

      const updateStatus = (query) => {
        if (statusCount) statusCount.textContent = i18n.t("searchCount", { n: hits.length });
        if (statusNote) {
          const note = noteText();
          statusNote.textContent = note;
          statusNote.hidden = !note;
        }
        if (outsideRow) {
          outsideRow.hidden = outside <= 0;
          if (outsideBtn && outside > 0) {
            outsideBtn.textContent = i18n.t("searchOutside", { n: outside });
          }
        }
        if (message) {
          const label = messageText(query);
          message.textContent = label;
          message.hidden = !label;
        }
      };

      const itemFor = (hit, position, query) => {
        const item = ui.el("div", "drop-item row row-tall");
        item.dataset.id = hit.id;
        ui.setOn(item, position === 0, "is-active");
        item.appendChild(ui.el("span", "did", hit.id));
        item.appendChild(ui.el("span", "dmeta",
          hit.chapter ? i18n.chapterTitle(hit.chapter) : ""));
        if (hit.snippet) item.appendChild(markSnippet(hit.snippet, query));
        item.addEventListener("click", () => {
          hide();
          reader.focusText(hit.id, query);
          store.select(hit.id, { history: true });
        });
        return item;
      };

      const fill = (frag, from, to, query) => {
        for (let position = from; position < to; position++) {
          frag.appendChild(itemFor(hits[position], position, query));
        }
      };

      const render = (query, keepScroll) => {
        const box = $("searchResults");
        if (!box) return 0;
        const result = search.search(query);
        hits = result.hits;
        total = result.total;
        outside = result.outside;
        active = 0;
        const scrollTop = keepScroll ? box.scrollTop : 0;
        const limit = keepScroll ? Math.max(rendered, PAGE) : PAGE;
        rendered = Math.min(hits.length, limit);

        statusCount = null;
        statusNote = null;
        outsideRow = null;
        outsideBtn = null;
        message = null;

        const frag = document.createDocumentFragment();
        if (query.length >= 2) {
          const row = ui.el("div", "drop-scope");
          statusCount = ui.el("span", null, "");
          row.appendChild(statusCount);
          statusNote = ui.el("span", null, "");
          row.appendChild(statusNote);
          if (scoped()) {
            const clear = ui.el("button", "btn-link", i18n.t("searchClearFilters"));
            clear.type = "button";
            clear.addEventListener("click", clearFilter);
            row.appendChild(clear);
          }
          frag.appendChild(row);

          outsideRow = ui.el("div", "drop-empty popover-empty");
          outsideBtn = ui.el("button", "drop-more btn-link", "");
          outsideBtn.type = "button";
          outsideBtn.addEventListener("click", clearFilter);
          outsideRow.appendChild(outsideBtn);
          frag.appendChild(outsideRow);

          message = ui.el("div", "drop-empty popover-empty", "");
          frag.appendChild(message);
          fill(frag, 0, rendered, query);
        } else {
          message = ui.el("div", "drop-empty popover-empty", "");
          frag.appendChild(message);
        }

        box.replaceChildren(frag);
        updateStatus(query);
        box.scrollTop = scrollTop;
        return hits.length;
      };

      const appendMore = () => {
        const box = $("searchResults");
        if (!box || rendered >= hits.length) return false;
        const end = Math.min(hits.length, rendered + PAGE);
        const frag = document.createDocumentFragment();
        fill(frag, rendered, end, lastQuery);
        box.appendChild(frag);
        rendered = end;
        return true;
      };

      const run = () => {
        const input = $("search");
        const box = $("searchResults");
        if (!input || !box) return 0;
        const query = input.value.trim();
        lastQuery = query;
        store.setQuery(query);
        if (!query) {
          hide();
          return 0;
        }
        const count = render(query);
        show();
        return count;
      };

      const refresh = ui.rafBatch(() => {
        const input = $("search");
        const box = $("searchResults");
        if (!input || !box || box.hidden) return;
        const query = input.value.trim();
        if (query.length < 2) return;
        lastQuery = query;
        const result = search.search(query);
        if (result.total !== total || !hits.length) {
          render(query, true);
          return;
        }
        updateStatus(query);
      });

      const warmFullText = (lang) => {
        if (warming && warmingLang === lang) return warming;
        warmingLang = lang;
        const chain = text.ensureAll(lang, (loaded, size) => {
          ui.progress(i18n.t("searchLoadingText", { loaded, total: size }));
          refresh();
        }).then(() => {
          if (warming === chain) {
            warming = null;
            warmingLang = "";
          }
          ui.progress("");
          const input = $("search");
          if (input && input.value.trim()) run();
        }).catch(() => {
          if (warming === chain) {
            warming = null;
            warmingLang = "";
          }
          ui.progress("");
        });
        warming = chain;
        return chain;
      };

      const perform = () => {
        const input = $("search");
        if (!input) return;
        const query = input.value.trim();
        run();
        const progress = text.progress(store.textLang());
        if (query.length < 2 || progress.done) return;
        ui.progress(i18n.t("searchLoadingText", { loaded: progress.loaded, total: progress.total }));
        warmFullText(store.textLang());
      };

      const onInput = ui.debounce(perform, 160);

      const choose = () => {
        const hit = hits[active] || hits[0];
        if (!hit) return false;
        hide();
        reader.focusText(hit.id, lastQuery);
        store.select(hit.id, { history: true });
        return true;
      };

      const reset = () => {
        hits = [];
        total = 0;
        outside = 0;
        rendered = 0;
        active = 0;
        hide();
      };

      const bind = () => {
        const input = $("search");
        const box = $("searchResults");
        if (!input || !box) return;
        input.addEventListener("input", onInput);
        input.addEventListener("focus", () => {
          if (input.value.trim()) perform();
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            hide();
            input.blur();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            choose();
          }
        });
        box.addEventListener("scroll", () => {
          if (box.scrollTop + box.clientHeight >= box.scrollHeight - SCROLL_GAP) appendMore();
        });
        overlay.register("searchResults", {
          id: "searchResults",
          triggerId: "search",
          group: "menu",
          onHide: () => {
            box.hidden = true;
            ui.setExpanded(input, false);
          },
          placement: { align: "start", gap: 8, matchWidth: true, fit: true },
        });
        if (input.value.trim()) perform();
      };

      return {
        bind,
        reset,
      };
    });
})();
