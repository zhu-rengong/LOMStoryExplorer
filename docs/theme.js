(() => {
  "use strict";

  const KEY = "legend-of-mortal.story-reader.theme.v1";
  const MODES = ["paper", "night", "auto"];
  const root = document.documentElement;

  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  let mode = "auto";

  const stored = () => {
    try {
      const value = localStorage.getItem(KEY);
      if (MODES.indexOf(value) >= 0) return value;
    } catch {
      return "auto";
    }
    return "auto";
  };

  const resolve = (next) => {
    if (next === "auto") return media && media.matches ? "night" : "paper";
    return next === "night" ? "night" : "paper";
  };

  const apply = () => {
    const theme = resolve(mode);
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "night" ? "dark" : "light";
    return theme;
  };

  const set = (next) => {
    if (MODES.indexOf(next) < 0) next = "auto";
    mode = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      mode = next;
    }
    const theme = apply();
    document.dispatchEvent(new CustomEvent("sr:theme", {
      detail: { mode: mode, theme: theme },
    }));
    return theme;
  };

  mode = stored();
  apply();

  if (media) {
    const onSystemChange = () => {
      if (mode !== "auto") return;
      apply();
      document.dispatchEvent(new CustomEvent("sr:theme", {
        detail: { mode: mode, theme: resolve(mode), system: true },
      }));
    };
    if (media.addEventListener) media.addEventListener("change", onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  window.StoryTheme = {
    KEY: KEY,
    MODES: MODES.slice(),
    get: () => mode,
    theme: () => resolve(mode),
    set: set,
  };
})();
