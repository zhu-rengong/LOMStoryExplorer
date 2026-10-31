(() => {
  "use strict";

  const SR = window.SR;

  const RICH_BASE = 40;
  const RICH_MIN = 0.72;
  const RICH_MAX = 1.9;
  const RICH_TAG = /\{([^{}]*)\}/g;
  const SAY_CLASS = ["", "narration", "think"];
  const ENTRY_KEYS = { combat: "entryCombat", free: "entryFree" };

  SR.define("beats", ["schema", "graph", "store", "i18n", "ui", "text", "condexpr"],
    ({ schema, graph, store, i18n, ui, text, condexpr }) => {
      const clampScale = (value) => {
        if (!Number.isFinite(value) || value <= 0) return 1;
        return Math.max(RICH_MIN, Math.min(RICH_MAX, value));
      };

      const appendSegment = (parent, chunk, stack) => {
        if (!chunk) return;
        const scale = stack.length ? stack[stack.length - 1] : 1;
        if (scale === 1) {
          parent.appendChild(document.createTextNode(chunk));
          return;
        }
        const span = document.createElement("span");
        span.style.fontSize = `${scale.toFixed(2)}em`;
        span.textContent = chunk;
        parent.appendChild(span);
      };

      const appendRich = (parent, text) => {
        if (!text) return parent;
        const stack = [];
        let last = 0;
        let match;
        RICH_TAG.lastIndex = 0;
        while ((match = RICH_TAG.exec(text)) !== null) {
          if (match.index > last) appendSegment(parent, text.slice(last, match.index), stack);
          const tag = (match[1] || "").trim();
          const lower = tag.toLowerCase();
          if (lower.indexOf("/size") === 0 || lower === "size") {
            stack.pop();
          } else if (lower.indexOf("size") === 0 && tag.indexOf("=") > 0) {
            const value = parseFloat(tag.slice(tag.indexOf("=") + 1));
            stack.push(Number.isFinite(value) ? clampScale(value / RICH_BASE) : (stack[stack.length - 1] || 1));
          }
          last = RICH_TAG.lastIndex;
        }
        if (last < text.length) appendSegment(parent, text.slice(last), stack);
        return parent;
      };

      const stripRich = schema.stripRich;

      const speakerName = (id) => {
        if (!id) return "";
        return text.characters(store.state.lang)[id] || id;
      };

      const speakerTone = (id) => {
        let sum = 0;
        for (let index = 0; index < id.length; index++) {
          sum = (sum * 31 + id.charCodeAt(index)) % 997;
        }
        return sum % 3;
      };

      const entryLabel = (node) => {
        if (!node || !node.entry) return "";
        const key = ENTRY_KEYS[node.entry];
        return key ? i18n.t(key) : "";
      };

      const entryBadge = (node) => {
        const label = entryLabel(node);
        if (!label) return null;
        const badge = ui.el("span",
          `entry-badge badge ${node.entry === "combat" ? "badge-danger" : "badge-cool"} is-${node.entry}`,
          label);
        badge.title = i18n.t("entrySourceTitle", { name: label });
        return badge;
      };

      const extractKey = (value) => {
        const match = /「([^」]{2,})」/.exec(value || "");
        return match ? match[1] : "";
      };

      const loreBlock = (value) => {
        const box = ui.el("div", "lore");
        const body = ui.el("div", "lore-text");
        String(value || "").split(/\n+/).forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) body.appendChild(ui.el("p", "lore-p", trimmed));
        });
        box.appendChild(body);
        return box;
      };

      const upgradeBranchCond = (cond, label, kind, ctx) => {
        if (!cond || !label) return;
        if (kind !== "switch" && kind !== "condition" && kind !== "dice") return;
        const key = extractKey(label);
        if (!key) return;
        const result = condexpr.resultOf(label);
        condexpr.ensure(key).then(() => {
          if (!cond.isConnected) return;
          const expr = condexpr.pick(kind, key, result);
          if (expr) {
            cond.classList.add("is-expr");
            cond.replaceChildren(condexpr.render(expr, {
              openLookup: ctx.lookup ? ctx.lookup.open : null,
              method: kind,
            }));
            cond.title = condexpr.label(expr);
            return;
          }
          const missed = condexpr.fallback(kind, key, result);
          if (!missed) return;
          cond.classList.add("is-expr", "is-fallback");
          cond.replaceChildren(ui.el("span", "cx-fallback", i18n.t("lookupCondFallback")));
          const excluded = missed.excluded.map(condexpr.label).filter(Boolean);
          const hint = [label, i18n.t("cxFallbackHint", { n: missed.n })];
          if (excluded.length) hint.push(excluded.join("；"));
          cond.title = hint.join("\n");
        });
      };

      const renderChoice = (beat, ctx) => {
        const box = ui.el("div", "choice");
        const beatKey = `bt${ctx.seq++}`;
        box.dataset.beat = beatKey;
        schema.choices(beat).forEach((option, index) => {
          const wrapper = ui.el("div", "option");
          wrapper.dataset.opt = `${beatKey}:${index}`;
          const button = ui.el("button", "option-head row");
          button.type = "button";
          button.setAttribute("aria-expanded", "false");
          button.appendChild(ui.el("span", "option-idx", String(index + 1)));

          const main = ui.el("span", "option-main");
          const textEl = ui.el("span", "option-text");
          appendRich(textEl, option.text);
          main.appendChild(textEl);

          if (option.lock || option.note) {
            const badges = ui.el("span", "option-badges");
            if (option.lock) badges.appendChild(ui.el("span", "badge badge-lock", `🔒 ${option.lock}`));
            if (option.note) {
              const isDice = option.note.indexOf(i18n.t("diceLabel")) === 0;
              badges.appendChild(ui.el("span", `badge ${isDice ? "badge-dice" : "badge-need"}`, option.note));
            }
            main.appendChild(badges);
          }
          button.appendChild(main);

          const body = ui.el("div", "option-body");
          body.appendChild(renderBeats(option.beats, ctx));
          button.addEventListener("click", () => {
            const open = wrapper.classList.toggle("is-open");
            button.setAttribute("aria-expanded", open ? "true" : "false");
          });
          wrapper.appendChild(button);
          wrapper.appendChild(body);
          box.appendChild(wrapper);
        });
        return box;
      };

      const renderBranch = (beat, ctx) => {
        const data = schema.branch(beat);
        const box = ui.el("div", "branch");
        box.dataset.beat = `bt${ctx.seq++}`;
        const body = ui.el("div", "branch-body");
        body.appendChild(renderBeats(data.beats, ctx));
        const empty = !body.childNodes.length;
        if (empty) box.classList.add("is-empty");

        const head = ui.el("div", empty ? "branch-head" : "branch-head row row-sm");
        const cond = ui.el("span", "cond", data.label);
        if (data.label) {
          cond.title = data.label;
          cond.dataset.label = data.label;
        }
        head.appendChild(cond);
        upgradeBranchCond(cond, data.label, data.kind, empty ? { lookup: null } : ctx);

        if (empty) {
          const hint = i18n.t("previewEmpty");
          const tag = ui.el("span", "branch-empty", i18n.t("branchEmpty"));
          tag.title = hint;
          tag.setAttribute("aria-label", hint);
          head.appendChild(tag);
          box.appendChild(head);
          return box;
        }

        head.setAttribute("role", "button");
        head.tabIndex = 0;
        head.setAttribute("aria-expanded", "false");

        const target = ctx.lookup && ctx.lookup.targetOf
          ? ctx.lookup.targetOf(extractKey(data.label) || data.label)
          : null;
        if (target) {
          const lookupBtn = ui.el("button", "cond-lookup btn btn-icon");
          lookupBtn.type = "button";
          lookupBtn.title = i18n.t("condLookup");
          lookupBtn.setAttribute("aria-label", i18n.t("condLookup"));
          lookupBtn.appendChild(ui.svg("i-search"));
          lookupBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            const method = ["switch", "dice", "condition", "position"].indexOf(data.kind) >= 0
              ? data.kind : "";
            ctx.lookup.open(target.kind, target.key, lookupBtn, method);
          });
          head.appendChild(lookupBtn);
        }

        const toggle = () => {
          const open = box.classList.toggle("is-open");
          head.setAttribute("aria-expanded", open ? "true" : "false");
          if (ctx.preview) ctx.preview.hide();
        };
        head.addEventListener("click", toggle);
        head.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        });
        if (ctx.preview) {
          ctx.preview.bind(head, box, () => ({ title: data.label, beats: data.beats }));
        }

        box.appendChild(head);
        box.appendChild(body);
        return box;
      };

      const renderScene = (beat) => {
        const data = schema.scene(beat);
        const row = ui.el("div", "scene-switch");
        row.appendChild(ui.el("span", "scene-label", i18n.t("sceneSwitch")));
        if (data.name) row.appendChild(ui.el("span", "scene-name", data.name));
        if (data.key) row.appendChild(ui.el("span", "scene-key", data.key));
        if (data.next) {
          row.appendChild(ui.el("span", "scene-arrow", "→"));
          row.appendChild(ui.el("span", "scene-next", data.next));
        }
        return row;
      };

      const renderJump = (beat, ctx) => {
        const data = schema.jump(beat);
        if (!data.target) {
          return ui.el("span", "jump dynamic", `▷ ${data.label || i18n.t("jumpDynamic")}`);
        }
        if (!graph.nodeById.has(data.target)) {
          return ui.el("span", "jump dynamic", `▷ ${data.target}（${i18n.t("jumpMissing")}）`);
        }
        const button = ui.el("button", "jump btn btn-sm");
        button.type = "button";
        button.appendChild(ui.el("span", "arrow", "→"));
        button.appendChild(document.createTextNode(data.target));
        if (data.label) button.appendChild(ui.el("span", "option-cond", `  ${data.label}`));
        button.addEventListener("click", () => {
          if (ctx.navigate) ctx.navigate(data.target);
        });
        return button;
      };

      const renderBeats = (rows, context) => {
        const ctx = context || { seq: 0 };
        const frag = document.createDocumentFragment();
        let metaBuffer = [];
        let branchBuffer = [];
        let branchGroup = null;
        let diceButtons = [];

        const flushMeta = () => {
          if (!metaBuffer.length) return;
          const group = ui.el("div", "meta-group");
          const chips = ui.el("div", "meta-chips");
          metaBuffer.forEach((meta) => {
            const value = meta.text;
            let target = null;
            if (ctx.lookup) {
              if (meta.method === "dice" && meta.key) {
                target = { kind: "check", key: meta.key };
              } else if (ctx.lookup.targetOf) {
                target = ctx.lookup.targetOf(extractKey(value) || value);
              }
            }
            const chip = ui.el(target ? "button" : "span",
              target ? "btn btn-sm meta-action" : "chip-stat chip chip-sm", value);
            if (target) {
              chip.type = "button";
              chip.setAttribute("aria-haspopup", "dialog");
            }
            if (value.length > 24) chip.title = value;
            if (target) {
              const open = (event) => {
                event.stopPropagation();
                ctx.lookup.open(target.kind, target.key, chip, meta.method);
              };
              chip.addEventListener("click", open);
            }
            if (target && meta.method === "dice") diceButtons.push(chip);
            else chips.appendChild(chip);
          });
          metaBuffer = [];
          if (!chips.childNodes.length) return;
          group.appendChild(chips);
          frag.appendChild(group);
        };

        const flushDice = () => {
          if (!diceButtons.length) return;
          const group = ui.el("div", "meta-group");
          const chips = ui.el("div", "meta-chips");
          diceButtons.forEach((chip) => chips.appendChild(chip));
          diceButtons = [];
          group.appendChild(chips);
          frag.appendChild(group);
        };

        const flushBranches = () => {
          if (!branchBuffer.length) return;
          const boxes = branchBuffer;
          branchBuffer = [];
          branchGroup = null;
          flushDice();
          const filled = boxes.filter((box) => !box.classList.contains("is-empty"));
          if (!filled.length) return;
          const group = ui.el("div", "branch-group");
          filled.forEach((box) => group.appendChild(box));
          frag.appendChild(group);
        };

        for (const beat of rows || []) {
          if (!Array.isArray(beat) || !beat.length) continue;
          const tag = beat[0];

          if (tag === "br") {
            flushMeta();
            const group = typeof beat[4] === "number" ? beat[4] : 0;
            if (branchBuffer.length && group !== branchGroup) flushBranches();
            branchGroup = group;
            branchBuffer.push(renderBranch(beat, ctx));
            continue;
          }

          flushBranches();

          if (tag === "m") {
            const meta = schema.metaBeat(beat);
            meta.text = stripRich(meta.text);
            metaBuffer.push(meta);
            continue;
          }
          flushMeta();

          if (tag === "c") {
            const choice = renderChoice(beat, ctx);
            if (diceButtons.length) {
              const dice = document.createDocumentFragment();
              diceButtons.forEach((chip) => dice.appendChild(chip));
              diceButtons = [];
              choice.insertBefore(dice, choice.firstChild);
            }
            frag.appendChild(choice);
            continue;
          }
          flushDice();

          if (tag === "lore") {
            frag.appendChild(loreBlock(stripRich(beat[1])));
            continue;
          }

          if (tag === "sc") {
            frag.appendChild(renderScene(beat));
            continue;
          }

          if (tag === "s") {
            const data = schema.say(beat);
            const wrap = ui.el("div", `say${data.mode !== "dialog" ? ` ${SAY_CLASS[data.mode === "think" ? 2 : 1]}` : ""}`);
            if (data.speaker && data.mode === "dialog") wrap.classList.add(`spk-${speakerTone(data.speaker)}`);
            if (data.speaker) {
              const who = ui.el("span", "who", speakerName(data.speaker));
              who.classList.add("is-link");
              who.title = i18n.t("lookupSpeaker");
              who.addEventListener("click", (event) => {
                event.stopPropagation();
                if (ctx.lookup) ctx.lookup.open("speaker", data.speaker, who);
              });
              wrap.appendChild(who);
            }
            const what = ui.el("div", "what");
            appendRich(what, data.text);
            wrap.appendChild(what);
            frag.appendChild(wrap);
          } else if (tag === "j") {
            frag.appendChild(renderJump(beat, ctx));
          }
        }
        flushMeta();
        flushBranches();
        flushDice();
        return frag;
      };

      const beatsPreview = (rows, budget) => {
        const limits = budget || { lines: 6, chars: 220 };
        const out = { lines: [], more: 0 };
        let used = 0;
        let stop = false;

        const push = (kind, value, who) => {
          const clean = stripRich(String(value == null ? "" : value)).replace(/\s+/g, " ").trim();
          if (!clean) return;
          if (stop || out.lines.length >= limits.lines || used + clean.length > limits.chars) {
            out.more++;
            if (out.lines.length >= limits.lines) stop = true;
            return;
          }
          out.lines.push({ kind, text: clean, who: who || "" });
          used += clean.length;
        };

        const walk = (list) => {
          for (const beat of list || []) {
            if (!Array.isArray(beat)) continue;
            if (beat[0] === "s") {
              const data = schema.say(beat);
              push(data.mode === "narration" ? "narration" : data.mode === "think" ? "think" : "say",
                data.text, data.mode === "dialog" && data.speaker ? speakerName(data.speaker) : "");
            } else if (beat[0] === "m") {
              push("meta", beat[1]);
            } else if (beat[0] === "j") {
              push("jump", `→ ${beat[1] || ""}`);
            } else if (beat[0] === "sc") {
              const data = schema.scene(beat);
              push("jump", `↩ ${data.name}${data.next ? ` → ${data.next}` : ""}`);
            } else if (beat[0] === "c") {
              const options = schema.choices(beat);
              const first = options[0] && options[0].text ? `：${options[0].text}` : "";
              push("choice", i18n.t("previewChoice", { n: options.length }) + first);
            } else if (beat[0] === "br") {
              walk(schema.branch(beat).beats);
            }
          }
        };

        walk(rows);
        return out;
      };

      const previewOfBranches = (list) => {
        let lines = [];
        let hidden = 0;
        (list || []).slice(0, 3).forEach((beat) => {
          const data = schema.branch(beat);
          const label = stripRich(data.label).trim();
          if (label) lines.push({ kind: "cond", text: label });
          const sub = beatsPreview(data.beats, { lines: 1, chars: 60 });
          sub.lines.forEach((line) => lines.push(line));
        });
        if ((list || []).length > 3) hidden = list.length - 3;
        if (lines.length > 6) {
          hidden += lines.length - 6;
          lines = lines.slice(0, 6);
        }
        return { lines, more: hidden };
      };

      const firstLineOf = (node) => {
        if (!node) return "";
        const rows = text.story(store.state.lang, node.id);
        if (!rows) return "";
        return schema.firstLine(rows, speakerName);
      };

      return {
        RICH_BASE,
        RICH_MAX,
        RICH_MIN,
        RICH_TAG,
        SAY_CLASS,
        appendRich,
        appendSegment,
        beatsPreview,
        clampScale,
        entryBadge,
        entryLabel,
        extractKey,
        firstLineOf,
        loreBlock,
        previewOfBranches,
        renderBeats,
        renderBranch,
        renderChoice,
        renderJump,
        renderScene,
        speakerName,
        speakerTone,
        stripRich,
      };
    });
})();
