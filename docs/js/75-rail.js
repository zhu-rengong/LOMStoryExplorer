(() => {
  "use strict";

  const SR = window.SR;

  const RAIL_TABS = ["bookmarks", "outline"];

  SR.define("rail", ["store", "graph", "i18n", "storage", "ui"],
    ({ store, graph, i18n, storage, ui }) => {
      const $ = ui.$;
      const ENTRY_KEYS = { combat: "entryCombat", free: "entryFree" };

      let nodesByChapter = null;

      const chapterNodes = (index) => {
        if (!nodesByChapter) {
          nodesByChapter = graph.nodesByChapter();
        }
        return nodesByChapter[index] || [];
      };

      const syncSelection = (id) => {
        const list = $("chapterList");
        if (!list) return;
        for (const row of list.querySelectorAll(".rail-item[data-id]")) {
          const on = row.dataset.id === id;
          ui.setOn(row, on);
          row.setAttribute("aria-selected", on ? "true" : "false");
        }
      };

      const railRow = (id, extras) => {
        const node = graph.nodeById.get(id);
        const row = ui.el("div", "rail-item row row-tall");
        row.dataset.id = id;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", store.state.selectedId === id ? "true" : "false");
        row.tabIndex = 0;
        if (!node) {
          row.appendChild(ui.el("span", "ri-id", id));
          return row;
        }
        ui.setOn(row, store.state.selectedId === id);
        row.appendChild(ui.el("span", "ri-id", id));
        if (node.entry && ENTRY_KEYS[node.entry]) {
          const mark = ui.el("span", `ri-entry is-${node.entry}`);
          mark.title = i18n.t(ENTRY_KEYS[node.entry]);
          row.appendChild(mark);
        }
        row.appendChild(ui.el("span", "ri-meta", extras || i18n.chapterTitle(graph.chapterOf(node))));
        const open = () => {
          store.select(id, { history: true });
        };
        row.addEventListener("click", open);
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        });
        return row;
      };

      const renderBookmarks = () => {
        const list = $("chapterList");
        if (!list) return;
        const frag = document.createDocumentFragment();
        const ids = Array.from(storage.bookmarks);
        if (!ids.length) {
          frag.appendChild(ui.el("p", "rail-empty", i18n.t("bookmarkEmpty")));
        } else {
          frag.appendChild(ui.el("p", "rail-group", `${i18n.t("railTabBookmarks")} · ${ids.length}`));
          ids.forEach((id) => {
            const row = railRow(id);
            const remove = ui.el("button", "ri-del btn btn-icon btn-sm");
            remove.type = "button";
            remove.title = i18n.t("bookmarkRemove");
            remove.appendChild(ui.svg("i-close"));
            remove.addEventListener("click", (event) => {
              event.stopPropagation();
              const on = store.toggleBookmark(id);
              ui.toast(i18n.t(on ? "bookmarkAdded" : "bookmarkRemoved"));
              render();
            });
            row.appendChild(remove);
            frag.appendChild(row);
          });
          const clear = ui.el("button", "link-btn btn-link", i18n.t("bookmarkClear"));
          clear.type = "button";
          clear.addEventListener("click", () => {
            store.clearBookmarks();
            render();
            ui.toast(i18n.t("bookmarkCleared"));
          });
          frag.appendChild(clear);
        }
        list.replaceChildren(frag);
      };

      const renderOutline = () => {
        const list = $("chapterList");
        if (!list) return;
        const search = $("railSearch");
        const query = search ? ui.normalizeQuery(search.value) : "";
        let open = store.state.outlineChapter;
        if (open === undefined) {
          const selected = store.selected();
          open = selected ? selected.chapter : -1;
        }
        const frag = document.createDocumentFragment();

        graph.chapters.forEach((chapter, index) => {
          let members = chapterNodes(index);
          if (query) {
            const title = i18n.chapterTitle(chapter).toLowerCase();
            if (title.indexOf(query) < 0 && chapter.id.toLowerCase().indexOf(query) < 0) {
              members = members.filter((node) => node.id.toLowerCase().indexOf(query) >= 0);
            }
            if (!members.length) return;
          }

          const head = ui.el("div", `rail-item rail-chap row row-tall${index === open ? " is-open" : ""}`);
          head.setAttribute("role", "button");
          head.tabIndex = 0;
          head.appendChild(ui.el("span", "ri-id", i18n.chapterTitle(chapter)));
          head.appendChild(ui.el("span", "ri-meta", String(members.length)));
          const toggle = () => {
            store.setOutlineChapter(store.state.outlineChapter === index ? -1 : index);
          };
          head.addEventListener("click", toggle);
          head.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggle();
            }
          });
          frag.appendChild(head);

          if (index === open || query) {
            const body = ui.el("div", "rail-body");
            members.slice(0, query ? 200 : members.length).forEach((node) => {
              const row = railRow(node.id, i18n.t("tagSay", { n: node.say }));
              row.classList.add("is-card");
              body.appendChild(row);
            });
            frag.appendChild(body);
          }
        });

        if (!frag.childNodes.length) frag.appendChild(ui.el("p", "rail-empty", i18n.t("searchEmpty")));
        list.replaceChildren(frag);
      };

      const syncTabs = () => {
        const box = $("railSearchBox");
        if (box) box.hidden = store.state.railTab === "bookmarks";
        for (const tab of ui.$$(".rail-tab")) {
          const on = tab.dataset.rail === store.state.railTab;
          ui.setOn(tab, on);
          tab.setAttribute("aria-selected", on ? "true" : "false");
        }
      };

      const render = () => {
        if (store.state.railTab === "bookmarks") renderBookmarks();
        else renderOutline();
        syncTabs();
      };

      const setTab = (tab) => {
        if (RAIL_TABS.indexOf(tab) < 0 || tab === store.state.railTab) return;
        store.setRailTab(tab);
        const search = $("railSearch");
        if (search) search.value = "";
        render();
      };

      const reset = () => {
        nodesByChapter = null;
      };

      return {
        chapterNodes,
        railRow,
        render,
        renderBookmarks,
        renderOutline,
        reset,
        setTab,
        syncSelection,
        syncTabs,
      };
    });
})();
