(() => {
  "use strict";
  const SR = window.SR;
  const KEY = "storyreader:v2";
  const VERSION = 2;
  const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_]{1,100}$/.test(value);
  const validate = (payload) => {
    if (!payload || payload.version !== VERSION) return null;
    const settings = payload.settings || {};
    return {
      lang: ["zh-tw", "zh-cn", "kr"].includes(payload.lang) ? payload.lang : "zh-tw",
      bookmarks: Array.isArray(payload.bookmarks) ? [...new Set(payload.bookmarks.filter(validId))].slice(0, 500) : [],
      recents: Array.isArray(payload.recents) ? payload.recents.filter((item) => validId(item?.id) && Number.isFinite(item.at)).slice(0, 60) : [],
      progress: payload.progress && typeof payload.progress === "object" ? Object.fromEntries(
        Object.entries(payload.progress).filter(([id, value]) => validId(id) && Number.isFinite(value)).map(([id, value]) => [id, SR.core.clamp(value, 0, 1)])
      ) : {},
      expanded: Array.isArray(payload.expanded) ? payload.expanded.filter((id) => typeof id === "string").slice(0, 100) : [],
      settings: {
        theme: ["system", "paper", "night"].includes(settings.theme) ? settings.theme : "system",
        font: ["serif", "sans"].includes(settings.font) ? settings.font : "serif",
        fontSize: SR.core.clamp(Number(settings.fontSize) || 19, 16, 26),
        lineHeight: SR.core.clamp(Number(settings.lineHeight) || 1.9, 1.5, 2.3),
        width: SR.core.clamp(Number(settings.width) || 720, 560, 900),
      },
    };
  };
  const load = () => {
    try {
      return validate(JSON.parse(localStorage.getItem(KEY) || "null"));
    } catch {
      return null;
    }
  };
  const save = () => {
    const state = SR.store.state;
    const payload = {
      version: VERSION,
      lang: state.lang,
      bookmarks: state.bookmarks,
      recents: state.recents,
      progress: state.progress,
      expanded: state.expanded,
      settings: state.settings,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
      return;
    }
  };
  SR.register("storage", { load, save, schedule: SR.core.debounce(save, 240) });
})();
