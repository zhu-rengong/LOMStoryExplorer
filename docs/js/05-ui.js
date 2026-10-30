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

  const NUMBER_RE = /\B(?=(\d{3})+(?!\d))/g;

  const formatNumber = (value) => String(Number(value) || 0).replace(NUMBER_RE, ",");

  const setPressed = (node, on) => {
    if (!node) return;
    node.setAttribute("aria-pressed", on ? "true" : "false");
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

  const copyText = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => false);
    }
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  };

  const focusables = (root) => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(selector), (node) => node.offsetParent !== null);
  };

  SR.define("ui", [], () => ({
    $,
    $$,
    clamp,
    copyText,
    debounce,
    el,
    focusables,
    formatNumber,
    progress,
    setPressed,
    svg,
    toast,
  }));
})();
