(() => {
  "use strict";

  const SR = window.SR;

  const DEFAULT_TAGS = ["s", "c", "br", "j", "m", "lore", "sc"];
  const DEFAULT_MODES = ["dialog", "narration", "think"];
  const RICH_TAG = /\{[^{}]*\}/g;

  const record = (value) => (
    value && typeof value === "object" && !Array.isArray(value) ? value : null
  );

  const list = (value) => (Array.isArray(value) ? value : []);

  const text = (value) => (typeof value === "string" ? value : "");

  const number = (value, fallback) => (
    typeof value === "number" && Number.isFinite(value) ? value : fallback
  );

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

    const say = (row) => {
      const modeIndex = number(row[3], 0);
      return {
        speaker: text(row[1]),
        text: text(row[2]),
        mode: modes[modeIndex] || modes[0],
        modeIndex,
      };
    };

    const check = (value) => {
      const hit = record(value);
      return hit && text(hit.key) ? hit : null;
    };

    const option = (item) => ({
      text: text(item[0]),
      cond: record(item[1]),
      beats: list(item[2]),
      lock: text(item[3]),
      detail: record(item[4]),
    });

    const choice = (row) => list(row[1]).filter(Array.isArray).map(option);

    const branch = (row) => ({
      check: check(row[1]),
      cond: record(row[2]),
      text: text(row[3]),
      beats: list(row[4]),
      group: number(row[5], 0),
    });

    const jump = (row) => ({
      target: text(row[1]),
      label: text(row[2]),
    });

    const scene = (row) => ({
      name: text(row[1]),
      key: text(row[2]),
      next: text(row[3]),
    });

    const meta = (row) => ({
      kind: text(row[1]),
      key: text(row[2]),
      value: number(row[3], null),
    });

    const lore = (row) => text(row[1]);

    const walk = (rows, visit) => {
      for (const row of list(rows)) {
        if (!Array.isArray(row) || !row.length) continue;
        visit(row);
        if (is(row, "choice")) {
          for (const item of choice(row)) walk(item.beats, visit);
        } else if (is(row, "branch")) {
          walk(branch(row).beats, visit);
        }
      }
    };

    const stripRich = (value) => (value ? String(value).replace(RICH_TAG, "") : "");

    const textOf = (rows) => {
      const parts = [];
      walk(rows, (row) => {
        if (is(row, "say")) parts.push(stripRich(say(row).text));
        else if (is(row, "choice")) {
          for (const item of choice(row)) parts.push(stripRich(item.text));
        } else if (is(row, "lore")) parts.push(stripRich(lore(row)));
      });
      return parts.join("\n");
    };

    const firstSay = (rows) => {
      let hit = null;
      walk(rows, (row) => {
        if (hit || !is(row, "say")) return;
        const said = say(row);
        hit = { speaker: said.speaker, text: stripRich(said.text) };
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
