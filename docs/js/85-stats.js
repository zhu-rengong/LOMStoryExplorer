(() => {
  "use strict";

  const SR = window.SR;

  const KINDS = ["dialog", "narration", "think", "option", "lore"];

  const KIND_LABEL = {
    dialog: "typeDialog",
    narration: "typeNarration",
    think: "typeThink",
    option: "typeOption",
    lore: "typeLore",
  };

  SR.define("stats", ["store", "graph", "i18n", "overlay", "ui"],
    ({ store, graph, i18n, overlay, ui }) => {
      const $ = ui.$;

      let dataPromise = null;
      let openFlag = false;
      let activeKind = "all";
      let openChapter = "";
      let lastFocus = null;
      let chapterNodes = null;

      const ensureData = () => {
        if (window.SR_WORDCOUNT) return Promise.resolve(window.SR_WORDCOUNT);
        if (dataPromise) return dataPromise;
        dataPromise = new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "data/wordcount.js";
          script.async = true;
          script.onload = () => resolve(window.SR_WORDCOUNT || null);
          script.onerror = () => resolve(null);
          document.head.appendChild(script);
        });
        return dataPromise;
      };

      const pack = () => {
        const all = window.SR_WORDCOUNT;
        if (!all || !all.langs) return null;
        return all.langs[store.textLang()] || all.langs[Object.keys(all.langs)[0]] || null;
      };

      const counts = (row, kind) => {
        const total = [0, 0];
        if (!row) return total;
        for (let index = 0; index < KINDS.length; index++) {
          if (kind !== "all" && KINDS[index] !== kind) continue;
          const pair = row[index];
          if (!pair) continue;
          total[0] += pair[0] || 0;
          total[1] += pair[1] || 0;
        }
        return total;
      };

      const chapterNodeMap = () => {
        if (chapterNodes) return chapterNodes;
        chapterNodes = {};
        for (const node of graph.nodes) {
          const chapter = graph.chapters[node.chapter];
          if (!chapter) continue;
          (chapterNodes[chapter.id] || (chapterNodes[chapter.id] = [])).push(node.id);
        }
        return chapterNodes;
      };

      const storyIdsOf = (chapterId) => chapterNodeMap()[chapterId] || [];

      const hidePanelRaw = () => {
        const panel = $("statsPanel");
        if (panel) {
          panel.hidden = true;
          panel.setAttribute("aria-hidden", "true");
        }
        openFlag = false;
        const button = $("statsBtn");
        if (button) {
          ui.setOn(button, false);
          ui.setExpanded(button, false);
        }
      };

      const setBodyMessage = (text, className) => {
        const body = $("statsBody");
        if (!body) return;
        body.replaceChildren();
        body.appendChild(ui.el("p", className || "stats-empty popover-empty", text));
      };

      const statCard = (labelKey, value) => {
        const card = ui.el("div", "stat-card");
        card.appendChild(ui.el("span", "stat-value", ui.formatNumber(value)));
        card.appendChild(ui.el("span", "stat-label", i18n.t(labelKey)));
        return card;
      };

      const renderSummary = () => {
        const box = $("statsSummary");
        if (!box) return;
        const data = pack();
        box.replaceChildren();
        const total = [0, 0];
        if (data) {
          Object.keys(data.stories || {}).forEach((id) => {
            const pair = counts(data.stories[id], "all");
            if (!pair[0] && !pair[1]) return;
            total[0] += pair[0];
            total[1] += pair[1];
          });
        }
        box.appendChild(statCard("statsZh", total[0]));
        box.appendChild(statCard("statsEn", total[1]));
        box.appendChild(statCard("statsSum", total[0] + total[1]));
        box.appendChild(ui.el("span", "stats-note",
          i18n.t("statsNote", { n: graph.nodes.length, chapters: graph.chapters.length })));
      };

      const numCell = (value, className) => ui.el("td", `num${className ? ` ${className}` : ""}`,
        ui.formatNumber(value));

      const storyRow = (id, pair) => {
        const row = ui.el("tr", "stats-story");
        const nameCell = ui.el("td", "name");
        const button = ui.el("button", "stats-open btn-link", id);
        button.type = "button";
        button.title = i18n.t("statsOpen");
        button.addEventListener("click", () => {
          closePanel();
          store.select(id, { history: true });
        });
        nameCell.appendChild(button);
        row.appendChild(nameCell);
        row.appendChild(ui.el("td", "num muted", "—"));
        row.appendChild(numCell(pair[0]));
        row.appendChild(numCell(pair[1]));
        row.appendChild(numCell(pair[0] + pair[1], "sum"));
        return row;
      };

      const chapterRow = (data, chapter) => {
        const pair = counts((data.chapters || {})[chapter.id], activeKind);
        const isOpen = openChapter === chapter.id;
        const row = ui.el("tr", `stats-chapter${isOpen ? " is-open" : ""}`);
        row.dataset.chapter = chapter.id;

        const nameCell = ui.el("th", "name");
        nameCell.scope = "row";
        const button = ui.el("button", "stats-expand row");
        button.type = "button";
        ui.setExpanded(button, isOpen);
        button.appendChild(ui.el("span", "stats-name", i18n.chapterTitle(chapter)));
        nameCell.appendChild(button);
        row.appendChild(nameCell);

        row.appendChild(numCell(storyIdsOf(chapter.id).length));
        row.appendChild(numCell(pair[0]));
        row.appendChild(numCell(pair[1]));
        row.appendChild(numCell(pair[0] + pair[1], "sum"));

        button.addEventListener("click", () => {
          openChapter = isOpen ? "" : chapter.id;
          renderTable();
        });
        return row;
      };

      const colgroup = () => {
        const group = ui.el("colgroup");
        group.appendChild(ui.el("col", "col-name"));
        for (let index = 0; index < 4; index++) group.appendChild(ui.el("col", "col-num"));
        return group;
      };

      const renderTable = () => {
        const body = $("statsBody");
        if (!body) return;
        const data = pack();
        if (!data) {
          setBodyMessage(i18n.t("statsEmpty"), "stats-empty");
          return;
        }
        body.replaceChildren();

        const headBox = ui.el("div", "stats-head");
        const headTable = ui.el("table", "stats-table");
        headTable.appendChild(colgroup());
        const head = ui.el("thead");
        const headRow = ui.el("tr");
        ["statsChapter", "statsStories", "statsZh", "statsEn", "statsSum"].forEach((key, index) => {
          const cell = ui.el("th", index ? "num" : "name", i18n.t(key));
          cell.scope = "col";
          headRow.appendChild(cell);
        });
        head.appendChild(headRow);
        headTable.appendChild(head);
        headBox.appendChild(headTable);
        body.appendChild(headBox);

        const table = ui.el("table", "stats-table");
        table.appendChild(colgroup());

        const tbody = ui.el("tbody");
        const foot = [0, 0];
        graph.chapters.forEach((chapter) => {
          const pair = counts((data.chapters || {})[chapter.id], activeKind);
          foot[0] += pair[0];
          foot[1] += pair[1];
          tbody.appendChild(chapterRow(data, chapter));
          if (openChapter !== chapter.id) return;
          const rows = storyIdsOf(chapter.id).map((id) => ({
            id,
            pair: counts((data.stories || {})[id], activeKind),
          })).filter((item) => item.pair[0] || item.pair[1]);
          rows.sort((a, b) => (b.pair[0] + b.pair[1]) - (a.pair[0] + a.pair[1]));
          rows.forEach((item) => tbody.appendChild(storyRow(item.id, item.pair)));
        });
        table.appendChild(tbody);

        const footRow = ui.el("tr", "stats-total");
        footRow.appendChild(ui.el("th", "name", i18n.t("statsTotalRow")));
        footRow.appendChild(ui.el("td", "num", ""));
        footRow.appendChild(numCell(foot[0]));
        footRow.appendChild(numCell(foot[1]));
        footRow.appendChild(numCell(foot[0] + foot[1], "sum"));
        const tfoot = ui.el("tfoot");
        tfoot.appendChild(footRow);
        table.appendChild(tfoot);
        body.appendChild(table);
      };

      const renderKinds = () => {
        const box = $("statsKinds");
        if (!box) return;
        box.replaceChildren();
        const items = [{ id: "all", key: "statsKindAll" }];
        KINDS.forEach((kind) => items.push({ id: kind, key: KIND_LABEL[kind] }));
        items.forEach((item) => {
          const button = ui.el("button", `stats-kind btn btn-sm${item.id === activeKind ? " is-on" : ""}`,
            i18n.t(item.key));
          button.type = "button";
          button.setAttribute("aria-pressed", item.id === activeKind ? "true" : "false");
          button.addEventListener("click", () => {
            if (activeKind === item.id) return;
            activeKind = item.id;
            renderKinds();
            renderTable();
          });
          box.appendChild(button);
        });
      };

      const openPanel = (trigger) => {
        const panel = $("statsPanel");
        if (!panel) return;
        lastFocus = trigger || $("statsBtn");
        openFlag = true;
        openChapter = "";
        panel.setAttribute("aria-hidden", "false");
        const button = $("statsBtn");
        if (button) {
          ui.setOn(button, true);
          ui.setExpanded(button, true);
        }
        renderSummary();
        renderKinds();
        setBodyMessage(i18n.t("statsLoading"), "stats-loading");
        overlay.open("stats", { trigger: lastFocus, autofocus: "statsClose" });
        ensureData().then(() => {
          if (!openFlag) return;
          chapterNodes = null;
          renderSummary();
          renderTable();
        });
      };

      const closePanel = () => {
        if (!overlay.close("stats")) hidePanelRaw();
        if (lastFocus && lastFocus.isConnected) {
          try {
            lastFocus.focus({ preventScroll: true });
          } catch {
            lastFocus = null;
          }
        }
      };

      const refresh = () => {
        if (!openFlag) return;
        chapterNodes = null;
        renderSummary();
        renderKinds();
        renderTable();
      };

      const init = () => {
        const button = $("statsBtn");
        if (button) {
          button.addEventListener("click", () => {
            if (openFlag) closePanel();
            else openPanel(button);
          });
        }
        const close = $("statsClose");
        if (close) close.addEventListener("click", closePanel);
      };

      overlay.register("stats", {
        id: "statsPanel",
        triggerId: "statsBtn",
        group: "modal",
        onHide: hidePanelRaw,
        autofocus: "statsClose",
      });

      return {
        init,
        open: openPanel,
        refresh,
      };
    });
})();
