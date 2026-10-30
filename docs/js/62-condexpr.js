(() => {
  "use strict";

  const SR = window.SR;

  const TYPE_KEYS = [
    "cxTypeConst", "cxTypeStat", "cxTypeRel", "cxTypeFlag", "cxTypeBook", "cxTypeMisc",
    "cxTypeSpecial", "cxTypeRandom", "cxTypeGroup", "cxTypeTime", "cxTypeTalent",
    "cxTypeBookLevel", "cxTypeUpgrade", "cxTypeUpgradeLevel", "cxTypeBookMaster",
    "cxTypeChronicle", "cxTypeCondition",
  ];

  const GROUP_KEYS = ["", "cxGroupSum", "cxGroupMax", "cxGroupMin", "cxGroupProduct",
    "cxGroupAll", "cxGroupAny"];

  const OP_TEXT = ["=", "≠", "<", "≤", ">", "≥"];

  const LOOKUP_KIND = { 1: "stat", 2: "rel", 3: "flag", 16: "check" };

  const NAME_GROUP = { check: "checks", flag: "flags", rel: "rels", stat: "stats" };

  SR.define("condexpr", ["checkpoints", "i18n", "text", "ui", "graph", "store"],
    ({ checkpoints, i18n, text, ui, graph, store }) => {

      const typeText = (check) => {
        const key = TYPE_KEYS[check];
        return key ? i18n.t(key) : String(check);
      };

      const lookupKeyOf = (kind, id) => {
        const raw = String(id || "");
        if (kind === "stat") {
          const stat = /^Player_(.+)$/.exec(raw);
          return stat ? stat[1].toLowerCase() : raw;
        }
        if (kind === "rel") {
          const rel = /^Relationship_([A-Za-z0-9]+)/.exec(raw);
          return rel ? rel[1].toLowerCase() : raw;
        }
        return raw;
      };

      const displayName = (kind, key, fallbackText) => {
        if (kind) {
          const table = (text.names(store.state.lang) || {})[NAME_GROUP[kind]] || {};
          if (table[key]) return table[key];
        }
        return fallbackText || key;
      };

      const countOf = (kind, key) => {
        try {
          if (kind === "flag") {
            const groups = graph.flagGroups(key);
            return groups.writes.length + groups.reads.length;
          }
          return graph.lookup(kind, key).length;
        } catch {
          return 0;
        }
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
          return ui.el("span", "cx-const cx-rand", i18n.t("cxRandom", { min: node.min, max: node.max }));
        }
        if (node.tag === "dice") return ui.el("span", "cx-dice", i18n.t("cxDice"));
        if (node.tag === "var") return chipOf(node, opts);
        if (node.tag === "group") return groupOf(node, opts);
        return ui.el("span", "cx-const", String(node.value === undefined ? "" : node.value));
      };

      const chipOf = (node, opts) => {
        const type = node.type;
        const raw = node.name;
        const kind = LOOKUP_KIND[type] || "";
        const key = lookupKeyOf(kind, raw);
        const label = displayName(kind, key, raw);
        const chip = ui.el("span", "cx-var");
        chip.appendChild(ui.el("span", "cx-type", typeText(type)));
        chip.appendChild(ui.el("span", "cx-name", label));
        if ((kind === "flag" || kind === "check") && raw && raw !== label) {
          chip.appendChild(ui.el("span", "cx-id", raw));
        }
        if (node.negative) chip.appendChild(ui.el("span", "cx-neg", "×-1"));
        if (kind) bindVar(chip, { kind, key, type: typeText(type), label }, opts);
        return chip;
      };

      const singleChild = (node) => {
        const children = node.items || [];
        if (children.length !== 1) return null;
        if (node.negative) return null;
        if (node.group && node.group !== 1) return null;
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
        const groupKey = GROUP_KEYS[node.group];
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
          cmp.appendChild(ui.el("span", "cx-op", OP_TEXT[node.op] || "?"));
          cmp.appendChild(inlineOf(node.right, opts));
          return cmp;
        }
        if (node.tag === "logic") {
          const box = ui.el("span", "cx-cmp");
          const joiner = node.op === 1 ? i18n.t("cxOr") : i18n.t("cxAnd");
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
        if (expr.tag === "logic") joiner = expr.op === 1 ? i18n.t("cxOr") : i18n.t("cxAnd");
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
        if (node.tag === "random") return i18n.t("cxRandom", { min: node.min, max: node.max });
        if (node.tag === "dice") return i18n.t("cxDice");
        if (node.tag === "var") {
          const kind = LOOKUP_KIND[node.type] || "";
          const key = lookupKeyOf(kind, node.name);
          return `${typeText(node.type)}（${displayName(kind, key, node.name)}）${node.negative ? "×-1" : ""}`;
        }
        if (node.tag === "group") {
          const child = singleChild(node);
          if (child) return valueLabel(child);
          const groupKey = GROUP_KEYS[node.group];
          const inner = (node.items || []).map(valueLabel).join(" + ");
          return `${node.name || (groupKey ? i18n.t(groupKey) : "")}（${groupKey ? i18n.t(groupKey) : ""}[${inner}]）${node.negative ? "×-1" : ""}`;
        }
        return "";
      };

      const label = (expr) => {
        if (!expr) return "";
        if (expr.tag === "compare") {
          return `${label(expr.left)} ${OP_TEXT[expr.op] || "?"} ${label(expr.right)}`;
        }
        if (expr.tag === "logic") {
          const joiner = ` ${expr.op === 1 ? i18n.t("cxOr") : i18n.t("cxAnd")} `;
          return (expr.items || []).map(label).join(joiner);
        }
        return valueLabel(expr);
      };

      const pick = (kind, key, result) => {
        const model = checkpoints.get(key, kind);
        if (!model) return null;
        const branches = model.branches || [];
        if (!branches.length) return null;
        const type = model.kind || kind;
        if (type === "condition") return branches[0].expr || null;
        if (type !== "switch" && type !== "dice") return null;
        if (result === null || result === undefined) return null;
        for (const branch of branches) {
          if (branch.result === result) return branch.expr || null;
        }
        return null;
      };

      const fallback = (kind, key, result) => {
        const model = checkpoints.get(key, kind);
        if (!model) return null;
        const type = model.kind || kind;
        if (type !== "switch" && type !== "dice") return null;
        if (result === null || result === undefined) return null;
        if (model.fallback === undefined || result !== model.fallback) return null;
        const branches = model.branches || [];
        const excluded = [];
        for (const branch of branches) if (branch && branch.expr) excluded.push(branch.expr);
        return { n: branches.length, excluded };
      };

      const resultOf = (text) => {
        const found = /==\s*(-?\d+)\s*$/.exec(String(text || ""));
        return found ? Number(found[1]) : null;
      };

      return {
        bindVar,
        ensure: checkpoints.ensure,
        fallback,
        get: checkpoints.get,
        label,
        pick,
        render,
        resultOf,
        typeText,
      };
    });
})();
