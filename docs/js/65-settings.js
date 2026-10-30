(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const TYPE_LABEL_KEY = SR.i18n.TYPE_LABEL_KEY;
  const el = SR.core.el;
  const overlay = SR.overlay;
  const picker = SR.core.picker;
  const pickerList = SR.core.pickerList;
  const pickerSearch = SR.core.pickerSearch;
  const settingsDrawer = SR.core.settingsDrawer;
  const settingsScrim = SR.core.settingsScrim;
  const state = SR.core.state;
  const t = SR.i18n.t;
  const toast = SR.core.toast;

  const pickerState = { target: "", items: [], visible: [], active: 0 };

  const presetLabel = (preset) => {
    if (!preset || !preset.label) return "";
    return preset.label[state.lang === "zh-cn" ? "cn" : "tw"] || preset.label.tw || "";
  };

  const setTrigger = (id, text) => {
    const node = $(id);
    if (!node) return;
    const name = node.querySelector(".ft-name");
    if (name) name.textContent = text;
  };

  const fontItems = (target) => {
    const api = window.StorySettings;
    const items = [];
    if (target.indexOf("type:") === 0) {
      items.push({ value: "", name: t("fontFollowReading"), meta: "" });
    } else if (target === "ui") {
      items.push({ value: "system", name: t("fontSystemDefault"), meta: "" });
    }
    const presets = target === "ui" ? api.presets.ui : api.presets.reading;
    presets.forEach((preset) => {
      if (preset.id === "custom") return;
      if (target === "ui" && preset.id === "system") return;
      items.push({ value: preset.id, name: presetLabel(preset), meta: t("fontPresetMeta") });
    });
    items.push({ value: "__custom__", name: t("fontCustomItem"), meta: "" });
    api.families().forEach((family) => {
      items.push({ value: family, name: family, meta: t("fontSystemMeta"), family: family });
    });
    return items;
  };

  const renderPickerList = (filter) => {
    if (!pickerList) return;
    const query = (filter || "").trim().toLowerCase();
    const items = pickerState.items.filter((item) => {
      if (!query) return true;
      return item.name.toLowerCase().indexOf(query) >= 0;
    });
    pickerState.visible = items;
    if (pickerState.active >= items.length) pickerState.active = 0;
    pickerList.replaceChildren();
    if (!items.length) {
      pickerList.appendChild(el("div", "picker-empty", t("fontNoMatch")));
      return;
    }
    items.forEach((item, index) => {
      const btn = el("button", `picker-item${index === pickerState.active ? " is-active" : ""}`);
      btn.type = "button";
      const name = el("span", "pi-name", item.name);
      if (item.family) name.style.fontFamily = `"${item.family.replace(/"/g, "")}"`;
      btn.appendChild(name);
      if (item.meta) btn.appendChild(el("span", "pi-meta", item.meta));
      btn.addEventListener("click", () => {
        pickFontItem(item, btn);
      });
      pickerList.appendChild(btn);
    });
  };

  const paintPickerActive = () => {
    if (!pickerList) return;
    const rows = pickerList.querySelectorAll(".picker-item");
    rows.forEach((row, index) => {
      row.classList.toggle("is-active", index === pickerState.active);
    });
    const active = rows[pickerState.active];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  };

  const hideFontPickerRaw = () => {
    if (!picker) return;
    picker.hidden = true;
    pickerState.target = "";
  };

  const openFontPicker = (anchor, target) => {
    if (!picker || !anchor) return;
    pickerState.target = target;
    pickerState.items = fontItems(target);
    pickerState.active = 0;
    if (pickerSearch) pickerSearch.value = "";
    renderPickerList("");
    overlay.open("fontPicker", {
      trigger: anchor,
      keep: ["settings"],
      placement: { align: "start", gap: 6, width: 300, fit: true },
    });
    if (pickerSearch) pickerSearch.focus();
  };

  const closeFontPicker = () => {
    if (!overlay.close("fontPicker")) hideFontPickerRaw();
  };

  const pickFontItem = (item, anchor) => {
    const api = window.StorySettings;
    const target = pickerState.target;

    if (item.value === "__custom__") {
      closeFontPicker();
      if (target.indexOf("type:") === 0) {
        const id = target.slice(5);
        const patch = { types: {} };
        patch.types[id] = { font: "" };
        api.set(patch);
        syncSettingsUi();
        const input = $("typeFontCustom");
        if (input) {
          input.hidden = false;
          input.value = "";
          input.focus();
        }
      } else {
        api.set(target === "reading" ? { reading: "custom" } : { ui: "custom" });
        syncSettingsUi();
        const custom = $(target === "reading" ? "fontReadingCustom" : "fontUiCustom");
        if (custom) custom.focus();
      }
      return;
    }

    if (target.indexOf("type:") === 0) {
      const typeId = target.slice(5);
      const payload = { types: {} };
      payload.types[typeId] = { font: item.value };
      api.set(payload);
    } else if (target === "reading") {
      api.set({ reading: item.value });
    } else {
      api.set({ ui: item.value });
    }
    closeFontPicker();
    syncSettingsUi();
    toast(t("fontPicked", { name: item.name }));
    if (anchor) anchor.focus();
  };

  const syncSettingsUi = () => {
    const api = window.StorySettings;
    if (!api || !settingsDrawer) return;
    const settings = api.get();

    setTrigger("fontReadingTrigger", api.describe("reading"));
    setTrigger("fontUiTrigger", api.describe("ui"));

    const readingCustom = $("fontReadingCustom");
    if (readingCustom) {
      readingCustom.hidden = settings.reading !== "custom";
      readingCustom.value = settings.readingCustom || "";
    }
    const uiCustom = $("fontUiCustom");
    if (uiCustom) {
      uiCustom.hidden = settings.ui !== "custom";
      uiCustom.value = settings.uiCustom || "";
    }

    const scale = $("fontScale");
    if (scale) scale.value = String(settings.scale);
    const scaleOut = $("fontScaleOut");
    if (scaleOut) scaleOut.textContent = `${settings.scale}%`;
    document.querySelectorAll("#scalePresets .chip-btn").forEach((btn) => {
      btn.classList.toggle("is-on", Number(btn.dataset.scale) === settings.scale);
    });
    document.querySelectorAll("#leadingSeg .seg-btn").forEach((btn) => {
      btn.classList.toggle("is-on", Math.abs(Number(btn.dataset.leading) - settings.leading) < 0.01);
    });

    const typeId = state.settingsType;
    document.querySelectorAll("#typeTabs .type-tab").forEach((btn) => {
      const on = btn.dataset.type === typeId;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", String(on));
      btn.textContent = t(TYPE_LABEL_KEY[btn.dataset.type] || "typeDialog");
    });

    const item = settings.types[typeId] || { font: "", scale: 100, weight: 400 };
    setTrigger("typeFontTrigger", api.describe(`type:${typeId}`));
    const typeScale = $("typeScale");
    if (typeScale) typeScale.value = String(item.scale);
    const typeScaleOut = $("typeScaleOut");
    if (typeScaleOut) typeScaleOut.textContent = `${item.scale}%`;
    document.querySelectorAll("#weightSeg .seg-btn").forEach((btn) => {
      btn.classList.toggle("is-on", Number(btn.dataset.weight) === Number(item.weight));
    });

    const isPresetId = api.presets.reading.some((preset) => preset.id === item.font);
    const isCustomFamily = !!item.font && !isPresetId;
    const typeCustom = $("typeFontCustom");
    if (typeCustom) {
      typeCustom.hidden = !isCustomFamily;
      if (isCustomFamily) typeCustom.value = item.font;
    }
  };

  const initTypeTabs = () => {
    const tabs = $("typeTabs");
    const api = window.StorySettings;
    if (!tabs || !api) return;
    const frag = document.createDocumentFragment();
    api.presets.types.forEach((type) => {
      const btn = el("button", "type-tab");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.type = type.id;
      btn.textContent = t(TYPE_LABEL_KEY[type.id] || "typeDialog");
      frag.appendChild(btn);
    });
    tabs.replaceChildren(frag);
    tabs.addEventListener("click", (event) => {
      const btn = event.target.closest(".type-tab");
      if (!btn) return;
      state.settingsType = btn.dataset.type;
      syncSettingsUi();
    });
  };

  const hideSettingsRaw = () => {
    if (settingsDrawer) settingsDrawer.hidden = true;
    if (settingsScrim) settingsScrim.hidden = true;
    const btn = $("settingsBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  };

  const openSettings = () => {
    if (!settingsDrawer) return;
    syncSettingsUi();
    settingsScrim.hidden = false;
    const settingsBtn = $("settingsBtn");
    if (settingsBtn) settingsBtn.setAttribute("aria-expanded", "true");
    overlay.open("settings", { trigger: settingsBtn });
    const first = $("fontReadingTrigger");
    if (first) first.focus();
  };

  const closeSettings = () => {
    closeFontPicker();
    if (!overlay.close("settings")) hideSettingsRaw();
  };

  const syncThemeUi = () => {
    const mode = window.StoryTheme ? window.StoryTheme.get() : "auto";
    document.querySelectorAll("#themeSeg .seg-btn").forEach((btn) => {
      const on = btn.dataset.theme === mode;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  };

  const applyTheme = (mode) => {
    if (!window.StoryTheme) return;
    window.StoryTheme.set(mode);
    syncThemeUi();
  };

  const bindTheme = () => {
    document.querySelectorAll("#themeSeg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.theme);
      });
    });
    syncThemeUi();
    document.addEventListener("sr:theme", () => {
      syncThemeUi();
    });
  };

  const bindSettings = () => {
    const api = window.StorySettings;
    if (!api) return;
    bindTheme();
    initTypeTabs();

    const readingTrigger = $("fontReadingTrigger");
    if (readingTrigger) {
      readingTrigger.addEventListener("click", () => {
        openFontPicker(readingTrigger, "reading");
      });
    }
    const uiTrigger = $("fontUiTrigger");
    if (uiTrigger) {
      uiTrigger.addEventListener("click", () => {
        openFontPicker(uiTrigger, "ui");
      });
    }
    const typeTrigger = $("typeFontTrigger");
    if (typeTrigger) {
      typeTrigger.addEventListener("click", () => {
        openFontPicker(typeTrigger, `type:${state.settingsType}`);
      });
    }

    const readingCustom = $("fontReadingCustom");
    if (readingCustom) {
      readingCustom.addEventListener("input", () => {
        api.set({ readingCustom: readingCustom.value });
      });
    }
    const uiCustom = $("fontUiCustom");
    if (uiCustom) {
      uiCustom.addEventListener("input", () => {
        api.set({ uiCustom: uiCustom.value });
      });
    }
    const typeCustom = $("typeFontCustom");
    if (typeCustom) {
      typeCustom.addEventListener("input", () => {
        const payload = { types: {} };
        payload.types[state.settingsType] = { font: typeCustom.value };
        api.set(payload);
      });
    }

    const scale = $("fontScale");
    if (scale) {
      scale.addEventListener("input", () => {
        api.set({ scale: Number(scale.value) });
        syncSettingsUi();
      });
    }

    document.querySelectorAll("#scalePresets .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        api.set({ scale: Number(btn.dataset.scale) });
        syncSettingsUi();
      });
    });

    document.querySelectorAll("#leadingSeg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        api.set({ leading: Number(btn.dataset.leading) });
        syncSettingsUi();
      });
    });

    const typeScale = $("typeScale");
    if (typeScale) {
      typeScale.addEventListener("input", () => {
        const payload = { types: {} };
        payload.types[state.settingsType] = { scale: Number(typeScale.value) };
        api.set(payload);
        syncSettingsUi();
      });
    }

    document.querySelectorAll("#weightSeg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const payload = { types: {} };
        payload.types[state.settingsType] = { weight: Number(btn.dataset.weight) };
        api.set(payload);
        syncSettingsUi();
      });
    });

    if (pickerSearch) {
      pickerSearch.addEventListener("input", () => {
        renderPickerList(pickerSearch.value);
      });
      pickerSearch.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeFontPicker();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (pickerState.visible.length) {
            pickerState.active = (pickerState.active + 1) % pickerState.visible.length;
            paintPickerActive();
          }
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (pickerState.visible.length) {
            pickerState.active = (pickerState.active - 1 + pickerState.visible.length) % pickerState.visible.length;
            paintPickerActive();
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const item = pickerState.visible[pickerState.active];
          if (item) pickFontItem(item);
        }
      });
    }

    document.addEventListener("click", (event) => {
      if (!picker || picker.hidden) return;
      if (picker.contains(event.target)) return;
      if (event.target.closest && event.target.closest(".font-trigger")) return;
      closeFontPicker();
    });

    const reset = $("settingsReset");
    if (reset) {
      reset.addEventListener("click", () => {
        api.reset();
        syncSettingsUi();
        toast(t("toastReset"));
      });
    }

    const done = $("settingsDone");
    if (done) done.addEventListener("click", closeSettings);
    const close = $("settingsClose");
    if (close) close.addEventListener("click", closeSettings);
    if (settingsScrim) settingsScrim.addEventListener("click", closeSettings);
    const btn = $("settingsBtn");
    if (btn) btn.addEventListener("click", openSettings);
  };

  window.addEventListener("sr:fonts", () => {
    if (!picker || picker.hidden || !pickerState.target) return;
    pickerState.items = fontItems(pickerState.target);
    pickerState.active = 0;
    renderPickerList(pickerSearch ? pickerSearch.value : "");
    paintPickerActive();
  });

  overlay.register("settings", {
    id: "settingsDrawer",
    triggerId: "settingsBtn",
    group: "sheet",
    hide: hideSettingsRaw,
  });
  overlay.register("fontPicker", {
    id: "fontPicker",
    group: "menu",
    hide: hideFontPickerRaw,
    keep: ["settings"],
    placement: { align: "start", gap: 6, width: 300, fit: true },
  });

  SR.register("settings", {
    applyTheme: applyTheme,
    bindSettings: bindSettings,
    closeFontPicker: closeFontPicker,
    closeSettings: closeSettings,
    fontItems: fontItems,
    initTypeTabs: initTypeTabs,
    openFontPicker: openFontPicker,
    openSettings: openSettings,
    paintPickerActive: paintPickerActive,
    pickFontItem: pickFontItem,
    presetLabel: presetLabel,
    renderPickerList: renderPickerList,
    setTrigger: setTrigger,
    syncSettingsUi: syncSettingsUi,
  });
})();
