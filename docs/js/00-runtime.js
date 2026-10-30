window.SR = window.SR || {};

(() => {
  "use strict";

  const SR = window.SR;

  const registry = new Map();
  const instances = new Map();
  const loading = [];

  const resolve = (name) => {
    if (instances.has(name)) return instances.get(name);
    const entry = registry.get(name);
    if (!entry) throw new Error(`SR module "${name}" is not defined (missing script tag?)`);
    const cycle = loading.indexOf(name);
    if (cycle >= 0) {
      throw new Error(`SR dependency cycle: ${loading.slice(cycle).concat(name).join(" -> ")}`);
    }
    loading.push(name);
    const deps = {};
    for (const dep of entry.deps) deps[dep] = resolve(dep);
    const api = entry.factory(deps) || {};
    loading.pop();
    instances.set(name, api);
    return api;
  };

  SR.version = 2;
  SR.define = (name, deps, factory) => {
    if (registry.has(name)) throw new Error(`SR module "${name}" is already defined`);
    registry.set(name, { deps: (deps || []).slice(), factory });
    return SR;
  };
  SR.require = resolve;
  SR.start = (name) => resolve(name);
  SR.isDefined = (name) => registry.has(name);
  SR.moduleNames = () => Array.from(registry.keys());
})();
