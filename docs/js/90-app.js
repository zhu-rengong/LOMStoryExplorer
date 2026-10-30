(() => {
  "use strict";
  const SR = window.SR;
  const state = SR.store.state;
  const render = (_, reason) => {
    if (["ready", "view", "bookmark", "recents", "chapters", "select", "language"].includes(reason)) SR.library.render();
    if (reason === "search" || reason === "language") SR.library.renderSearch();
    if (["select", "story", "routeError", "language", "ready"].includes(reason)) SR.reader.render();
    if (reason === "bookmark" || reason === "select") SR.reader.updateBookmark();
    if (["select", "story", "routeError", "context", "ready"].includes(reason)) SR.navigation.render();
    if (["settings", "language", "ready"].includes(reason)) SR.settings.apply();
    if (["overlay", "mobile", "view", "ready"].includes(reason)) SR.overlays.sync();
    if (reason === "select" || reason === "language") SR.reader.load();
  };
  const start = () => {
    SR.store.actions.hydrate(SR.storage.load());
    try {
      SR.data.init();
      SR.store.actions.ready(SR.data.catalog.defaultLang, SR.data.catalog.languages);
      if (!state.expanded.length && SR.data.chapters.length) state.expanded.push(SR.data.chapters[0].id);
      SR.library.init();
      SR.reader.init();
      SR.navigation.init();
      SR.settings.init();
      SR.overlays.init();
      SR.store.subscribe(render);
      SR.i18n.apply();
      SR.settings.apply();
      SR.library.render();
      SR.reader.render();
      SR.navigation.render();
      SR.overlays.sync();
      SR.router.start();
    } catch (error) {
      SR.store.actions.fail(error.message);
      const fatal = SR.core.dom.byId("fatalError");
      fatal.hidden = false;
      fatal.querySelector("[data-error-message]").textContent = error.message;
    }
  };
  SR.register("app", { start });
  document.addEventListener("DOMContentLoaded", start, { once: true });
})();
