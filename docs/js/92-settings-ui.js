(() => {
  "use strict";

  const SR = window.SR;

  SR.define("settingsUi", ["store", "i18n", "settings", "overlay", "ui"],
    ({ store, i18n, settings, overlay, ui }) => {
      const $ = ui.$;

      const pickerState = { target: "", items: [], visible: [], active: 0 };

      let activeGroup = "prose";

      const lang = () => store.state.lang;

      const presetLabel = (preset) => {
        if (!preset || !preset.label) return "";
        return settings.pickLabel(preset.label, lang());
      };

      const setTrigger = (id, text) => {
        const node = $(id);
        if (!node) return;
        const name = node.querySelector(".ft-name");
        if (name) name.textContent = text;
      };

      const typesOfGroup = (groupId) => settings.presets.types.filter((type) => type.group === groupId);

      const firstTypeOf = (groupId) => {
        const list = typesOfGroup(groupId);
        return list.length ? list[0].id : "dialog";
      };

      const fontItems = (target) => {
        const items = [];
        if (target.indexOf("type:") === 0) {
          items.push({ value: "", name: i18n.t("fontFollowReading"), meta: "" });
          items.push({ value: "@ui", name: i18n.t("fontFollowUi"), meta: "" });
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

      const specimenOf = (typeId) => {
        const wrap = (className, text) => ui.el("div", className, text);
        switch (typeId) {
          case "dialog": {
            const say = wrap("say");
            say.appendChild(ui.el("div", "what", i18n.t("previewText")));
            return say;
          }
          case "speaker": {
            const say = wrap("say");
            say.appendChild(ui.el("span", "who is-link", i18n.t("previewWho")));
            return say;
          }
          case "narration": {
            const say = ui.el("div", "say narration");
            say.appendChild(ui.el("div", "what", i18n.t("previewNarration")));
            return say;
          }
          case "think": {
            const say = ui.el("div", "say think");
            say.appendChild(ui.el("div", "what", i18n.t("previewThink")));
            return say;
          }
          case "lore": {
            const box = ui.el("div", "lore");
            const body = ui.el("div", "lore-text");
            body.appendChild(ui.el("p", "lore-p", i18n.t("previewLore")));
            box.appendChild(body);
            return box;
          }
          case "snippet": {
            const row = ui.el("div", "drop-item");
            row.appendChild(ui.el("span", "dtext", i18n.t("previewSnippet")));
            return row;
          }
          case "option": {
            const head = ui.el("div", "option-head row");
            head.appendChild(ui.el("span", "option-idx", i18n.t("previewIndex")));
            const main = ui.el("span", "option-main");
            main.appendChild(ui.el("span", "option-text", i18n.t("previewOption")));
            head.appendChild(main);
            return head;
          }
          case "index": {
            const head = ui.el("div", "option-head row");
            head.appendChild(ui.el("span", "option-idx", i18n.t("previewIndex")));
            return head;
          }
          case "option-cond":
            return ui.el("span", "option-cond", i18n.t("previewOptionCond"));
          case "branch-cond": {
            const branch = ui.el("div", "branch");
            const head = ui.el("div", "branch-head row");
            head.appendChild(ui.el("span", "cond", i18n.t("previewBranchCond")));
            branch.appendChild(head);
            return branch;
          }
          case "label": {
            const row = ui.el("div", "scene-switch");
            row.appendChild(ui.el("span", "scene-label", i18n.t("sceneSwitch")));
            row.appendChild(ui.el("span", "scene-name", i18n.t("previewLabel")));
            return row;
          }
          case "badge":
            return ui.el("span", "badge", i18n.t("previewBadge"));
          case "crumb": {
            const crumb = ui.el("p", "crumb");
            crumb.appendChild(document.createTextNode(i18n.t("previewCrumb")));
            crumb.appendChild(ui.el("span", "crumb-time", i18n.t("previewMeta")));
            return crumb;
          }
          case "meta": {
            const row = ui.el("div", "drop-item");
            row.appendChild(ui.el("span", "dmeta", i18n.t("previewMeta")));
            return row;
          }
          case "title":
            return ui.el("h2", "node-title", i18n.t("previewNode"));
          case "heading":
            return ui.el("h2", "panel-title", i18n.t("previewHeading"));
          case "ui": {
            const button = ui.el("button", "btn", i18n.t("previewUi"));
            button.type = "button";
            return button;
          }
          case "caption":
            return ui.el("p", "sub-label", i18n.t("previewCaption"));
          case "id": {
            const row = ui.el("div", "drop-item");
            row.appendChild(ui.el("span", "did", i18n.t("previewId")));
            return row;
          }
          case "status":
            return ui.el("p", "stats-loading", i18n.t("previewStatus"));
          case "loading":
            return ui.el("span", "sk-caption", i18n.t("previewLoading"));
          case "empty":
            return ui.el("p", "drop-empty", i18n.t("previewEmpty"));
          default:
            return ui.el("p", "drop-empty", i18n.t("previewText"));
        }
      };

      const renderPreview = (type) => {
        const box = $("settingsPreview");
        if (!box) return;
        box.replaceChildren();
        const head = ui.el("div", "preview-head");
        head.appendChild(ui.el("span", "preview-tag", i18n.typeLabel(type.id)));
        box.appendChild(head);
        const specimen = ui.el("div", "preview-specimen");
        specimen.dataset.type = type.id;
        specimen.appendChild(specimenOf(type.id));
        box.appendChild(specimen);
      };

      const renderGroups = () => {
        const box = $("typeGroups");
        if (!box) return;
        box.replaceChildren();
        settings.presets.groups.forEach((group) => {
          const button = ui.el("button", `type-group${group.id === activeGroup ? " is-on" : ""}`,
            settings.pickLabel(group.label, lang()));
          button.type = "button";
          button.dataset.group = group.id;
          button.setAttribute("aria-pressed", String(group.id === activeGroup));
          button.addEventListener("click", () => {
            activeGroup = group.id;
            store.setSettingsType(firstTypeOf(group.id));
            sync();
          });
          box.appendChild(button);
        });
      };

      const renderChips = () => {
        const box = $("typeChips");
        if (!box) return;
        box.replaceChildren();
        const typeId = store.state.settingsType;
        typesOfGroup(activeGroup).forEach((type) => {
          const button = ui.el("button", `type-tab btn btn-sm${type.id === typeId ? " is-on" : ""}`,
            i18n.typeLabel(type.id));
          button.type = "button";
          button.dataset.type = type.id;
          button.setAttribute("aria-pressed", String(type.id === typeId));
          button.addEventListener("click", () => {
            store.setSettingsType(type.id);
            sync();
          });
          box.appendChild(button);
        });
      };

      const sync = () => {
        const current = settings.get();
        setTrigger("fontReadingTrigger", settings.describe("reading", lang()));
        setTrigger("fontUiTrigger", settings.describe("ui", lang()));

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
        const leading = $("leading");
        if (leading) leading.value = String(current.leading);
        const leadingOut = $("leadingOut");
        if (leadingOut) leadingOut.textContent = Number(current.leading).toFixed(2);

        const type = settings.typeById(store.state.settingsType) || settings.presets.types[0];
        activeGroup = type.group;
        renderGroups();
        renderChips();
        renderPreview(type);

        const item = current.types[type.id] || { font: "", scale: 100, weight: 400, leading: 100 };
        setTrigger("typeFontTrigger", settings.describe(`type:${type.id}`, lang()));
        const typeScale = $("typeScale");
        if (typeScale) typeScale.value = String(item.scale);
        const typeScaleOut = $("typeScaleOut");
        if (typeScaleOut) typeScaleOut.textContent = `${item.scale}%`;
        const typeLeading = $("typeLeading");
        if (typeLeading) typeLeading.value = String(item.leading);
        const typeLeadingOut = $("typeLeadingOut");
        if (typeLeadingOut) typeLeadingOut.textContent = `${item.leading}%`;
        ui.$$("#weightSeg .seg-btn").forEach((button) => {
          const on = Number(button.dataset.weight) === Number(item.weight);
          button.classList.toggle("is-on", on);
          ui.setPressed(button, on);
        });

        const isPreset = settings.presets.reading.some((preset) => preset.id === item.font);
        const isFollow = !item.font || item.font === "@ui";
        const isCustom = !!item.font && !isFollow && !isPreset;
        const typeCustom = $("typeFontCustom");
        if (typeCustom) {
          typeCustom.hidden = !isCustom;
          if (isCustom) typeCustom.value = item.font;
        }
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
        const leading = $("leading");
        if (leading) {
          leading.addEventListener("input", () => {
            settings.set({ leading: Number(leading.value) });
            sync();
          });
        }

        const typeScale = $("typeScale");
        if (typeScale) {
          typeScale.addEventListener("input", () => {
            const patch = { types: {} };
            patch.types[store.state.settingsType] = { scale: Number(typeScale.value) };
            settings.set(patch);
            sync();
          });
        }
        const typeLeading = $("typeLeading");
        if (typeLeading) {
          typeLeading.addEventListener("input", () => {
            const patch = { types: {} };
            patch.types[store.state.settingsType] = { leading: Number(typeLeading.value) };
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
      };
    });
})();
