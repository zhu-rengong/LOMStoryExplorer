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
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-expanded", on ? "true" : "false");
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

      const updateLangButtons = () => {
        ui.$$("#langSeg .seg-btn").forEach((button) => {
          const on = button.dataset.lang === store.state.lang;
          button.classList.toggle("is-on", on);
          button.setAttribute("aria-pressed", on ? "true" : "false");
        });
      };

      const applyLanguage = () => {
        panels.reset();
        search.invalidate();
        searchUi.reset();
        filterUi.reset();
        i18n.apply();
        updateLangButtons();
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

      const setLang = (lang) => {
        if (!lang || lang === store.state.lang || schema.meta.langs.indexOf(lang) < 0) return;
        const token = ++langToken;
        text.ensureHead(lang).then(() => {
          if (token !== langToken) return;
          store.setLang(lang);
          applyLanguage();
        });
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
            const item = ui.el("button", "nav-item row");
            item.type = "button";
            item.setAttribute("role", "menuitem");
            item.appendChild(ui.el("span", "nav-id", target.id));
            const label = beatsLabel(edge);
            if (label) item.appendChild(ui.el("span", "nav-label", label));
            if (edge.kind === "inferred") {
              item.appendChild(ui.el("span", "nav-badge badge badge-cool", i18n.t("navInferred")));
            } else if (edge.kind === "temp" || edge.kind === "travel") {
              item.appendChild(ui.el("span", "nav-badge badge badge-accent", i18n.t("navTemp")));
            } else if (edge.kind === "position") {
              item.appendChild(ui.el("span", "nav-badge badge badge-cool", i18n.t("navPosition")));
            }
            item.addEventListener("click", () => {
              closeNav();
              store.select(target.id, { history: true });
            });
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
          button.setAttribute("aria-expanded", "true");
          overlay.open("navMenu", { trigger: button });
        } else {
          closeNav();
        }
      };

      const renderMoreMenu = () => {
        const menu = $("moreMenu");
        if (!menu) return;
        menu.replaceChildren();
        menu.appendChild(ui.el("div", "menu-head", i18n.t("moreLang")));
        const language = ui.el("button", "menu-item row",
          store.state.lang === "zh-tw" ? i18n.t("langZhCn") : i18n.t("langZhTw"));
        language.type = "button";
        language.addEventListener("click", () => {
          closeMore();
          setLang(store.state.lang === "zh-tw" ? "zh-cn" : "zh-tw");
        });
        menu.appendChild(language);

        menu.appendChild(ui.el("div", "menu-sep"));
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
            const row = ui.el("button", "nav-item row");
            row.type = "button";
            row.appendChild(ui.el("span", "nav-id", item.node.id));
            row.appendChild(ui.el("span", "nav-label", beatsLabel(item.edge)
              || i18n.chapterTitle(graph.chapterOf(item.node))));
            row.addEventListener("click", () => {
              closeMore();
              store.select(item.node.id, { history: true });
            });
            menu.appendChild(row);
          });
        }
      };

      const openMore = () => {
        const button = $("moreBtn");
        if (!button) return;
        renderMoreMenu();
        button.setAttribute("aria-expanded", "true");
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

        ui.$$("#langSeg .seg-btn").forEach((button) => {
          button.addEventListener("click", () => setLang(button.dataset.lang));
        });

        let resizeTimer = null;
        window.addEventListener("resize", () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            applyLayout(false);
            panels.hideBranchPreview();
            closeNav();
          }, 80);
        });

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
        store.subscribe(["settingsType"], () => settingsUi.sync());
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
        updateLangButtons();
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

        text.ensureHead(store.state.lang).then(() => {
          search.invalidate();
          filterUi.reset();
          const node = store.selected();
          if (node) reader.render(node);
          if (store.state.filterSource.trim()) filterUi.apply(store.state.filterSource);
        });
      };

      return {
        applyLayout,
        bindShell,
        closeNav,
        closeRail,
        openRail,
        renderNavMenu,
        setLang,
        start,
        toggleNav,
        toggleRail,
      };
    });
})();
