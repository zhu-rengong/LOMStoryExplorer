(() => {
  "use strict";

  const SR = window.SR;

  SR.define("settingsUi", ["store", "i18n", "settings", "overlay", "ui"],
    ({ store, i18n, settings, overlay, ui }) => {
      const $ = ui.$;

      const pickerState = { target: "", items: [], visible: [], active: 0 };

      const presetLabel = (preset) => {
        if (!preset || !preset.label) return "";
        return preset.label[store.state.lang === "zh-cn" ? "cn" : "tw"] || preset.label.tw || "";
      };

      const setTrigger = (id, text) => {
        const node = $(id);
        if (!node) return;
        const name = node.querySelector(".ft-name");
        if (name) name.textContent = text;
      };

      const fontItems = (target) => {
        const items = [];
        if (target.indexOf("type:") === 0) {
          items.push({ value: "", name: i18n.t("fontFollowReading"), meta: "" });
        } else if (target === "ui") {
          items.push({ value: "system", name: i18n.t("fontSystemDefault"), meta: "" });
        }
        const presets = target === "ui" ? settings.presets.ui : settings.presets.reading;
        presets.forEach((preset) => {
          if (preset.id === "custom") return;
          if (target === "ui" && preset.id === "system") return;
          items.push({ value: preset.id, name: presetLabel(preset), meta: i18n.t("fontPresetMeta") });
        });
        items.push({ value: "__custom__", name: i18n.t("fontCustomItem"), meta: "" });
        settings.families().forEach((family) => {
          items.push({ value: family, name: family, meta: i18n.t("fontSystemMeta"), family });
        });
        return items;
      };

      const renderPickerList = (filter) => {
        const list = $("fontPickerList");
        if (!list) return;
        const query = (filter || "").trim().toLowerCase();
        const items = pickerState.items.filter((item) => (
          !query || item.name.toLowerCase().indexOf(query) >= 0
        ));
        pickerState.visible = items;
        if (pickerState.active >= items.length) pickerState.active = 0;
        list.replaceChildren();
        if (!items.length) {
          list.appendChild(ui.el("div", "picker-empty popover-empty", i18n.t("fontNoMatch")));
          return;
        }
        items.forEach((item, index) => {
          const button = ui.el("button", `picker-item row${index === pickerState.active ? " is-active" : ""}`);
          button.type = "button";
          const name = ui.el("span", "pi-name", item.name);
          if (item.family) name.style.fontFamily = `"${item.family.replace(/"/g, "")}"`;
          button.appendChild(name);
          if (item.meta) button.appendChild(ui.el("span", "pi-meta", item.meta));
          button.addEventListener("click", () => pickFontItem(item));
          list.appendChild(button);
        });
      };

      const paintPickerActive = () => {
        const list = $("fontPickerList");
        if (!list) return;
        const rows = list.querySelectorAll(".picker-item");
        rows.forEach((row, index) => row.classList.toggle("is-active", index === pickerState.active));
        const active = rows[pickerState.active];
        if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
      };

      const hidePickerRaw = () => {
        const picker = $("fontPicker");
        if (picker) picker.hidden = true;
        pickerState.target = "";
      };

      const openPicker = (anchor, target) => {
        const picker = $("fontPicker");
        if (!picker || !anchor) return;
        pickerState.target = target;
        pickerState.items = fontItems(target);
        pickerState.active = 0;
        const search = $("fontPickerSearch");
        if (search) search.value = "";
        renderPickerList("");
        settings.ensureFamilies();
        overlay.open("fontPicker", {
          trigger: anchor,
          keep: ["settings"],
          placement: { align: "start", gap: 6, width: 300, fit: true },
        });
        if (search) search.focus();
      };

      const closePicker = () => {
        if (!overlay.close("fontPicker")) hidePickerRaw();
      };

      const pickFontItem = (item) => {
        const target = pickerState.target;
        if (item.value === "__custom__") {
          closePicker();
          if (target.indexOf("type:") === 0) {
            const typeId = target.slice(5);
            const patch = { types: {} };
            patch.types[typeId] = { font: "" };
            settings.set(patch);
            sync();
            const input = $("typeFontCustom");
            if (input) {
              input.hidden = false;
              input.value = "";
              input.focus();
            }
          } else {
            settings.set(target === "reading" ? { reading: "custom" } : { ui: "custom" });
            sync();
            const custom = $(target === "reading" ? "fontReadingCustom" : "fontUiCustom");
            if (custom) custom.focus();
          }
          return;
        }

        if (target.indexOf("type:") === 0) {
          const patch = { types: {} };
          patch.types[target.slice(5)] = { font: item.value };
          settings.set(patch);
        } else if (target === "reading") {
          settings.set({ reading: item.value });
        } else {
          settings.set({ ui: item.value });
        }
        closePicker();
        sync();
        ui.toast(i18n.t("fontPicked", { name: item.name }));
      };

      const syncTheme = () => {
        const mode = settings.get().theme;
        ui.$$("#themeSeg .seg-btn").forEach((button) => {
          const on = button.dataset.theme === mode;
          button.classList.toggle("is-on", on);
          ui.setPressed(button, on);
        });
      };

      const sync = () => {
        const current = settings.get();
        const lang = store.state.lang;
        setTrigger("fontReadingTrigger", settings.describe("reading", lang));
        setTrigger("fontUiTrigger", settings.describe("ui", lang));

        const readingCustom = $("fontReadingCustom");
        if (readingCustom) {
          readingCustom.hidden = current.reading !== "custom";
          readingCustom.value = current.readingCustom || "";
        }
        const uiCustom = $("fontUiCustom");
        if (uiCustom) {
          uiCustom.hidden = current.ui !== "custom";
          uiCustom.value = current.uiCustom || "";
        }

        const scale = $("fontScale");
        if (scale) scale.value = String(current.scale);
        const scaleOut = $("fontScaleOut");
        if (scaleOut) scaleOut.textContent = `${current.scale}%`;
        ui.$$("#scalePresets .chip-btn").forEach((button) => {
          const on = Number(button.dataset.scale) === current.scale;
          button.classList.toggle("is-on", on);
          ui.setPressed(button, on);
        });
        ui.$$("#leadingSeg .seg-btn").forEach((button) => {
          const on = Math.abs(Number(button.dataset.leading) - current.leading) < 0.01;
          button.classList.toggle("is-on", on);
          ui.setPressed(button, on);
        });

        const typeId = store.state.settingsType;
        ui.$$("#typeTabs .type-tab").forEach((button) => {
          const on = button.dataset.type === typeId;
          button.classList.toggle("is-on", on);
          button.setAttribute("aria-selected", String(on));
          button.textContent = i18n.typeLabel(button.dataset.type);
        });

        const item = current.types[typeId] || { font: "", scale: 100, weight: 400 };
        setTrigger("typeFontTrigger", settings.describe(`type:${typeId}`, lang));
        const typeScale = $("typeScale");
        if (typeScale) typeScale.value = String(item.scale);
        const typeScaleOut = $("typeScaleOut");
        if (typeScaleOut) typeScaleOut.textContent = `${item.scale}%`;
        ui.$$("#weightSeg .seg-btn").forEach((button) => {
          const on = Number(button.dataset.weight) === Number(item.weight);
          button.classList.toggle("is-on", on);
          ui.setPressed(button, on);
        });

        const isPreset = settings.presets.reading.some((preset) => preset.id === item.font);
        const isCustom = !!item.font && !isPreset;
        const typeCustom = $("typeFontCustom");
        if (typeCustom) {
          typeCustom.hidden = !isCustom;
          if (isCustom) typeCustom.value = item.font;
        }
        syncTheme();
      };

      const initTypeTabs = () => {
        const tabs = $("typeTabs");
        if (!tabs) return;
        const frag = document.createDocumentFragment();
        settings.presets.types.forEach((type) => {
          const button = ui.el("button", "type-tab btn btn-sm");
          button.type = "button";
          button.setAttribute("role", "tab");
          button.dataset.type = type.id;
          button.textContent = i18n.typeLabel(type.id);
          frag.appendChild(button);
        });
        tabs.replaceChildren(frag);
        tabs.addEventListener("click", (event) => {
          const button = event.target.closest(".type-tab");
          if (!button) return;
          store.setSettingsType(button.dataset.type);
          sync();
        });
      };

      const hideRaw = () => {
        const drawer = $("settingsDrawer");
        const scrim = $("settingsScrim");
        if (drawer) drawer.hidden = true;
        if (scrim) scrim.hidden = true;
        const button = $("settingsBtn");
        if (button) button.setAttribute("aria-expanded", "false");
      };

      const open = () => {
        const drawer = $("settingsDrawer");
        const scrim = $("settingsScrim");
        if (!drawer) return;
        sync();
        if (scrim) scrim.hidden = false;
        const button = $("settingsBtn");
        if (button) button.setAttribute("aria-expanded", "true");
        overlay.open("settings", { trigger: button });
        const first = $("fontReadingTrigger");
        if (first) first.focus();
      };

      const close = () => {
        closePicker();
        if (!overlay.close("settings")) hideRaw();
      };

      const bind = () => {
        initTypeTabs();

        ui.$$("#themeSeg .seg-btn").forEach((button) => {
          button.addEventListener("click", () => {
            settings.set({ theme: button.dataset.theme });
            syncTheme();
          });
        });

        const readingTrigger = $("fontReadingTrigger");
        if (readingTrigger) readingTrigger.addEventListener("click", () => openPicker(readingTrigger, "reading"));
        const uiTrigger = $("fontUiTrigger");
        if (uiTrigger) uiTrigger.addEventListener("click", () => openPicker(uiTrigger, "ui"));
        const typeTrigger = $("typeFontTrigger");
        if (typeTrigger) {
          typeTrigger.addEventListener("click", () => openPicker(typeTrigger, `type:${store.state.settingsType}`));
        }

        const readingCustom = $("fontReadingCustom");
        if (readingCustom) {
          readingCustom.addEventListener("input", () => settings.set({ readingCustom: readingCustom.value }));
        }
        const uiCustom = $("fontUiCustom");
        if (uiCustom) {
          uiCustom.addEventListener("input", () => settings.set({ uiCustom: uiCustom.value }));
        }
        const typeCustom = $("typeFontCustom");
        if (typeCustom) {
          typeCustom.addEventListener("input", () => {
            const patch = { types: {} };
            patch.types[store.state.settingsType] = { font: typeCustom.value };
            settings.set(patch);
          });
        }

        const scale = $("fontScale");
        if (scale) {
          scale.addEventListener("input", () => {
            settings.set({ scale: Number(scale.value) });
            sync();
          });
        }
        ui.$$("#scalePresets .chip-btn").forEach((button) => {
          button.addEventListener("click", () => {
            settings.set({ scale: Number(button.dataset.scale) });
            sync();
          });
        });
        ui.$$("#leadingSeg .seg-btn").forEach((button) => {
          button.addEventListener("click", () => {
            settings.set({ leading: Number(button.dataset.leading) });
            sync();
          });
        });

        const typeScale = $("typeScale");
        if (typeScale) {
          typeScale.addEventListener("input", () => {
            const patch = { types: {} };
            patch.types[store.state.settingsType] = { scale: Number(typeScale.value) };
            settings.set(patch);
            sync();
          });
        }
        ui.$$("#weightSeg .seg-btn").forEach((button) => {
          button.addEventListener("click", () => {
            const patch = { types: {} };
            patch.types[store.state.settingsType] = { weight: Number(button.dataset.weight) };
            settings.set(patch);
            sync();
          });
        });

        const pickerSearch = $("fontPickerSearch");
        if (pickerSearch) {
          pickerSearch.addEventListener("input", () => renderPickerList(pickerSearch.value));
          pickerSearch.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              closePicker();
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
                pickerState.active = (pickerState.active - 1 + pickerState.visible.length)
                  % pickerState.visible.length;
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

        const reset = $("settingsReset");
        if (reset) {
          reset.addEventListener("click", () => {
            settings.reset();
            sync();
            ui.toast(i18n.t("toastReset"));
          });
        }

        const done = $("settingsDone");
        if (done) done.addEventListener("click", close);
        const closeButton = $("settingsClose");
        if (closeButton) closeButton.addEventListener("click", close);
        const scrim = $("settingsScrim");
        if (scrim) scrim.addEventListener("click", close);
        const button = $("settingsBtn");
        if (button) button.addEventListener("click", open);

        document.addEventListener("sr:prefs", () => {
          if (!document.getElementById("settingsDrawer")) return;
          sync();
        });
        settings.onFamilies(() => {
          const picker = $("fontPicker");
          if (!picker || picker.hidden || !pickerState.target) return;
          pickerState.items = fontItems(pickerState.target);
          pickerState.active = 0;
          renderPickerList($("fontPickerSearch") ? $("fontPickerSearch").value : "");
          paintPickerActive();
        });

        overlay.register("settings", {
          id: "settingsDrawer",
          triggerId: "settingsBtn",
          group: "sheet",
          onHide: hideRaw,
        });
        overlay.register("fontPicker", {
          id: "fontPicker",
          group: "menu",
          keep: ["settings"],
          onHide: hidePickerRaw,
          placement: { align: "start", gap: 6, width: 300, fit: true },
        });
      };

      return {
        bind,
        close,
        closePicker,
        fontItems,
        open,
        openPicker,
        sync,
        syncTheme,
      };
    });
})();
