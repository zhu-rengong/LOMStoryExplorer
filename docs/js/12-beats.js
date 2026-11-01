(() => {
  "use strict";

  const SR = window.SR;

  const DEFAULT_TAGS = ["s", "c", "br", "j", "m", "lore", "sc"];
  const DEFAULT_MODES = ["dialog", "narration", "think"];
  const RICH_TAG = /\{[^{}]*\}/g;

  SR.define("beat", ["data"], ({ data }) => {
    const tags = (data.vocab.beatTags && data.vocab.beatTags.length)
      ? data.vocab.beatTags : DEFAULT_TAGS;
    const modes = (data.vocab.sayModes && data.vocab.sayModes.length)
      ? data.vocab.sayModes : DEFAULT_MODES;

    const TAGS = {
      say: tags[0],
      choice: tags[1],
      branch: tags[2],
      jump: tags[3],
      meta: tags[4],
      lore: tags[5],
      scene: tags[6],
    };

    const is = (row, name) => Array.isArray(row) && row.length > 0 && row[0] === TAGS[name];

    const say = (row) => ({
      speaker: row[1] || "",
      text: row[2] || "",
      mode: modes[row[3]] || modes[0],
      modeIndex: typeof row[3] === "number" ? row[3] : 0,
    });

    const choice = (row) => (row[1] || []).map((item) => ({
      text: item[0] || "",
      cond: item[1] || null,
      beats: item[2] || [],
      lock: item[3] || "",
      detail: item[4] || null,
    }));

    const branch = (row) => ({
      check: row[1] || null,
      cond: row[2] || null,
      text: row[3] || "",
      beats: row[4] || [],
      group: typeof row[5] === "number" ? row[5] : 0,
    });

    const jump = (row) => ({
      target: row[1] || "",
      label: row[2] || "",
    });

    const scene = (row) => ({
      name: row[1] || "",
      key: row[2] || "",
      next: row[3] || "",
    });

    const meta = (row) => ({
      kind: row[1] || "",
      key: row[2] || "",
      value: typeof row[3] === "number" ? row[3] : null,
    });

    const lore = (row) => row[1] || "";

    const walk = (rows, visit) => {
      for (const row of rows || []) {
        if (!Array.isArray(row) || !row.length) continue;
        visit(row);
        if (is(row, "choice")) {
          for (const item of row[1] || []) {
            if (item && Array.isArray(item[2])) walk(item[2], visit);
          }
        } else if (is(row, "branch")) {
          walk(row[4], visit);
        }
      }
    };

    const stripRich = (text) => (text ? String(text).replace(RICH_TAG, "") : "");

    const textOf = (rows) => {
      const parts = [];
      walk(rows, (row) => {
        if (is(row, "say")) parts.push(stripRich(row[2]));
        else if (is(row, "choice")) {
          for (const item of row[1] || []) parts.push(stripRich(item[0]));
        } else if (is(row, "lore")) parts.push(stripRich(row[1]));
      });
      return parts.join("\n");
    };

    const firstSay = (rows) => {
      let hit = null;
      walk(rows, (row) => {
        if (hit || !is(row, "say")) return;
        hit = { speaker: row[1] || "", text: stripRich(row[2]) };
      });
      return hit;
    };

    return {
      TAGS,
      branch,
      choice,
      firstSay,
      is,
      jump,
      lore,
      meta,
      say,
      scene,
      stripRich,
      textOf,
      walk,
    };
  });
})();
