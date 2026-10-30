(() => {
  "use strict";
  const SR = window.SR;
  const indexes = new Map();
  let generation = 0;
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase();
  const flatten = (beats, parts = []) => {
    for (const beat of beats || []) {
      if (beat[0] === "s") parts.push(beat[2]);
      else if (beat[0] === "c") {
        for (const option of beat[2]) {
          parts.push(option[0]);
          flatten(option[2], parts);
        }
      } else if (beat[0] === "b") {
        parts.push(beat[1]);
        flatten(beat[2], parts);
      } else if (beat[0] === "l") parts.push(beat[1]);
    }
    return parts;
  };
  const indexFor = (lang) => {
    if (!indexes.has(lang)) indexes.set(lang, new Map());
    return indexes.get(lang);
  };
  const indexStory = (id, lang) => {
    const index = indexFor(lang);
    if (index.has(id)) return index.get(id);
    const raw = flatten(SR.text.get(id, lang) || []).join("\n");
    const entry = { raw, normalized: normalize(raw) };
    index.set(id, entry);
    return entry;
  };
  const snippet = (raw, query) => {
    const position = normalize(raw).indexOf(query);
    if (position < 0) return "";
    const start = Math.max(0, position - 42);
    const end = Math.min(raw.length, position + query.length + 86);
    return `${start ? "…" : ""}${raw.slice(start, end).replace(/\s+/g, " ")}${end < raw.length ? "…" : ""}`;
  };
  const search = async (text, lang, chapter = "", onProgress) => {
    const current = ++generation;
    const query = normalize(text.trim());
    if (!query) return [];
    const pack = await SR.text.loadAll(lang, onProgress, () => current !== generation);
    if (current !== generation) throw new DOMException("Search cancelled", "AbortError");
    const results = [];
    for (const node of SR.data.nodes) {
      if (chapter && SR.data.chapter(node.chapter)?.id !== chapter) continue;
      const id = normalize(node.id);
      const speakers = node.speakers.map((speaker) => normalize(SR.text.packOf(lang)?.characters[speaker] || speaker));
      const story = indexStory(node.id, lang);
      let score = 0;
      if (id === query) score = 140;
      else if (id.startsWith(query)) score = 110;
      else if (id.includes(query)) score = 90;
      if (speakers.some((speaker) => speaker.includes(query))) score = Math.max(score, 75);
      const position = story.normalized.indexOf(query);
      if (position >= 0) score = Math.max(score, 55) + Math.min(20, story.normalized.split(query).length - 1);
      if (score) results.push({ id: node.id, score, snippet: snippet(story.raw, query) });
    }
    return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 250);
  };
  const cancel = () => {
    generation += 1;
  };
  SR.register("search", { search, cancel, flatten, normalize });
})();
