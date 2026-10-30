(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const el = SR.core.el;
  const ensureCheckpoints = SR.checkpoints.ensure;
  const getCheckpoint = SR.checkpoints.get;
  const langPack = SR.text.langPack;
  const openLookup = SR.fwd("panels", "openLookup");
  const lookupCount = SR.fwd("panels", "lookupCount");
  const state = SR.core.state;
  const t = SR.i18n.t;

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

  const typeText = (check) => {
    const key = TYPE_KEYS[check];
    return key ? t(key) : String(check);
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
      const pack = langPack(state.lang) || {};
      const table = (pack.names || {})[NAME_GROUP[kind]] || {};
      if (table[key]) return table[key];
    }
    return fallbackText || key;
  };

  const countOf = (kind, key) => {
    try {
      return lookupCount(kind, key) || 0;
    } catch {
      return 0;
    }
  };

  const bindVar = (chip, target) => {
    const count = countOf(target.kind, target.key);
    const hint = count
      ? t("cxVarTip", { type: target.type, name: target.label, n: count })
      : t("cxVarTipNone", { type: target.type, name: target.label });
    chip.title = hint;
    chip.setAttribute("aria-label", hint);
    if (!count) return;
    chip.classList.add("is-link");
    chip.setAttribute("role", "button");
    chip.tabIndex = 0;
    chip.setAttribute("data-kind", target.kind);
    chip.setAttribute("data-key", target.key);
    const open = (event) => {
      event.stopPropagation();
      event.preventDefault();
      openLookup(target.kind, target.key, chip);
    };
    chip.addEventListener("click", open);
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open(event);
    });
  };

  const valueOf = (node, opts) => {
    if (!node || !node.length) return el("span", "cx-empty", t("lookupCondEmpty"));
    const tag = node[0];
    if (tag === "c") return el("span", "cx-const", String(node[1]));
    if (tag === "r") {
      return el("span", "cx-const cx-rand", t("cxRandom", { min: node[1], max: node[2] }));
    }
    if (tag === "d") return el("span", "cx-dice", t("cxDice"));
    if (tag === "v") return chipOf(node);
    if (tag === "g") return groupOf(node, opts);
    return el("span", "cx-const", String(node[1] === undefined ? "" : node[1]));
  };

  const chipOf = (node) => {
    const type = node[1];
    const raw = node[2];
    const kind = LOOKUP_KIND[type] || "";
    const key = lookupKeyOf(kind, raw);
    const text = displayName(kind, key, raw);
    const chip = el("span", "cx-var");
    chip.appendChild(el("span", "cx-type", typeText(type)));
    chip.appendChild(el("span", "cx-name", text));
    if ((kind === "flag" || kind === "check") && raw && raw !== text) {
      chip.appendChild(el("span", "cx-id", raw));
    }
    if (node[3]) chip.appendChild(el("span", "cx-neg", "×-1"));
    if (kind) bindVar(chip, { kind: kind, key: key, type: typeText(type), label: text });
    return chip;
  };

  const singleChild = (node) => {
    const children = node[3] || [];
    const groupType = node[1];
    if (children.length !== 1) return null;
    if (node[4]) return null;
    if (groupType && groupType !== 1) return null;
    return children[0];
  };

  const groupOf = (node, opts) => {
    const child = singleChild(node);
    if (child) {
      const leaf = valueOf(child, opts);
      if (node[2] && !leaf.title) leaf.title = node[2];
      return leaf;
    }
    const box = el("span", "cx-group");
    const groupKey = GROUP_KEYS[node[1]];
    if (groupKey) box.appendChild(el("span", "cx-gtag", t(groupKey)));
    const items = el("span", "cx-gitems");
    items.appendChild(el("span", "cx-bracket", "["));
    const children = node[3] || [];
    children.forEach((item, index) => {
      if (index) items.appendChild(el("span", "cx-gsep", " + "));
      items.appendChild(valueOf(item, opts));
    });
    if (!children.length) items.appendChild(el("span", "cx-const", node[2] || "—"));
    items.appendChild(el("span", "cx-bracket", "]"));
    box.appendChild(items);
    if (node[4]) box.appendChild(el("span", "cx-neg", "×-1"));
    if (node[2]) box.title = node[2];
    return box;
  };

  const inlineOf = (node, opts) => {
    if (!node || !node.length) return el("span", "cx-empty", t("lookupCondEmpty"));
    if (node[0] === "p") {
      const cmp = el("span", "cx-cmp");
      cmp.appendChild(inlineOf(node[2], opts));
      cmp.appendChild(el("span", "cx-op", OP_TEXT[node[1]] || "?"));
      cmp.appendChild(inlineOf(node[3], opts));
      return cmp;
    }
    if (node[0] === "l") {
      const box = el("span", "cx-cmp");
      const joiner = node[1] === 1 ? t("cxOr") : t("cxAnd");
      (node[2] || []).forEach((child, index) => {
        if (index) box.appendChild(el("span", "cx-op", joiner));
        box.appendChild(inlineOf(child, opts));
      });
      return box;
    }
    return valueOf(node, opts);
  };

  const render = (expr, opts) => {
    const box = el("span", "cx-expr");
    if (!expr) return box;
    let joiner = "";
    if (expr[0] === "l") joiner = expr[1] === 1 ? t("cxOr") : t("cxAnd");
    const lines = expr[0] === "l"
      ? (expr[2] || []).map((child, index) => ({ lead: index ? joiner : "", node: child }))
      : [{ lead: "", node: expr }];
    lines.forEach((line) => {
      const row = el("span", "cx-line");
      if (line.lead) row.appendChild(el("span", "cx-logic", line.lead));
      row.appendChild(inlineOf(line.node, opts || {}));
      box.appendChild(row);
    });
    return box;
  };

  const valueLabel = (node) => {
    if (!node || !node.length) return "";
    const tag = node[0];
    if (tag === "c") return String(node[1]);
    if (tag === "r") return t("cxRandom", { min: node[1], max: node[2] });
    if (tag === "d") return t("cxDice");
    if (tag === "v") {
      const kind = LOOKUP_KIND[node[1]] || "";
      const key = lookupKeyOf(kind, node[2]);
      return `${typeText(node[1])}（${displayName(kind, key, node[2])}）${node[3] ? "×-1" : ""}`;
    }
    if (tag === "g") {
      const child = singleChild(node);
      if (child) return valueLabel(child);
      const groupKey = GROUP_KEYS[node[1]];
      const inner = (node[3] || []).map(valueLabel).join(" + ");
      return `${node[2] || (groupKey ? t(groupKey) : "")}（${groupKey ? t(groupKey) : ""}[${inner}]）${node[4] ? "×-1" : ""}`;
    }
    return "";
  };

  const label = (expr) => {
    if (!expr || !expr.length) return "";
    if (expr[0] === "p") {
      return `${label(expr[2])} ${OP_TEXT[expr[1]] || "?"} ${label(expr[3])}`;
    }
    if (expr[0] === "l") {
      const joiner = ` ${expr[1] === 1 ? t("cxOr") : t("cxAnd")} `;
      return (expr[2] || []).map(label).join(joiner);
    }
    return valueLabel(expr);
  };

  const pick = (kind, key, result) => {
    const model = getCheckpoint(key);
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
    const model = getCheckpoint(key);
    if (!model) return null;
    const type = model.kind || kind;
    if (type !== "switch" && type !== "dice") return null;
    if (result === null || result === undefined) return null;
    if (model.fallback === undefined || result !== model.fallback) return null;
    const branches = model.branches || [];
    const excluded = [];
    branches.forEach((branch) => {
      if (branch && branch.expr) excluded.push(branch.expr);
    });
    return { n: branches.length, excluded: excluded };
  };

  const resultOf = (text) => {
    const found = /==\s*(-?\d+)\s*$/.exec(String(text || ""));
    return found ? Number(found[1]) : null;
  };

  SR.register("condexpr", {
    bindVar: bindVar,
    ensure: ensureCheckpoints,
    fallback: fallback,
    label: label,
    pick: pick,
    render: render,
    resultOf: resultOf,
    typeText: typeText,
  });
})();
