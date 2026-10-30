(() => {
  "use strict";
  const SR = window.SR = window.SR || {};
  SR.VERSION = 1;
  SR.register = (name, api) => {
    if (SR[name]) throw new Error(`Duplicate SR module: ${name}`);
    SR[name] = api;
    return api;
  };
  const dom = {
    byId: (id) => document.getElementById(id),
    all: (selector, root = document) => [...root.querySelectorAll(selector)],
    clear: (node) => {
      while (node.firstChild) node.firstChild.remove();
      return node;
    },
    h: (tag, attributes = {}, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, String(value));
      }
      for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
      return node;
    },
    icon: (name, className = "icon") => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", className);
      svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", `#icon-${name}`);
      svg.append(use);
      return svg;
    },
  };
  const pending = new Map();
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < 2 && queue.length) {
      const item = queue.shift();
      active += 1;
      const script = document.createElement("script");
      script.src = item.src;
      script.async = false;
      const finish = (error) => {
        active -= 1;
        script.remove();
        if (error) pending.delete(item.src);
        item.settle(error);
        pump();
      };
      script.addEventListener("load", () => finish(null), { once: true });
      script.addEventListener("error", () => finish(new Error(`Unable to load data: ${item.src}`)), { once: true });
      document.head.append(script);
    }
  };
  const loadScript = (src) => {
    if (pending.has(src)) return pending.get(src);
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    pending.set(src, promise);
    queue.push({ src, settle: (error) => error ? reject(error) : resolve() });
    pump();
    return promise;
  };
  const debounce = (callback, delay = 180) => {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...args), delay);
    };
  };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  SR.register("core", { dom, loadScript, debounce, clamp, escapeRegExp });
})();
