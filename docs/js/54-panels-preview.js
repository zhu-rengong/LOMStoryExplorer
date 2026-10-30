(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core || !SR.panels) return;

  const $ = SR.core.$;
  const FACETS = SR.data.FACETS;
  const HOVER_OK = SR.core.HOVER_OK;
  const el = SR.core.el;
  const langPack = SR.text.langPack;
  const overlay = SR.overlay;
  const speakerName = SR.reader.speakerName;
  const state = SR.core.state;
  const stripRich = SR.reader.stripRich;
  const t = SR.i18n.t;

  let facetSets = null;

  let nameToKey = null;

  let branchPreview = null;

  let bpHideTimer = null;

  const ensureFacetSets = () => {
    if (facetSets || !FACETS) return facetSets;
    const flags = new Set();
    const checks = new Set();
    FACETS.forEach((row) => {
      (row[1] || "").split(",").forEach((key) => {
        if (key) flags.add(key);
      });
      (row[2] || "").split(",").forEach((key) => {
        if (key) checks.add(key);
      });
    });
    facetSets = { flags: flags, checks: checks };
    return facetSets;
  };

  const ensureNameIndex = () => {
    if (nameToKey) return nameToKey;
    const pack = langPack(state.lang);
    const names = pack.names || {};
    nameToKey = { flags: {}, checks: {}, stats: {}, rels: {} };
    ["flags", "checks", "stats", "rels"].forEach((group) => {
      const table = names[group] || {};
      Object.keys(table).forEach((key) => {
        nameToKey[group][table[key]] = key;
      });
    });
    return nameToKey;
  };

  const resetNameIndex = () => {
    nameToKey = null;
  };

  const lookupTargetOf = (text) => {
    if (!text || !facetSets) return null;
    const raw = String(text).trim();
    let key = raw;
    let kind = facetSets.flags.has(key) ? "flag" : facetSets.checks.has(key) ? "check" : "";
    if (!kind) {
      const index = ensureNameIndex();
      const plain = raw.replace(/\s*[+-]\d+\s*$/, "").trim();
      if (index.flags[plain]) {
        kind = "flag";
        key = index.flags[plain];
      } else if (index.checks[plain]) {
        kind = "check";
        key = index.checks[plain];
      } else if (index.stats[plain]) {
        kind = "stat";
        key = index.stats[plain];
      } else if (index.rels[plain]) {
        kind = "rel";
        key = index.rels[plain];
      }
    }
    return kind ? { kind: kind, key: key } : null;
  };

  const attachLookupAnchor = (chip, text) => {
    if (!chip || !text) return;
    const target = lookupTargetOf(text);
    if (!target) return;
    const kind = target.kind;
    const key = target.key;
    chip.classList.add("is-link");
    chip.setAttribute("role", "button");
    chip.tabIndex = 0;
    chip.title = t(kind === "flag" ? "lookupFlag"
      : kind === "check" ? "lookupCheck"
      : kind === "rel" ? "lookupRel" : "lookupStat");
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      SR.panels.openLookup(kind, key, chip);
    });
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        SR.panels.openLookup(kind, key, chip);
      }
    });
  };

  const extractKey = (text) => {
    const match = /「([^」]{2,})」/.exec(text || "");
    return match ? match[1] : "";
  };

  const branchPreviewEl = () => {
    if (!branchPreview) branchPreview = $("branchPreview");
    return branchPreview;
  };

  const hideBranchPreview = () => {
    if (bpHideTimer) {
      clearTimeout(bpHideTimer);
      bpHideTimer = null;
    }
    const node = branchPreviewEl();
    if (node) node.hidden = true;
  };

  const beatsPreview = (beats, budget) => {
    budget = budget || { lines: 6, chars: 220 };
    const out = { lines: [], more: 0 };
    let used = 0;
    let stop = false;

    const push = (kind, text, who) => {
      const clean = stripRich(String(text == null ? "" : text)).replace(/\s+/g, " ").trim();
      if (!clean) return;
      if (stop || out.lines.length >= budget.lines || used + clean.length > budget.chars) {
        out.more++;
        if (out.lines.length >= budget.lines) stop = true;
        return;
      }
      out.lines.push({ kind: kind, text: clean, who: who || "" });
      used += clean.length;
    };

    const walk = (rows) => {
      for (const beat of rows) {
        if (!Array.isArray(beat)) continue;
        const tag = beat[0];
        if (tag === "s") {
          const kind = beat[3] || 0;
          push(kind === 1 ? "narration" : kind === 2 ? "think" : "say",
            beat[2], (kind === 0 && beat[1]) ? speakerName(beat[1]) : "");
        } else if (tag === "m") {
          push("meta", beat[1]);
        } else if (tag === "j") {
          push("jump", `→ ${beat[1] || ""}`);
        } else if (tag === "c") {
          const branches = beat[1] || [];
          const first = branches[0] && branches[0][0] ? `：${branches[0][0]}` : "";
          push("choice", t("previewChoice", { n: branches.length }) + first);
        } else if (tag === "br") {
          walk(beat[2] || []);
        }
      }
    };

    walk(beats || []);
    return out;
  };

  const previewOfBranches = (list) => {
    let lines = [];
    let hidden = 0;
    list.slice(0, 3).forEach((beat) => {
      const label = stripRich(beat[1] || "").trim();
      if (label) lines.push({ kind: "cond", text: label });
      const sub = beatsPreview(beat[2] || [], { lines: 1, chars: 60 });
      sub.lines.forEach((line) => {
        lines.push(line);
      });
    });
    if (list.length > 3) hidden = list.length - 3;
    if (lines.length > 6) {
      hidden += lines.length - 6;
      lines = lines.slice(0, 6);
    }
    return { lines: lines, more: hidden };
  };

  const positionBranchPreview = (head, node) => {
    overlay.place(node, head, { align: "start", gap: 6, width: 300, fit: true });
  };

  const showBranchPreview = (head, payload) => {
    const node = branchPreviewEl();
    if (!node || !head) return;
    node.replaceChildren();

    if (payload.branches) {
      const headRow = el("div", "bp-head");
      headRow.appendChild(el("span", "bp-title", payload.title || ""));
      node.appendChild(headRow);
    }

    const preview = payload.branches ? previewOfBranches(payload.branches) : beatsPreview(payload.beats || []);
    if (!preview.lines.length) {
      node.appendChild(el("div", "bp-empty", t("previewEmpty")));
    } else {
      preview.lines.forEach((line) => {
        const row = el("div", `bp-line${line.kind ? ` is-${line.kind}` : ""}`);
        if (line.who) row.appendChild(el("span", "bp-who", line.who));
        row.appendChild(document.createTextNode(line.text));
        node.appendChild(row);
      });
      if (preview.more > 0) node.appendChild(el("div", "bp-foot", t("previewMore", { n: preview.more })));
    }

    node.hidden = false;
    positionBranchPreview(head, node);
  };

  const bindBranchPreview = (head, box, getPayload) => {
    if (!HOVER_OK) return;
    let overVar = false;
    head.addEventListener("mouseenter", () => {
      if (box.classList.contains("is-open")) return;
      if (bpHideTimer) {
        clearTimeout(bpHideTimer);
        bpHideTimer = null;
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
      bpHideTimer = setTimeout(hideBranchPreview, 120);
    });
    head.addEventListener("focus", () => {
      if (box.classList.contains("is-open")) return;
      showBranchPreview(head, getPayload());
    });
    head.addEventListener("blur", hideBranchPreview);
  };

  Object.assign(SR.panels, {
    attachLookupAnchor: attachLookupAnchor,
    beatsPreview: beatsPreview,
    bindBranchPreview: bindBranchPreview,
    branchPreviewEl: branchPreviewEl,
    ensureFacetSets: ensureFacetSets,
    ensureNameIndex: ensureNameIndex,
    extractKey: extractKey,
    hideBranchPreview: hideBranchPreview,
    lookupTargetOf: lookupTargetOf,
    positionBranchPreview: positionBranchPreview,
    previewOfBranches: previewOfBranches,
    resetNameIndex: resetNameIndex,
    showBranchPreview: showBranchPreview,
  });
})();
