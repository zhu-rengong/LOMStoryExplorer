(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const MARGIN = 12;
  const GAP = 8;
  const TRAP_GROUPS = { sheet: 1, modal: 1 };

  const defs = Object.create(null);
  const stack = [];
  let refreshRaf = 0;

  const $ = (id) => document.getElementById(id);

  const panelOf = (def) => {
    if (!def) return null;
    if (!def.panel || !def.panel.isConnected) def.panel = def.id ? $(def.id) : null;
    return def.panel;
  };

  const register = (key, def) => {
    defs[key] = def || {};
    return defs[key];
  };

  const isOpen = (key) => {
    for (const layer of stack) if (layer.key === key) return true;
    return false;
  };

  const topKey = () => (stack.length ? stack[stack.length - 1].key : "");

  const fixedOrigin = (panel) => {
    let node = panel.parentElement;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const blocks = (cs.transform && cs.transform !== "none")
        || (cs.filter && cs.filter !== "none")
        || (cs.backdropFilter && cs.backdropFilter !== "none")
        || (cs.perspective && cs.perspective !== "none")
        || (cs.contain && /paint|layout|strict|content/.test(cs.contain))
        || (cs.willChange && /transform|filter/.test(cs.willChange));
      if (blocks) {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left + (parseFloat(cs.borderLeftWidth) || 0),
          y: rect.top + (parseFloat(cs.borderTopWidth) || 0),
          node: node,
        };
      }
      node = node.parentElement;
    }
    return { x: 0, y: 0, node: null };
  };

  const place = (panel, trigger, options) => {
    if (!panel) return null;
    const opts = options || {};
    const margin = opts.margin == null ? MARGIN : opts.margin;
    const gap = opts.gap == null ? GAP : opts.gap;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;

    const anchor = trigger && trigger.getBoundingClientRect
      ? trigger.getBoundingClientRect()
      : { left: margin, right: margin, top: margin, bottom: margin, width: vw - margin * 2 };

    const below = vh - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    let preferTop = opts.side === "top";
    let maxH = 0;

    if (opts.fit) {
      maxH = Math.max(120, preferTop ? above : below);
      if (!preferTop && below < 220 && above > below) {
        preferTop = true;
        maxH = Math.max(120, above);
      }
      if (preferTop && above < 220 && below > above) {
        preferTop = false;
        maxH = Math.max(120, below);
      }
      if (maxH < 160) maxH = Math.max(120, vh - margin * 2);
    }

    const presetW = opts.width ? Math.round(Math.min(opts.width, vw - margin * 2))
      : opts.matchWidth ? Math.round(Math.min(anchor.width, vw - margin * 2)) : 0;

    panel.classList.add("is-overlay");
    panel.style.cssText = "position:fixed;right:auto;bottom:auto;left:0;top:0"
      + (presetW ? `;width:${presetW}px` : "")
      + (maxH ? `;max-height:${maxH}px` : "");

    const width = Math.round(panel.offsetWidth) || Math.min(240, vw - margin * 2);
    const height = Math.round(panel.offsetHeight) || 200;
    const maxX = Math.max(margin, vw - width - margin);
    const maxY = Math.max(margin, vh - height - margin);

    let x;
    if (opts.align === "start") x = anchor.left;
    else if (opts.align === "center") x = anchor.left + anchor.width / 2 - width / 2;
    else x = anchor.right - width;
    x = Math.min(Math.max(margin, x), maxX);

    let y = preferTop ? anchor.top - height - gap : anchor.bottom + gap;
    y = Math.min(Math.max(margin, y), maxY);

    const origin = fixedOrigin(panel);
    panel.style.cssText = "position:fixed;right:auto;bottom:auto;left:"
      + `${Math.round(x - origin.x)}px;top:${Math.round(y - origin.y)}px;width:${width}px`
      + (maxH ? `;max-height:${maxH}px` : "");

    if (!opts._settled) {
      requestAnimationFrame(() => {
        if (panel.hidden) return;
        place(panel, trigger, { ...opts, _settled: true });
      });
    }
    return { left: x, top: y, width: width, height: height };
  };

  const reposition = (key) => {
    const def = defs[key];
    if (!def || !def.placement) return;
    const panel = panelOf(def);
    if (!panel || panel.hidden) return;
    const trigger = def.trigger && def.trigger.isConnected ? def.trigger : (def.triggerId ? $(def.triggerId) : null);
    place(panel, trigger, def.placement);
  };

  const refresh = () => {
    if (refreshRaf) return;
    refreshRaf = requestAnimationFrame(() => {
      refreshRaf = 0;
      for (const layer of stack) reposition(layer.key);
    });
  };

  const restoreFocus = (layer) => {
    const trigger = layer && layer.trigger;
    if (!trigger || !trigger.isConnected) return;
    if (trigger.disabled) return;
    try {
      trigger.focus({ preventScroll: true });
    } catch (err) {
      try {
        trigger.focus();
      } catch (err2) {
        return;
      }
    }
  };

  const hideLayer = (key) => {
    const def = defs[key];
    if (!def) return;
    if (typeof def.hide === "function") {
      try {
        def.hide();
      } catch (err) {
        return;
      }
      return;
    }
    const panel = panelOf(def);
    if (panel) panel.hidden = true;
  };

  const open = (key, options) => {
    const opts = options || {};
    const def = defs[key];
    if (!def) return false;
    const panel = panelOf(def);
    if (!panel) return false;

    const keep = (def.keep || []).concat(opts.keep || []);
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].key === key) continue;
      if (keep.indexOf(stack[i].key) >= 0) continue;
      close(stack[i].key, { restoreFocus: false });
    }

    const trigger = opts.trigger || (def.triggerId ? $(def.triggerId) : null);
    if (trigger) def.trigger = trigger;
    panel.hidden = false;

    const existing = isOpen(key);
    if (!existing) {
      stack.push({
        key: key,
        trigger: trigger || document.activeElement,
        focusInside: panel.contains(document.activeElement),
      });
    }

    const placement = opts.placement || def.placement;
    if (placement) {
      def.placement = placement;
      place(panel, trigger, placement);
    }

    const autofocus = opts.autofocus || def.autofocus;
    if (!existing && autofocus) {
      const target = typeof autofocus === "string" ? $(autofocus) : null;
      if (target) target.focus();
    }
    return true;
  };

  const close = (key, options) => {
    const opts = options || {};
    let index = -1;
    for (let i = 0; i < stack.length; i++) {
      if (stack[i].key === key) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      hideLayer(key);
      return false;
    }
    const layer = stack.splice(index, 1)[0];
    hideLayer(key);
    if (opts.restoreFocus && !layer.focusInside) restoreFocus(layer);
    return true;
  };

  const closeTop = () => {
    if (!stack.length) return false;
    const layer = stack[stack.length - 1];
    return close(layer.key, { restoreFocus: true });
  };

  const closeAll = () => {
    for (let i = stack.length - 1; i >= 0; i--) close(stack[i].key, { restoreFocus: false });
  };

  const focusRoot = () => {
    if (!stack.length) return null;
    const def = defs[stack[stack.length - 1].key];
    if (!def || !TRAP_GROUPS[def.group || "menu"]) return null;
    return panelOf(def);
  };

  const trapTab = (event) => {
    const root = focusRoot();
    if (!root) return;
    const list = SR.core.focusables(root);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (closeTop()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key === "Tab") trapTab(event);
  }, true);

  window.addEventListener("resize", refresh);
  document.addEventListener("scroll", refresh, true);

  SR.register("overlay", {
    close: close,
    closeAll: closeAll,
    closeTop: closeTop,
    defs: defs,
    isOpen: isOpen,
    open: open,
    place: place,
    refresh: refresh,
    register: register,
    reposition: reposition,
    stack: stack,
    topKey: topKey,
  });
})();
