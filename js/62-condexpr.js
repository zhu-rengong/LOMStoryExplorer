(() => {
  "use strict";

  const SR = window.SR;

  const LOOKUP_KINDS = { stat: true, rel: true, flag: true, check: true };

  SR.define("condexpr", ["checkpoints", "i18n", "ui", "graph", "names"],
    ({ checkpoints, i18n, ui, graph, names }) => {
      const typeText = (kind) => i18n.t(`vk.${kind}`, { defaultValue: kind || "" });

      const checkText = (kind) => i18n.t(`ck.${kind}`, { defaultValue: kind || "" });

      const displayName = (kind, key) => names.label(kind, key);

      const countOf = (kind, key) => {
        if (!key) return 0;
        if (kind === "flag") {
          const groups = graph.flagGroups(key);
          return groups.writes.length + groups.reads.length;
        }
        if (kind === "check") return graph.lookup("check", key).length;
        return graph.lookup(kind, key).length;
      };

      const bindVar = (chip, target, opts) => {
        const count = countOf(target.kind, target.key);
        const hint = count
          ? i18n.t("cxVarTip", { type: target.type, name: target.label, n: count })
          : i18n.t("cxVarTipNone", { type: target.type, name: target.label });
        chip.title = hint;
        chip.setAttribute("aria-label", hint);
        if (!count || !opts || typeof opts.openLookup !== "function") return;
        chip.classList.add("is-link");
        chip.setAttribute("role", "button");
        chip.tabIndex = 0;
        chip.setAttribute("data-kind", target.kind);
        chip.setAttribute("data-key", target.key);
        const open = (event) => {
          event.stopPropagation();
          event.preventDefault();
          opts.openLookup(target.kind, target.key, chip, opts.method);
        };
        chip.addEventListener("click", open);
        chip.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") open(event);
        });
      };

      const valueOf = (node, opts) => {
        if (!node) return ui.el("span", "cx-empty", i18n.t("lookupCondEmpty"));
        if (node.tag === "const") return ui.el("span", "cx-const", String(node.value));
        if (node.tag === "random") {
          return ui.el("span", "cx-const cx-rand", i18n.t("cRandom", { min: node.min, max: node.max }));
        }
        if (node.tag === "dice") return ui.el("span", "cx-dice", i18n.t("cDice"));
        if (node.tag === "var") return chipOf(node, opts);
        if (node.tag === "check") return chipOf(node, opts);
        if (node.tag === "group") return groupOf(node, opts);
        return ui.el("span", "cx-const", String(node.value === undefined ? "" : node.value));
      };

      const chipOf = (node, opts) => {
        const isCheck = node.tag === "check";
        const kind = isCheck ? "check" : node.kind;
        const key = node.key;
        const label = displayName(kind, key);
        const chip = ui.el("span", "cx-var");
        chip.appendChild(ui.el("span", "cx-type", isCheck ? checkText(kind) : typeText(kind)));
        chip.appendChild(ui.el("span", "cx-name", label));
        if ((kind === "flag" || kind === "check") && key && key !== label) {
          chip.appendChild(ui.el("span", "cx-id", key));
        }
        if (node.negative) chip.appendChild(ui.el("span", "cx-neg", "×-1"));
        if (LOOKUP_KINDS[kind]) {
          bindVar(chip, { kind, key, type: isCheck ? checkText(kind) : typeText(kind), label }, opts);
        }
        return chip;
      };

      const singleChild = (node) => {
        const children = node.items || [];
        if (children.length !== 1) return null;
        if (node.negative) return null;
        if (node.op && node.op !== "sum") return null;
        return children[0];
      };

      const groupOf = (node, opts) => {
        const child = singleChild(node);
        if (child) {
          const leaf = valueOf(child, opts);
          if (node.name && !leaf.title) leaf.title = node.name;
          return leaf;
        }
        const box = ui.el("span", "cx-group");
        const groupKey = node.op ? `grp.${node.op}` : "";
        if (groupKey) box.appendChild(ui.el("span", "cx-gtag", i18n.t(groupKey)));
        const items = ui.el("span", "cx-gitems");
        items.appendChild(ui.el("span", "cx-bracket", "["));
        const children = node.items || [];
        children.forEach((item, index) => {
          if (index) items.appendChild(ui.el("span", "cx-gsep", " + "));
          items.appendChild(valueOf(item, opts));
        });
        if (!children.length) items.appendChild(ui.el("span", "cx-const", node.name || "—"));
        items.appendChild(ui.el("span", "cx-bracket", "]"));
        box.appendChild(items);
        if (node.negative) box.appendChild(ui.el("span", "cx-neg", "×-1"));
        if (node.name) box.title = node.name;
        return box;
      };

      const inlineOf = (node, opts) => {
        if (!node) return ui.el("span", "cx-empty", i18n.t("lookupCondEmpty"));
        if (node.tag === "compare") {
          const cmp = ui.el("span", "cx-cmp");
          cmp.appendChild(inlineOf(node.left, opts));
          cmp.appendChild(ui.el("span", "cx-op", node.op || "?"));
          cmp.appendChild(inlineOf(node.right, opts));
          return cmp;
        }
        if (node.tag === "logic") {
          const box = ui.el("span", "cx-cmp");
          const joiner = node.op === "or" ? i18n.t("cxOr") : i18n.t("cxAnd");
          (node.items || []).forEach((child, index) => {
            if (index) box.appendChild(ui.el("span", "cx-op", joiner));
            box.appendChild(inlineOf(child, opts));
          });
          return box;
        }
        return valueOf(node, opts);
      };

      const render = (expr, opts) => {
        const box = ui.el("span", "cx-expr");
        if (!expr) return box;
        const options = opts || {};
        let joiner = "";
        if (expr.tag === "logic") joiner = expr.op === "or" ? i18n.t("cxOr") : i18n.t("cxAnd");
        const lines = expr.tag === "logic"
          ? (expr.items || []).map((child, index) => ({ lead: index ? joiner : "", node: child }))
          : [{ lead: "", node: expr }];
        lines.forEach((line) => {
          const row = ui.el("span", "cx-line");
          if (line.lead) row.appendChild(ui.el("span", "cx-logic", line.lead));
          row.appendChild(inlineOf(line.node, options));
          box.appendChild(row);
        });
        return box;
      };

      const valueLabel = (node) => {
        if (!node) return "";
        if (node.tag === "const") return String(node.value);
        if (node.tag === "random") return i18n.t("cRandom", { min: node.min, max: node.max });
        if (node.tag === "dice") return i18n.t("cDice");
        if (node.tag === "var" || node.tag === "check") {
          const kind = node.tag === "check" ? "check" : node.kind;
          const type = node.tag === "check" ? checkText(kind) : typeText(kind);
          const name = displayName(kind, node.key);
          return i18n.t("cxValue", { type, name }) + (node.negative ? "×-1" : "");
        }
        if (node.tag === "group") {
          const child = singleChild(node);
          if (child) return valueLabel(child);
          const groupKey = node.op ? `grp.${node.op}` : "";
          const inner = (node.items || []).map(valueLabel).join(" + ");
          return i18n.t("cGroup", {
            name: node.name || (groupKey ? i18n.t(groupKey) : ""),
            group: groupKey ? i18n.t(groupKey) : "",
            items: inner,
          }) + (node.negative ? "×-1" : "");
        }
        return "";
      };

      const label = (expr) => {
        if (!expr) return "";
        if (expr.tag === "compare") {
          return `${label(expr.left)} ${expr.op || "?"} ${label(expr.right)}`;
        }
        if (expr.tag === "logic") {
          const joiner = ` ${expr.op === "or" ? i18n.t("cxOr") : i18n.t("cxAnd")} `;
          return (expr.items || []).map(label).join(joiner);
        }
        return valueLabel(expr);
      };

      const pick = (check, result) => {
        if (!check || !check.key) return null;
        const model = checkpoints.get(check.key, check.kind);
        if (!model) return null;
        const branches = model.branches || [];
        if (!branches.length) return null;
        const type = model.kind || check.kind;
        const wanted = result === undefined ? check.result : result;
        if (type === "condition") return branches[0].expr || null;
        if (type !== "switch" && type !== "dice") return null;
        if (wanted === null || wanted === undefined) return null;
        for (const branch of branches) {
          if (branch.result === wanted) return branch.expr || null;
        }
        return null;
      };

      const fallback = (check, result) => {
        if (!check || !check.key) return null;
        const model = checkpoints.get(check.key, check.kind);
        if (!model) return null;
        const type = model.kind || check.kind;
        if (type !== "switch" && type !== "dice") return null;
        const wanted = result === undefined ? check.result : result;
        if (wanted === null || wanted === undefined) return null;
        if (model.fallback === undefined || wanted !== model.fallback) return null;
        const branches = model.branches || [];
        const excluded = [];
        for (const branch of branches) if (branch && branch.expr) excluded.push(branch.expr);
        return { n: branches.length, excluded };
      };

      const localizedName = (node) => {
        if (!node || !node.kind) return "";
        return displayName(node.kind, node.key);
      };

      return {
        fallback,
        label,
        localizedName,
        pick,
        render,
      };
    });
})();
