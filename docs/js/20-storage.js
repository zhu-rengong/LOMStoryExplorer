(() => {
  "use strict";

  const SR = window.SR;

  SR.define("storage", [], () => {
    const SESSION_KEY = "legend-of-mortal.reader.session.v2";
    const BOOKMARK_KEY = "legend-of-mortal.reader.bookmarks.v2";
    const POSITION_KEY = "legend-of-mortal.reader.positions.v2";

    const LEGACY_SESSION = "legend-of-mortal.story-graph.v1";
    const LEGACY_BOOKMARKS = "legend-of-mortal.story-reader.bookmarks.v1";
    const LEGACY_POSITIONS = "legend-of-mortal.story-reader.progress.v1";

    const LIMIT = 500;

    const read = (key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    };

    const write = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    };

    const readSession = () => {
      const saved = read(SESSION_KEY) || read(LEGACY_SESSION);
      if (!saved || typeof saved !== "object") return null;
      return {
        lang: typeof saved.lang === "string" ? saved.lang : "",
        selected: typeof saved.selected === "string" ? saved.selected : "",
        chapters: Array.isArray(saved.chapters) ? saved.chapters : [],
        filter: typeof saved.filter === "string" ? saved.filter : "",
      };
    };

    let sessionTimer = null;
    let pendingSession = null;

    const saveSession = (value) => {
      pendingSession = value;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => {
        if (pendingSession) write(SESSION_KEY, pendingSession);
        pendingSession = null;
      }, 200);
    };

    const bookmarks = new Set();

    const loadBookmarks = () => {
      const saved = read(BOOKMARK_KEY) || read(LEGACY_BOOKMARKS);
      if (!saved) return bookmarks;
      const ids = Array.isArray(saved) ? saved : Array.isArray(saved.ids) ? saved.ids : [];
      for (const id of ids) if (typeof id === "string") bookmarks.add(id);
      return bookmarks;
    };

    const saveBookmarks = () => write(BOOKMARK_KEY, Array.from(bookmarks));

    const positions = new Map();

    const loadPositions = () => {
      const saved = read(POSITION_KEY) || read(LEGACY_POSITIONS);
      const map = saved && typeof saved === "object" && !Array.isArray(saved)
        ? (saved.pos && typeof saved.pos === "object" ? saved.pos : saved)
        : {};
      for (const id of Object.keys(map)) {
        const value = Number(map[id]);
        if (typeof id === "string" && Number.isFinite(value) && value >= 0 && value <= 1) {
          positions.set(id, value);
        }
      }
      return positions;
    };

    let positionTimer = null;

    const savePositions = () => {
      const out = {};
      const keys = Array.from(positions.keys()).slice(-LIMIT);
      for (const id of keys) out[id] = Math.round(positions.get(id) * 1000) / 1000;
      write(POSITION_KEY, { pos: out });
    };

    const rememberPosition = (id, fraction) => {
      if (!id || typeof fraction !== "number" || !Number.isFinite(fraction)) return;
      positions.set(id, Math.max(0, Math.min(1, fraction)));
      clearTimeout(positionTimer);
      positionTimer = setTimeout(savePositions, 300);
    };

    loadBookmarks();
    loadPositions();

    return {
      BOOKMARK_KEY,
      POSITION_KEY,
      SESSION_KEY,
      bookmarks,
      flush: () => {
        if (pendingSession) write(SESSION_KEY, pendingSession);
        savePositions();
        saveBookmarks();
      },
      loadBookmarks,
      loadPositions,
      positionOf: (id) => (positions.has(id) ? positions.get(id) : 0),
      readSession,
      rememberPosition,
      saveBookmarks,
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
