(() => {
  "use strict";

  const SR = window.SR;

  const RICH_BASE = 40;
  const RICH_MIN = 0.72;
  const RICH_MAX = 1.9;
  const RICH_TAG = /\{([^{}]*)\}/g;
  const SAY_CLASS = ["", "narration", "think"];
  const PREVIEW_LINES = 6;
  const PREVIEW_CHARS = 220;
  const PREVIEW_BRANCH_LINES = 3;
  const PREVIEW_TOTAL_LINES = 6;

  SR.define("beats",
    ["beat", "graph", "store", "i18n", "ui", "text", "condexpr", "condtext", "checkpoints", "names"],
    ({ beat, graph, store, i18n, ui, text, condexpr, condtext, checkpoints, names }) => {
      const clampScale = (value) => {
        if (!Number.isFinite(value) || value <= 0) return 1;
        return ui.clamp(value, RICH_MIN, RICH_MAX);
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

      const speakerName = (id) => {
        if (!id) return "";
        const name = names.speaker(id);
        const title = names.title(id);
        return title ? i18n.t("nameWithTitle", { name, title }) : name;
      };

      const entryLabel = (node) => {
        if (!node || !node.entry) return "";
        return i18n.t(`entry.${node.entry}`, { defaultValue: "" });
      };

      const entryBadge = (node) => {
        const label = entryLabel(node);
        if (!label) return null;
        const badge = ui.el("span",
          `entry-badge badge${node.entry === "combat" ? " badge-danger" : ""} is-${node.entry}`,
          label);
        badge.title = i18n.t("entrySourceTitle", { name: label });
        return badge;
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

      const upgradeBranchCond = (cond, data, ctx) => {
        if (!data.check || !data.check.key) return;
        const kind = data.check.kind;
        const key = data.check.key;
        checkpoints.ensure(key).then(() => {
          if (!cond.isConnected) return;
          const expr = condexpr.pick(data.check);
          if (expr) {
            cond.classList.add("is-expr");
            cond.replaceChildren(condexpr.render(expr, {
              openLookup: ctx.lookup ? ctx.lookup.open : null,
              method: kind,
            }));
            cond.title = condexpr.label(expr);
            return;
          }
          const missed = condexpr.fallback(data.check);
          if (!missed) return;
          cond.classList.add("is-expr", "is-fallback");
          cond.replaceChildren(ui.el("span", "cx-fallback", i18n.t("lookupCondFallback")));
          const excluded = missed.excluded.map(condexpr.label).filter(Boolean);
          const hint = [cond.title, i18n.t("cxFallbackHint", { n: missed.n })];
          if (excluded.length) hint.push(excluded.join(i18n.t("listJoin")));
          cond.title = hint.join("\n");
        });
      };

      const renderChoice = (row, ctx) => {
        const box = ui.el("div", "choice");
        beat.choice(row).forEach((option, index) => {
          const wrapper = ui.el("div", "option");
          const button = ui.el("button", "option-head row");
          button.type = "button";
          ui.setExpanded(button, false);
          button.appendChild(ui.el("span", "option-idx", String(index + 1)));

          const main = ui.el("span", "option-main");
          const textEl = ui.el("span", "option-text");
          appendRich(textEl, condtext.optionHead(option.text, option.detail));
          main.appendChild(textEl);

          const condText = condtext.optionCond(option.cond);
          const needText = condtext.needText(option.detail);
          if (option.lock || condText || needText) {
            const badges = ui.el("span", "option-badges");
            if (option.lock) {
              badges.appendChild(ui.el("span", "badge badge-danger", `🔒 ${option.lock}`));
            }
            if (condText) badges.appendChild(ui.el("span", "option-cond", condText));
            if (needText) badges.appendChild(ui.el("span", "badge", needText));
            main.appendChild(badges);
          }
          button.appendChild(main);

          const body = ui.el("div", "option-body");
          body.appendChild(renderBeats(option.beats, ctx));
          button.addEventListener("click", () => {
            const open = wrapper.classList.toggle("is-open");
            ui.setExpanded(button, open);
          });
          wrapper.appendChild(button);
          wrapper.appendChild(body);
          box.appendChild(wrapper);
        });
        return box;
      };

      const branchLabel = (data) => {
        const fromCond = condtext.cond(data.cond);
        return fromCond || data.text || "";
      };

      const renderBranch = (row, ctx) => {
        const data = beat.branch(row);
        const box = ui.el("div", "branch");
        const body = ui.el("div", "branch-body");
        body.appendChild(renderBeats(data.beats, ctx));
        const empty = !body.childNodes.length;
        if (empty) box.classList.add("is-empty");

        const label = branchLabel(data);
        const head = ui.el("div", empty ? "branch-head" : "branch-head row row-sm");
        const cond = ui.el("span", "cond", label);
        if (label) cond.title = label;
        head.appendChild(cond);
        upgradeBranchCond(cond, data, empty ? { lookup: null } : ctx);

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
        ui.setExpanded(head, false);

        const target = data.check ? { kind: "check", key: data.check.key } : null;
        if (target && ctx.lookup) {
          const lookupBtn = ui.el("button", "cond-lookup btn btn-icon");
          lookupBtn.type = "button";
          lookupBtn.title = i18n.t("condLookup");
          lookupBtn.setAttribute("aria-label", i18n.t("condLookup"));
          lookupBtn.appendChild(ui.svg("i-search"));
          lookupBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            ctx.lookup.open(target.kind, target.key, lookupBtn, data.check.kind);
          });
          head.appendChild(lookupBtn);
        }

        const toggle = () => {
          const open = box.classList.toggle("is-open");
          ui.setExpanded(head, open);
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
          ctx.preview.bind(head, box, () => ({ title: label, beats: data.beats }));
        }

        box.appendChild(head);
        box.appendChild(body);
        return box;
      };

      const renderScene = (row) => {
        const data = beat.scene(row);
        const line = ui.el("div", "scene-switch");
        line.appendChild(ui.el("span", "scene-label", i18n.t("sceneSwitch")));
        if (data.name) line.appendChild(ui.el("span", "scene-name", data.name));
        if (data.key) line.appendChild(ui.el("span", "scene-key", data.key));
        if (data.next) {
          line.appendChild(ui.el("span", "scene-arrow", "→"));
          line.appendChild(ui.el("span", "scene-next", data.next));
        }
        return line;
      };

      const renderJump = (row, ctx) => {
        const data = beat.jump(row);
        if (!data.target) {
          return ui.el("span", "jump dynamic", `▷ ${data.label || i18n.t("jumpDynamic")}`);
        }
        if (!graph.nodeById.has(data.target)) {
          const suffix = i18n.t("wrap", { text: i18n.t("jumpMissing") });
          return ui.el("span", "jump dynamic", `▷ ${data.target}${suffix}`);
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

      const renderBeats = (input, context) => {
        const rows = Array.isArray(input) ? input : [];
        const ctx = context || {};
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
            const value = condtext.meta(meta.kind, meta.key, meta.value);
            if (!value) return;
            const target = meta.kind === "dice"
              ? (meta.key ? { kind: "check", key: meta.key } : null)
              : condtext.metaTarget(meta.kind, meta.key);
            const chip = ui.el(target ? "button" : "span",
              target ? "btn btn-sm meta-action" : "chip-stat chip chip-sm", value);
            if (target) {
              chip.type = "button";
              chip.setAttribute("aria-haspopup", "dialog");
            }
            if (value.length > 24) chip.title = value;
            if (target && ctx.lookup) {
              const open = (event) => {
                event.stopPropagation();
                ctx.lookup.open(target.kind, target.key, chip, meta.kind);
              };
              chip.addEventListener("click", open);
            }
            if (target && meta.kind === "dice") diceButtons.push(chip);
            else chips.appendChild(chip);
          });
          metaBuffer = [];
          if (!chips.childNodes.length) return;
          group.appendChild(chips);
          frag.appendChild(group);
        };

        const flushDice = () => {
          if (!diceButtons.length) return;
          const group = ui.el("div", "meta-group is-dice");
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

        for (const row of rows) {
          if (!Array.isArray(row) || !row.length) continue;

          if (beat.is(row, "branch")) {
            flushMeta();
            const group = beat.branch(row).group;
            if (branchBuffer.length && group !== branchGroup) flushBranches();
            branchGroup = group;
            branchBuffer.push(renderBranch(row, ctx));
            continue;
          }

          flushBranches();

          if (beat.is(row, "meta")) {
            metaBuffer.push(beat.meta(row));
            continue;
          }
          flushMeta();

          if (beat.is(row, "choice")) {
            const choice = renderChoice(row, ctx);
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

          if (beat.is(row, "lore")) {
            frag.appendChild(loreBlock(beat.stripRich(beat.lore(row))));
            continue;
          }

          if (beat.is(row, "scene")) {
            frag.appendChild(renderScene(row));
            continue;
          }

          if (beat.is(row, "say")) {
            const data = beat.say(row);
            const wrap = ui.el("div", `say${data.mode !== "dialog" ? ` ${SAY_CLASS[data.mode === "think" ? 2 : 1]}` : ""}`);
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
          } else if (beat.is(row, "jump")) {
            frag.appendChild(renderJump(row, ctx));
          }
        }
        flushMeta();
        flushBranches();
        flushDice();
        return frag;
      };

      const beatsPreview = (rows, budget) => {
        const limits = budget || { lines: PREVIEW_LINES, chars: PREVIEW_CHARS };
        const out = { lines: [], more: 0 };
        let used = 0;
        let stop = false;

        const push = (kind, value, who) => {
          const clean = beat.stripRich(String(value == null ? "" : value)).replace(/\s+/g, " ").trim();
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
          for (const row of list || []) {
            if (!Array.isArray(row)) continue;
            if (beat.is(row, "say")) {
              const data = beat.say(row);
              push(data.mode === "narration" ? "narration" : data.mode === "think" ? "think" : "say",
                data.text, data.mode === "dialog" && data.speaker ? speakerName(data.speaker) : "");
            } else if (beat.is(row, "meta")) {
              const data = beat.meta(row);
              push("meta", condtext.meta(data.kind, data.key, data.value));
            } else if (beat.is(row, "jump")) {
              push("jump", `→ ${beat.jump(row).target || ""}`);
            } else if (beat.is(row, "scene")) {
              const data = beat.scene(row);
              push("jump", `↩ ${data.name}${data.next ? ` → ${data.next}` : ""}`);
            } else if (beat.is(row, "choice")) {
              const options = beat.choice(row);
              const first = options[0] && options[0].text
                ? i18n.t("colonPrefix", { text: options[0].text }) : "";
              push("choice", i18n.t("previewChoice", { n: options.length }) + first);
            } else if (beat.is(row, "branch")) {
              walk(beat.branch(row).beats);
            }
          }
        };

        walk(rows);
        return out;
      };

      const previewOfBranches = (list) => {
        let lines = [];
        let hidden = 0;
        (list || []).slice(0, PREVIEW_BRANCH_LINES).forEach((row) => {
          const data = beat.branch(row);
          const label = branchLabel(data).trim();
          if (label) lines.push({ kind: "cond", text: label });
          const sub = beatsPreview(data.beats, { lines: 1, chars: 60 });
          sub.lines.forEach((line) => lines.push(line));
        });
        if ((list || []).length > PREVIEW_BRANCH_LINES) hidden = list.length - PREVIEW_BRANCH_LINES;
        if (lines.length > PREVIEW_TOTAL_LINES) {
          hidden += lines.length - PREVIEW_TOTAL_LINES;
          lines = lines.slice(0, PREVIEW_TOTAL_LINES);
        }
        return { lines, more: hidden };
      };

      const firstLineOf = (node) => {
        if (!node) return "";
        const rows = text.story(store.textLang(), node.id);
        if (!rows) return "";
        const first = beat.firstSay(rows);
        if (!first) return "";
        if (!first.speaker) return first.text;
        return i18n.t("lineSpeaker", { name: speakerName(first.speaker), text: first.text });
      };

      return {
        beatsPreview,
        entryBadge,
        firstLineOf,
        previewOfBranches,
        renderBeats,
        speakerName,
      };
    });
})();
