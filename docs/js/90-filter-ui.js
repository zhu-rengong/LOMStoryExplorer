(() => {
  "use strict";

  const SR = window.SR;

  const RESULT_LIMIT = 50;

  const FIELD_LABEL_KEYS = {
    speaker: "fieldSpeaker", flag: "fieldFlag", check: "fieldCheck", stat: "fieldStat",
    rel: "fieldRel", option: "fieldOption", lock: "fieldLock", dice: "fieldDice",
    out: "fieldOut", in: "fieldIn", saycount: "fieldSay", id: "fieldId",
    chapter: "fieldChapter", text: "fieldText", kind: "fieldKind", via: "fieldVia",
  };

  const EXAMPLES = [
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

  const TEXT_RE = /\btext\s*[:=!<>]|正文|關鍵詞|关键词/i;

  SR.define("filterUi",
    ["store", "graph", "schema", "i18n", "query", "text", "overlay", "ui"],
    ({ store, graph, schema, i18n, query, text, overlay, ui }) => {
      const $ = ui.$;

      let suggest = { open: false, items: [], active: 0, from: 0, to: 0, mode: "field" };
      let timer = null;
      let textCache = { lang: "", count: -1, map: new Map() };
      let contextCache = null;

      const nodeText = (index) => {
        const lang = store.textLang();
        const pack = text.pack(lang);
        const count = pack && pack.stories ? Object.keys(pack.stories).length : 0;
        if (textCache.lang !== lang || textCache.count !== count) {
          textCache = { lang, count, map: new Map() };
          contextCache = null;
        }
        if (textCache.map.has(index)) return textCache.map.get(index);
        const node = graph.nodes[index];
        const rows = pack && pack.stories ? pack.stories[node.id] : null;
        const value = rows ? schema.textOf(rows).toLowerCase() : "";
        textCache.map.set(index, value);
        return value;
      };

      const buildContext = () => {
        if (contextCache) return contextCache;
        const names = text.names(store.textLang());
        contextCache = {
          count: graph.nodes.length,
          nodes: graph.nodes.map((node) => ({
            id: node.id,
            chapter: node.chapter,
            out: node.out,
            in: node.in,
            say: node.say,
            systemIn: node.systemIn,
            entry: node.entry,
          })),
          chapters: graph.chapters,
          facets: graph.nodes.map((node) => node.facets),
          edgeKinds: graph.edgeKinds,
          names: {
            speakers: text.characters(store.textLang()),
            flags: names.flags || {},
            checks: names.checks || {},
            stats: names.stats || {},
            rels: names.rels || {},
          },
          textOf: nodeText,
        };
        return contextCache;
      };

      const resetContext = () => {
        textCache = { lang: "", count: -1, map: new Map() };
        contextCache = null;
      };

      const hideSuggestRaw = () => {
        const box = $("filterSuggest");
        const input = $("filterExpr");
        if (box) box.hidden = true;
        if (input) input.setAttribute("aria-expanded", "false");
        suggest = { open: false, items: [], active: 0, from: 0, to: 0, mode: "field" };
      };

      const hideSuggest = () => {
        if (!overlay.close("filterSuggest")) hideSuggestRaw();
      };

      const paintSuggest = () => {
        const box = $("filterSuggest");
        if (!box) return;
        const rows = box.querySelectorAll(".suggest-item");
        rows.forEach((row, index) => row.classList.toggle("is-active", index === suggest.active));
        const current = rows[suggest.active];
        if (current && current.scrollIntoView) current.scrollIntoView({ block: "nearest" });
      };

      const moveSuggest = (delta) => {
        if (!suggest.items.length) return;
        suggest.active = (suggest.active + delta + suggest.items.length) % suggest.items.length;
        paintSuggest();
      };

      const renderResults = () => {
        const box = $("filterResults");
        if (!box) return;
        const state = store.state;
        if (!state.filterSet || !state.filterSource.trim()) {
          box.hidden = true;
          box.replaceChildren();
          return;
        }
        const indexes = Array.from(state.filterSet);
        box.hidden = false;
        box.replaceChildren();
        box.appendChild(ui.el("div", "filter-results-title", i18n.t("filterResults", { n: indexes.length })));
        if (!indexes.length) {
          box.appendChild(ui.el("div", "filter-results-empty", i18n.t("filterResultsEmpty")));
          return;
        }
        const list = ui.el("div", "filter-results-list");
        indexes.slice(0, RESULT_LIMIT).forEach((index) => {
          const node = graph.nodes[index];
          const item = ui.el("button",
            `result-item row row-sm${store.state.selectedId === node.id ? " is-active" : ""}`);
          item.type = "button";
          item.dataset.id = node.id;
          item.appendChild(ui.el("span", "ri-id", node.id));
          item.appendChild(ui.el("span", "ri-ch", i18n.chapterTitle(graph.chapterOf(node))));
          item.addEventListener("click", () => {
            close();
            store.select(node.id, { history: true });
          });
          list.appendChild(item);
        });
        box.appendChild(list);
        if (indexes.length > RESULT_LIMIT) {
          box.appendChild(ui.el("div", "filter-results-more",
            i18n.t("filterResultsMore", { n: indexes.length - RESULT_LIMIT })));
        }
      };

      const updateUi = () => {
        const state = store.state;
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
        const button = $("filterBtn");
        if (button) button.classList.toggle("is-on", active);

        const expr = $("filterExpr");
        if (expr) {
          expr.classList.toggle("is-error", !!state.filterError);
          if (document.activeElement !== expr && expr.value !== state.filterSource) {
            expr.value = state.filterSource;
          }
        }

        const status = $("filterStatus");
        if (status) {
          if (state.filterError) {
            status.textContent = state.filterError;
            status.className = "filter-status is-error";
          } else if (!state.filterSource.trim()) {
            status.textContent = i18n.t("filterIdle");
            status.className = "filter-status";
          } else if (state.filterSet && state.filterSet.size === 0) {
            status.textContent = state.filterLoading ? i18n.t("filterLoadingText") : i18n.t("filterNoMatch");
            status.className = state.filterLoading ? "filter-status" : "filter-status is-error";
          } else {
            status.textContent = state.filterLoading ? i18n.t("filterLoadingText") : "";
            status.className = "filter-status is-ok";
          }
        }

        const count = $("filterCount");
        if (count) {
          count.textContent = state.filterSet
            ? i18n.t("filterCount", { n: state.filterSet.size, total: graph.nodes.length })
            : "";
        }
        renderResults();
      };

      const apply = (source) => {
        const value = source || "";
        store.applyFilter({ source: value });
        if (!value.trim()) {
          store.applyFilter({ source: "", set: null, error: "", loading: false });
          return { ok: true, count: null };
        }
        const loading = TEXT_RE.test(value) && !text.progress(store.textLang()).done;
        store.applyFilter({ loading });
        if (loading) {
          text.ensureAll(store.textLang()).then(() => {
            resetContext();
            if (store.state.filterSource === value) {
              const result = query.compile(value, buildContext());
              store.applyFilter({
                set: result.ok ? result.set : null,
                error: result.ok ? "" : i18n.t("filterSyntax", {
                  column: result.error.column, message: result.error.message,
                }),
                loading: false,
              });
            }
          });
        }
        const result = query.compile(value, buildContext());
        if (!result.ok) {
          store.applyFilter({
            set: null,
            error: i18n.t("filterSyntax", { column: result.error.column, message: result.error.message }),
            loading: false,
          });
          return { ok: false, count: 0 };
        }
        store.applyFilter({ set: result.set, error: "", loading });
        return { ok: true, count: result.set ? result.set.size : 0 };
      };

      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const expr = $("filterExpr");
          if (expr) apply(expr.value);
        }, 250);
      };

      const insertAtCursor = (input, value) => {
        if (!input) return;
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const textValue = input.value || "";
        input.value = textValue.slice(0, start) + value + textValue.slice(end);
        const caret = start + value.length;
        input.setSelectionRange(caret, caret);
        input.focus();
      };

      const suggestLabel = (item) => {
        if (item.kind === "field") return i18n.t(FIELD_LABEL_KEYS[item.value] || item.value);
        if (item.kind === "logic") return "";
        return item.label || "";
      };

      const updateSuggest = () => {
        const input = $("filterExpr");
        const box = $("filterSuggest");
        if (!input || !box) return;
        if (!input.value) {
          hideSuggest();
          return;
        }
        const result = query.suggest(input.value, input.selectionStart, buildContext());
        suggest.mode = result.mode;
        suggest.from = result.from;
        suggest.to = result.to;
        suggest.items = result.items || [];
        suggest.active = 0;
        suggest.open = true;

        box.replaceChildren();
        if (!suggest.items.length) {
          box.appendChild(ui.el("div", "suggest-empty popover-empty", i18n.t("suggestEmpty")));
        } else {
          suggest.items.forEach((item, index) => {
            const row = ui.el("button", `suggest-item row row-sm row-accent${index === 0 ? " is-active" : ""}`);
            row.type = "button";
            row.setAttribute("role", "option");
            const shown = item.kind === "logic" ? item.value : item.value + (item.kind === "field" ? ":" : "");
            row.appendChild(ui.el("span", "sg-value", shown));
            const label = suggestLabel(item);
            if (label) row.appendChild(ui.el("span", "sg-label", label));
            if (item.count) row.appendChild(ui.el("span", "sg-count", i18n.t("suggestCount", { n: item.count })));
            row.addEventListener("mousedown", (event) => {
              event.preventDefault();
              accept(index);
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

      const accept = (index) => {
        const input = $("filterExpr");
        const item = suggest.items[index === undefined ? suggest.active : index];
        if (!input || !item) return;
        const insert = item.insert || item.value;
        const value = input.value;
        input.value = value.slice(0, suggest.from) + insert + value.slice(suggest.to);
        const caret = suggest.from + insert.length;
        input.setSelectionRange(caret, caret);
        input.focus();
        hideSuggest();
        schedule();
        if (/(:|\(|\s)$/.test(insert)) updateSuggest();
      };

      const hideRaw = () => {
        const panel = $("filterPanel");
        const button = $("filterBtn");
        if (panel) panel.hidden = true;
        if (button) button.setAttribute("aria-expanded", "false");
        hideSuggestRaw();
      };

      const open = () => {
        const panel = $("filterPanel");
        const button = $("filterBtn");
        if (!panel || !button) return;
        button.setAttribute("aria-expanded", "true");
        const expr = $("filterExpr");
        if (expr) expr.value = store.state.filterSource;
        overlay.open("filterPanel", { trigger: button });
        if (expr) {
          expr.focus();
          expr.select();
        }
        updateUi();
      };

      const close = () => {
        if (!overlay.close("filterPanel")) hideRaw();
      };

      const toggle = () => {
        const panel = $("filterPanel");
        if (!panel) return;
        if (panel.hidden) open();
        else close();
      };

      const bind = () => {
        const fieldBox = $("filterFieldChips");
        if (fieldBox) {
          const frag = document.createDocumentFragment();
          query.fields().forEach((field) => {
            const chip = ui.el("button", "filter-chip btn btn-sm btn-mono",
              i18n.t(FIELD_LABEL_KEYS[field.id] || field.id));
            chip.type = "button";
            chip.dataset.insert = `${field.id}:`;
            frag.appendChild(chip);
          });
          fieldBox.replaceChildren(frag);
          fieldBox.addEventListener("click", (event) => {
            const chip = event.target.closest(".filter-chip");
            if (!chip || !chip.dataset.insert) return;
            insertAtCursor($("filterExpr"), chip.dataset.insert);
            schedule();
          });
        }

        const opBox = $("filterOpChips");
        if (opBox) {
          for (const op of ["AND", "OR", "NOT", "(", ")"]) {
            const chip = ui.el("button", "filter-chip btn btn-sm btn-mono", op);
            chip.type = "button";
            chip.dataset.insert = op === "(" || op === ")" ? op : ` ${op} `;
            opBox.appendChild(chip);
          }
          opBox.addEventListener("click", (event) => {
            const chip = event.target.closest(".filter-chip");
            if (!chip) return;
            insertAtCursor($("filterExpr"), chip.dataset.insert);
            schedule();
          });
        }

        const exampleBox = $("filterExampleChips");
        if (exampleBox) {
          EXAMPLES.forEach((example) => {
            const chip = ui.el("button", "filter-chip btn btn-sm btn-mono", i18n.t(example.key));
            chip.type = "button";
            chip.dataset.expr = example.expr;
            exampleBox.appendChild(chip);
          });
          exampleBox.addEventListener("click", (event) => {
            const chip = event.target.closest(".filter-chip");
            if (!chip || !chip.dataset.expr) return;
            const expr = $("filterExpr");
            if (expr) expr.value = chip.dataset.expr;
            apply(chip.dataset.expr);
            updateUi();
          });
        }

        const button = $("filterBtn");
        if (button) {
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            toggle();
          });
        }

        const expr = $("filterExpr");
        if (expr) {
          expr.addEventListener("input", () => {
            schedule();
            updateSuggest();
          });
          expr.addEventListener("click", updateSuggest);
          expr.addEventListener("keyup", (event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) >= 0) updateSuggest();
          });
          expr.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              if (suggest.open) {
                event.preventDefault();
                event.stopPropagation();
                hideSuggest();
                return;
              }
              hideSuggest();
              return;
            }
            if (event.key === "ArrowDown" && suggest.open) {
              event.preventDefault();
              moveSuggest(1);
              return;
            }
            if (event.key === "ArrowUp" && suggest.open) {
              event.preventDefault();
              moveSuggest(-1);
              return;
            }
            if (suggest.open && suggest.items.length
              && (event.key === "Tab" || (event.key === "Enter" && !event.ctrlKey))) {
              event.preventDefault();
              accept(suggest.active);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              clearTimeout(timer);
              hideSuggest();
              apply(expr.value);
            }
          });
          expr.addEventListener("blur", () => {
            setTimeout(hideSuggest, 120);
          });
        }

        const applyButton = $("filterApply");
        if (applyButton) {
          applyButton.addEventListener("click", () => {
            clearTimeout(timer);
            const input = $("filterExpr");
            apply(input ? input.value : "");
          });
        }

        overlay.register("filterPanel", {
          id: "filterPanel",
          triggerId: "filterBtn",
          group: "pop",
          onHide: hideRaw,
        });
        overlay.register("filterSuggest", {
          id: "filterSuggest",
          group: "menu",
          keep: ["filterPanel"],
          onHide: hideSuggestRaw,
          placement: { align: "start", gap: 6, matchWidth: true, fit: true },
        });
      };

      return {
        apply,
        bind,
        close,
        open,
        reset: () => {
          resetContext();
          updateUi();
        },
        sync: updateUi,
        toggle,
        updateUi,
      };
    });
})();
