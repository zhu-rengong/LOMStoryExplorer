(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core || !SR.panels) return;

  const $ = SR.core.$;
  const condexprLabel = SR.condexpr.label;
  const condexprRender = SR.condexpr.render;
  const el = SR.core.el;
  const overlay = SR.overlay;
  const t = SR.i18n.t;

  const condRow = (parent, content, result) => {
    const row = el("p", "lc-row");
    const cond = el("span", "lc-cond");
    if (content && content.nodeType) cond.appendChild(content);
    else cond.textContent = content;
    row.appendChild(cond);
    if (result) row.appendChild(el("span", "lc-result", result));
    parent.appendChild(row);
  };

  const fallbackRow = (parent, model, result) => {
    const branches = model.branches || [];
    const excluded = branches.map((branch) => (branch && branch.expr ? condexprLabel(branch.expr) : ""))
      .filter(Boolean);
    const chip = el("span", "cx-fallback", t("lookupCondFallback"));
    const hint = [t("cxFallbackHint", { n: branches.length })];
    if (excluded.length) hint.push(excluded.join("；"));
    chip.title = hint.join("\n");
    chip.setAttribute("aria-label", chip.title);
    condRow(parent, chip, result);
  };

  const branchRow = (parent, branch, result) => {
    if (branch && branch.expr) {
      const box = condexprRender(branch.expr);
      box.title = condexprLabel(branch.expr);
      condRow(parent, box, result);
      return;
    }
    const text = ((branch && branch.conds) || []).join("；") || t("lookupCondEmpty");
    condRow(parent, text, result);
  };

  const renderCondModel = (body, model) => {
    const kind = model.kind;
    const branches = model.branches || [];
    if (kind === "switch" || kind === "condition") {
      branches.forEach((branch) => {
        branchRow(body, branch, kind === "switch"
          ? t("lookupCondResult", { n: branch.result })
          : t("lookupCondTrue"));
      });
      if (kind === "switch" && model.fallback) {
        fallbackRow(body, model, t("lookupCondResult", { n: model.fallback }));
      }
      if (model.useCount && (model.countItems || []).length) {
        body.appendChild(el("p", "lookup-cond-sub", t("lookupCondCount")));
        model.countItems.forEach((item) => {
          condRow(body, t("lookupCondCountRow", { n: item.value, op: item.op }),
            t("lookupCondResult", { n: item.result }));
        });
      }
    } else if (kind === "dice") {
      if ((model.additions || []).length) {
        body.appendChild(el("p", "lookup-cond-sub", t("lookupCondAdditions")));
        model.additions.forEach((text) => {
          body.appendChild(el("p", "lc-row lc-plain", text));
        });
      }
      branches.forEach((branch) => {
        branchRow(body, branch, t("lookupCondResult", { n: branch.result }));
      });
      if (model.fallback) {
        fallbackRow(body, model, t("lookupCondResult", { n: model.fallback }));
      }
    } else if (kind === "position") {
      body.appendChild(el("p", "lookup-cond-sub", t("lookupCondPrefix", { prefix: model.prefix || "—" })));
      (model.candidates || []).slice(0, 12).forEach((item) => {
        const label = item.note ? `${item.name}（${item.note}）` : item.name;
        condRow(body, label, t("lookupCondWeight", { n: item.rate }));
      });
    } else if (kind === "flag") {
      body.appendChild(el("p", "lc-row lc-plain", t("lookupCondFlag", { n: model.default })));
    } else {
      body.appendChild(el("p", "lookup-cond-muted", t("lookupCondEmpty")));
    }
    if (model.note) body.appendChild(el("p", "lookup-cond-note", model.note));
    if (!body.childNodes.length) {
      body.appendChild(el("p", "lookup-cond-muted", t("lookupCondEmpty")));
    }
  };

  const repositionLookup = () => {
    if (!SR.panels.lookup.open) return;
    overlay.reposition("lookup");
  };

  const renderCondBlock = (list, key) => {
    if (!SR.checkpoints) return;
    const seq = ++SR.panels.lookup.seq;
    const box = el("div", "lookup-cond");
    box.appendChild(el("p", "lookup-cond-title", t("lookupCondTitle")));
    const body = el("div", "lookup-cond-body");
    body.appendChild(el("p", "lookup-cond-muted", t("lookupCondLoading")));
    box.appendChild(body);
    list.insertBefore(box, list.firstChild);

    SR.checkpoints.ensure(key).then(() => {
      if (seq !== SR.panels.lookup.seq) return;
      const model = SR.checkpoints.get(key);
      if (!model) {
        box.remove();
        repositionLookup();
        return;
      }
      body.replaceChildren();
      renderCondModel(body, model);
      repositionLookup();
    });
  };

  Object.assign(SR.panels, {
    branchRow: branchRow,
    condRow: condRow,
    fallbackRow: fallbackRow,
    renderCondBlock: renderCondBlock,
    renderCondModel: renderCondModel,
  });
})();
