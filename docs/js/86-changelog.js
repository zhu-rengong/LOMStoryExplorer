(() => {
  "use strict";

  const SR = window.SR;

  const ENTRIES = [
    { date: "2026-11-02", from: "22c2c0f", to: "d40ecee", key: "changelogEntry1" },
  ];

  SR.define("changelog", ["i18n", "overlay", "ui"],
    ({ i18n, overlay, ui }) => {
      const $ = ui.$;

      let openFlag = false;
      let lastFocus = null;

      const entryBlock = (entry) => {
        const article = ui.el("article", "changelog-entry");
        const meta = ui.el("div", "changelog-meta");
        meta.appendChild(ui.el("span", "changelog-date", entry.date));
        meta.appendChild(ui.el("span", "changelog-range", `${entry.from} → ${entry.to}`));
        meta.appendChild(ui.el("span", "changelog-badge", i18n.t("changelogLatest")));
        article.appendChild(meta);
        article.appendChild(ui.el("p", "changelog-text", i18n.t(entry.key)));
        return article;
      };

      const render = () => {
        const body = $("changelogBody");
        if (!body) return;
        body.replaceChildren();
        ENTRIES.forEach((entry) => body.appendChild(entryBlock(entry)));
      };

      const hideRaw = () => {
        const panel = $("changelogPanel");
        if (panel) {
          panel.hidden = true;
          panel.setAttribute("aria-hidden", "true");
        }
        openFlag = false;
        const button = $("changelogBtn");
        if (button) {
          ui.setOn(button, false);
          ui.setExpanded(button, false);
        }
      };

      const open = (trigger) => {
        const panel = $("changelogPanel");
        if (!panel || openFlag) return;
        const button = $("changelogBtn");
        lastFocus = trigger || button;
        render();
        openFlag = true;
        panel.setAttribute("aria-hidden", "false");
        if (button) ui.setOn(button, true);
        overlay.open("changelog", { trigger: lastFocus, autofocus: "changelogClose" });
      };

      const close = () => {
        overlay.close("changelog");
        if (lastFocus && lastFocus.isConnected) {
          try {
            lastFocus.focus({ preventScroll: true });
          } catch {
            lastFocus = null;
          }
        }
      };

      const toggle = () => {
        if (openFlag) close();
        else open($("changelogBtn"));
      };

      const refresh = () => {
        if (openFlag) render();
      };

      const init = () => {
        const button = $("changelogBtn");
        if (button) button.addEventListener("click", toggle);
        const closeButton = $("changelogClose");
        if (closeButton) closeButton.addEventListener("click", close);
        overlay.register("changelog", {
          id: "changelogPanel",
          triggerId: "changelogBtn",
          group: "modal",
          onHide: hideRaw,
          autofocus: "changelogClose",
        });
      };

      return {
        init,
        open,
        refresh,
        toggle,
      };
    });
})();
