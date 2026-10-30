(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const FACETS = SR.data.FACETS;
  const chapterOf = SR.data.chapterOf;
  const chapterTitle = SR.i18n.chapterTitle;
  const el = SR.core.el;
  const firstLineOf = SR.reader.firstLineOf;
  const revealBeat = SR.reader.revealBeat;
  const isMobile = SR.viewport.isMobile;
  const langPack = SR.text.langPack;
  const navigateTo = SR.fwd("actions", "navigateTo");
  const nodes = SR.data.nodes;
  const overlay = SR.overlay;
  const speakerName = SR.reader.speakerName;
  const state = SR.core.state;
  const stripRich = SR.reader.stripRich;
  const t = SR.i18n.t;

  const FACET_COLUMN = { speaker: 0, flag: 1, check: 2, stat: 3, rel: 4 };

  const NAME_TABLE = { flag: "flags", check: "checks", stat: "stats", rel: "rels" };

  const lookup = { items: [], active: 0, trigger: null, open: false, seq: 0 };

  const outlineModel = (beats) => {
    let seq = 0;

    const walk = (rowsIn) => {
      const out = [];
      for (const beat of rowsIn) {
        if (!beat) continue;
        if (beat[0] === "c") {
          const key = `bt${seq++}`;
          const choice = {
            kind: "choice",
            key: key,
            label: t("choiceHead", { n: beat[1].length }),
            children: [],
          };
          for (let j = 0; j < beat[1].length; j++) {
            const branch = beat[1][j] || [];
            choice.children.push({
              kind: "option",
              key: `${key}:${j}`,
              index: j + 1,
              label: stripRich(branch[0] || ""),
              lock: branch[3] || "",
              note: branch[1] || "",
              children: walk(branch[2] || []),
            });
          }
          out.push(choice);
        } else if (beat[0] === "br") {
          out.push({
            kind: "branch",
            key: `bt${seq++}`,
            label: stripRich(beat[1] || ""),
            children: walk(beat[2] || []),
          });
        }
      }
      return out;
    };

    return walk(beats || []);
  };

  const scrollToBeat = (key) => {
    const target = revealBeat(key);
    if (!target) return;
    requestAnimationFrame(() => {
      if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("is-flash");
      setTimeout(() => {
        target.classList.remove("is-flash");
      }, 900);
    });
  };

  const renderOutlineNode = (node, depth) => {
    const key = node.key;
    const box = el("div", `ol-node ol-${node.kind}`);
    box.dataset.kind = node.kind;
    box.dataset.depth = String(Math.min(depth, 4));
    if (depth) box.classList.add("is-nested");

    const row = el("div", "outline-item ol-head");
    row.title = node.label;
    if (node.kind === "option") {
      row.appendChild(el("span", "ol-idx", String(node.index || "")));
    } else {
      row.appendChild(el("span", "ol-tag", "◇"));
    }
    row.appendChild(el("span", "ol-label", node.label));
    if (node.lock) row.appendChild(el("span", "ol-badge ol-lock", `🔒 ${node.lock}`));
    else if (node.note) row.appendChild(el("span", "ol-badge ol-note", node.note));

    if (key) {
      row.dataset.key = key;
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.addEventListener("click", () => {
        scrollToBeat(key);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          scrollToBeat(key);
        }
      });
    }
    box.appendChild(row);

    if (node.children && node.children.length) {
      const body = el("div", "ol-body");
      body.appendChild(renderOutlineNodes(node.children, depth + 1));
      box.appendChild(body);
    }
    return box;
  };

  const renderOutlineNodes = (list, depth) => {
    const frag = document.createDocumentFragment();
    list.forEach((node) => {
      frag.appendChild(renderOutlineNode(node, depth));
    });
    return frag;
  };

  const renderOutlinePanel = (node) => {
    const panel = $("outlinePanel");
    const list = $("outlineList");
    if (!panel || !list) return;
    if (!node) {
      panel.hidden = true;
      return;
    }
    const beats = (langPack(state.lang).stories || {})[node.id] || [];
    const tree = outlineModel(beats);
    list.replaceChildren();
    if (!tree.length) {
      list.appendChild(el("p", "rail-empty", t("outlineEmpty")));
      return;
    }
    list.appendChild(renderOutlineNodes(tree, 0));
  };

  const hideOutline = () => {
    const panel = $("outlinePanel");
    const btn = $("outlineBtn");
    if (panel) panel.hidden = true;
    if (btn) {
      btn.classList.remove("is-on");
      btn.setAttribute("aria-pressed", "false");
    }
  };

  const closeOutline = () => {
    if (!overlay.close("outline")) hideOutline();
  };

  const openOutline = () => {
    const panel = $("outlinePanel");
    const btn = $("outlineBtn");
    if (!panel || !state.selected) return;
    renderOutlinePanel(state.selected);
    if (btn) {
      btn.classList.add("is-on");
      btn.setAttribute("aria-pressed", "true");
    }
    overlay.open("outline", { trigger: btn });
    if (panel.hidden) overlay.close("outline", { restoreFocus: false });
  };

  const toggleOutlinePanel = () => {
    const panel = $("outlinePanel");
    if (!panel) return;
    if (panel.hidden) openOutline();
    else closeOutline();
  };

  const lookupMatches = (kind, key) => {
    const out = [];
    if (!FACETS) return out;
    let columnIndex = FACET_COLUMN[kind];
    if (columnIndex === undefined) columnIndex = 3;
    for (let i = 0; i < FACETS.length; i++) {
      const column = FACETS[i][columnIndex] || "";
      if (!column) continue;
      if ((`,${column},`).indexOf(`,${key},`) < 0) continue;
      out.push(nodes[i]);
    }
    return out;
  };

  const checkBelongsTo = (key, checkKey) => checkKey === key || checkKey.indexOf(`${key}_`) === 0;

  const flagLookup = (key) => {
    const writes = [];
    const reads = [];
    if (!FACETS) return { writes: writes, reads: reads };
    for (let i = 0; i < FACETS.length; i++) {
      const row = FACETS[i];
      const flagCol = row[1] || "";
      if ((`,${flagCol},`).indexOf(`,${key},`) >= 0) {
        writes.push(nodes[i]);
        continue;
      }
      const checkCol = row[2] || "";
      if (!checkCol) continue;
      let hit = (`,${checkCol},`).indexOf(`,${key},`) >= 0;
      if (!hit) {
        for (const checkKey of checkCol.split(",")) {
          if (checkKey && checkBelongsTo(key, checkKey)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) reads.push(nodes[i]);
    }
    return { writes: writes, reads: reads };
  };

  const lookupCount = (kind, key) => {
    if (!key) return 0;
    if (kind === "flag") {
      const groups = flagLookup(key);
      return groups.writes.length + groups.reads.length;
    }
    return lookupMatches(kind, key).length;
  };

  const repositionLookup = () => {
    if (!lookup.open) return;
    overlay.reposition("lookup");
  };

  const paintLookupActive = () => {
    const list = $("lookupList");
    if (!list) return;
    const rows = list.querySelectorAll(".lookup-item");
    rows.forEach((row, index) => {
      row.classList.toggle("is-active", index === lookup.active);
    });
    const active = rows[lookup.active];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  };

  const moveLookup = (delta) => {
    if (!lookup.items.length) return;
    lookup.active = (lookup.active + delta + lookup.items.length) % lookup.items.length;
    paintLookupActive();
  };

  const hideLookup = () => {
    const panel = $("lookupPanel");
    if (panel) panel.hidden = true;
    lookup.open = false;
  };

  const closeLookup = () => {
    if (!overlay.close("lookup")) hideLookup();
  };

  const chooseLookup = () => {
    const node = lookup.items[lookup.active];
    if (!node) return false;
    closeLookup();
    navigateTo(node.id);
    return true;
  };

  const positionLookup = (trigger) => {
    const panel = $("lookupPanel");
    if (!panel || !trigger || !trigger.getBoundingClientRect) return;
    if (isMobile()) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.position = "";
      return;
    }
    overlay.place(panel, trigger, { align: "start", width: 330, fit: true });
  };

  const openLookup = (kind, key, trigger) => {
    if (!key) return;
    const panel = $("lookupPanel");
    if (!panel) return;
    const groups = kind === "flag" ? flagLookup(key) : null;
    const items = groups ? groups.writes.concat(groups.reads) : lookupMatches(kind, key);
    const titleKey = kind === "speaker" ? "lookupSpeaker"
      : kind === "flag" ? "lookupFlag"
      : kind === "check" ? "lookupCheck"
      : kind === "rel" ? "lookupRel" : "lookupStat";
    let name = kind === "speaker" ? speakerName(key) : key;
    if (kind !== "speaker") {
      const pack = langPack(state.lang);
      const table = (pack.names || {})[NAME_TABLE[kind] || "stats"];
      if (table && table[key]) name = table[key];
    }

    const title = $("lookupTitle");
    if (title) title.textContent = t("lookupTitle", { name: name, n: items.length });
    const sub = $("lookupSub");
    if (sub) sub.textContent = t(titleKey);

    const list = $("lookupList");
    list.replaceChildren();
    if (kind === "check") {
      const renderCondBlock = SR.fwd("panels", "renderCondBlock");
      renderCondBlock(list, key);
    }

    const rowOf = (node) => {
      const row = el("div", "lookup-item");
      row.setAttribute("role", "option");
      const top = el("div", "li-top");
      top.appendChild(el("span", "li-id", node.id));
      top.appendChild(el("span", "li-ch", chapterTitle(chapterOf(node))));
      row.appendChild(top);
      const first = firstLineOf(node);
      if (first) row.appendChild(el("span", "li-text", first));
      row.addEventListener("click", () => {
        closeLookup();
        navigateTo(node.id);
      });
      return row;
    };

    if (!items.length) {
      list.appendChild(el("p", "lookup-empty", t("lookupEmpty")));
    } else if (groups) {
      if (groups.writes.length) {
        list.appendChild(el("p", "lookup-group", t("lookupGroupWrites", { n: groups.writes.length })));
        groups.writes.forEach((node) => {
          list.appendChild(rowOf(node));
        });
      }
      if (groups.reads.length) {
        list.appendChild(el("p", "lookup-group", t("lookupGroupReads", { n: groups.reads.length })));
        groups.reads.forEach((node) => {
          list.appendChild(rowOf(node));
        });
      } else {
        list.appendChild(el("p", "lookup-group-note", t("lookupGroupReadsEmpty")));
      }
    } else {
      items.forEach((node) => {
        list.appendChild(rowOf(node));
      });
    }

    lookup.items = items;
    lookup.active = 0;
    lookup.trigger = trigger || null;
    lookup.open = true;
    paintLookupActive();
    panel.hidden = false;
    overlay.open("lookup", { trigger: trigger || null });
  };

  overlay.register("lookup", {
    id: "lookupPanel",
    group: "pop",
    hide: hideLookup,
    placement: { align: "start", width: 330, fit: true },
  });
  overlay.register("outline", {
    id: "outlinePanel",
    triggerId: "outlineBtn",
    group: "sheet",
    hide: hideOutline,
    placement: { align: "end", width: 320, fit: true },
  });

  SR.register("panels", {
    checkBelongsTo: checkBelongsTo,
    chooseLookup: chooseLookup,
    closeLookup: closeLookup,
    closeOutline: closeOutline,
    flagLookup: flagLookup,
    hideLookup: hideLookup,
    hideOutline: hideOutline,
    lookup: lookup,
    lookupCount: lookupCount,
    lookupMatches: lookupMatches,
    moveLookup: moveLookup,
    openLookup: openLookup,
    openOutline: openOutline,
    outlineModel: outlineModel,
    paintLookupActive: paintLookupActive,
    positionLookup: positionLookup,
    renderOutlinePanel: renderOutlinePanel,
    repositionLookup: repositionLookup,
    scrollToBeat: scrollToBeat,
    toggleOutlinePanel: toggleOutlinePanel,
  });
})();
