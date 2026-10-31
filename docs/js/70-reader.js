(() => {
  "use strict";

  const SR = window.SR;

  SR.define("reader",
    ["store", "graph", "i18n", "text", "beats", "panels", "ui"],
    ({ store, graph, i18n, text, beats, panels, ui }) => {
      const $ = ui.$;
      const HIT_SELECTOR = ".say .what, .option-text, .lore-p";
      const scrollMemory = new Map();
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
        if (ids.length) text.prefetch(store.textLang(), ids, 2);
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
          text.retry(store.textLang(), node.id);
          render(node, { keepScroll: true });
        });
        card.appendChild(button);
        return card;
      };

      const edgeLabelOf = (edge) => text.edgeLabel(store.textLang(), String(edge.id), edge.label);

      const syncBookmark = () => {
        const node = store.selected();
        const on = !!(node && store.isBookmarked(node.id));
        const button = $("bookmarkBtn");
        if (!button) return;
        button.setAttribute("aria-pressed", on ? "true" : "false");
        button.title = i18n.t(on ? "bookmarkRemove" : "bookmarkAdd");
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
        const lang = store.textLang();
        const rows = text.story(lang, node.id);

        if (readingId && readingId !== node.id) {
          scrollMemory.set(readingId, body.scrollTop);
          store.rememberPosition(readingId, scrollFraction());
        }
        readingId = node.id;

        title.textContent = node.id;
        title.title = node.id;
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

      return {
        clearScrollMemory,
        edgeLabelOf,
        focusText,
        nextTargets,
        render,
        scrollFraction,
        syncBookmark,
      };
    });
})();
