(() => {
  "use strict";

  const SR = window.SR;

  const LOCAL = window.SR_LOCAL;

  SR.define("storage", ["ui"], ({ ui }) => {
    const SESSION_KEY = "legend-of-mortal.explorer.session.v1";
    const BOOKMARK_KEY = "legend-of-mortal.explorer.bookmarks.v1";
    const POSITION_KEY = "legend-of-mortal.explorer.positions.v1";

    const LIMIT = 500;

    const readSession = () => {
      const saved = LOCAL.getJson(SESSION_KEY);
      if (!saved || typeof saved !== "object") return null;
      return {
        selected: typeof saved.selected === "string" ? saved.selected : "",
        filter: typeof saved.filter === "string" ? saved.filter : "",
      };
    };

    let pendingSession = null;

    const writeSession = ui.debounce(() => {
      if (pendingSession) LOCAL.setJson(SESSION_KEY, pendingSession);
      pendingSession = null;
    }, 200);

    const saveSession = (value) => {
      pendingSession = value;
      writeSession();
    };

    const bookmarks = new Set();

    const loadBookmarks = () => {
      const saved = LOCAL.getJson(BOOKMARK_KEY);
      if (!Array.isArray(saved)) return bookmarks;
      for (const id of saved) if (typeof id === "string") bookmarks.add(id);
      return bookmarks;
    };

    const saveBookmarks = () => LOCAL.setJson(BOOKMARK_KEY, Array.from(bookmarks));

    const positions = new Map();

    const loadPositions = () => {
      const saved = LOCAL.getJson(POSITION_KEY);
      const map = saved && typeof saved === "object" && !Array.isArray(saved)
        ? (saved.pos && typeof saved.pos === "object" ? saved.pos : {})
        : {};
      for (const id of Object.keys(map)) {
        const value = Number(map[id]);
        if (typeof id === "string" && Number.isFinite(value) && value >= 0 && value <= 1) {
          positions.set(id, value);
        }
      }
      return positions;
    };

    const savePositions = () => {
      const out = {};
      const keys = Array.from(positions.keys()).slice(-LIMIT);
      for (const id of keys) out[id] = Math.round(positions.get(id) * 1000) / 1000;
      LOCAL.setJson(POSITION_KEY, { pos: out });
    };

    const writePositions = ui.debounce(savePositions, 300);

    const rememberPosition = (id, fraction) => {
      if (!id || typeof fraction !== "number" || !Number.isFinite(fraction)) return;
      positions.set(id, ui.clamp(fraction, 0, 1));
      writePositions();
    };

    const flush = () => {
      if (pendingSession) LOCAL.setJson(SESSION_KEY, pendingSession);
      savePositions();
      saveBookmarks();
    };

    window.addEventListener("beforeunload", flush);

    loadBookmarks();
    loadPositions();

    return {
      bookmarks,
      positionOf: (id) => (positions.has(id) ? positions.get(id) : 0),
      readSession,
      rememberPosition,
      saveSession,
      toggleBookmark: (id) => {
        if (!id) return false;
        if (bookmarks.has(id)) bookmarks.delete(id);
        else bookmarks.add(id);
        saveBookmarks();
        return bookmarks.has(id);
      },
      clearBookmarks: () => {
        bookmarks.clear();
        saveBookmarks();
      },
    };
  });
})();
