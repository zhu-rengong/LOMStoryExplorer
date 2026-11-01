(() => {
  "use strict";

  const SR = window.SR;

  const BREAKS = [[1440, "wide"], [1200, "mid"], [1024, "narrow"], [768, "compact"]];

  SR.define("app",
    ["schema", "graph", "store", "i18n", "text", "search", "searchUi",
      "filterUi", "settingsUi", "rail", "reader", "panels", "stats", "shortcuts",
      "grip", "overlay", "ui"],
    ({ schema, graph, store, i18n, text, search, searchUi, filterUi, settingsUi,
      rail, reader, panels, stats, shortcuts, grip, overlay, ui }) => {
      const $ = ui.$;

      const layoutFor = (width) => {
        for (const [min, name] of BREAKS) if (width >= min) return name;
        return "mobile";
      };

      const isOverlayRail = () => store.state.layout === "compact" || store.state.layout === "mobile";

      const toggleRailButton = (on) => {
        const button = $("railToggle");
        if (!button) return;
        ui.setOn(button, on);
        ui.setExpanded(button, on);
      };

      const hideRail = () => {
        document.body.classList.remove("rail-open");
        const scrim = $("railScrim");
        if (scrim) scrim.hidden = true;
        toggleRailButton(false);
      };

      const closeRail = () => {
        if (!overlay.close("rail")) hideRail();
      };

      const openRail = () => {
        if (!isOverlayRail()) return;
        document.body.classList.add("rail-open");
        const scrim = $("railScrim");
        if (scrim) scrim.hidden = false;
        toggleRailButton(true);
        overlay.open("rail", { trigger: $("railToggle") });
      };

      const toggleRail = () => {
        if (document.body.classList.contains("rail-open")) closeRail();
        else openRail();
      };

      const closeMore = () => {
        if (!overlay.close("moreMenu")) {
          const menu = $("moreMenu");
          if (menu) menu.hidden = true;
        }
      };

      const closeNav = () => {
        if (!overlay.close("navMenu")) {
          const menu = $("navMenu");
          if (menu) menu.hidden = true;
        }
      };

      const applyLayout = (force) => {
        const next = layoutFor(window.innerWidth);
        if (!force && next === store.state.layout && document.body.dataset.layout) return;
        store.setLayout(next);
        document.body.dataset.layout = next;
        if (!isOverlayRail()) closeRail();
        closeMore();
        closeLang();
        closeNav();
      };

      const updateHistoryButtons = () => {
        const back = $("backBtn");
        const forward = $("forwardBtn");
        if (back) back.disabled = store.state.hIndex <= 0;
        if (forward) forward.disabled = store.state.hIndex >= store.state.history.length - 1;
      };

      const updateHash = (id) => {
        if (!window.history || !history.replaceState) return;
        const target = `#/${id}`;
        if (location.hash !== target) history.replaceState(null, "", target);
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

      const closeLang = () => {
        if (!overlay.close("langMenu")) {
          const menu = $("langMenu");
          if (menu) menu.hidden = true;
          const button = $("langBtn");
          if (button) ui.setOn(button, false);
        }
      };

      const renderLangMenu = () => {
        const menu = $("langMenu");
        if (!menu) return;
        menu.replaceChildren();
        menu.appendChild(ui.el("div", "menu-head", i18n.t("moreLang")));
        i18n.languages().forEach((item) => {
          const on = item.id === store.state.lang;
          const row = ui.el("button", `menu-item row${on ? " is-on" : ""}`, item.native);
          row.type = "button";
          row.setAttribute("role", "menuitemradio");
          row.setAttribute("aria-checked", on ? "true" : "false");
          row.setAttribute("lang", item.html);
          row.dataset.lang = item.id;
          row.title = item.label;
          row.addEventListener("click", () => {
            closeLang();
            setLang(item.id);
          });
          menu.appendChild(row);
        });
        menu.appendChild(ui.el("div", "menu-sep"));
        menu.appendChild(ui.el("p", "menu-note", i18n.t("langPickerNote")));
      };

      const openLang = () => {
        const button = $("langBtn");
        if (!button) return;
        renderLangMenu();
        ui.setExpanded(button, true);
        ui.setOn(button, true);
        overlay.open("langMenu", { trigger: button });
      };

      const applyLanguage = () => {
        panels.reset();
        search.invalidate();
        searchUi.reset();
        filterUi.reset();
        i18n.apply();
        renderLangMenu();
        rail.render();
        settingsUi.sync();
        reader.syncBookmark();
        renderNavMenu();
        const node = store.selected();
        if (node) reader.render(node);
        stats.refresh();
        if (store.state.filterSource.trim()) filterUi.apply(store.state.filterSource);
      };

      let langToken = 0;

      const setLang = (id) => {
        if (!id) return;
        const token = ++langToken;
        const content = schema.meta.langs.indexOf(id) >= 0 ? id : store.textLang();
        text.ensureHead(content).then(() => {
          if (token !== langToken) return;
          if (!store.setLang(id)) return;
          i18n.syncLanguage();
          applyLanguage();
        });
      };

      const navRow = (id, label, badge, onPick) => {
        const row = ui.el("button", "nav-item row");
        row.type = "button";
        row.appendChild(ui.el("span", "nav-id", id));
        if (label) row.appendChild(ui.el("span", "nav-label", label));
        if (badge) row.appendChild(ui.el("span", "nav-badge badge", badge));
        row.addEventListener("click", onPick);
        return row;
      };

      const renderNavMenu = () => {
        const menu = $("navMenu");
        const button = $("navBtn");
        if (!menu || !button) return;
        const node = store.selected();
        button.disabled = !node;
        menu.replaceChildren();
        if (!node) return;

        const list = ui.el("div", "menu-list popover-list");
        const addGroup = (titleKey, edges, pick) => {
          list.appendChild(ui.el("div", "menu-head", i18n.t(titleKey, { n: edges.length })));
          if (!edges.length) {
            list.appendChild(ui.el("div", "menu-empty popover-empty", i18n.t("navEmpty")));
            return;
          }
          edges.forEach((edge) => {
            const target = pick(edge);
            if (!target) return;
            let tag = "";
            if (edge.kind === "inferred") tag = i18n.t("navInferred");
            else if (edge.kind === "temp" || edge.kind === "travel") tag = i18n.t("navTemp");
            else if (edge.kind === "position") tag = i18n.t("navPosition");
            const item = navRow(target.id, beatsLabel(edge), tag, () => {
              closeNav();
              store.select(target.id, { history: true });
            });
            item.setAttribute("role", "menuitem");
            list.appendChild(item);
          });
        };

        const nodeIndex = graph.indexById.get(node.id);
        addGroup("navOut", graph.outAdj[nodeIndex] || [], (edge) => graph.nodeById.get(edge.to));
        list.appendChild(ui.el("div", "menu-sep"));
        addGroup("navIn", graph.inAdj[nodeIndex] || [], (edge) => graph.nodeById.get(edge.from));

        menu.appendChild(list);
      };

      const beatsLabel = (edge) => {
        const label = reader.edgeLabelOf(edge);
        return schema.stripRich(label) || "";
      };

      const toggleNav = () => {
        const menu = $("navMenu");
        const button = $("navBtn");
        if (!menu || !button) return;
        if (menu.hidden) {
          renderNavMenu();
          ui.setExpanded(button, true);
          overlay.open("navMenu", { trigger: button });
        } else {
          closeNav();
        }
      };

      const renderMoreMenu = () => {
        const menu = $("moreMenu");
        if (!menu) return;
        menu.replaceChildren();
        const statsRow = ui.el("button", "menu-item row", i18n.t("statsBtn"));
        statsRow.type = "button";
        statsRow.addEventListener("click", () => {
          closeMore();
          stats.open($("statsBtn"));
        });
        const helpRow = ui.el("button", "menu-item row", i18n.t("helpTitle"));
        helpRow.type = "button";
        helpRow.addEventListener("click", () => {
          closeMore();
          shortcuts.toggle();
        });
        menu.appendChild(statsRow);
        menu.appendChild(helpRow);

        const node = store.selected();
        const targets = node ? reader.nextTargets(node) : [];
        if (targets.length) {
          menu.appendChild(ui.el("div", "menu-sep"));
          menu.appendChild(ui.el("div", "menu-head", i18n.t("recentChoices")));
          targets.slice(0, 6).forEach((item) => {
            menu.appendChild(navRow(
              item.node.id,
              beatsLabel(item.edge) || i18n.chapterTitle(graph.chapterOf(item.node)),
              "",
              () => {
                closeMore();
                store.select(item.node.id, { history: true });
              },
            ));
          });
        }
      };

      const openMore = () => {
        const button = $("moreBtn");
        if (!button) return;
        renderMoreMenu();
        ui.setExpanded(button, true);
        overlay.open("moreMenu", { trigger: button });
      };

      const bindShell = () => {
        const railToggle = $("railToggle");
        if (railToggle) railToggle.addEventListener("click", toggleRail);
        const railClose = $("railClose");
        if (railClose) railClose.addEventListener("click", closeRail);
        const railScrim = $("railScrim");
        if (railScrim) railScrim.addEventListener("click", closeRail);

        const railSearch = $("railSearch");
        if (railSearch) railSearch.addEventListener("input", rail.render);
        ui.$$(".rail-tab").forEach((tab) => {
          tab.addEventListener("click", () => rail.setTab(tab.dataset.rail));
        });

        const bookmark = $("bookmarkBtn");
        if (bookmark) {
          bookmark.addEventListener("click", () => {
            const node = store.selected();
            if (!node) return;
            const on = store.toggleBookmark(node.id);
            ui.toast(i18n.t(on ? "bookmarkAdded" : "bookmarkRemoved"));
          });
        }

        const lookupClose = $("lookupClose");
        if (lookupClose) lookupClose.addEventListener("click", panels.closeLookup);

        const navButton = $("navBtn");
        if (navButton) {
          navButton.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleNav();
          });
        }

        const moreButton = $("moreBtn");
        if (moreButton) {
          moreButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const menu = $("moreMenu");
            if (menu && !menu.hidden) closeMore();
            else openMore();
          });
        }
        const back = $("backBtn");
        if (back) back.addEventListener("click", () => store.back());
        const forward = $("forwardBtn");
        if (forward) forward.addEventListener("click", () => store.forward());

        const body = $("readerBody");
        if (body) {
          body.addEventListener("scroll", () => {
            const node = store.selected();
            if (node) store.rememberPosition(node.id, reader.scrollFraction());
          }, { passive: true });
        }

        document.addEventListener("click", () => panels.hideBranchPreview(), true);
        if (body) body.addEventListener("scroll", panels.hideBranchPreview, { passive: true });

        const langButton = $("langBtn");
        if (langButton) {
          langButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const menu = $("langMenu");
            if (menu && !menu.hidden) closeLang();
            else openLang();
          });
        }

        window.addEventListener("resize", ui.debounce(() => {
          applyLayout(false);
          panels.hideBranchPreview();
          closeNav();
        }, 80));

        window.addEventListener("hashchange", () => {
          const id = readHash();
          if (!id || (store.state.selectedId === id)) return;
          if (graph.nodeById.has(id)) store.select(id, { history: false });
          else ui.toast(i18n.t("statusNotFound", { id }));
        });

        const readerBody = $("readerBody");
        if (readerBody) readerBody.addEventListener("click", () => panels.hideBranchPreview());

        window.addEventListener("beforeunload", () => {
          store.persist();
        });
      };

      const bindOverlays = () => {
        overlay.register("rail", {
          id: "chapterRail",
          triggerId: "railToggle",
          group: "sheet",
          onHide: hideRail,
        });
        overlay.register("navMenu", {
          id: "navMenu",
          triggerId: "navBtn",
          group: "menu",
          onHide: () => {
            const menu = $("navMenu");
            if (menu) menu.hidden = true;
          },
          placement: { align: "end", width: 340, fit: true },
        });
        overlay.register("langMenu", {
          id: "langMenu",
          triggerId: "langBtn",
          group: "menu",
          onHide: () => {
            const menu = $("langMenu");
            if (menu) menu.hidden = true;
            const button = $("langBtn");
            if (button) ui.setOn(button, false);
          },
          placement: { align: "end", width: 240, fit: true },
        });
        overlay.register("moreMenu", {
          id: "moreMenu",
          triggerId: "moreBtn",
          group: "menu",
          onHide: () => {
            const menu = $("moreMenu");
            if (menu) menu.hidden = true;
          },
          placement: { align: "end", width: 268, fit: true },
        });
      };

      const bindSubscriptions = () => {
        store.subscribe(["selected"], () => {
          const node = store.selected();
          updateHistoryButtons();
          rail.syncSelection(node ? node.id : "");
          if (!node) return;
          updateHash(node.id);
          reader.render(node);
          renderNavMenu();
        });
        store.subscribe(["bookmarks"], () => {
          reader.syncBookmark();
          rail.render();
        });
        store.subscribe(["filter"], () => filterUi.sync());
        store.subscribe(["railTab", "outline"], () => rail.render());
        store.subscribe(["settingsTarget"], () => settingsUi.sync());
        store.subscribe(["layout"], () => {
          document.body.dataset.layout = store.state.layout;
        });
      };

      const start = () => {
        applyLayout(true);
        bindOverlays();
        bindSubscriptions();
        store.restore();
        bindShell();
        settingsUi.bind();
        filterUi.bind();
        searchUi.bind();
        stats.init();
        shortcuts.init();
        grip.init();
        renderLangMenu();
        updateHistoryButtons();
        i18n.apply();
        rail.render();
        settingsUi.sync();

        const startId = readHash() || store.state.selectedId;
        if (startId && graph.nodeById.has(startId)) {
          store.select(startId, { history: false });
        } else {
          const body = $("readerBody");
          if (body && !body.querySelector(".empty-state")) {
            body.replaceChildren();
            const empty = ui.el("div", "empty-state");
            empty.appendChild(ui.el("span", "brush", i18n.t("emptyBrush")));
            empty.appendChild(ui.el("h3", null, i18n.t("emptyH3")));
            empty.appendChild(ui.el("p", null, i18n.t("emptyP")));
            empty.appendChild(ui.el("p", "hint-line", i18n.t("emptyHint")));
            body.appendChild(empty);
          }
        }

        text.ensureHead(store.textLang()).then(() => {
          search.invalidate();
          filterUi.reset();
          const node = store.selected();
          if (node) reader.render(node);
          if (store.state.filterSource.trim()) filterUi.apply(store.state.filterSource);
        });
      };

      return { start };
    });
})();
