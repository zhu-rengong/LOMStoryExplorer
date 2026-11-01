(() => {
  "use strict";

  const SR = window.SR;

  SR.define("panels",
    ["store", "graph", "i18n", "beats", "condexpr", "checkpoints", "overlay", "ui", "text"],
    ({ store, graph, i18n, beats, condexpr, checkpoints, overlay, ui, text }) => {
      const $ = ui.$;
      const HOVER_OK = !(window.matchMedia && window.matchMedia("(hover: none)").matches);

      const NAME_GROUP = { check: "checks", flag: "flags", rel: "rels", stat: "stats" };

      const lookup = { open: false, seq: 0 };

      let facetSets = null;
      let nameCache = { lang: "", index: null };
      let preview = null;
      let previewTimer = null;

      const ensureFacetSets = () => {
        if (facetSets) return facetSets;
        const flags = new Set();
        const checks = new Set();
        for (const node of graph.nodes) {
          for (const key of node.facets.flags) flags.add(key);
          for (const key of node.facets.checks) checks.add(key);
        }
        facetSets = { flags, checks };
        return facetSets;
      };

      const resetNameIndex = () => {
        nameCache = { lang: "", index: null };
      };

      const ensureNameIndex = () => {
        if (nameCache.lang === store.textLang() && nameCache.index) return nameCache.index;
        const names = text.names(store.textLang());
        const index = { flags: {}, checks: {}, stats: {}, rels: {} };
        for (const group of ["flags", "checks", "stats", "rels"]) {
          const table = names[group] || {};
          for (const key of Object.keys(table)) index[group][table[key]] = key;
        }
        nameCache = { lang: store.textLang(), index };
        return index;
      };

      const lookupTargetOf = (value) => {
        if (!value) return null;
        const sets = ensureFacetSets();
        const raw = String(value).trim();
        let key = raw;
        let kind = sets.flags.has(key) ? "flag" : sets.checks.has(key) ? "check" : "";
        if (!kind) {
          const index = ensureNameIndex();
          const plain = raw.replace(/\s*[+-]\d+\s*$/, "").trim();
          const relName = plain.replace(/\s*(?:好感度|好感)$/, "").trim();
          const relKey = index.rels[plain] || index.rels[relName];
          if (index.flags[plain]) {
            kind = "flag";
            key = index.flags[plain];
          } else if (index.checks[plain]) {
            kind = "check";
            key = index.checks[plain];
          } else if (index.stats[plain]) {
            kind = "stat";
            key = index.stats[plain];
          } else if (relKey) {
            kind = "rel";
            key = relKey;
          }
        }
        return kind ? { kind, key } : null;
      };

      const attachLookupAnchor = (chip, value) => {
        if (!chip || !value) return;
        const target = lookupTargetOf(value);
        if (!target) return;
        chip.classList.add("is-link");
        chip.setAttribute("role", "button");
        chip.tabIndex = 0;
        chip.title = i18n.t(target.kind === "flag" ? "lookupFlag"
          : target.kind === "check" ? "lookupCheck"
            : target.kind === "rel" ? "lookupRel" : "lookupStat");
        const open = (event) => {
          event.stopPropagation();
          openLookup(target.kind, target.key, chip);
        };
        chip.addEventListener("click", open);
        chip.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open(event);
          }
        });
      };

      const lookupCount = (kind, key) => {
        if (!key) return 0;
        if (kind === "flag") {
          const groups = graph.flagGroups(key);
          return groups.writes.length + groups.reads.length;
        }
        return graph.lookup(kind, key).length;
      };

      const lookupItems = (kind, key) => {
        if (kind === "flag") {
          const groups = graph.flagGroups(key);
          return { items: groups.writes.concat(groups.reads), groups };
        }
        return { items: graph.lookup(kind, key), groups: null };
      };

      const hideLookup = () => {
        const panel = $("lookupPanel");
        if (panel) panel.hidden = true;
        lookup.open = false;
      };

      const closeLookup = () => {
        if (!overlay.close("lookup")) hideLookup();
      };

      const positionLookup = (trigger) => {
        const panel = $("lookupPanel");
        if (!panel || !trigger || !trigger.getBoundingClientRect) return;
        if (store.state.layout === "mobile") {
          panel.style.left = "";
          panel.style.top = "";
          panel.style.position = "";
          return;
        }
        overlay.place(panel, trigger, { align: "start", width: 380, fit: true });
      };

      const openLookup = (kind, key, trigger, method) => {
        if (!key) return;
        const panel = $("lookupPanel");
        if (!panel) return;
        const data = lookupItems(kind, key);
        const titleKey = kind === "speaker" ? "lookupSpeaker"
          : kind === "flag" ? "lookupFlag"
            : kind === "check" ? "lookupCheck"
              : kind === "rel" ? "lookupRel" : "lookupStat";
        let name = kind === "speaker" ? beats.speakerName(key) : key;
        if (kind !== "speaker") {
          const table = (text.names(store.textLang()) || {})[NAME_GROUP[kind] || "stats"];
          if (table && table[key]) name = table[key];
        }

        const title = $("lookupTitle");
        if (title) title.textContent = i18n.t("lookupTitle", { name, n: data.items.length });
        const sub = $("lookupSub");
        if (sub) sub.textContent = i18n.t(titleKey);

        const list = $("lookupList");
        list.replaceChildren();
        if (kind === "check") renderCondBlock(list, key, method);

        const rowOf = (node) => {
          const row = ui.el("div", "lookup-item row row-tall");
          const top = ui.el("div", "li-top");
          top.appendChild(ui.el("span", "li-id", node.id));
          top.appendChild(ui.el("span", "li-ch", i18n.chapterTitle(graph.chapterOf(node))));
          row.appendChild(top);
          const first = beats.firstLineOf(node);
          if (first) row.appendChild(ui.el("span", "li-text", first));
          row.addEventListener("click", () => {
            closeLookup();
            store.select(node.id, { history: true });
          });
          return row;
        };

        if (!data.items.length) {
          list.appendChild(ui.el("p", "lookup-empty popover-empty", i18n.t("lookupEmpty")));
        } else if (data.groups) {
          if (data.groups.writes.length) {
            list.appendChild(ui.el("p", "lookup-group", i18n.t("lookupGroupWrites", { n: data.groups.writes.length })));
            data.groups.writes.forEach((node) => list.appendChild(rowOf(node)));
          }
          if (data.groups.reads.length) {
            list.appendChild(ui.el("p", "lookup-group", i18n.t("lookupGroupReads", { n: data.groups.reads.length })));
            data.groups.reads.forEach((node) => list.appendChild(rowOf(node)));
          } else {
            list.appendChild(ui.el("p", "lookup-group-note", i18n.t("lookupGroupReadsEmpty")));
          }
        } else {
          data.items.forEach((node) => list.appendChild(rowOf(node)));
        }

        lookup.open = true;
        panel.hidden = false;
        overlay.open("lookup", { trigger: trigger || null });
        positionLookup(trigger);
      };

      const condRow = (parent, content, result) => {
        const row = ui.el("p", "lc-row");
        const cond = ui.el("span", "lc-cond");
        if (content && content.nodeType) cond.appendChild(content);
        else cond.textContent = content;
        row.appendChild(cond);
        if (result) row.appendChild(ui.el("span", "lc-result", result));
        parent.appendChild(row);
      };

      const fallbackRow = (parent, model, result) => {
        const branches = model.branches || [];
        const excluded = branches.map((branch) => (branch && branch.expr ? condexpr.label(branch.expr) : ""))
          .filter(Boolean);
        const chip = ui.el("span", "cx-fallback", i18n.t("lookupCondFallback"));
        const hint = [i18n.t("cxFallbackHint", { n: branches.length })];
        if (excluded.length) hint.push(excluded.join("；"));
        chip.title = hint.join("\n");
        chip.setAttribute("aria-label", chip.title);
        condRow(parent, chip, result);
      };

      const branchRow = (parent, branch, result, method) => {
        if (branch && branch.expr) {
          const box = condexpr.render(branch.expr, { openLookup, method });
          box.title = condexpr.label(branch.expr);
          condRow(parent, box, result);
          return;
        }
        condRow(parent, (branch && branch.text) || i18n.t("lookupCondEmpty"), result);
      };

      const ADDITION_TYPES = ["diceAddStat", "diceAddRel", "diceAddTalent", "diceAddFlag"];

      const additionLabel = (item) => {
        const labels = item.label;
        if (!labels) return "";
        return labels[store.textLang()] || labels["zh-tw"] || "";
      };

      const additionRow = (item) => {
        if (!item || typeof item !== "object") {
          return ui.el("p", "lc-row lc-plain", item == null ? "" : String(item));
        }
        const row = ui.el("p", `lc-row lc-add${item.negative ? " is-neg" : ""}`);
        const main = ui.el("span", "lc-add-main");
        const typeKey = ADDITION_TYPES[Number(item.type)] || "";
        if (typeKey) main.appendChild(ui.el("span", "lc-add-type", i18n.t(typeKey)));
        main.appendChild(ui.el("span", "lc-add-name", additionLabel(item) || item.name || "—"));
        row.appendChild(main);
        const rate = Number(item.rate);
        const factor = Number.isFinite(rate) && rate !== 1 ? i18n.t("diceAddRate", { n: rate }) : "";
        row.appendChild(ui.el("span", "lc-add-rate", (item.negative ? "−" : "+") + factor));
        if (item.hide) row.appendChild(ui.el("span", "lc-add-tag", i18n.t("diceAddHide")));
        return row;
      };

      const renderCondModel = (body, model) => {
        const kind = model.kind;
        const branches = model.branches || [];
        if (kind === "switch" || kind === "condition") {
          branches.forEach((branch) => {
            branchRow(body, branch, kind === "switch"
              ? i18n.t("lookupCondResult", { n: branch.result })
              : i18n.t("lookupCondTrue"), kind);
          });
          if (kind === "switch" && model.fallback) {
            fallbackRow(body, model, i18n.t("lookupCondResult", { n: model.fallback }));
          }
          if (model.useCount && (model.countItems || []).length) {
            body.appendChild(ui.el("p", "lookup-cond-sub", i18n.t("lookupCondCount")));
            model.countItems.forEach((item) => {
              condRow(body, i18n.t("lookupCondCountRow", { n: item.value, op: item.op }),
                i18n.t("lookupCondResult", { n: item.result }));
            });
          }
        } else if (kind === "dice") {
          if ((model.additions || []).length) {
            body.appendChild(ui.el("p", "lookup-cond-sub", i18n.t("lookupCondAdditions")));
            model.additions.forEach((item) => body.appendChild(additionRow(item)));
          }
          branches.forEach((branch) => {
            branchRow(body, branch, i18n.t("lookupCondResult", { n: branch.result }), kind);
          });
          if (model.fallback) {
            fallbackRow(body, model, i18n.t("lookupCondResult", { n: model.fallback }));
          }
        } else if (kind === "position") {
          body.appendChild(ui.el("p", "lookup-cond-sub",
            i18n.t("lookupCondPrefix", { prefix: model.prefix || "—" })));
          (model.candidates || []).slice(0, 12).forEach((item) => {
            const label = item.note ? `${item.name}（${item.note}）` : item.name;
            condRow(body, label, i18n.t("lookupCondWeight", { n: item.rate }));
          });
        } else if (kind === "flag") {
          body.appendChild(ui.el("p", "lc-row lc-plain", i18n.t("lookupCondFlag", { n: model.default })));
        } else {
          body.appendChild(ui.el("p", "lookup-cond-muted", i18n.t("lookupCondEmpty")));
        }
        if (model.note) body.appendChild(ui.el("p", "lookup-cond-note", model.note));
        if (!body.childNodes.length) {
          body.appendChild(ui.el("p", "lookup-cond-muted", i18n.t("lookupCondEmpty")));
        }
      };

      const renderCondBlock = (list, key, method) => {
        const seq = ++lookup.seq;
        const box = ui.el("div", "lookup-cond");
        box.appendChild(ui.el("p", "lookup-cond-title", i18n.t("lookupCondTitle")));
        const body = ui.el("div", "lookup-cond-body");
        body.appendChild(ui.el("p", "lookup-cond-muted", i18n.t("lookupCondLoading")));
        box.appendChild(body);
        list.insertBefore(box, list.firstChild);

        checkpoints.ensure(key).then(() => {
          if (seq !== lookup.seq) return;
          const model = checkpoints.get(key, method);
          if (!model) {
            box.remove();
            if (lookup.open) overlay.reposition("lookup");
            return;
          }
          body.replaceChildren();
          renderCondModel(body, model);
          if (lookup.open) overlay.reposition("lookup");
        });
      };

      const previewEl = () => {
        if (!preview) preview = $("branchPreview");
        return preview;
      };

      const hideBranchPreview = () => {
        if (previewTimer) {
          clearTimeout(previewTimer);
          previewTimer = null;
        }
        const node = previewEl();
        if (node) node.hidden = true;
      };

      const showBranchPreview = (head, payload) => {
        const node = previewEl();
        if (!node || !head) return;
        node.replaceChildren();
        if (payload.branches) {
          const header = ui.el("div", "bp-head");
          header.appendChild(ui.el("span", "bp-title", payload.title || ""));
          node.appendChild(header);
        }
        const data = payload.branches
          ? beats.previewOfBranches(payload.branches)
          : beats.beatsPreview(payload.beats || []);
        if (!data.lines.length) {
          node.appendChild(ui.el("div", "bp-empty", i18n.t("previewEmpty")));
        } else {
          data.lines.forEach((line) => {
            const row = ui.el("div", `bp-line${line.kind ? ` is-${line.kind}` : ""}`);
            if (line.who) row.appendChild(ui.el("span", "bp-who", line.who));
            row.appendChild(document.createTextNode(line.text));
            node.appendChild(row);
          });
          if (data.more > 0) node.appendChild(ui.el("div", "bp-foot", i18n.t("previewMore", { n: data.more })));
        }
        node.hidden = false;
        overlay.place(node, head, { align: "start", gap: 6, width: 300, fit: true });
      };

      const bindBranchPreview = (head, box, getPayload) => {
        if (!HOVER_OK) return;
        let overVar = false;
        head.addEventListener("mouseenter", () => {
          if (box.classList.contains("is-open")) return;
          if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
          }
          if (overVar) return;
          showBranchPreview(head, getPayload());
        });
        head.addEventListener("mousemove", (event) => {
          const target = event.target;
          const now = !!(target && target.closest && target.closest(".cx-var"));
          if (now === overVar) return;
          overVar = now;
          if (now) hideBranchPreview();
          else if (!box.classList.contains("is-open")) showBranchPreview(head, getPayload());
        });
        head.addEventListener("mouseleave", () => {
          previewTimer = setTimeout(hideBranchPreview, 120);
        });
        head.addEventListener("focus", () => {
          if (box.classList.contains("is-open")) return;
          showBranchPreview(head, getPayload());
        });
        head.addEventListener("blur", hideBranchPreview);
      };

      overlay.register("lookup", {
        id: "lookupPanel",
        group: "pop",
        onHide: hideLookup,
        placement: { align: "start", width: 380, fit: true },
      });
      return {
        attachLookupAnchor,
        bindBranchPreview,
        closeLookup,
        ensureFacetSets,
        extractKey: beats.extractKey,
        hideBranchPreview,
        hideLookup,
        lookup,
        lookupCount,
        lookupTargetOf,
        openLookup,
        positionLookup,
        renderCondBlock,
        renderCondModel,
        repositionLookup: () => overlay.reposition("lookup"),
        reset: () => {
          resetNameIndex();
          facetSets = null;
        },
        showBranchPreview,
      };
    });
})();
