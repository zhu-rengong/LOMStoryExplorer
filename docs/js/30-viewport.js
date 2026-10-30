(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const closeMore = SR.fwd("actions", "closeMore");
  const closeNav = SR.fwd("actions", "closeNav");
  const hideBranchPreview = SR.fwd("panels", "hideBranchPreview");
  const nodeById = SR.data.nodeById;
  const overlay = SR.overlay;
  const railScrim = SR.core.railScrim;
  const readHash = SR.fwd("actions", "readHash");
  const select = SR.fwd("actions", "select");
  const state = SR.core.state;

  const BREAKS = [[1440, "wide"], [1200, "mid"], [1024, "narrow"], [768, "compact"]];

  const layoutFor = (width) => {
    for (const [min, name] of BREAKS) {
      if (width >= min) return name;
    }
    return "mobile";
  };

  const isOverlayRail = () => state.layout === "compact" || state.layout === "mobile";

  const isMobile = () => state.layout === "mobile";

  const hideRail = () => {
    document.body.classList.remove("rail-open");
    if (railScrim) railScrim.hidden = true;
    const btn = $("railToggle");
    if (btn) {
      btn.classList.remove("is-on");
      btn.setAttribute("aria-expanded", "false");
    }
  };

  const closeRail = () => {
    if (!overlay.close("rail")) hideRail();
  };

  const openRail = () => {
    if (!isOverlayRail()) return;
    document.body.classList.add("rail-open");
    if (railScrim) railScrim.hidden = false;
    const btn = $("railToggle");
    if (btn) {
      btn.classList.add("is-on");
      btn.setAttribute("aria-expanded", "true");
    }
    overlay.open("rail", { trigger: btn });
  };

  const toggleRail = () => {
    if (document.body.classList.contains("rail-open")) closeRail();
    else openRail();
  };

  const applyLayout = (force) => {
    const next = layoutFor(window.innerWidth);
    if (!force && next === state.layout && document.body.dataset.layout) return;
    state.layout = next;
    document.body.dataset.layout = next;

    if (!isOverlayRail()) closeRail();
    closeMore();
  };

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyLayout(false);
      hideBranchPreview();
      closeNav();
    }, 80);
  });

  window.addEventListener("hashchange", () => {
    const id = readHash();
    if (!id) return;
    if (state.selected && state.selected.id === id) return;
    const node = nodeById.get(id);
    if (node) select(node, { history: false, animate: true });
  });

  overlay.register("rail", {
    id: "chapterRail",
    triggerId: "railToggle",
    group: "sheet",
    hide: hideRail,
  });

  SR.register("viewport", {
    BREAKS: BREAKS,
    applyLayout: applyLayout,
    closeRail: closeRail,
    isMobile: isMobile,
    isOverlayRail: isOverlayRail,
    layoutFor: layoutFor,
    openRail: openRail,
    toggleRail: toggleRail,
  });
})();
