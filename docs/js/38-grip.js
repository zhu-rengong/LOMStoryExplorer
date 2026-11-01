(() => {
  "use strict";

  const SR = window.SR;

  SR.define("grip", ["prefs", "store", "ui"], ({ prefs, store, ui }) => {
    const $ = ui.$;
    const reader = $("reader");
    const stage = $("main");
    const rail = $("chapterRail");
    const grips = ui.$$(".reader-grip");
    let drag = null;

    if (!reader || !stage || !grips.length) {
      return { init: () => {} };
    }

    const range = () => prefs.measureRange;

    const widthNow = () => Math.round(reader.getBoundingClientRect().width);

    const available = () => {
      const overlayRail = store.state.layout === "compact" || store.state.layout === "mobile";
      const railWidth = !overlayRail && rail ? rail.getBoundingClientRect().width : 0;
      return Math.max(0, stage.clientWidth - railWidth);
    };

    const clamp = (value) => {
      const bounds = range();
      const room = Math.max(bounds.min, Math.min(bounds.max, available() - 32));
      const max = Math.max(room, Math.min(bounds.max, widthNow()));
      return Math.round(Math.min(Math.max(value, bounds.min), max));
    };

    const paint = (value) => {
      document.documentElement.style.setProperty("--reader-measure", `${value}px`);
    };

    const commit = (value) => {
      paint(value);
      prefs.set({ measure: value });
    };

    const stop = () => {
      if (!drag) return;
      const value = drag.value;
      drag = null;
      document.body.classList.remove("is-gripping");
      commit(value);
    };

    const move = (event) => {
      if (!drag) return;
      const delta = event.clientX - drag.startX;
      const next = drag.edge === "left" ? drag.start - delta * 2 : drag.start + delta * 2;
      drag.value = clamp(next);
      paint(drag.value);
    };

    const init = () => {
      grips.forEach((grip) => {
        grip.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          drag = {
            edge: grip.dataset.edge === "left" ? "left" : "right",
            startX: event.clientX,
            start: widthNow(),
            value: widthNow(),
          };
          document.body.classList.add("is-gripping");
          grip.setPointerCapture(event.pointerId);
        });
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", stop);
        grip.addEventListener("pointercancel", stop);
        grip.addEventListener("dblclick", () => commit(clamp(range().fallback)));
        grip.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = event.key === "ArrowRight" ? 20 : -20;
          commit(clamp(widthNow() + step));
        });
      });
      paint(prefs.get().measure);
    };

    return { init };
  });
})();
