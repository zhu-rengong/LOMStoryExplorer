(() => {
  "use strict";

  const SR = window.SR;

  SR.define("searchUi", ["store", "graph", "i18n", "text", "search", "overlay", "ui"],
    ({ store, graph, i18n, text, search, overlay, ui }) => {
      const $ = ui.$;

      let hits = [];
      let active = 0;
      let timer = null;

      const scoped = () => store.state.chapterFilter.size > 0 || !!store.state.filterSet;

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
          store.clearChapters();
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
        store.setQuery(query);
        if (!query) {
          hide();
          return 0;
        }
        hits = search.search(query);
        const frag = document.createDocumentFragment();
        renderScope(frag);

        if (!hits.length) {
          frag.appendChild(ui.el("div", "drop-empty popover-empty",
            i18n.t(scoped() ? "searchNoHit" : "searchEmpty")));
          if (scoped() && query.length >= 2) {
            const outside = search.countOutside(query);
            if (outside > 0) {
              const more = ui.el("div", "drop-empty popover-empty");
              const button = ui.el("button", "drop-more btn-link",
                i18n.t("searchOutside", { n: outside }));
              button.type = "button";
              button.addEventListener("click", (event) => {
                event.stopPropagation();
                store.clearChapters();
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
            store.select(hit.id, { history: true });
          });
          frag.appendChild(item);
        });
        box.replaceChildren(frag);
        show();
        return hits.length;
      };

      const perform = () => {
        const input = $("search");
        if (!input) return;
        const query = input.value.trim();
        run();
        if (query.length < 2 || text.progress(store.state.lang).done) return;
        ui.progress(i18n.t("searchLoadingText", { loaded: 0, total: 0 }));
        text.ensureAll(store.state.lang, (loaded, total) => {
          ui.progress(i18n.t("searchLoadingText", { loaded, total }));
        }).then(() => {
          search.invalidate();
          ui.progress("");
          if (input.value.trim() === query) run();
        });
      };

      const onInput = () => {
        clearTimeout(timer);
        timer = setTimeout(perform, 160);
      };

      const choose = () => {
        const hit = hits[active] || hits[0];
        if (!hit) return false;
        hide();
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
          if (input.value.trim()) run();
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
