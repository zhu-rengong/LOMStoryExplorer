(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const FACETS = SR.data.FACETS;
  const chapterOf = SR.data.chapterOf;
  const chapterTitle = SR.i18n.chapterTitle;
  const chapters = SR.data.chapters;
  const computeVisibility = SR.data.computeVisibility;
  const edgeKinds = SR.data.edgeKinds;
  const el = SR.core.el;
  const ensureAllText = SR.text.ensureAllText;
  const langPack = SR.text.langPack;
  const nodes = SR.data.nodes;
  const overlay = SR.overlay;
  const persist = SR.store.persist;
  const select = SR.fwd("actions", "select");
  const state = SR.core.state;
  const stripRich = SR.reader.stripRich;
  const t = SR.i18n.t;
  const textDone = SR.text.textDone;

  const FILTER_TEXT_RE = /\btext\s*[:=!<>]|正文|關鍵詞|关键词/i;

  const FILTER_RESULT_LIMIT = 50;

  const FIELD_LABEL_KEYS = {
    speaker: "fieldSpeaker", flag: "fieldFlag", check: "fieldCheck", stat: "fieldStat",
    rel: "fieldRel", option: "fieldOption", lock: "fieldLock", dice: "fieldDice",
    out: "fieldOut", in: "fieldIn", saycount: "fieldSay", id: "fieldId",
    chapter: "fieldChapter", text: "fieldText", kind: "fieldKind", via: "fieldVia",
  };

  const FILTER_EXAMPLES = [
    { key: "exLock", expr: "lock >= 1" },
    { key: "exDice", expr: "dice >= 1" },
    { key: "exOptions", expr: "option >= 5" },
    { key: "exSpeaker", expr: "speaker:master" },
    { key: "exLeaf", expr: "out = 0" },
    { key: "exEntry", expr: "in = 0" },
    { key: "exSystem", expr: "kind:sys" },
    { key: "exVia", expr: "via:free" },
    { key: "exChapter", expr: "chapter:第1章" },
    { key: "exCombo", expr: "speaker:master AND (dice:yes OR lock:yes)" },
  ];

  let textCache = { lang: "", map: new Map() };

  let filterTimer = null;

  const suggestState = { open: false, items: [], active: 0, from: 0, to: 0, mode: "field" };

  const nodeText = (i) => {
    if (textCache.lang !== state.lang) textCache = { lang: state.lang, map: new Map() };
    if (textCache.map.has(i)) return textCache.map.get(i);
    const pack = langPack(state.lang);
    const beats = (pack.stories || {})[nodes[i].id] || [];
    const parts = [];
    const walk = (rows) => {
      for (const beat of rows) {
        if (beat[0] === "s") {
          parts.push(stripRich(beat[2]));
        } else if (beat[0] === "c") {
          for (const branch of beat[1]) {
            parts.push(stripRich(branch[0]));
            walk(branch[2] || []);
          }
        } else if (beat[0] === "br") {
          walk(beat[2] || []);
        }
      }
    };
    walk(beats);
    const text = parts.join(" ").toLowerCase();
    textCache.map.set(i, text);
    return text;
  };

  const queryCtx = {
    count: nodes.length,
    nodes: nodes.map((node) => ({
      id: node.id,
      ch: node.ch,
      out: node.out,
      in: node.inc,
      say: node.say,
      flags: node.flags,
      sysIn: node.sysIn,
      entry: node.entry,
    })),
    chapters: chapters,
    facets: FACETS || [],
    edgeKinds: edgeKinds,
    names: null,
    textOf: nodeText,
  };

  const resetTextCaches = () => {
    textCache = { lang: "", map: new Map() };
    state.searchIndex = null;
    queryCtx._index = null;
    queryCtx._values = null;
  };

  const syncQueryNames = () => {
    const pack = langPack(state.lang);
    const names = pack.names || {};
    queryCtx.names = {
      speakers: pack.characters || {},
      rels: pack.characters || {},
      flags: names.flags || {},
      checks: names.checks || {},
      stats: names.stats || {},
    };
    queryCtx._index = null;
    queryCtx._values = null;
  };

  const insertAtCursor = (input, text) => {
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const value = input.value || "";
    input.value = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
    input.focus();
  };

  const suggestLabel = (item) => {
    if (item.kind === "field") return t(FIELD_LABEL_KEYS[item.value] || item.value);
    if (item.kind === "logic") return "";
    return item.label || "";
  };

  const hideSuggestRaw = () => {
    const box = $("filterSuggest");
    const input = $("filterExpr");
    if (box) box.hidden = true;
    if (input) input.setAttribute("aria-expanded", "false");
    suggestState.open = false;
    suggestState.items = [];
    suggestState.active = 0;
  };

  const hideSuggest = () => {
    if (!overlay.close("filterSuggest")) hideSuggestRaw();
  };

  const paintSuggestActive = () => {
    const box = $("filterSuggest");
    if (!box) return;
    const rows = box.querySelectorAll(".suggest-item");
    rows.forEach((row, index) => {
      row.classList.toggle("is-active", index === suggestState.active);
    });
    const active = rows[suggestState.active];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  };

  const moveSuggest = (delta) => {
    if (!suggestState.items.length) return;
    suggestState.active = (suggestState.active + delta + suggestState.items.length) % suggestState.items.length;
    paintSuggestActive();
  };

  const scheduleFilterApply = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      const expr = $("filterExpr");
      if (expr) applyFilterSource(expr.value);
    }, 250);
  };

  const renderFilterResults = () => {
    const box = $("filterResults");
    if (!box) return;
    if (!state.filterSet || !state.filterSource.trim()) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const ids = Array.from(state.filterSet);
    box.hidden = false;
    box.replaceChildren();
    box.appendChild(el("div", "filter-results-title", t("filterResults", { n: ids.length })));
    if (!ids.length) {
      box.appendChild(el("div", "filter-results-empty", t("filterResultsEmpty")));
      return;
    }
    const list = el("div", "filter-results-list");
    ids.slice(0, FILTER_RESULT_LIMIT).forEach((index) => {
      const node = nodes[index];
      const item = el("button", `result-item row row-sm${state.selected && state.selected.i === index ? " is-active" : ""}`);
      item.type = "button";
      item.dataset.id = node.id;
      item.appendChild(el("span", "ri-id", node.id));
      item.appendChild(el("span", "ri-ch", chapterTitle(chapterOf(node))));
      item.addEventListener("click", () => {
        closeFilterPanel();
        select(node, { history: true, animate: true });
      });
      list.appendChild(item);
    });
    box.appendChild(list);
    if (ids.length > FILTER_RESULT_LIMIT) {
      box.appendChild(el("div", "filter-results-more",
        t("filterResultsMore", { n: ids.length - FILTER_RESULT_LIMIT })));
    }
  };

  const updateFilterUi = () => {
    const badge = $("filterBadge");
    const active = !!state.filterSet;
    if (badge) {
      if (active) {
        badge.hidden = false;
        badge.textContent = state.filterSet.size > 99 ? "99+" : String(state.filterSet.size);
      } else {
        badge.hidden = true;
      }
    }
    const btn = $("filterBtn");
    if (btn) btn.classList.toggle("is-on", active);

    const expr = $("filterExpr");
    if (expr) expr.classList.toggle("is-error", !!state.filterError);

    const status = $("filterStatus");
    if (status) {
      if (state.filterError) {
        status.textContent = state.filterError;
        status.className = "filter-status is-error";
      } else if (!state.filterSource.trim()) {
        status.textContent = t("filterIdle");
        status.className = "filter-status";
      } else if (state.filterSet && state.filterSet.size === 0) {
        status.textContent = state.filterLoading ? t("filterLoadingText") : t("filterNoMatch");
        status.className = state.filterLoading ? "filter-status" : "filter-status is-error";
      } else {
        status.textContent = state.filterLoading ? t("filterLoadingText") : "";
        status.className = "filter-status is-ok";
      }
    }

    const count = $("filterCount");
    if (count) {
      count.textContent = state.filterSet
        ? t("filterCount", { n: state.filterSet.size, total: nodes.length })
        : "";
    }

    renderFilterResults();
  };

  const recomputeAfterFilter = () => {
    computeVisibility();
    updateFilterUi();
    persist();
  };

  const applyFilterSource = (source) => {
    state.filterSource = source || "";
    if (!state.filterSource.trim()) {
      state.filterSet = null;
      state.filterError = null;
      recomputeAfterFilter();
      return { ok: true, count: null };
    }
    if (!window.StoryQuery || !FACETS) {
      state.filterSet = null;
      state.filterError = t("filterNeedData");
      recomputeAfterFilter();
      return { ok: false, count: null };
    }
    syncQueryNames();
    if (FILTER_TEXT_RE.test(state.filterSource) && !textDone()) {
      state.filterLoading = true;
      ensureAllText();
    } else {
      state.filterLoading = false;
    }
    const result = window.StoryQuery.compile(state.filterSource, queryCtx);
    if (!result.ok) {
      state.filterError = `第 ${result.error.column} 列：${result.error.message}`;
      recomputeAfterFilter();
      return { ok: false, count: state.filterSet ? state.filterSet.size : 0 };
    }
    state.filterError = null;
    state.filterSet = result.set;
    recomputeAfterFilter();
    return { ok: true, count: state.filterSet ? state.filterSet.size : 0 };
  };

  const updateSuggest = () => {
    const input = $("filterExpr");
    const box = $("filterSuggest");
    if (!input || !box || !window.StoryQuery) return;
    if (!input.value) {
      hideSuggest();
      return;
    }

    const result = window.StoryQuery.suggest(input.value, input.selectionStart, queryCtx);
    suggestState.mode = result.mode;
    suggestState.from = result.from;
    suggestState.to = result.to;
    suggestState.items = result.items || [];
    suggestState.active = 0;
    suggestState.open = true;

    box.replaceChildren();
    if (!suggestState.items.length) {
      box.appendChild(el("div", "suggest-empty popover-empty", t("suggestEmpty")));
    } else {
      suggestState.items.forEach((item, index) => {
        const row = el("button", `suggest-item row row-sm row-accent${index === 0 ? " is-active" : ""}`);
        row.type = "button";
        row.setAttribute("role", "option");
        const shown = item.kind === "logic" ? item.value : item.value + (item.kind === "field" ? ":" : "");
        row.appendChild(el("span", "sg-value", shown));
        const label = suggestLabel(item);
        if (label) row.appendChild(el("span", "sg-label", label));
        if (item.count) row.appendChild(el("span", "sg-count", t("suggestCount", { n: item.count })));
        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          acceptSuggest(index);
        });
        box.appendChild(row);
      });
    }
    input.setAttribute("aria-expanded", "true");
    overlay.open("filterSuggest", {
      trigger: input,
      keep: ["filterPanel"],
      placement: { align: "start", gap: 6, matchWidth: true, fit: true },
    });
  };

  const acceptSuggest = (index) => {
    const input = $("filterExpr");
    const item = suggestState.items[index === undefined ? suggestState.active : index];
    if (!input || !item) return;
    const insert = item.insert || item.value;
    const value = input.value;
    input.value = value.slice(0, suggestState.from) + insert + value.slice(suggestState.to);
    const caret = suggestState.from + insert.length;
    input.setSelectionRange(caret, caret);
    input.focus();
    hideSuggest();
    scheduleFilterApply();
    if (/(:|\(|\s)$/.test(insert)) updateSuggest();
  };

  const hideFilterPanelRaw = () => {
    const panel = $("filterPanel");
    const btn = $("filterBtn");
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    hideSuggestRaw();
  };

  const openFilterPanel = () => {
    const panel = $("filterPanel");
    const btn = $("filterBtn");
    if (!panel || !btn) return;
    btn.setAttribute("aria-expanded", "true");
    const expr = $("filterExpr");
    if (expr) expr.value = state.filterSource;
    overlay.open("filterPanel", { trigger: btn });
    if (expr) {
      expr.focus();
      expr.select();
    }
    updateFilterUi();
  };

  const closeFilterPanel = () => {
    if (!overlay.close("filterPanel")) hideFilterPanelRaw();
  };

  const toggleFilterPanel = () => {
    const panel = $("filterPanel");
    if (!panel) return;
    if (panel.hidden) openFilterPanel();
    else closeFilterPanel();
  };

  const initFilterUi = () => {
    const fieldBox = $("filterFieldChips");
    if (fieldBox && window.StoryQuery) {
      const frag = document.createDocumentFragment();
      window.StoryQuery.fields().forEach((field) => {
        const chip = el("button", "filter-chip chip chip-mono", t(FIELD_LABEL_KEYS[field.id] || field.id));
        chip.type = "button";
        chip.dataset.insert = `${field.id}:`;
        frag.appendChild(chip);
      });
      fieldBox.replaceChildren(frag);
      fieldBox.addEventListener("click", (event) => {
        const chip = event.target.closest(".filter-chip");
        if (!chip || !chip.dataset.insert) return;
        insertAtCursor($("filterExpr"), chip.dataset.insert);
        scheduleFilterApply();
      });
    }

    const opBox = $("filterOpChips");
    if (opBox) {
      ["AND", "OR", "NOT", "(", ")"].forEach((op) => {
        const chip = el("button", "filter-chip chip chip-mono", op);
        chip.type = "button";
        chip.dataset.insert = op === "(" || op === ")" ? op : ` ${op} `;
        opBox.appendChild(chip);
      });
      opBox.addEventListener("click", (event) => {
        const chip = event.target.closest(".filter-chip");
        if (!chip) return;
        insertAtCursor($("filterExpr"), chip.dataset.insert);
        scheduleFilterApply();
      });
    }

    const exBox = $("filterExampleChips");
    if (exBox) {
      FILTER_EXAMPLES.forEach((example) => {
        const chip = el("button", "filter-chip chip chip-mono", t(example.key));
        chip.type = "button";
        chip.dataset.expr = example.expr;
        exBox.appendChild(chip);
      });
      exBox.addEventListener("click", (event) => {
        const chip = event.target.closest(".filter-chip");
        if (!chip || !chip.dataset.expr) return;
        const expr = $("filterExpr");
        if (expr) expr.value = chip.dataset.expr;
        applyFilterSource(chip.dataset.expr);
        updateFilterUi();
      });
    }

    const btn = $("filterBtn");
    if (btn) {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFilterPanel();
      });
    }

    const expr = $("filterExpr");
    if (expr) {
      expr.addEventListener("input", () => {
        scheduleFilterApply();
        updateSuggest();
      });
      expr.addEventListener("click", updateSuggest);
      expr.addEventListener("keyup", (event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) >= 0) updateSuggest();
      });
      expr.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (suggestState.open) {
            event.preventDefault();
            event.stopPropagation();
            hideSuggest();
            return;
          }
          hideSuggest();
          return;
        }
        if (event.key === "ArrowDown" && suggestState.open) {
          event.preventDefault();
          moveSuggest(1);
          return;
        }
        if (event.key === "ArrowUp" && suggestState.open) {
          event.preventDefault();
          moveSuggest(-1);
          return;
        }
        if (suggestState.open && suggestState.items.length
            && (event.key === "Tab" || (event.key === "Enter" && !event.ctrlKey))) {
          event.preventDefault();
          acceptSuggest(suggestState.active);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          clearTimeout(filterTimer);
          hideSuggest();
          applyFilterSource(expr.value);
        }
      });
      expr.addEventListener("blur", () => {
        setTimeout(hideSuggest, 120);
      });
    }

    const apply = $("filterApply");
    if (apply) {
      apply.addEventListener("click", () => {
        clearTimeout(filterTimer);
        const input = $("filterExpr");
        applyFilterSource(input ? input.value : "");
      });
    }

    const clear = $("filterClear");
    if (clear) {
      clear.addEventListener("click", () => {
        clearTimeout(filterTimer);
        const input = $("filterExpr");
        if (input) {
          input.value = "";
          input.focus();
        }
        applyFilterSource("");
      });
    }

    document.addEventListener("click", (event) => {
      const panel = $("filterPanel");
      const button = $("filterBtn");
      if (!panel) return;
      if (!panel.hidden && !panel.contains(event.target) && !(button && button.contains(event.target))) {
        closeFilterPanel();
        return;
      }
      if (!event.target.closest || !event.target.closest(".filter-input-wrap")) hideSuggest();
    });
  };

  overlay.register("filterPanel", {
    id: "filterPanel",
    triggerId: "filterBtn",
    group: "sheet",
    hide: hideFilterPanelRaw,
    placement: { align: "end", width: 440, fit: true },
  });
  overlay.register("filterSuggest", {
    id: "filterSuggest",
    group: "menu",
    hide: hideSuggestRaw,
    keep: ["filterPanel"],
    placement: { align: "start", gap: 6, matchWidth: true, fit: true },
  });

  SR.register("filter", {
    FIELD_LABEL_KEYS: FIELD_LABEL_KEYS,
    FILTER_EXAMPLES: FILTER_EXAMPLES,
    FILTER_RESULT_LIMIT: FILTER_RESULT_LIMIT,
    FILTER_TEXT_RE: FILTER_TEXT_RE,
    acceptSuggest: acceptSuggest,
    applyFilterSource: applyFilterSource,
    closeFilterPanel: closeFilterPanel,
    hideSuggest: hideSuggest,
    initFilterUi: initFilterUi,
    insertAtCursor: insertAtCursor,
    moveSuggest: moveSuggest,
    nodeText: nodeText,
    openFilterPanel: openFilterPanel,
    paintSuggestActive: paintSuggestActive,
    recomputeAfterFilter: recomputeAfterFilter,
    renderFilterResults: renderFilterResults,
    resetTextCaches: resetTextCaches,
    scheduleFilterApply: scheduleFilterApply,
    suggestLabel: suggestLabel,
    syncQueryNames: syncQueryNames,
    toggleFilterPanel: toggleFilterPanel,
    updateFilterUi: updateFilterUi,
    updateSuggest: updateSuggest,
  });
})();
