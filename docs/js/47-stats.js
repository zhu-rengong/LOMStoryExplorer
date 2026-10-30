(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const chapters = SR.data.chapters;
  const chapterTitle = SR.i18n.chapterTitle;
  const el = SR.core.el;
  const navigateTo = SR.fwd("actions", "navigateTo");
  const nodes = SR.data.nodes;
  const overlay = SR.overlay;
  const state = SR.core.state;
  const t = SR.i18n.t;

  const KINDS = ["dialog", "narration", "think", "option", "lore"];

  const KIND_LABEL = {
    dialog: "typeDialog",
    narration: "typeNarration",
    think: "typeThink",
    option: "typeOption",
    lore: "typeLore",
  };

  const NUMBER_RE = /\B(?=(\d{3})+(?!\d))/g;

  let dataPromise = null;

  let openFlag = false;

  let activeKind = "all";

  let openChapter = "";

  let lastFocus = null;

  let chapterNodes = null;

  const ensureData = () => {
    if (window.__STORY_WORDCOUNT__) return Promise.resolve(window.__STORY_WORDCOUNT__);
    if (dataPromise) return dataPromise;
    dataPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "data/wordcount.js";
      script.async = true;
      script.onload = () => resolve(window.__STORY_WORDCOUNT__ || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
    return dataPromise;
  };

  const pack = () => {
    const all = window.__STORY_WORDCOUNT__;
    if (!all || !all.langs) return null;
    return all.langs[state.lang] || all.langs[Object.keys(all.langs)[0]] || null;
  };

  const counts = (row, kind) => {
    const total = [0, 0];
    if (!row) return total;
    for (let i = 0; i < KINDS.length; i++) {
      if (kind !== "all" && KINDS[i] !== kind) continue;
      const pair = row[i];
      if (!pair) continue;
      total[0] += pair[0] || 0;
      total[1] += pair[1] || 0;
    }
    return total;
  };

  const chapterNodeMap = () => {
    if (chapterNodes) return chapterNodes;
    chapterNodes = {};
    for (const node of nodes) {
      const chapter = chapters[node.ch];
      if (!chapter) continue;
      (chapterNodes[chapter.id] || (chapterNodes[chapter.id] = [])).push(node.id);
    }
    return chapterNodes;
  };

  const storyIdsOf = (chapterId) => chapterNodeMap()[chapterId] || [];

  const num = (value) => String(value || 0).replace(NUMBER_RE, ",");

  const hidePanelRaw = () => {
    const panel = $("statsPanel");
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    openFlag = false;
    const btn = $("statsBtn");
    if (btn) {
      btn.classList.remove("is-on");
      btn.setAttribute("aria-expanded", "false");
    }
  };

  const setBodyMessage = (text, className) => {
    const body = $("statsBody");
    if (!body) return;
    body.replaceChildren();
    body.appendChild(el("p", className || "stats-empty popover-empty", text));
  };

  const statCard = (labelKey, value) => {
    const card = el("div", "stat-card");
    card.appendChild(el("span", "stat-value", num(value)));
    card.appendChild(el("span", "stat-label", t(labelKey)));
    return card;
  };

  const renderSummary = () => {
    const box = $("statsSummary");
    if (!box) return;
    const data = pack();
    box.replaceChildren();
    const total = [0, 0];
    let stories = 0;
    if (data) {
      Object.keys(data.stories || {}).forEach((sid) => {
        const pair = counts(data.stories[sid], "all");
        if (!pair[0] && !pair[1]) return;
        total[0] += pair[0];
        total[1] += pair[1];
        stories += 1;
      });
    }
    box.appendChild(statCard("statsZh", total[0]));
    box.appendChild(statCard("statsEn", total[1]));
    box.appendChild(statCard("statsSum", total[0] + total[1]));
    box.appendChild(el("span", "stats-note", t("statsNote", { n: stories, chapters: chapters.length })));
  };

  const numCell = (value, className) => el("td", `num${className ? ` ${className}` : ""}`, num(value));

  const storyRow = (id, pair) => {
    const row = el("tr", "stats-story");
    const nameCell = el("td", "name");
    const btn = el("button", "stats-open btn-link", id);
    btn.type = "button";
    btn.title = t("statsOpen");
    btn.addEventListener("click", () => {
      closePanel();
      navigateTo(id);
    });
    nameCell.appendChild(btn);
    row.appendChild(nameCell);
    row.appendChild(el("td", "num muted", "—"));
    row.appendChild(numCell(pair[0]));
    row.appendChild(numCell(pair[1]));
    row.appendChild(numCell(pair[0] + pair[1], "sum"));
    return row;
  };

  const chapterRow = (data, chapter) => {
    const pair = counts((data.chapters || {})[chapter.id], activeKind);
    const isOpen = openChapter === chapter.id;
    const row = el("tr", `stats-chapter${isOpen ? " is-open" : ""}`);
    row.dataset.chapter = chapter.id;

    const nameCell = el("th", "name");
    nameCell.scope = "row";
    const btn = el("button", "stats-expand row");
    btn.type = "button";
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    btn.appendChild(el("span", "stats-name", chapterTitle(chapter)));
    nameCell.appendChild(btn);
    row.appendChild(nameCell);

    let stories = 0;
    storyIdsOf(chapter.id).forEach((sid) => {
      const item = counts((data.stories || {})[sid], activeKind);
      if (item[0] || item[1]) stories += 1;
    });
    row.appendChild(numCell(stories));
    row.appendChild(numCell(pair[0]));
    row.appendChild(numCell(pair[1]));
    row.appendChild(numCell(pair[0] + pair[1], "sum"));

    btn.addEventListener("click", () => {
      openChapter = isOpen ? "" : chapter.id;
      renderTable();
    });
    return row;
  };

  const renderTable = () => {
    const body = $("statsBody");
    if (!body) return;
    const data = pack();
    if (!data) {
      setBodyMessage(t("statsEmpty"), "stats-empty");
      return;
    }
    body.replaceChildren();
    const table = el("table", "stats-table");
    const thead = el("thead");
    const headRow = el("tr");
    ["statsChapter", "statsStories", "statsZh", "statsEn", "statsSum"].forEach((key, i) => {
      const th = el("th", i ? "num" : "name", t(key));
      th.scope = "col";
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    const foot = [0, 0];
    chapters.forEach((chapter) => {
      const pair = counts((data.chapters || {})[chapter.id], activeKind);
      foot[0] += pair[0];
      foot[1] += pair[1];
      tbody.appendChild(chapterRow(data, chapter));
      if (openChapter !== chapter.id) return;
      const rows = storyIdsOf(chapter.id).map((sid) => ({
        id: sid,
        pair: counts((data.stories || {})[sid], activeKind),
      })).filter((item) => item.pair[0] || item.pair[1]);
      rows.sort((a, b) => (b.pair[0] + b.pair[1]) - (a.pair[0] + a.pair[1]));
      rows.forEach((item) => {
        tbody.appendChild(storyRow(item.id, item.pair));
      });
    });
    table.appendChild(tbody);

    const tfoot = el("tfoot");
    const totalRow = el("tr", "stats-total");
    totalRow.appendChild(el("th", "name", t("statsTotalRow")));
    totalRow.appendChild(el("td", "num", ""));
    totalRow.appendChild(numCell(foot[0]));
    totalRow.appendChild(numCell(foot[1]));
    totalRow.appendChild(numCell(foot[0] + foot[1], "sum"));
    tfoot.appendChild(totalRow);
    table.appendChild(tfoot);

    body.appendChild(table);
  };

  const renderKinds = () => {
    const box = $("statsKinds");
    if (!box) return;
    box.replaceChildren();
    const items = [{ id: "all", key: "statsKindAll" }];
    KINDS.forEach((kind) => {
      items.push({ id: kind, key: KIND_LABEL[kind] });
    });
    items.forEach((item) => {
      const btn = el("button", `stats-kind chip${item.id === activeKind ? " is-on" : ""}`, t(item.key));
      btn.type = "button";
      btn.setAttribute("aria-pressed", item.id === activeKind ? "true" : "false");
      btn.addEventListener("click", () => {
        if (activeKind === item.id) return;
        activeKind = item.id;
        renderKinds();
        renderTable();
      });
      box.appendChild(btn);
    });
  };

  const openPanel = (trigger) => {
    const panel = $("statsPanel");
    if (!panel) return;
    lastFocus = trigger || $("statsBtn");
    openFlag = true;
    openChapter = "";
    panel.setAttribute("aria-hidden", "false");
    const btn = $("statsBtn");
    if (btn) {
      btn.classList.add("is-on");
      btn.setAttribute("aria-expanded", "true");
    }
    renderSummary();
    renderKinds();
    setBodyMessage(t("statsLoading"), "stats-loading");
    overlay.open("stats", { trigger: lastFocus, autofocus: "statsClose" });
    ensureData().then(() => {
      if (!openFlag) return;
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
    renderSummary();
    renderKinds();
    renderTable();
  };

  const isOpen = () => openFlag;

  const init = () => {
    const btn = $("statsBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        if (openFlag) closePanel();
        else openPanel(btn);
      });
    }
    const closeBtn = $("statsClose");
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
  };

  overlay.register("stats", {
    id: "statsPanel",
    triggerId: "statsBtn",
    group: "modal",
    hide: hidePanelRaw,
    autofocus: "statsClose",
  });

  SR.register("stats", {
    close: closePanel,
    init: init,
    isOpen: isOpen,
    open: openPanel,
    refresh: refresh,
  });
})();
