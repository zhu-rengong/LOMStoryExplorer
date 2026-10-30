(() => {
  "use strict";

  const SR = window.SR;

  SR.define("overlay", ["ui"], ({ ui }) => {
    const MARGIN = 12;
    const GAP = 8;
    const TRAP_GROUPS = { sheet: true, modal: true };
    const AUTO_CLOSE_GROUPS = { menu: true, pop: true };

    const defs = Object.create(null);
    const stack = [];
    let refreshRaf = 0;

    const $ = (id) => document.getElementById(id);

    const panelOf = (def) => {
      if (!def) return null;
      if (def.panel && def.panel.isConnected) return def.panel;
      if (typeof def.panel === "string") {
        def.panel = $(def.panel);
      } else if (def.id) {
        def.panel = $(def.id);
      }
      return def.panel;
    };

    const triggerOf = (def, explicit) => {
      if (explicit) return explicit;
      if (def.trigger && def.trigger.isConnected) return def.trigger;
      if (typeof def.trigger === "string") {
        def.trigger = $(def.trigger);
      } else if (def.triggerId) {
        def.trigger = $(def.triggerId);
      }
      return def.trigger;
    };

    const register = (key, def) => {
      defs[key] = def || {};
      return defs[key];
    };

    const isOpen = (key) => stack.some((layer) => layer.key === key);

    const topKey = () => (stack.length ? stack[stack.length - 1].key : "");

    const fixedOrigin = (panel) => {
      let node = panel.parentElement;
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        const blocks = (style.transform && style.transform !== "none")
          || (style.filter && style.filter !== "none")
          || (style.backdropFilter && style.backdropFilter !== "none")
          || (style.perspective && style.perspective !== "none")
          || (style.contain && /paint|layout|strict|content/.test(style.contain))
          || (style.willChange && /transform|filter/.test(style.willChange));
        if (blocks) {
          const rect = node.getBoundingClientRect();
          return {
            x: rect.left + (parseFloat(style.borderLeftWidth) || 0),
            y: rect.top + (parseFloat(style.borderTopWidth) || 0),
          };
        }
        node = node.parentElement;
      }
      return { x: 0, y: 0 };
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
      let maxHeight = 0;

      if (opts.fit) {
        maxHeight = Math.max(120, preferTop ? above : below);
        if (!preferTop && below < 220 && above > below) {
          preferTop = true;
          maxHeight = Math.max(120, above);
        }
        if (preferTop && above < 220 && below > above) {
          preferTop = false;
          maxHeight = Math.max(120, below);
        }
        if (maxHeight < 160) maxHeight = Math.max(120, vh - margin * 2);
      }

      const presetWidth = opts.width ? Math.round(Math.min(opts.width, vw - margin * 2))
        : opts.matchWidth ? Math.round(Math.min(anchor.width, vw - margin * 2)) : 0;

      panel.classList.add("is-overlay");
      panel.style.cssText = "position:fixed;right:auto;bottom:auto;left:0;top:0"
        + (presetWidth ? `;width:${presetWidth}px` : "")
        + (maxHeight ? `;max-height:${maxHeight}px` : "");

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
        + (maxHeight ? `;max-height:${maxHeight}px` : "");

      if (!opts._settled) {
        requestAnimationFrame(() => {
          if (panel.hidden) return;
          place(panel, trigger, Object.assign({}, opts, { _settled: true }));
        });
      }
      return { left: x, top: y, width, height };
    };

    const reposition = (key) => {
      const def = defs[key];
      if (!def || !def.placement) return;
      const panel = panelOf(def);
      if (!panel || panel.hidden) return;
      place(panel, triggerOf(def), def.placement);
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
      if (!trigger || !trigger.isConnected || trigger.disabled) return;
      try {
        trigger.focus({ preventScroll: true });
      } catch {
        try {
          trigger.focus();
        } catch {
          return;
        }
      }
    };

    const hideLayer = (key) => {
      const def = defs[key];
      if (!def) return;
      const panel = panelOf(def);
      if (typeof def.onHide === "function") def.onHide();
      else if (panel) panel.hidden = true;
      if (def.trigger && def.trigger.setAttribute) def.trigger.setAttribute("aria-expanded", "false");
    };

    const open = (key, options) => {
      const opts = options || {};
      const def = defs[key];
      if (!def) return false;
      const panel = panelOf(def);
      if (!panel) return false;

      const keep = (def.keep || []).concat(opts.keep || []);
      for (let index = stack.length - 1; index >= 0; index--) {
        if (stack[index].key === key) continue;
        if (keep.indexOf(stack[index].key) >= 0) continue;
        close(stack[index].key, { restoreFocus: false });
      }

      const trigger = triggerOf(def, opts.trigger);
      const previous = def.trigger;
      if (previous && previous !== trigger && previous.setAttribute) {
        previous.setAttribute("aria-expanded", "false");
      }
      if (trigger) def.trigger = trigger;
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      if (trigger && trigger.setAttribute) trigger.setAttribute("aria-expanded", "true");

      const existing = stack.find((layer) => layer.key === key);
      if (!existing) {
        stack.push({
          key,
          trigger: trigger || document.activeElement,
          focusInside: panel.contains(document.activeElement),
        });
      } else if (trigger) {
        existing.trigger = trigger;
      }

      const placement = opts.placement || def.placement;
      if (placement) {
        def.placement = placement;
        place(panel, trigger, placement);
      }

      if (!existing) {
        const autofocus = opts.autofocus || def.autofocus;
        if (autofocus) {
          const target = typeof autofocus === "string" ? $(autofocus) : autofocus;
          if (target) {
            try {
              target.focus({ preventScroll: true });
            } catch {
              target.focus();
            }
          }
        }
      }
      if (typeof def.onOpen === "function") def.onOpen();
      return true;
    };

    const close = (key, options) => {
      const opts = options || {};
      let index = -1;
      for (let cursor = 0; cursor < stack.length; cursor++) {
        if (stack[cursor].key === key) {
          index = cursor;
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
      return close(stack[stack.length - 1].key, { restoreFocus: true });
    };

    const toggle = (key, options) => {
      if (isOpen(key)) return close(key, { restoreFocus: true });
      return open(key, options);
    };

    const activePanel = () => {
      if (!stack.length) return null;
      return panelOf(defs[stack[stack.length - 1].key]);
    };

    const trapTab = (event) => {
      const def = defs[topKey()];
      if (!def || !TRAP_GROUPS[def.group || "menu"]) return;
      const root = panelOf(def);
      if (!root) return;
      const list = ui.focusables(root);
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

    document.addEventListener("click", (event) => {
      for (let guard = 0; guard < 8; guard++) {
        const def = defs[topKey()];
        if (!def || !AUTO_CLOSE_GROUPS[def.group || ""]) return;
        const panel = panelOf(def);
        const trigger = triggerOf(def);
        if (!panel || panel.hidden) return;
        if (panel.contains(event.target)) return;
        if (trigger && trigger.contains && trigger.contains(event.target)) return;
        let kept = false;
        for (const keep of def.keep || []) {
          const keptDef = defs[keep];
          const keptPanel = keptDef && panelOf(keptDef);
          if (keptPanel && keptPanel.contains(event.target)) {
            kept = true;
            break;
          }
        }
        close(topKey(), { restoreFocus: false });
        if (kept) return;
      }
    });

    window.addEventListener("resize", refresh);
    document.addEventListener("scroll", refresh, true);

    return {
      activePanel,
      close,
      closeTop,
      defs,
      isOpen,
      open,
      place,
      refresh,
      register,
      reposition,
      stack,
      toggle,
      topKey,
    };
  });
})();
