(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const reader = document.getElementById("reader");
  const stage = document.getElementById("main");
  const rail = document.getElementById("chapterRail");
  const grips = Array.from(document.querySelectorAll(".reader-grip"));
  if (!reader || !stage || !grips.length) return;

  const api = () => window.StorySettings;

  const range = () => {
    const settings = api();
    if (settings && settings.measureRange) return settings.measureRange;
    return { min: 520, max: 1400, fallback: 860 };
  };

  const savedMeasure = () => {
    const settings = api();
    const saved = settings && settings.get ? settings.get().measure : 0;
    return Number(saved) || range().fallback;
  };

  const widthNow = () => Math.round(reader.getBoundingClientRect().width);

  const available = () => {
    const overlay = SR.viewport && SR.viewport.isOverlayRail ? SR.viewport.isOverlayRail() : false;
    const railWidth = !overlay && rail ? rail.getBoundingClientRect().width : 0;
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
    const settings = api();
    if (settings && settings.set) settings.set({ measure: value });
  };

  let drag = null;

  const stop = () => {
    if (!drag) return;
    const value = drag.value;
    drag = null;
    document.body.classList.remove("is-gripping");
    commit(value);
  };

  const paintDrag = (event) => {
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    const next = drag.edge === "left" ? drag.start - delta * 2 : drag.start + delta * 2;
    drag.value = clamp(next);
    paint(drag.value);
  };

  grips.forEach((grip) => {
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const start = widthNow();
      drag = {
        edge: grip.dataset.edge === "left" ? "left" : "right",
        startX: event.clientX,
        start: start,
        value: start,
      };
      document.body.classList.add("is-gripping");
      grip.setPointerCapture(event.pointerId);
    });

    grip.addEventListener("pointermove", paintDrag);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);

    grip.addEventListener("dblclick", () => {
      commit(clamp(range().fallback));
    });

    grip.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 20 : -20;
      commit(clamp(widthNow() + step));
    });
  });

  paint(savedMeasure());

  SR.register("grip", {
    available: available,
    clamp: clamp,
    commit: commit,
    paint: paint,
    widthNow: widthNow,
  });
})();
