(() => {
  "use strict";

  const META = window.SR_I18N_META || {};

  const DICT = window.SR_I18N || {};

  const langOf = () => {
    const html = String(document.documentElement.lang || "").toLowerCase();
    for (const id of Object.keys(META)) {
      if (String(META[id].html || "").toLowerCase() === html) return id;
    }
    if (html.indexOf("hans") >= 0) return "zh-cn";
    if (html.indexOf("en") === 0) return "en";
    return "zh-tw";
  };

  const dict = DICT[langOf()] || DICT["zh-tw"] || {};

  const showFatal = (error) => {
    const body = document.body;
    body.replaceChildren();
    const panel = document.createElement("div");
    panel.style.cssText = "max-width:640px;margin:12vh auto;padding:32px;font-family:var(--font-base,system-ui,sans-serif);line-height:1.7;color:var(--ink,currentColor)";
    const title = document.createElement("h1");
    title.style.cssText = "font-size:22px;margin:0 0 12px";
    title.textContent = dict.errorTitle || "Failed to load";
    const message = document.createElement("p");
    message.style.cssText = "margin:0 0 20px;color:var(--ink-2,currentColor);word-break:break-word";
    message.textContent = (error && error.message) || String(error);
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = "padding:8px 18px;border:1px solid currentColor;border-radius:2px;background:transparent;color:inherit;cursor:pointer";
    button.textContent = dict.errorReload || "Reload";
    button.addEventListener("click", () => location.reload());
    panel.appendChild(title);
    panel.appendChild(message);
    panel.appendChild(button);
    body.appendChild(panel);
  };

  window.addEventListener("error", (event) => {
    const target = event.target;
    if (target && target.tagName === "SCRIPT" && target.src && /\/js\//.test(target.src)) {
      showFatal(new Error(`${dict.errorMissing || "Failed to load"}: ${target.src}`));
    }
  }, true);

  try {
    window.SR.start("app").start();
  } catch (error) {
    showFatal(error);
  }
})();
