(() => {
  "use strict";

  const get = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const set = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  const remove = (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };

  const getJson = (key) => {
    const raw = get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const setJson = (key, value) => {
    let payload = "";
    try {
      payload = JSON.stringify(value);
    } catch {
      return false;
    }
    return set(key, payload);
  };

  window.SR_LOCAL = { get, getJson, remove, set, setJson };
})();
