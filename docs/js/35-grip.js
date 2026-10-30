(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const main = document.querySelector(".reader-main");
  const grips = Array.from(document.querySelectorAll(".reader-grip"));
  if (!main || !grips.length) return;

  const api = () => window.StorySettings;

  const range = () => {
    const settings = api();
    if (settings && settings.measureRange) return settings.measureRange;
    return { min: 480, max: 1280, fallback: 820 };
  };

  const measureNow = () => {
    const settings = api();
    const saved = settings && settings.get ? settings.get().measure : 0;
    return Number(saved) || range().fallback;
  };

  const paint = (value) => {
    document.documentElement.style.setProperty("--reader-measure", `${value}px`);
  };

  const commit = (value) => {
    paint(value);
    const settings = api();
    if (settings && settings.set) settings.set({ measure: value });
  };

  const clamp = (value) => {
    const bounds = range();
    const available = main.clientWidth - 48;
    const max = Math.max(bounds.min, Math.min(bounds.max, available || bounds.max));
    return Math.round(Math.min(Math.max(value, bounds.min), max));
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
      const start = measureNow();
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
      commit(clamp(measureNow() + step));
    });
  });

  paint(measureNow());

  SR.register("grip", {
    clamp: clamp,
    commit: commit,
    measureNow: measureNow,
    paint: paint,
  });
})();
