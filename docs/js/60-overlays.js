(() => {
  "use strict";
  const SR = window.SR;
  const { dom } = SR.core;
  const state = SR.store.state;
  let toastTimer = 0;
  let returnFocus = null;
  const toast = (message) => {
    const node = dom.byId("toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 2400);
  };
  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const input = dom.h("textarea", { class: "clipboard-fallback", text });
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  };
  const sync = () => {
    const dialog = dom.byId("settingsDialog");
    if (state.overlay === "settings" && !dialog.open) {
      returnFocus = document.activeElement;
      dialog.showModal();
    } else if (state.overlay !== "settings" && dialog.open) {
      dialog.close();
      returnFocus?.focus();
    }
    document.body.dataset.mobileView = state.mobileView;
    for (const button of dom.all("[data-mobile]")) button.classList.toggle("is-active", button.dataset.mobile === state.mobileView);
  };
  const init = () => {
    for (const button of dom.all("[data-open-settings]")) button.addEventListener("click", () => SR.store.actions.overlay("settings"));
    dom.byId("settingsDialog").addEventListener("close", () => {
      if (state.overlay === "settings") SR.store.actions.overlay(null);
    });
    dom.byId("settingsDialog").addEventListener("click", (event) => {
      if (event.target === dom.byId("settingsDialog")) SR.store.actions.overlay(null);
    });
    dom.byId("libraryToggle").addEventListener("click", () => SR.store.actions.mobileView(state.mobileView === "library" ? "read" : "library"));
    dom.byId("libraryClose").addEventListener("click", () => SR.store.actions.mobileView("read"));
    dom.byId("libraryScrim").addEventListener("click", () => SR.store.actions.mobileView("read"));
    for (const button of dom.all("[data-mobile]")) button.addEventListener("click", () => SR.store.actions.mobileView(button.dataset.mobile));
    document.addEventListener("keydown", (event) => {
      const editing = event.target.matches("input, textarea, select, [contenteditable]");
      if (event.key === "/" && !editing) {
        event.preventDefault();
        dom.byId("globalSearch").focus();
      } else if (event.key === "Escape") {
        dom.byId("searchPanel").hidden = true;
        if (state.contextOpen) SR.store.actions.context(false);
        if (state.mobileView === "library") SR.store.actions.mobileView("read");
      }
    });
  };
  SR.register("overlays", { init, sync, toast, copyText });
})();
