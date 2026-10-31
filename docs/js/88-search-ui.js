(() => {
  "use strict";

  const SR = window.SR;

  SR.define("searchUi", ["store", "graph", "i18n", "text", "search", "overlay", "ui", "reader"],
    ({ store, graph, i18n, text, search, overlay, ui, reader }) => {
      const $ = ui.$;

      let hits = [];
      let active = 0;
      let timer = null;
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

      const paint = () => {
        const rows = ui.$$(".drop-item", $("searchResults"));
        rows.forEach((row, index) => row.classList.toggle("is-active", index === active));
        const current = rows[active];
        if (current && current.scrollIntoView) current.scrollIntoView({ block: "nearest" });
      };

      const move = (delta) => {
        if (!hits.length) return;
        active = (active + delta + hits.length) % hits.length;
        paint();
      };

      const hide = () => {
        if (!overlay.close("searchResults")) {
          const box = $("searchResults");
          const input = $("search");
          if (box) box.hidden = true;
          if (input) input.setAttribute("aria-expanded", "false");
        }
      };

      const show = () => {
        const input = $("search");
        overlay.open("searchResults", {
          trigger: input,
          placement: { align: "start", gap: 8, matchWidth: true, fit: true },
        });
        if (input) input.setAttribute("aria-expanded", "true");
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
          show();
          return 0;
        }

        active = 0;
        hits.forEach((hit, index) => {
          const item = ui.el("div", "drop-item row row-tall row-accent");
          item.dataset.id = hit.id;
          if (index === 0) item.classList.add("is-active");
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
        show();
        return hits.length;
      };

      const warmFullText = (lang) => {
        if (warming && warmingLang === lang) return warming;
        warmingLang = lang;
        const chain = text.ensureAll(lang, (loaded, total) => {
          ui.progress(i18n.t("searchLoadingText", { loaded, total }));
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
        if (query.length < 2 || text.progress(store.textLang()).done) return;
        ui.progress(i18n.t("searchLoadingText", { loaded: 0, total: 0 }));
        warmFullText(store.textLang());
      };

      const onInput = () => {
        clearTimeout(timer);
        timer = setTimeout(perform, 160);
      };

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
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
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
            input.setAttribute("aria-expanded", "false");
          },
          placement: { align: "start", gap: 8, matchWidth: true, fit: true },
        });
        if (input.value.trim()) perform();
      };

      return {
        bind,
        choose,
        hide,
        move,
        onInput,
        perform,
        reset,
        run,
      };
    });
})();
