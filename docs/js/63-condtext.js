(() => {
  "use strict";

  const SR = window.SR;

  const LOOKUP_KINDS = ["stat", "rel", "flag"];

  SR.define("condtext", ["i18n", "names"], ({ i18n, names }) => {
    const valueKind = (kind) => i18n.t(`vk.${kind}`, { defaultValue: kind || "" });

    const checkKind = (kind) => i18n.t(`ck.${kind}`, { defaultValue: kind || "" });

    const groupKind = (op) => i18n.t(`grp.${op}`, { defaultValue: op || "" });

    const negative = (node, text) => (node.negative ? `${text}×-1` : text);

    const signed = (value) => {
      if (typeof value !== "number") return "";
      return value > 0 ? `+${value}` : String(value);
    };

    const cond = (node) => {
      if (!node || typeof node !== "object") return "";
      if (node.tag === "const") return String(node.value === undefined ? "" : node.value);
      if (node.tag === "random") return i18n.t("cRandom", { min: node.min, max: node.max });
      if (node.tag === "dice") return i18n.t("cDice");
      if (node.tag === "var") {
        return negative(node, i18n.t("cVar", {
          type: valueKind(node.kind),
          name: names.label(node.kind, node.key),
        }));
      }
      if (node.tag === "check") {
        return i18n.t("cVar", {
          type: checkKind(node.kind),
          name: names.label("check", node.key),
        });
      }
      if (node.tag === "group") {
        const items = Array.isArray(node.items) ? node.items : [];
        if (items.length === 1 && node.op === "sum" && !node.negative) return cond(items[0]);
        const inner = items.map(cond).join(" + ");
        return negative(node, i18n.t("cGroup", {
          name: node.name || groupKind(node.op),
          group: groupKind(node.op),
          items: inner || "—",
        }));
      }
      if (node.tag === "compare") {
        return `${cond(node.left)} ${node.op || "?"} ${cond(node.right)}`;
      }
      if (node.tag === "logic") {
        const joiner = ` ${node.op === "or" ? i18n.t("cxOr") : i18n.t("cxAnd")} `;
        const items = Array.isArray(node.items) ? node.items : [];
        return items.map(cond).join(joiner);
      }
      return typeof node.text === "string" ? node.text : "";
    };

    const gain = (label, count) => {
      if (typeof count === "number" && count < 0) return i18n.t("metaLose", { label });
      if (typeof count === "number" && count > 1) return i18n.t("metaGainCount", { label, count });
      return i18n.t("metaGain", { label });
    };

    const meta = (kind, key, value) => {
      if (kind === "stat") {
        const name = names.label("stat", key);
        const delta = signed(value);
        return delta ? i18n.t("metaValue", { name, delta }) : name;
      }
      if (kind === "rel") {
        const name = names.label("rel", key);
        const delta = signed(value);
        return delta ? i18n.t("metaRelation", { name, delta }) : i18n.t("metaRelation", { name, delta: "" }).trim();
      }
      if (kind === "flag") return i18n.t("metaFlag", { name: names.label("flag", key), value });
      if (kind === "setstat") return i18n.t("metaAssign", { name: names.label("stat", key), value });
      if (kind === "setrel") {
        return i18n.t("metaAssignRelation", { name: names.label("rel", key), value });
      }
      if (kind === "book") return gain(i18n.t("metaBook", { name: names.label("book", key) }), value);
      if (kind === "misc") return gain(i18n.t("metaItem", { name: names.label("misc", key) }), value);
      if (kind === "special") {
        return gain(i18n.t("metaItem", { name: names.label("special", key) }), value);
      }
      if (kind === "talent") {
        return i18n.t("metaTalent", { name: names.label("talent", key), value });
      }
      if (kind === "library") return i18n.t("metaLibrary", { name: names.label("chronicle", key) });
      if (kind === "mission") return i18n.t("metaMission", { key });
      if (kind === "dice") return i18n.t("metaDice", { name: names.label("check", key) });
      return "";
    };

    const metaTarget = (kind, key) => (
      LOOKUP_KINDS.indexOf(kind) >= 0 && key ? { kind, key } : null
    );

    const optionCond = (condition) => {
      if (!condition || typeof condition !== "object") return "";
      const value = typeof condition.value === "string" ? condition.value : "";
      const op = typeof condition.op === "string" ? condition.op : "";
      if (!op) return value;
      return i18n.t("oCond", { op, value });
    };

    const needText = (detail) => {
      const need = detail && Array.isArray(detail.need) ? detail.need : [];
      return need.filter((item) => (
        item && typeof item === "object" && typeof item.kind === "string" && item.kind
      )).map((item) => i18n.t("oNeed", {
        label: i18n.t(`need.${item.kind}`, { defaultValue: item.kind }),
        op: item.op === undefined ? "" : item.op,
        value: item.value === undefined ? "" : item.value,
      })).join(" · ");
    };

    const optionHead = (text, detail) => {
      const action = detail && typeof detail.action === "string" && detail.action
        ? i18n.t(`menu.${detail.action}`, { defaultValue: detail.action }) : "";
      if (action && text) return i18n.t("optionActionJoin", { action, title: text });
      return action || text || i18n.t("optionOther");
    };

    return {
      checkKind,
      cond,
      meta,
      metaTarget,
      needText,
      optionCond,
      optionHead,
      valueKind,
    };
  });
})();
