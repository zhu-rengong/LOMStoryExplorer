(() => {
  "use strict";
  const SR = window.SR;
  const { dom } = SR.core;
  const state = SR.store.state;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const settings = state.settings;
    const night = settings.theme === "night" || (settings.theme === "system" && media.matches);
    document.documentElement.dataset.theme = night ? "night" : "paper";
    document.documentElement.dataset.font = settings.font;
    document.documentElement.style.setProperty("--reader-size", `${settings.fontSize}px`);
    document.documentElement.style.setProperty("--reader-leading", settings.lineHeight);
    document.documentElement.style.setProperty("--reader-width", `${settings.width}px`);
    dom.byId("themeToggle").dataset.theme = settings.theme;
    for (const input of dom.all("[data-setting]")) {
      const key = input.dataset.setting;
      if (input.type === "radio") input.checked = input.value === String(settings[key]);
      else input.value = settings[key];
      const output = dom.byId(`${key}Value`);
      if (output) output.textContent = key === "width" ? `${settings[key]} px` : key === "fontSize" ? `${settings[key]} px` : settings[key];
    }
    for (const button of dom.all("[data-lang]")) button.classList.toggle("is-active", button.dataset.lang === state.lang);
    SR.i18n.apply();
  };
  const init = () => {
    media.addEventListener("change", apply);
    for (const input of dom.all("[data-setting]")) {
      input.addEventListener("input", () => {
        const key = input.dataset.setting;
        const value = input.type === "range" ? Number(input.value) : input.value;
        SR.store.actions.settings({ [key]: value });
      });
    }
    for (const button of dom.all("[data-lang]")) button.addEventListener("click", () => SR.store.actions.language(button.dataset.lang));
    dom.byId("themeToggle").addEventListener("click", () => {
      const night = document.documentElement.dataset.theme === "night";
      SR.store.actions.settings({ theme: night ? "paper" : "night" });
    });
    dom.byId("resetSettings").addEventListener("click", () => SR.store.actions.settings({
      theme: "system", font: "serif", fontSize: 19, lineHeight: 1.9, width: 720,
    }));
  };
  SR.register("settings", { init, apply });
})();
