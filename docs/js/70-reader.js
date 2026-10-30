(() => {
  "use strict";

  const SR = window.SR;

  SR.define("reader",
    ["store", "graph", "i18n", "text", "beats", "panels", "overlay", "ui"],
    ({ store, graph, i18n, text, beats, panels, overlay, ui }) => {
      const $ = ui.$;
      const HIT_SELECTOR = ".say .what, .option-text, .lore-p";
      const scrollMemory = new Map();
      let nextTargetsCache = [];
      let readingId = "";
      let pendingHit = null;
      let flashTimer = 0;

      const isMobile = () => store.state.layout === "mobile";

      const revealHit = (target) => {
        const body = $("readerBody");
        let current = target.parentElement;
        while (current && current !== body) {
          const foldable = current.classList.contains("option")
            || current.classList.contains("branch");
          if (foldable && !current.classList.contains("is-open")) {
            current.classList.add("is-open");
            const head = current.firstElementChild;
            if (head) head.setAttribute("aria-expanded", "true");
          }
          current = current.parentElement;
        }
      };

      const scrollHit = (target) => {
        const body = $("readerBody");
        if (!body) return;
        const bodyRect = body.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        const offset = rect.top - bodyRect.top - Math.max(0, (body.clientHeight - rect.height) / 2);
        body.style.scrollBehavior = "auto";
        body.scrollTop = Math.max(0, body.scrollTop + offset);
        requestAnimationFrame(() => {
          body.style.scrollBehavior = "";
        });
      };

      const flashHit = (target) => {
        target.classList.remove("is-flash");
        void target.offsetWidth;
        target.classList.add("is-flash");
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => target.classList.remove("is-flash"), 1500);
      };

      const applyHit = (node) => {
        if (!pendingHit) return;
        if (pendingHit.id !== node.id) {
          pendingHit = null;
          return;
        }
        const body = $("readerBody");
        if (!body) return;
        let target = null;
        for (const element of body.querySelectorAll(HIT_SELECTOR)) {
          if (element.textContent.toLowerCase().includes(pendingHit.query)) {
            target = element;
            break;
          }
        }
        if (!target) return;
        pendingHit = null;
        revealHit(target);
        scrollHit(target);
        flashHit(target);
      };

      const focusText = (id, query) => {
        const needle = String(query || "").trim().toLowerCase();
        pendingHit = id && needle ? { id, query: needle } : null;
      };

      const scrollFraction = () => {
        const body = $("readerBody");
        if (!body) return 0;
        const max = body.scrollHeight - body.clientHeight;
        return max > 0 ? Math.min(1, Math.max(0, body.scrollTop / max)) : 0;
      };

      const nextTargets = (node) => graph.nextTargets(node);

      const prefetchNeighbors = (node) => {
        if (!node) return;
        const ids = [];
        const history = store.state.history;
        const ahead = history[store.state.hIndex + 1];
        if (ahead) ids.push(ahead);
        const targets = nextTargets(node);
        for (let index = 0; index < targets.length && ids.length < 2; index++) {
          ids.push(targets[index].node.id);
        }
        if (ids.length) text.prefetch(store.state.lang, ids, 2);
      };

      const skeletonBlock = () => {
        const wrap = ui.el("div", "reader-skeleton");
        wrap.setAttribute("role", "status");
        wrap.setAttribute("aria-live", "polite");
        wrap.appendChild(ui.el("span", "sk-caption", i18n.t("loadTextLoading")));
        for (let index = 0; index < 5; index++) {
          const line = ui.el("span", "sk-line");
          line.style.width = `${100 - index * 9}%`;
          wrap.appendChild(line);
        }
        return wrap;
      };

      const textFailedCard = (node) => {
        const card = ui.el("div", "reader-skeleton is-failed");
        card.appendChild(ui.el("span", "sk-caption", i18n.t("loadTextFailed")));
        const button = ui.el("button", "tool-btn btn", i18n.t("loadTextRetry"));
        button.type = "button";
        button.addEventListener("click", () => {
          text.retry(store.state.lang, node.id);
          render(node, { keepScroll: true });
        });
        card.appendChild(button);
        return card;
      };

      const edgeLabelOf = (edge) => text.edgeLabel(store.state.lang, String(edge.id), edge.label);

      const hideNextMenu = () => {
        const menu = $("nextMenu");
        if (menu) menu.hidden = true;
      };

      const closeNextMenu = () => {
        if (!overlay.close("nextMenu")) hideNextMenu();
      };

      const renderNextMenu = (node) => {
        const menu = $("nextMenu");
        if (!menu) return;
        const targets = nextTargetsCache.length ? nextTargetsCache : nextTargets(node);
        menu.replaceChildren();
        menu.appendChild(ui.el("div", "menu-head", i18n.t("recentChoices")));
        const list = ui.el("div", "menu-list popover-list");
        targets.forEach((item) => {
          const row = ui.el("button", "nav-item row");
          row.type = "button";
          row.appendChild(ui.el("span", "nav-id", item.node.id));
          const label = beats.stripRich(edgeLabelOf(item.edge)) || i18n.chapterTitle(graph.chapterOf(item.node));
          row.appendChild(ui.el("span", "nav-label", label));
          if (item.edge.kind === "inferred") {
            row.appendChild(ui.el("span", "nav-badge badge badge-cool", i18n.t("navInferred")));
          } else if (item.edge.kind === "temp" || item.edge.kind === "travel") {
            row.appendChild(ui.el("span", "nav-badge badge badge-accent", i18n.t("navTemp")));
          }
          row.addEventListener("click", () => {
            closeNextMenu();
            store.select(item.node.id, { history: true });
          });
          list.appendChild(row);
        });
        menu.appendChild(list);
        overlay.open("nextMenu", {
          trigger: $("nextBtn"),
          placement: { align: "end", side: "top", gap: 8, width: 300, fit: true },
        });
      };

      const stepNext = () => {
        const node = store.selected();
        if (!node) return;
        const targets = nextTargetsCache.length ? nextTargetsCache : nextTargets(node);
        if (!targets.length) return;
        if (targets.length === 1) {
          store.select(targets[0].node.id, { history: true });
          return;
        }
        const menu = $("nextMenu");
        if (!menu) return;
        if (menu.hidden) renderNextMenu(node);
        else closeNextMenu();
      };

      const renderFoot = (node) => {
        const foot = $("readerFoot");
        if (!foot) return;
        if (!node) {
          foot.hidden = true;
          return;
        }
        foot.hidden = false;
        const prev = $("prevBtn");
        if (prev) prev.disabled = store.state.hIndex <= 0;
        const pos = $("footPos");
        if (pos) {
          pos.textContent = store.state.history.length
            ? `${store.state.hIndex + 1} / ${store.state.history.length}` : "";
        }
        nextTargetsCache = nextTargets(node);
        const button = $("nextBtn");
        const label = $("nextLabel");
        if (!button || !label) return;
        button.disabled = nextTargetsCache.length === 0;
        if (!nextTargetsCache.length) label.textContent = i18n.t("recentEnd");
        else if (nextTargetsCache.length === 1) label.textContent = i18n.t("recentNext");
        else label.textContent = i18n.t("recentContinue");
        closeNextMenu();
      };

      const syncBookmark = () => {
        const node = store.selected();
        const on = !!(node && store.isBookmarked(node.id));
        for (const id of ["bookmarkBtn", "footBookmark"]) {
          const button = $(id);
          if (!button) continue;
          button.setAttribute("aria-pressed", on ? "true" : "false");
          button.title = i18n.t(on ? "bookmarkRemove" : "bookmarkAdd");
        }
      };

      const buildContext = () => ({
        seq: 0,
        lookup: { open: panels.openLookup, targetOf: panels.lookupTargetOf },
        preview: { bind: panels.bindBranchPreview, hide: panels.hideBranchPreview },
        navigate: (id) => store.select(id, { history: true }),
      });

      const render = (node, options) => {
        const opts = options || {};
        const body = $("readerBody");
        const title = $("nodeTitle");
        const readerPanel = $("reader");
        if (!body || !title || !readerPanel) return;
        panels.hideBranchPreview();
        const lang = store.state.lang;
        const rows = text.story(lang, node.id);

        if (readingId && readingId !== node.id) {
          scrollMemory.set(readingId, body.scrollTop);
          store.rememberPosition(readingId, scrollFraction());
        }
        readingId = node.id;

        title.textContent = node.id;
        renderFoot(node);
        syncBookmark();

        const crumb = $("nodeChapter");
        if (crumb) {
          crumb.hidden = false;
          crumb.replaceChildren();
          crumb.appendChild(document.createTextNode(i18n.chapterTitle(graph.chapterOf(node))));
          const badge = beats.entryBadge(node);
          if (badge) crumb.appendChild(badge);
          if (typeof node.time === "number") {
            const time = ui.el("span", "crumb-time", ` · ${i18n.timeText(node.time)}`);
            crumb.appendChild(time);
          }
        }

        const content = document.createDocumentFragment();

        if (rows === null && text.shardState(lang, node.id) !== "ready") {
          content.appendChild(skeletonBlock());
          body.setAttribute("aria-busy", "true");
          body.replaceChildren(content);
          if (!opts.keepScroll) body.scrollTop = 0;
          text.ensureStory(lang, node.id).then((ok) => {
            if (!store.selected() || store.selected().id !== node.id) return;
            if (!ok && text.shardState(lang, node.id) !== "ready") {
              body.setAttribute("aria-busy", "false");
              const current = body.querySelector(".reader-skeleton");
              if (current) body.replaceChild(textFailedCard(node), current);
              return;
            }
            render(node, { keepScroll: true });
          });
          readerPanel.classList.add("is-open");
          if (isMobile() && !document.body.dataset.sheet) document.body.dataset.sheet = "half";
          return;
        }

        if (!rows || rows.length === 0) {
          const empty = ui.el("div", "empty-state");
          empty.appendChild(ui.el("span", "brush", "空"));
          empty.appendChild(ui.el("h3", null, i18n.t("noBeatsTitle")));
          empty.appendChild(ui.el("p", null, node.flags.empty ? i18n.t("noBeatsEmpty") : i18n.t("noBeatsOther")));
          content.appendChild(empty);
        } else {
          content.appendChild(beats.renderBeats(rows, buildContext()));
        }

        body.removeAttribute("aria-busy");
        body.replaceChildren(content);

        if (!opts.keepScroll) {
          const remembered = scrollMemory.get(node.id);
          if (remembered !== undefined) {
            body.scrollTop = remembered;
          } else {
            const fraction = store.positionOf(node.id);
            const max = body.scrollHeight - body.clientHeight;
            body.scrollTop = fraction > 0 && max > 0 ? fraction * max : 0;
          }
        }
        applyHit(node);
        prefetchNeighbors(node);
        readerPanel.classList.add("is-open");
        if (isMobile() && !document.body.dataset.sheet) document.body.dataset.sheet = "half";
      };

      const clearScrollMemory = () => {
        scrollMemory.clear();
        readingId = "";
      };

      overlay.register("nextMenu", {
        id: "nextMenu",
        triggerId: "nextBtn",
        group: "menu",
        onHide: hideNextMenu,
        placement: { align: "end", side: "top", gap: 8, width: 300, fit: true },
      });

      return {
        clearScrollMemory,
        closeNextMenu,
        edgeLabelOf,
        focusText,
        nextTargets,
        render,
        renderFoot,
        renderNextMenu,
        scrollFraction,
        stepNext,
        syncBookmark,
      };
    });
})();
