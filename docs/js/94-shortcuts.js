(() => {
  "use strict";

  const SR = window.SR;

  const HELP_GROUPS = [
    {
      title: "helpGroupNav",
      rows: [
        ["/", "hkSearch"],
        ["← / →", "hkHistory"],
      ],
    },
    {
      title: "helpGroupRead",
      rows: [
        ["B", "hkBookmark"],
        ["?", "hkHelp"],
        ["Esc", "hkEsc"],
        ["Tab", "hkTab"],
      ],
    },
    {
      title: "helpGroupFilter",
      rows: [
        ["speaker:…", "hkFilterExpr"],
        ["Ctrl+Enter", "hkFilterApply"],
      ],
    },
  ];

  SR.define("shortcuts",
    ["store", "i18n", "overlay", "ui"],
    ({ store, i18n, overlay, ui }) => {
      const $ = ui.$;
      let openFlag = false;

      const renderHelp = () => {
        const body = $("helpBody");
        if (!body) return;
        body.replaceChildren();
        HELP_GROUPS.forEach((group) => {
          const section = ui.el("section", "help-group");
          section.appendChild(ui.el("h3", "help-group-title", i18n.t(group.title)));
          const list = ui.el("dl", "help-list");
          group.rows.forEach((row) => {
            list.appendChild(ui.el("dt", "help-key", row[0]));
            list.appendChild(ui.el("dd", "help-desc", i18n.t(row[1])));
          });
          section.appendChild(list);
          body.appendChild(section);
        });
      };

      const hideRaw = () => {
        const panel = $("helpPanel");
        if (panel) panel.hidden = true;
        openFlag = false;
        const button = $("helpBtn");
        if (button) button.setAttribute("aria-expanded", "false");
      };

      const open = () => {
        const panel = $("helpPanel");
        if (!panel || openFlag) return;
        renderHelp();
        openFlag = true;
        const button = $("helpBtn");
        if (button) button.setAttribute("aria-expanded", "true");
        overlay.open("help", { trigger: button, autofocus: "helpClose" });
      };

      const close = () => {
        if (!overlay.close("help")) hideRaw();
      };

      const toggle = () => {
        if (openFlag) close();
        else open();
      };

      const typingInField = () => {
        const active = document.activeElement;
        if (!active) return false;
        const tag = (active.tagName || "").toLowerCase();
        return tag === "input" || tag === "textarea" || active.isContentEditable;
      };

      const toggleBookmark = () => {
        const node = store.selected();
        if (!node) return;
        const on = store.toggleBookmark(node.id);
        ui.toast(i18n.t(on ? "bookmarkAdded" : "bookmarkRemoved"));
      };

      const onKeyDown = (event) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "?" && !typingInField()) {
          event.preventDefault();
          toggle();
          return;
        }
        if (typingInField()) return;

        if (event.key === "/") {
          event.preventDefault();
          const input = $("search");
          if (input) input.focus();
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          store.back();
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          store.forward();
          return;
        }
        if (String(event.key || "").toLowerCase() === "b") {
          event.preventDefault();
          toggleBookmark();
        }
      };

      const init = () => {
        const help = $("helpBtn");
        if (help) help.addEventListener("click", toggle);
        const closeButton = $("helpClose");
        if (closeButton) closeButton.addEventListener("click", close);
        document.addEventListener("keydown", onKeyDown);
        overlay.register("help", {
          id: "helpPanel",
          triggerId: "helpBtn",
          group: "modal",
          onHide: hideRaw,
          autofocus: "helpClose",
        });
      };

      return {
        close,
        init,
        isOpen: () => openFlag,
        open,
        toggle,
      };
    });
})();
