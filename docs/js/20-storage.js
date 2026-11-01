(() => {
  "use strict";

  const SR = window.SR;

  SR.define("storage", ["ui"], ({ ui }) => {
    const BOOKMARK_KEY = "legend-of-mortal.explorer.bookmarks.v1";

    const LOCAL = window.SR_LOCAL;

    const bookmarks = new Set();

    const loadBookmarks = () => {
      const saved = LOCAL.getJson(BOOKMARK_KEY);
      if (!Array.isArray(saved)) return bookmarks;
      for (const id of saved) if (typeof id === "string") bookmarks.add(id);
      return bookmarks;
    };

    const saveBookmarks = () => LOCAL.setJson(BOOKMARK_KEY, Array.from(bookmarks));

    const positions = new Map();

    const rememberPosition = (id, fraction) => {
      if (!id || typeof fraction !== "number" || !Number.isFinite(fraction)) return;
      positions.set(id, ui.clamp(fraction, 0, 1));
    };

    const positionOf = (id) => (positions.has(id) ? positions.get(id) : 0);

    loadBookmarks();

    return {
      bookmarks,
      positionOf,
      rememberPosition,
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
