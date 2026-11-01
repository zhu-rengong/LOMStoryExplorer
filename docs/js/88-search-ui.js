(() => {
  "use strict";

  const SR = window.SR;

  SR.define("searchUi", ["store", "graph", "i18n", "text", "search", "overlay", "ui", "reader"],
    ({ store, graph, i18n, text, search, overlay, ui, reader }) => {
      const $ = ui.$;

      let hits = [];
      let active = 0;
      let lastQuery = "";
      let warming = null;
      let warmingLang = "";

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

      const renderScope = (frag) => {
        if (!scoped()) return;
        const row = ui.el("div", "drop-scope");
        row.appendChild(ui.el("span", null, i18n.t("searchScoped")));
        const clear = ui.el("button", "btn-link", i18n.t("searchClearFilters"));
        clear.type = "button";
        clear.addEventListener("click", (event) => {
          event.stopPropagation();
          store.applyFilter({ source: "", set: null, error: "", loading: false });
          run();
        });
        row.appendChild(clear);
        frag.appendChild(row);
      };

      const render = (query) => {
        const box = $("searchResults");
        if (!box) return 0;
        hits = search.search(query);
        const frag = document.createDocumentFragment();
        renderScope(frag);

        if (!hits.length) {
          const progress = text.progress(store.textLang());
          const loading = query.length >= 2 && !progress.done;
          frag.appendChild(ui.el("div", "drop-empty popover-empty",
            loading
              ? i18n.t("searchLoadingText", { loaded: progress.loaded, total: progress.total })
              : i18n.t(scoped() ? "searchNoHit" : "searchEmpty")));
          if (!loading && scoped() && query.length >= 2) {
            const outside = search.countOutside(query);
            if (outside > 0) {
              const more = ui.el("div", "drop-empty popover-empty");
              const button = ui.el("button", "drop-more btn-link",
                i18n.t("searchOutside", { n: outside }));
              button.type = "button";
              button.addEventListener("click", (event) => {
                event.stopPropagation();
                store.applyFilter({ source: "", set: null, error: "", loading: false });
                run();
              });
              more.appendChild(button);
              frag.appendChild(more);
            }
          }
          active = 0;
          box.replaceChildren(frag);
          return 0;
        }

        active = 0;
        hits.forEach((hit, index) => {
          const item = ui.el("div", "drop-item row row-tall");
          item.dataset.id = hit.id;
          ui.setOn(item, index === 0, "is-active");
          item.appendChild(ui.el("span", "did", hit.id));
          item.appendChild(ui.el("span", "dmeta",
            hit.chapter ? i18n.chapterTitle(hit.chapter) : ""));
          if (hit.snippet) item.appendChild(markSnippet(hit.snippet, query));
          item.addEventListener("click", () => {
            hide();
            reader.focusText(hit.id, query);
            store.select(hit.id, { history: true });
          });
          frag.appendChild(item);
        });
        box.replaceChildren(frag);
        return hits.length;
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

      const refreshPlaceholder = ui.rafBatch(() => {
        const input = $("search");
        const box = $("searchResults");
        if (!input || !box || box.hidden) return;
        if (!box.querySelector(".drop-empty.popover-empty")) return;
        const query = input.value.trim();
        if (query.length < 2) return;
        lastQuery = query;
        render(query);
      });

      const warmFullText = (lang) => {
        if (warming && warmingLang === lang) return warming;
        warmingLang = lang;
        const chain = text.ensureAll(lang, (loaded, total) => {
          ui.progress(i18n.t("searchLoadingText", { loaded, total }));
          refreshPlaceholder();
        }).then(() => {
          if (warming === chain) {
            warming = null;
            warmingLang = "";
          }
          search.invalidate();
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
