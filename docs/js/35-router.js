(() => {
  "use strict";
  const SR = window.SR;
  const parse = () => {
    const match = location.hash.match(/^#\/story\/([A-Za-z0-9_]+)$/);
    return match ? match[1] : null;
  };
  const sync = () => {
    const id = parse();
    if (id && !SR.data.node(id)) {
      SR.store.actions.invalidRoute(`${SR.i18n.t("unknown")}: ${id}`);
      return;
    }
    SR.store.actions.select(id);
  };
  const go = (id, replace = false) => {
    if (!SR.data.node(id)) return;
    const hash = `#/story/${id}`;
    if (location.hash === hash) {
      sync();
      return;
    }
    if (replace) history.replaceState({ story: id }, "", hash);
    else location.hash = hash;
    if (replace) sync();
  };
  const home = () => {
    history.pushState(null, "", `${location.pathname}${location.search}`);
    SR.store.actions.select(null);
  };
  const start = () => {
    window.addEventListener("hashchange", sync);
    sync();
  };
  SR.register("router", { parse, go, home, sync, start });
})();
