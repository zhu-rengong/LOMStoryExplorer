(() => {
  "use strict";

  const SR = window.SR;

  const SVG_NS = "http://www.w3.org/2000/svg";

  const $ = (id) => document.getElementById(id);

  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  const svg = (icon, className) => {
    const root = document.createElementNS(SVG_NS, "svg");
    if (className) root.setAttribute("class", className);
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#${icon}`);
    root.appendChild(use);
    return root;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const debounce = (fn, wait) => {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
  };

  const rafBatch = (fn) => {
    let handle = 0;
    return () => {
      if (handle) return;
      handle = requestAnimationFrame(() => {
        handle = 0;
        fn();
      });
    };
  };

  const normalizeQuery = (value) => String(value || "").trim().toLowerCase();

  const NUMBER_RE = /\B(?=(\d{3})+(?!\d))/g;

  const formatNumber = (value) => String(Number(value) || 0).replace(NUMBER_RE, ",");

  const setPressed = (node, on) => {
    if (!node) return;
    node.setAttribute("aria-pressed", on ? "true" : "false");
  };

  const setExpanded = (node, on) => {
    if (!node || typeof node.setAttribute !== "function") return;
    node.setAttribute("aria-expanded", on ? "true" : "false");
  };

  const setOn = (node, on, token) => {
    if (!node) return;
    node.classList.toggle(token || "is-on", !!on);
  };

  let toastTimer = null;

  const toast = (text) => {
    const target = $("toast");
    if (!target || !text) return;
    target.textContent = text;
    target.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      target.hidden = true;
    }, 2400);
  };

  const progress = (text) => {
    const target = $("ioStatus");
    if (!target) return;
    target.textContent = text ? String(text) : "";
    target.hidden = !text;
    if (!text) target.textContent = "";
  };

  const loadScript = (src, async) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = !!async;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });

  const focusables = (root) => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(selector), (node) => node.offsetParent !== null);
  };

  SR.define("ui", [], () => ({
    $,
    $$,
    clamp,
    debounce,
    el,
    focusables,
    formatNumber,
    loadScript,
    normalizeQuery,
    progress,
    rafBatch,
    setExpanded,
    setOn,
    setPressed,
    svg,
    toast,
  }));
})();
