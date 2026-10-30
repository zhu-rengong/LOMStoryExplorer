(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const FLAG_EMPTY = SR.data.FLAG_EMPTY;
  const attachLookupAnchor = SR.fwd("panels", "attachLookupAnchor");
  const bindBranchPreview = SR.fwd("panels", "bindBranchPreview");
  const chapterOf = SR.data.chapterOf;
  const chapterTitle = SR.i18n.chapterTitle;
  const condexprFallback = SR.fwd("condexpr", "fallback");
  const condexprLabel = SR.fwd("condexpr", "label");
  const condexprPick = SR.fwd("condexpr", "pick");
  const condexprRender = SR.fwd("condexpr", "render");
  const condexprResultOf = SR.fwd("condexpr", "resultOf");
  const el = SR.core.el;
  const ensureCheckpoints = SR.checkpoints.ensure;
  const ensureStoryText = SR.text.ensureStoryText;
  const extractKey = SR.fwd("panels", "extractKey");
  const hideBranchPreview = SR.fwd("panels", "hideBranchPreview");
  const isMobile = SR.viewport.isMobile;
  const langPack = SR.text.langPack;
  const lookupTargetOf = SR.fwd("panels", "lookupTargetOf");
  const navigateTo = SR.fwd("actions", "navigateTo");
  const overlay = SR.overlay;
  const nodeById = SR.data.nodeById;
  const nodeTitle = SR.core.nodeTitle;
  const nodes = SR.data.nodes;
  const openLookup = SR.fwd("panels", "openLookup");
  const outAdj = SR.data.outAdj;
  const positionOf = SR.store.positionOf;
  const prefetchText = SR.text.prefetchText;
  const readerBody = SR.core.readerBody;
  const readerPanel = SR.core.readerPanel;
  const rememberPosition = SR.store.rememberPosition;
  const renderOutlinePanel = SR.fwd("panels", "renderOutlinePanel");
  const state = SR.core.state;
  const storyShardReady = SR.text.storyShardReady;
  const syncBookmarkBtn = SR.store.syncBookmarkBtn;
  const t = SR.i18n.t;
  const toTopBtn = SR.core.toTopBtn;

  const RICH_BASE = 40;

  const RICH_MIN = 0.72;

  const RICH_MAX = 1.9;

  const RICH_TAG = /\{([^{}]*)\}/g;

  const SAY_CLASS = ["", "narration", "think"];

  const ENTRY_KEYS = { combat: "entryCombat", free: "entryFree" };

  const firstLineCache = new Map();

  const clampScale = (value) => {
    if (!isFinite(value) || value <= 0) return 1;
    return Math.max(RICH_MIN, Math.min(RICH_MAX, value));
  };

  const entryLabel = (node) => {
    if (!node || !node.entry) return "";
    const key = ENTRY_KEYS[node.entry];
    return key ? t(key) : "";
  };

  const entryBadge = (node) => {
    const label = entryLabel(node);
    if (!label) return null;
    const badge = el("span", `entry-badge badge ${node.entry === "combat" ? "badge-danger" : "badge-cool"} is-${node.entry}`, label);
    badge.title = t("entrySourceTitle", { name: label });
    return badge;
  };

  const appendSegment = (parent, chunk, stack) => {
    if (!chunk) return;
    const scale = stack.length ? stack[stack.length - 1] : 1;
    if (scale === 1) {
      parent.appendChild(document.createTextNode(chunk));
      return;
    }
    const span = document.createElement("span");
    span.style.fontSize = `${scale.toFixed(2)}em`;
    span.textContent = chunk;
    parent.appendChild(span);
  };

  const appendRich = (parent, text) => {
    if (!text) return parent;
    const stack = [];
    let last = 0;
    let match;
    RICH_TAG.lastIndex = 0;
    while ((match = RICH_TAG.exec(text)) !== null) {
      if (match.index > last) appendSegment(parent, text.slice(last, match.index), stack);
      const tag = (match[1] || "").trim();
      const lower = tag.toLowerCase();
      if (lower.indexOf("/size") === 0 || lower === "size") {
        stack.pop();
      } else if (lower.indexOf("size") === 0 && tag.indexOf("=") > 0) {
        const value = parseFloat(tag.slice(tag.indexOf("=") + 1));
        stack.push(isFinite(value) ? clampScale(value / RICH_BASE) : (stack[stack.length - 1] || 1));
      }
      last = RICH_TAG.lastIndex;
    }
    if (last < text.length) appendSegment(parent, text.slice(last), stack);
    return parent;
  };

  const stripRich = (text) => (text ? String(text).replace(/\{[^{}]*\}/g, "") : "");

  const edgeLabelOf = (edge) => {
    const pack = langPack(state.lang);
    const map = pack.edgeLabels;
    if (map && map[edge.i]) return map[edge.i];
    return edge.label || "";
  };

  const updateReadProgress = () => {
    const bar = $("readProgress");
    if (!bar) return;
    const max = readerBody.scrollHeight - readerBody.clientHeight;
    if (max <= 8) {
      bar.hidden = true;
      bar.style.width = "0%";
      return;
    }
    bar.hidden = false;
    const fraction = Math.min(1, Math.max(0, readerBody.scrollTop / max));
    bar.style.width = `${(fraction * 100).toFixed(2)}%`;
  };

  const updateToTop = () => {
    if (toTopBtn) toTopBtn.hidden = readerBody.scrollTop < 320;
    updateReadProgress();
  };

  const scrollFraction = () => {
    const max = readerBody.scrollHeight - readerBody.clientHeight;
    return max > 0 ? Math.min(1, Math.max(0, readerBody.scrollTop / max)) : 0;
  };

  const nextTargets = (node) => {
    const seen = new Set();
    const list = [];
    outAdj[node.i].forEach((edge) => {
      const target = nodes[edge.b];
      if (!target || seen.has(target.id)) return;
      seen.add(target.id);
      list.push({ node: target, edge: edge });
    });
    return list;
  };

  const prefetchNeighbors = (node) => {
    if (!node || !prefetchText) return;
    const ids = [];
    const ahead = state.history[state.hIndex + 1];
    if (ahead) ids.push(ahead);
    const targets = nextTargets(node);
    for (let i = 0; i < targets.length && ids.length < 2; i++) ids.push(targets[i].node.id);
    if (ids.length) prefetchText(ids, 2);
  };

  const skeletonBlock = () => {
    const wrap = el("div", "reader-skeleton");
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    wrap.appendChild(el("span", "sk-caption", t("loadTextLoading")));
    for (let i = 0; i < 5; i++) {
      const line = el("span", "sk-line");
      line.style.width = `${100 - i * 9}%`;
      wrap.appendChild(line);
    }
    return wrap;
  };

  const textFailedCard = (node) => {
    const card = el("div", "reader-skeleton is-failed");
    card.appendChild(el("span", "sk-caption", t("loadTextFailed")));
    const btn = el("button", "tool-btn btn", t("loadTextRetry"));
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (window.StoryText) window.StoryText.retry(state.lang, node.id);
      renderReader(node, { keepScroll: true });
    });
    card.appendChild(btn);
    return card;
  };

  const speakerName = (id) => {
    if (!id) return "";
    return (langPack(state.lang).characters || {})[id] || id;
  };

  const speakerTone = (id) => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum = (sum * 31 + id.charCodeAt(i)) % 997;
    return sum % 3;
  };

  const loreBlock = (text) => {
    const box = el("div", "lore");
    const body = el("div", "lore-text");
    String(text || "").split(/\n+/).forEach((line) => {
      const trimmed = line.trim();
      if (trimmed) body.appendChild(el("p", "lore-p", trimmed));
    });
    box.appendChild(body);
    return box;
  };

  const renderChoice = (branches, ctx) => {
    const box = el("div", "choice");
    const beatKey = `bt${ctx.seq++}`;
    box.dataset.beat = beatKey;

    branches.forEach((branch, index) => {
      const text = branch[0] || "";
      const note = branch[1] || "";
      const body = branch[2] || [];
      const lock = branch[3] || "";

      const option = el("div", "option");
      option.dataset.opt = `${beatKey}:${index}`;
      const button = el("button", "option-head row");
      button.appendChild(el("span", "option-idx", String(index + 1)));

      const main = el("span", "option-main");
      const textEl = el("span", "option-text");
      appendRich(textEl, text);
      main.appendChild(textEl);

      if (lock || note) {
        const badges = el("span", "option-badges");
        if (lock) badges.appendChild(el("span", "badge badge-lock", `🔒 ${lock}`));
        if (note) {
          const isDice = note.indexOf(t("diceLabel")) === 0;
          badges.appendChild(el("span", `badge ${isDice ? "badge-dice" : "badge-need"}`, note));
        }
        main.appendChild(badges);
      }
      button.appendChild(main);

      const bodyEl = el("div", "option-body");
      bodyEl.appendChild(renderBeats(body, ctx));
      button.addEventListener("click", () => option.classList.toggle("is-open"));
      option.appendChild(button);
      option.appendChild(bodyEl);
      box.appendChild(option);
    });
    return box;
  };

  const foldHeadOf = (box) => {
    for (const child of box.children) {
      const cls = child.classList;
      if (!cls) continue;
      if (cls.contains("option-head") || cls.contains("branch-head")) {
        return child;
      }
    }
    return null;
  };

  const revealBeat = (key) => {
    if (!key || !readerBody) return null;
    const selector = String(key).indexOf(":") >= 0
      ? `[data-opt="${key}"]`
      : `[data-beat="${key}"]`;
    const target = readerBody.querySelector(selector);
    if (!target) return null;
    let node = target.parentElement;
    while (node && node !== readerBody) {
      const cls = node.classList;
      if (cls && (cls.contains("option") || cls.contains("branch")) && !cls.contains("is-open")) {
        cls.add("is-open");
        const head = foldHeadOf(node);
        if (head) head.setAttribute("aria-expanded", "true");
      }
      node = node.parentElement;
    }
    return target;
  };

  const upgradeBranchCond = (cond, label, kind) => {
    if (!cond || !label) return;
    if (kind !== "switch" && kind !== "condition" && kind !== "dice") return;
    const key = extractKey(label);
    if (!key) return;
    const result = condexprResultOf(label);
    ensureCheckpoints(key).then(() => {
      if (!cond.isConnected) return;
      const expr = condexprPick(kind, key, result);
      if (expr) {
        cond.classList.add("is-expr");
        cond.replaceChildren(condexprRender(expr));
        cond.title = condexprLabel(expr);
        return;
      }

      const missed = condexprFallback(kind, key, result);
      if (!missed) return;
      cond.classList.add("is-expr", "is-fallback");
      cond.replaceChildren(el("span", "cx-fallback", t("lookupCondFallback")));
      const excluded = missed.excluded.map(condexprLabel).filter(Boolean);
      const hint = [label, t("cxFallbackHint", { n: missed.n })];
      if (excluded.length) hint.push(excluded.join("；"));
      cond.title = hint.join("\n");
    });
  };

  const renderBranch = (label, beats, ctx, collapsed, kind) => {
    const box = el("div", `branch${collapsed ? "" : " is-open"}`);
    box.dataset.beat = `bt${ctx.seq++}`;
    const head = el("div", "branch-head row row-sm");
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const cond = el("span", "cond", label);
    if (label) {
      cond.title = label;
      cond.dataset.label = label;
    }
    head.appendChild(cond);
    upgradeBranchCond(cond, label, kind);

    const target = lookupTargetOf(extractKey(label) || label);
    if (target) {
      const lookupBtn = el("button", "cond-lookup btn btn-icon");
      lookupBtn.type = "button";
      lookupBtn.title = t("condLookup");
      lookupBtn.setAttribute("aria-label", t("condLookup"));
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-search");
      icon.appendChild(use);
      lookupBtn.appendChild(icon);
      lookupBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openLookup(target.kind, target.key, lookupBtn);
      });
      head.appendChild(lookupBtn);
    }

    const body = el("div", "branch-body");
    body.appendChild(renderBeats(beats || [], ctx));

    const toggle = () => {
      const open = box.classList.toggle("is-open");
      head.setAttribute("aria-expanded", open ? "true" : "false");
      hideBranchPreview();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
    bindBranchPreview(head, box, () => ({ title: label, beats: beats || [] }));

    box.appendChild(head);
    box.appendChild(body);
    return box;
  };

  const renderJump = (target, label) => {
    if (!target) {
      return el("span", "jump dynamic", `▷ ${label || t("jumpDynamic")}`);
    }
    if (!nodeById.has(target)) {
      return el("span", "jump dynamic", `▷ ${target}（${t("jumpMissing")}）`);
    }
    const button = el("button", "jump btn btn-sm btn-primary");
    button.appendChild(el("span", "arrow", "→"));
    button.appendChild(document.createTextNode(target));
    if (label) button.appendChild(el("span", "option-cond", `  ${label}`));
    button.addEventListener("click", () => {
      navigateTo(target);
    });
    return button;
  };

  const renderBeats = (beats, ctx) => {
    ctx = ctx || { seq: 0 };
    const frag = document.createDocumentFragment();
    let metaBuffer = [];
    let branchBuffer = [];
    let branchGroup = null;

    const flushMeta = () => {
      if (metaBuffer.length === 0) return;
      const group = el("div", "meta-group");
      const chips = el("div", "meta-chips");
      metaBuffer.forEach((text) => {
        const chip = el("span", "chip-stat chip chip-sm", text);
        if (text.length > 24) chip.title = text;
        attachLookupAnchor(chip, extractKey(text) || text);
        chips.appendChild(chip);
      });
      group.appendChild(chips);
      frag.appendChild(group);
      metaBuffer = [];
    };

    const flushBranches = () => {
      if (branchBuffer.length === 0) return;
      const group = el("div", "branch-group");
      branchBuffer.forEach((box) => group.appendChild(box));
      branchBuffer = [];
      branchGroup = null;
      frag.appendChild(group);
    };

    for (const beat of beats) {
      const tag = beat[0];

      if (tag === "br") {
        flushMeta();
        const group = beat.length > 4 ? beat[4] : null;
        if (branchBuffer.length > 0 && group !== branchGroup) flushBranches();
        branchGroup = group;
        branchBuffer.push(renderBranch(beat[1], beat[2], ctx, true, beat[3] || "if"));
        continue;
      }

      flushBranches();

      if (tag === "m") {
        metaBuffer.push(stripRich(beat[1]));
        continue;
      }
      flushMeta();

      if (tag === "lore") {
        frag.appendChild(loreBlock(stripRich(beat[1])));
        continue;
      }

      if (tag === "s") {
        const speaker = beat[1];
        const kind = beat[3] || 0;
        const wrapEl = el("div", `say${kind ? ` ${SAY_CLASS[kind]}` : ""}`);
        if (speaker && !kind) wrapEl.classList.add(`spk-${speakerTone(speaker)}`);
        if (speaker) {
          const who = el("span", "who", speakerName(speaker));
          who.classList.add("is-link");
          who.title = t("lookupSpeaker");
          who.addEventListener("click", (event) => {
            event.stopPropagation();
            openLookup("speaker", speaker, who);
          });
          wrapEl.appendChild(who);
        }
        const what = el("div", "what");
        appendRich(what, beat[2]);
        wrapEl.appendChild(what);
        frag.appendChild(wrapEl);
      } else if (tag === "c") {
        frag.appendChild(renderChoice(beat[1], ctx));
      } else if (tag === "j") {
        frag.appendChild(renderJump(beat[1], beat[2]));
      }
    }
    flushMeta();
    flushBranches();
    return frag;
  };

  const hideNextMenu = () => {
    const menu = $("nextMenu");
    if (menu) menu.hidden = true;
  };

  const closeNextMenu = () => {
    if (!overlay.close("nextMenu")) hideNextMenu();
  };

  const renderNextMenu = (node) => {
    const menu = $("nextMenu");
    if (!menu) return;
    const targets = state.nextTargets || nextTargets(node);
    menu.replaceChildren();
    menu.appendChild(el("div", "menu-head", t("recentChoices")));
    const list = el("div", "menu-list popover-list");
    targets.forEach((item) => {
      const row = el("button", "nav-item row");
      row.type = "button";
      row.appendChild(el("span", "nav-id", item.node.id));
      const text = stripRich(edgeLabelOf(item.edge)) || chapterTitle(chapterOf(item.node));
      row.appendChild(el("span", "nav-label", text));
      if (item.edge.kind === 1) row.appendChild(el("span", "nav-badge badge badge-cool", t("navInferred")));
      else if (item.edge.kind === 2) row.appendChild(el("span", "nav-badge badge badge-accent", t("navTemp")));
      row.addEventListener("click", () => {
        closeNextMenu();
        navigateTo(item.node.id);
      });
      list.appendChild(row);
    });
    menu.appendChild(list);
    overlay.open("nextMenu", {
      trigger: $("nextBtn"),
      placement: { align: "end", side: "top", gap: 8, width: 300, fit: true },
    });
  };

  const stepNext = () => {
    const node = state.selected;
    if (!node) return;
    const targets = state.nextTargets || nextTargets(node);
    if (!targets.length) return;
    if (targets.length === 1) {
      navigateTo(targets[0].node.id);
      return;
    }
    const menu = $("nextMenu");
    if (!menu) return;
    if (menu.hidden) renderNextMenu(node);
    else closeNextMenu();
  };

  const renderFoot = (node) => {
    const foot = $("readerFoot");
    if (!foot) return;
    if (!node) {
      foot.hidden = true;
      return;
    }
    foot.hidden = false;

    const prevBtn = $("prevBtn");
    if (prevBtn) prevBtn.disabled = state.hIndex <= 0;

    const pos = $("footPos");
    if (pos) {
      pos.textContent = state.history.length ? `${state.hIndex + 1} / ${state.history.length}` : "";
    }

    const targets = nextTargets(node);
    state.nextTargets = targets;
    const btn = $("nextBtn");
    const label = $("nextLabel");
    if (!btn || !label) return;
    btn.disabled = targets.length === 0;
    if (targets.length === 0) {
      label.textContent = t("recentEnd");
    } else if (targets.length === 1) {
      label.textContent = t("recentNext");
    } else {
      label.textContent = t("recentContinue");
    }
    closeNextMenu();
  };

  const renderReader = (node, options) => {
    options = options || {};
    hideBranchPreview();
    const pack = langPack(state.lang);
    const chapter = chapterOf(node);

    if (state.readingNode && state.readingNode !== node.id) {
      state.scrollMemory.set(state.readingNode, readerBody.scrollTop);
      rememberPosition(state.readingNode, scrollFraction());
    }
    state.readingNode = node.id;

    nodeTitle.textContent = node.id;

    renderFoot(node);
    syncBookmarkBtn();
    const outlinePanel = $("outlinePanel");
    if (outlinePanel && !outlinePanel.hidden) renderOutlinePanel(node);

    const crumb = $("nodeChapter");
    if (crumb) {
      crumb.hidden = false;
      crumb.replaceChildren();
      crumb.appendChild(document.createTextNode(chapterTitle(chapter)));
      const badge = entryBadge(node);
      if (badge) crumb.appendChild(badge);
      const when = SR.data.timeOf(node);
      if (when) {
        const timeSpan = document.createElement("span");
        timeSpan.className = "crumb-time";
        timeSpan.textContent = ` · ${SR.i18n.timeText(when.rounds)}`;
        crumb.appendChild(timeSpan);
      }
    }

    const body = document.createDocumentFragment();

    const beats = (pack.stories || {})[node.id];
    if (beats === undefined && !storyShardReady(node.id)) {
      body.appendChild(skeletonBlock());
      readerBody.setAttribute("aria-busy", "true");
      readerBody.replaceChildren(body);
      if (!options.keepScroll) readerBody.scrollTop = 0;
      updateToTop();
      ensureStoryText(node.id).then((ok) => {
        if (!state.selected || state.selected.id !== node.id) return;
        const current = readerBody.querySelector(".reader-skeleton");
        if (!ok && !storyShardReady(node.id)) {
          readerBody.setAttribute("aria-busy", "false");
          if (current) readerBody.replaceChild(textFailedCard(node), current);
          return;
        }
        renderReader(node, { keepScroll: true });
      });
      readerPanel.classList.add("is-open");
      if (isMobile() && !document.body.dataset.sheet) document.body.dataset.sheet = "half";
      return;
    }

    if (!beats || beats.length === 0) {
      const empty = el("div", "empty-state");
      empty.appendChild(el("span", "brush", "空"));
      empty.appendChild(el("h3", null, t("noBeatsTitle")));
      empty.appendChild(el("p", null, (node.flags & FLAG_EMPTY) ? t("noBeatsEmpty") : t("noBeatsOther")));
      body.appendChild(empty);
    } else {
      body.appendChild(renderBeats(beats, { seq: 0 }));
    }

    readerBody.removeAttribute("aria-busy");
    readerBody.replaceChildren(body);

    if (!options.keepScroll) {
      const remembered = state.scrollMemory.get(node.id);
      if (remembered !== undefined) {
        readerBody.scrollTop = remembered;
      } else {
        const fraction = positionOf(node.id);
        const max = readerBody.scrollHeight - readerBody.clientHeight;
        readerBody.scrollTop = fraction > 0 && max > 0 ? fraction * max : 0;
      }
    }
    updateToTop();
    prefetchNeighbors(node);

    readerPanel.classList.add("is-open");
    if (isMobile() && !document.body.dataset.sheet) document.body.dataset.sheet = "half";
  };

  const firstLineOf = (node) => {
    const key = `${state.lang}|${node.id}`;
    if (firstLineCache.has(key)) return firstLineCache.get(key);
    const pack = langPack(state.lang);
    const beats = (pack.stories || {})[node.id];
    let first = "";
    if (!beats) return first;
    const find = (list) => {
      for (const beat of list) {
        if (first) return;
        if (beat[0] === "s") first = (beat[1] ? `${speakerName(beat[1])}：` : "") + stripRich(beat[2]);
        else if (beat[0] === "c") find(beat[1][0][2] || []);
        else if (beat[0] === "br") find(beat[2] || []);
      }
    };
    find(beats);
    firstLineCache.set(key, first);
    return first;
  };

  const clearFirstLineCache = () => {
    firstLineCache.clear();
  };

  overlay.register("nextMenu", {
    id: "nextMenu",
    triggerId: "nextBtn",
    group: "menu",
    hide: hideNextMenu,
    placement: { align: "end", side: "top", gap: 8, width: 300, fit: true },
  });

  SR.register("reader", {
    RICH_BASE: RICH_BASE,
    RICH_MAX: RICH_MAX,
    RICH_MIN: RICH_MIN,
    RICH_TAG: RICH_TAG,
    SAY_CLASS: SAY_CLASS,
    appendRich: appendRich,
    appendSegment: appendSegment,
    clampScale: clampScale,
    clearFirstLineCache: clearFirstLineCache,
    edgeLabelOf: edgeLabelOf,
    firstLineOf: firstLineOf,
    nextTargets: nextTargets,
    prefetchNeighbors: prefetchNeighbors,
    renderBeats: renderBeats,
    renderBranch: renderBranch,
    renderChoice: renderChoice,
    renderFoot: renderFoot,
    renderJump: renderJump,
    renderNextMenu: renderNextMenu,
    renderReader: renderReader,
    revealBeat: revealBeat,
    scrollFraction: scrollFraction,
    skeletonBlock: skeletonBlock,
    speakerName: speakerName,
    speakerTone: speakerTone,
    stepNext: stepNext,
    stripRich: stripRich,
    textFailedCard: textFailedCard,
    updateReadProgress: updateReadProgress,
    updateToTop: updateToTop,
  });
})();
