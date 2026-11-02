(() => {
  "use strict";

  const SR = window.SR;

  SR.define("settingsUi", ["store", "i18n", "settings", "condexpr", "overlay", "ui"],
    ({ store, i18n, settings, condexpr, overlay, ui }) => {
      const $ = ui.$;

      const pickerState = { target: "", items: [], visible: [], active: 0 };

      const label = (value) => i18n.t(value);

      const parseTarget = () => {
        const value = String(store.state.settingsTarget || "");
        if (value.indexOf("group:") === 0) return { scope: "group", id: value.slice(6) };
        const type = settings.typeById(value.indexOf("type:") === 0 ? value.slice(5) : value);
        if (!type) return { scope: "type", id: settings.presets.types[0].id };
        return { scope: "type", id: type.id };
      };

      const groupOfTarget = (target) => {
        if (target.scope === "group") return settings.groupById(target.id);
        const type = settings.typeById(target.id);
        return type ? settings.groupById(type.group) : settings.presets.groups[0];
      };

      const scopeLabel = (target) => {
        const group = groupOfTarget(target);
        const name = group ? label(group.label) : "";
        const leaf = target.scope === "group" ? label(settings.labels.groupAll) : i18n.typeLabel(target.id);
        return name ? `${name} · ${leaf}` : leaf;
      };

      const setTrigger = (text) => {
        const node = $("typeFontTrigger");
        if (!node) return;
        const name = node.querySelector(".ft-name");
        if (name) name.textContent = text;
      };

      const fontItems = (target) => {
        const items = [];
        if (target.scope === "group") {
          items.push({ value: "@base", name: label(settings.labels.followBase), meta: "" });
        } else {
          items.push({ value: "@group", name: label(settings.labels.followGroup), meta: "" });
        }
        settings.presets.fonts.forEach((font) => {
          items.push({ value: font.id, name: label(font.label), meta: i18n.t("fontPresetMeta") });
        });
        items.push({ value: "__custom__", name: label(settings.labels.customFont), meta: "" });
        settings.families().forEach((family) => {
          items.push({ value: family, name: family, meta: i18n.t("fontSystemMeta"), family });
        });
        return items;
      };

      const renderPickerList = (filter) => {
        const list = $("fontPickerList");
        if (!list) return;
        const query = ui.normalizeQuery(filter);
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
        rows.forEach((row, index) => ui.setOn(row, index === pickerState.active, "is-active"));
        const active = rows[pickerState.active];
        if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
      };

      const hidePickerRaw = () => {
        const picker = $("fontPicker");
        if (picker) picker.hidden = true;
        pickerState.target = "";
      };

      const openPicker = (anchor) => {
        const picker = $("fontPicker");
        if (!picker || !anchor) return;
        const target = parseTarget();
        pickerState.target = store.state.settingsTarget;
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

      const closePicker = () => overlay.close("fontPicker");

      const patchEntry = (patch) => {
        const target = parseTarget();
        if (target.scope === "group") {
          const groups = {};
          groups[target.id] = patch;
          settings.set({ groups: groups });
        } else {
          const types = {};
          types[target.id] = patch;
          settings.set({ types: types });
        }
      };

      const pickFontItem = (item) => {
        if (item.value === "__custom__") {
          closePicker();
          patchEntry({ font: "" });
          sync();
          const input = $("typeFontCustom");
          if (input) {
            input.hidden = false;
            input.value = "";
            input.focus();
          }
          return;
        }
        patchEntry({ font: item.value });
        closePicker();
        sync();
        ui.toast(i18n.t("fontPicked", { name: item.name }));
      };

      const specimenOf = (typeId) => {
        switch (typeId) {
          case "dialog": {
            const say = ui.el("div", "say");
            say.appendChild(ui.el("div", "what", i18n.t("previewText")));
            return say;
          }
          case "speaker": {
            const say = ui.el("div", "say");
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
            return ui.el("span", "option-cond", i18n.t("oCond", { op: "≥", value: "30" }));
          case "branch-cond": {
            const branch = ui.el("div", "branch");
            const head = ui.el("div", "branch-head row");
            const expr = {
              tag: "compare",
              op: "=",
              left: { tag: "check", kind: "switch", key: "Ch_1_1_001" },
              right: { tag: "const", value: "1" },
            };
            const cond = ui.el("span", "cond");
            cond.appendChild(condexpr.render(expr, {}));
            cond.title = condexpr.label(expr);
            head.appendChild(cond);
            branch.appendChild(head);
            return branch;
          }
          case "label": {
            const row = ui.el("div", "scene-switch");
            row.appendChild(ui.el("span", "scene-label", i18n.t("sceneSwitch")));
            row.appendChild(ui.el("span", "scene-name", i18n.t("previewLabel")));
            return row;
          }
          case "jump": {
            const button = ui.el("button", "jump btn btn-sm");
            button.type = "button";
            button.appendChild(ui.svg("i-arrow-right", "arrow"));
            button.appendChild(document.createTextNode(i18n.t("previewJump")));
            return button;
          }
          case "badge":
            return ui.el("span", "badge", i18n.t("previewBadge"));
          case "title":
            return ui.el("h2", "node-title", i18n.t("previewNode"));
          case "panel":
            return ui.el("h2", "panel-title", i18n.t("previewHeading"));
          case "lookup":
            return ui.el("span", "panel-title lookup-title", i18n.t("lookupSpeaker"));
          case "brand": {
            const box = ui.el("div", "brand-text");
            box.appendChild(ui.el("h1", null, i18n.t("appTitle")));
            return box;
          }
          case "seal":
            return ui.el("span", "seal", i18n.t("previewSeal"));
          case "rail":
            return ui.el("h2", "rail-title", i18n.t("railTitle"));
          case "stat": {
            const card = ui.el("div", "stat-card");
            card.appendChild(ui.el("span", "stat-value", i18n.t("previewStat")));
            return card;
          }
          case "empty-title": {
            const box = ui.el("div", "empty-state");
            box.appendChild(ui.el("h3", null, i18n.t("noBeatsTitle")));
            return box;
          }
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
          case "ui":
            return ui.el("p", "help-desc", i18n.t("previewText"));
          case "ui-compact": {
            const button = ui.el("button", "btn", i18n.t("previewUi"));
            button.type = "button";
            return button;
          }
          case "ui-micro":
            return ui.el("p", "menu-note", i18n.t("previewMicro"));
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

      const appendSpecimen = (box, typeId) => {
        const head = ui.el("div", "preview-head");
        head.appendChild(ui.el("span", "preview-tag", i18n.typeLabel(typeId)));
        box.appendChild(head);
        const specimen = ui.el("div", "preview-specimen");
        specimen.appendChild(specimenOf(typeId));
        box.appendChild(specimen);
      };

      const renderPreview = (target) => {
        const box = $("settingsPreview");
        if (!box) return;
        box.replaceChildren();
        if (target.scope === "type") {
          appendSpecimen(box, target.id);
          return;
        }
        const types = settings.presets.types
          .filter((type) => type.group === target.id)
          .slice(0, 3);
        types.forEach((type) => appendSpecimen(box, type.id));
      };

      const renderGroups = (target) => {
        const box = $("typeGroups");
        if (!box) return;
        const group = groupOfTarget(target);
        box.replaceChildren();
        settings.presets.groups.forEach((item) => {
          const on = !!group && item.id === group.id;
          const button = ui.el("button", `type-group${on ? " is-on" : ""}`, label(item.label));
          button.type = "button";
          button.setAttribute("aria-pressed", String(on));
          button.addEventListener("click", () => {
            store.setSettingsTarget(`group:${item.id}`);
            sync();
          });
          box.appendChild(button);
        });
      };

      const renderChips = (target) => {
        const box = $("typeChips");
        if (!box) return;
        const group = groupOfTarget(target);
        box.replaceChildren();
        if (!group) return;
        const all = ui.el("button",
          `type-tab btn btn-sm${target.scope === "group" ? " is-on" : ""}`,
          label(settings.labels.groupAll));
        all.type = "button";
        all.setAttribute("aria-pressed", String(target.scope === "group"));
        all.addEventListener("click", () => {
          store.setSettingsTarget(`group:${group.id}`);
          sync();
        });
        box.appendChild(all);
        settings.presets.types.filter((type) => type.group === group.id).forEach((type) => {
          const on = target.scope === "type" && target.id === type.id;
          const button = ui.el("button", `type-tab btn btn-sm${on ? " is-on" : ""}`, i18n.typeLabel(type.id));
          button.type = "button";
          button.setAttribute("aria-pressed", String(on));
          button.addEventListener("click", () => {
            store.setSettingsTarget(`type:${type.id}`);
            sync();
          });
          box.appendChild(button);
        });
      };

      const sync = () => {
        const current = settings.get();
        const target = parseTarget();
        const group = groupOfTarget(target);
        const entry = target.scope === "group"
          ? current.groups[target.id]
          : current.types[target.id];
        if (!entry) return;
        const computed = settings.computed(target.scope, target.id);
        const type = target.scope === "type" ? settings.typeById(target.id) : null;

        const note = $("typeScopeNote");
        if (note) note.textContent = scopeLabel(target);

        renderGroups(target);
        renderChips(target);
        setTrigger(i18n.t(settings.describe(store.state.settingsTarget)));

        const scale = $("typeScale");
        if (scale) scale.value = String(entry.scale);
        const scaleOut = $("typeScaleOut");
        if (scaleOut) scaleOut.textContent = `${entry.scale}% · ${computed.px.toFixed(2)}px`;

        const leadingRow = $("typeLeadingRow");
        const leadingInput = $("typeLeading");
        const leading = $("typeLeadingOut");
        const noLeading = !!type && !!type.noLeading;
        if (leadingRow) leadingRow.hidden = noLeading;
        if (leadingInput) {
          leadingInput.hidden = noLeading;
          leadingInput.value = String(entry.leading);
        }
        if (leading) leading.textContent = `${entry.leading}% · ${computed.lineHeight.toFixed(2)}`;

        ui.$$("#weightSeg .seg-btn").forEach((button) => {
          const inherit = button.dataset.inherit === "true";
          const on = inherit
            ? !!type && entry.weight === null
            : entry.weight !== null && Number(button.dataset.weight) === Number(entry.weight);
          button.hidden = inherit && !type;
          ui.setOn(button, on);
          ui.setPressed(button, on);
        });

        const followValues = ["", "@base", "@group"];
        const isPreset = settings.presets.fonts.some((font) => font.id === entry.font);
        const isCustom = !!entry.font && followValues.indexOf(entry.font) < 0 && !isPreset;
        const typeCustom = $("typeFontCustom");
        if (typeCustom) {
          typeCustom.hidden = !isCustom;
          if (isCustom) typeCustom.value = entry.font;
        }

        renderPreview(target);
      };

      const hideRaw = () => {
        const drawer = $("settingsDrawer");
        const scrim = $("settingsScrim");
        if (drawer) drawer.hidden = true;
        if (scrim) scrim.hidden = true;
        ui.setExpanded($("settingsBtn"), false);
      };

      const open = () => {
        const drawer = $("settingsDrawer");
        const scrim = $("settingsScrim");
        if (!drawer) return;
        sync();
        if (scrim) scrim.hidden = false;
        const button = $("settingsBtn");
        ui.setExpanded(button, true);
        overlay.open("settings", { trigger: button });
        const first = $("typeFontTrigger");
        if (first) first.focus();
      };

      const close = () => {
        closePicker();
        overlay.close("settings");
      };

      const bind = () => {
        const trigger = $("typeFontTrigger");
        if (trigger) trigger.addEventListener("click", () => openPicker(trigger));

        const typeCustom = $("typeFontCustom");
        if (typeCustom) {
          typeCustom.addEventListener("input", () => {
            patchEntry({ font: typeCustom.value });
            sync();
          });
        }

        const scale = $("typeScale");
        if (scale) {
          scale.addEventListener("input", () => {
            patchEntry({ scale: Number(scale.value) });
            sync();
          });
        }
        const leading = $("typeLeading");
        if (leading) {
          leading.addEventListener("input", () => {
            patchEntry({ leading: Number(leading.value) });
            sync();
          });
        }
        ui.$$("#weightSeg .seg-btn").forEach((button) => {
          button.addEventListener("click", () => {
            patchEntry({ weight: button.dataset.inherit === "true" ? null : Number(button.dataset.weight) });
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

        settings.onChange(() => sync());
        settings.onFamilies(() => {
          const picker = $("fontPicker");
          if (!picker || picker.hidden || !pickerState.target) return;
          pickerState.items = fontItems(parseTarget());
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
        sync,
      };
    });
})();
