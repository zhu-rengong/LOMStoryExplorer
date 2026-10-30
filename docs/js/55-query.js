(() => {
  "use strict";

  const SR = window.SR;

  SR.define("query", [], () => {
    const VERSION = 2;

    const FIELDS = [
      { id: "speaker", kind: "text", aliases: ["speaker", "say", "說話", "说话", "說話人", "说话人"] },
      { id: "flag", kind: "text", aliases: ["flag", "flags", "標誌", "标志", "旗標", "旗标"] },
      { id: "check", kind: "text", aliases: ["check", "checks", "檢查點", "检查点", "判定"] },
      { id: "stat", kind: "text", aliases: ["stat", "stats", "屬性", "属性"] },
      { id: "rel", kind: "text", aliases: ["rel", "好感"] },
      { id: "option", kind: "number", aliases: ["option", "options", "選項", "选项"] },
      { id: "lock", kind: "number", aliases: ["lock", "locks", "解鎖", "解锁"] },
      { id: "dice", kind: "number", aliases: ["dice", "骰子"] },
      { id: "out", kind: "number", node: "out", aliases: ["out", "出度"] },
      { id: "in", kind: "number", node: "in", aliases: ["in", "入度"] },
      { id: "saycount", kind: "number", node: "say", aliases: ["saycount", "對白數", "对白数", "对白"] },
      { id: "id", kind: "string", aliases: ["id", "script", "劇本", "剧本"] },
      { id: "chapter", kind: "string", aliases: ["chapter", "章節", "章节"] },
      { id: "text", kind: "string", aliases: ["text", "正文", "關鍵詞", "关键词"] },
      { id: "kind", kind: "enum", aliases: ["kind", "type", "類型", "类型"] },
      { id: "via", kind: "enum", aliases: ["via", "來源", "来源", "拉起"] },
    ];

    const BY_ID = {};
    const BY_ALIAS = {};
    for (const field of FIELDS) {
      BY_ID[field.id] = field;
      for (const alias of field.aliases) BY_ALIAS[alias.toLowerCase()] = field;
    }

    const ROOTS = ["AND", "OR", "NOT", "XOR"];

    const isSpace = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
    const isStop = (ch) => isSpace(ch) || "()!:,=\"'<>".indexOf(ch) >= 0;

    const err = (message, at) => {
      const error = new Error(message);
      error.at = at || 0;
      return error;
    };

    const tokenize = (source) => {
      const tokens = [];
      let index = 0;
      const size = source.length;
      while (index < size) {
        const ch = source[index];
        if (isSpace(ch)) {
          index++;
          continue;
        }
        if (ch === "(" || ch === ")") {
          tokens.push({ type: ch === "(" ? "lparen" : "rparen", value: ch, at: index });
          index++;
          continue;
        }
        if (ch === "'" || ch === '"') {
          const quote = ch;
          const start = ++index;
          let text = "";
          while (index < size && source[index] !== quote) {
            if (source[index] === "\\" && index + 1 < size) {
              text += source[index + 1];
              index += 2;
              continue;
            }
            text += source[index++];
          }
          if (index >= size) throw err("字串沒有結束的引號", start - 1);
          index++;
          tokens.push({ type: "string", value: text, at: start });
          continue;
        }
        if (ch === "&" && source[index + 1] === "&") {
          tokens.push({ type: "op", value: "AND", at: index });
          index += 2;
          continue;
        }
        if (ch === "|" && source[index + 1] === "|") {
          tokens.push({ type: "op", value: "OR", at: index });
          index += 2;
          continue;
        }
        if (ch === "!" && source[index + 1] === "=") {
          tokens.push({ type: "op", value: "!=", at: index });
          index += 2;
          continue;
        }
        if (ch === "!") {
          tokens.push({ type: "op", value: "NOT", at: index });
          index++;
          continue;
        }
        if (ch === ">") {
          if (source[index + 1] === "=") {
            tokens.push({ type: "op", value: ">=", at: index });
            index += 2;
          } else {
            tokens.push({ type: "op", value: ">", at: index });
            index++;
          }
          continue;
        }
        if (ch === "<") {
          if (source[index + 1] === "=") {
            tokens.push({ type: "op", value: "<=", at: index });
            index += 2;
          } else {
            tokens.push({ type: "op", value: "<", at: index });
            index++;
          }
          continue;
        }
        if (ch === "≥") {
          tokens.push({ type: "op", value: ">=", at: index });
          index++;
          continue;
        }
        if (ch === "≤") {
          tokens.push({ type: "op", value: "<=", at: index });
          index++;
          continue;
        }
        if (ch === "=") {
          tokens.push({ type: "op", value: "=", at: index });
          index++;
          continue;
        }
        if (ch === ":") {
          tokens.push({ type: "op", value: ":", at: index });
          index++;
          continue;
        }
        if (ch === ",") {
          tokens.push({ type: "comma", value: ",", at: index });
          index++;
          continue;
        }
        const from = index;
        while (index < size && !isStop(source[index])) index++;
        const word = source.slice(from, index);
        if (!word) throw err(`無法辨識的字元「${ch}」`, index);
        if (/^-?\d+(\.\d+)?$/.test(word)) tokens.push({ type: "number", value: Number(word), at: from });
        else if (ROOTS.indexOf(word.toUpperCase()) >= 0) tokens.push({ type: "op", value: word.toUpperCase(), at: from });
        else if (word === "且") tokens.push({ type: "op", value: "AND", at: from });
        else if (word === "或") tokens.push({ type: "op", value: "OR", at: from });
        else if (word === "非") tokens.push({ type: "op", value: "NOT", at: from });
        else tokens.push({ type: "ident", value: word, at: from });
      }
      tokens.push({ type: "eof", value: "", at: size });
      return tokens;
    };

    class Parser {
      constructor(source) {
        this.source = source;
        this.tokens = tokenize(source);
        this.pos = 0;
      }

      peek(offset) {
        return this.tokens[this.pos + (offset || 0)];
      }

      next() {
        return this.tokens[this.pos++];
      }

      isOp(value, offset) {
        const token = this.peek(offset);
        return token && token.type === "op" && token.value === value;
      }

      parseOr() {
        let node = this.parseAnd();
        while (this.isOp("OR") || this.isOp("XOR")) {
          const op = this.next().value;
          node = { t: op === "OR" ? "or" : "xor", l: node, r: this.parseAnd() };
        }
        return node;
      }

      startsTerm() {
        const token = this.peek();
        if (!token) return false;
        if (token.type === "lparen") return true;
        if (token.type === "op" && token.value === "NOT") return true;
        return token.type === "ident";
      }

      parseAnd() {
        let node = this.parseUnary();
        for (;;) {
          if (this.isOp("AND")) {
            this.next();
            node = { t: "and", l: node, r: this.parseUnary() };
            continue;
          }
          if (this.startsTerm()) {
            node = { t: "and", l: node, r: this.parseUnary() };
            continue;
          }
          return node;
        }
      }

      parseUnary() {
        if (this.isOp("NOT")) {
          this.next();
          return { t: "not", x: this.parseUnary() };
        }
        const token = this.peek();
        if (token.type === "lparen") {
          this.next();
          const inner = this.parseOr();
          if (this.peek().type !== "rparen") throw err("缺少右括號「)」", this.peek().at);
          this.next();
          return inner;
        }
        return this.parseTerm();
      }

      parseTerm() {
        const token = this.peek();
        if (token.type !== "ident") throw err("這裡需要欄位名，例如 speaker:master", token.at);
        this.next();
        const field = BY_ALIAS[token.value.toLowerCase()];
        if (!field) throw err(`未知欄位「${token.value}」`, token.at);

        const opToken = this.peek();
        if (opToken.type !== "op" || [":", "=", "!=", ">", ">=", "<", "<="].indexOf(opToken.value) < 0) {
          throw err(`欄位後面要接運算子，例如 ${field.id}:值`, opToken.at);
        }
        this.next();

        const valueToken = this.peek();
        if (valueToken.type === "op" && valueToken.value === "NOT") throw err("這裡需要值", valueToken.at);
        let raw;
        if (valueToken.type === "string") raw = valueToken.value;
        else if (valueToken.type === "number") raw = valueToken.value;
        else if (valueToken.type === "ident") raw = valueToken.value;
        else throw err("缺少比較值", valueToken.at);
        this.next();

        const op = opToken.value === ":" ? "contains" : ({
          "=": "eq", "!=": "ne", ">": "gt", ">=": "ge", "<": "lt", "<=": "le",
        })[opToken.value];

        if (field.kind !== "number" && ["gt", "ge", "lt", "le"].indexOf(op) >= 0) {
          throw err(`欄位「${field.id}」不支援大小比較`, opToken.at);
        }
        return { t: "term", field: field.id, op, value: raw, at: token.at };
      }
    }

    const parse = (source) => {
      try {
        const parser = new Parser(String(source || ""));
        if (parser.peek().type === "eof") return { ok: true, ast: null };
        const ast = parser.parseOr();
        const rest = parser.peek();
        if (rest.type !== "eof") throw err(`多出來的內容「${rest.value}」`, rest.at);
        return { ok: true, ast };
      } catch (error) {
        return { ok: false, error: { message: error.message || String(error), column: (error.at || 0) + 1 } };
      }
    };

    const allSet = (ctx) => {
      if (!ctx._all) {
        const set = new Set();
        for (let index = 0; index < ctx.count; index++) set.add(index);
        ctx._all = set;
      }
      return ctx._all;
    };

    const union = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const out = new Set(a);
      for (const value of b) out.add(value);
      return out;
    };

    const intersect = (a, b) => {
      if (!a) return b ? new Set(b) : null;
      if (!b) return new Set(a);
      const small = a.size <= b.size ? a : b;
      const big = small === a ? b : a;
      const out = new Set();
      for (const value of small) if (big.has(value)) out.add(value);
      return out;
    };

    const complement = (set, ctx) => {
      const out = new Set();
      for (const value of allSet(ctx)) if (!set || !set.has(value)) out.add(value);
      return out;
    };

    const FACET_KEY = {
      speaker: "speakers", flag: "flags", check: "checks", stat: "stats",
      rel: "rels", option: "options", lock: "locks", dice: "dice",
    };

    const facetKey = (field) => FACET_KEY[field.id] || field.id;

    const valuesOf = (row, field) => {
      const raw = row && row[facetKey(field)];
      if (!raw) return [];
      return Array.isArray(raw) ? raw : String(raw).split(",");
    };

    const valueIndex = (ctx, field) => {
      if (!ctx._index) ctx._index = {};
      if (ctx._index[field.id]) return ctx._index[field.id];
      const map = new Map();
      for (let index = 0; index < ctx.count; index++) {
        for (const key of valuesOf(ctx.facets[index], field)) {
          if (!key) continue;
          let bucket = map.get(key.toLowerCase());
          if (!bucket) {
            bucket = new Set();
            map.set(key.toLowerCase(), bucket);
          }
          bucket.add(index);
        }
      }
      const names = ctx.names && ctx.names[field.id === "speaker" ? "speakers" : `${field.id}s`];
      if (names) {
        for (const key of Object.keys(names)) {
          const bucket = map.get(key.toLowerCase());
          if (!bucket) continue;
          const label = String(names[key] || "").toLowerCase();
          if (!label || label === key.toLowerCase()) continue;
          let named = map.get(label);
          if (!named) {
            named = new Set();
            map.set(label, named);
          }
          for (const value of bucket) named.add(value);
        }
      }
      ctx._index[field.id] = map;
      return map;
    };

    const textSet = (term, ctx, field) => {
      const map = valueIndex(ctx, field);
      const needle = String(term.value).toLowerCase();
      const out = new Set();
      if (needle === "*") {
        for (const bucket of map.values()) for (const value of bucket) out.add(value);
        return term.op === "ne" ? complement(out, ctx) : out;
      }
      if (term.op === "eq" || term.op === "ne") {
        const hit = map.get(needle);
        if (hit) for (const value of hit) out.add(value);
        return term.op === "ne" ? complement(out, ctx) : out;
      }
      for (const [key, bucket] of map) {
        if (key.indexOf(needle) >= 0) for (const value of bucket) out.add(value);
      }
      return out;
    };

    const numberSet = (term, ctx, field) => {
      const text = String(term.value).trim().toLowerCase();
      let op = term.op;
      let needle;
      if (text === "yes" || text === "y" || text === "true" || text === "是") {
        needle = 1;
        if (op === "contains" || op === "eq") op = "ge";
      } else if (text === "no" || text === "n" || text === "false" || text === "否") {
        needle = 0;
        if (op === "contains") op = "eq";
      } else {
        needle = Number(text);
      }
      if (!Number.isFinite(needle)) throw err(`欄位「${field.id}」需要數字`, term.at);

      const out = new Set();
      for (let index = 0; index < ctx.count; index++) {
        const value = field.node
          ? ctx.nodes[index][field.node]
          : (ctx.facets[index] && ctx.facets[index][facetKey(field)]) || 0;
        let pass = false;
        switch (op) {
          case "contains": case "eq": pass = value === needle; break;
          case "ne": pass = value !== needle; break;
          case "gt": pass = value > needle; break;
          case "ge": pass = value >= needle; break;
          case "lt": pass = value < needle; break;
          case "le": pass = value <= needle; break;
        }
        if (pass) out.add(index);
      }
      return out;
    };

    const VIA_VALUES = ["combat", "free", "position"];

    const VIA_ALIAS = {
      "戰鬥": "combat", "战斗": "combat", "戰鬥事件": "combat", "战斗事件": "combat",
      "場所腳本": "free", "场所脚本": "free", "執行腳本": "free", "执行脚本": "free",
      "場所事件": "position", "场所事件": "position", "any": "position",
      "系統": "position", "系统": "position",
    };

    const viaCanon = (value) => {
      const text = String(value).toLowerCase();
      return VIA_ALIAS[text] || text;
    };

    const viaPass = (node, index, ctx, value) => {
      if (value === "combat") return node.entry === "combat";
      if (value === "free") return node.entry === "free";
      return !!(ctx.edgeKinds[index] & 4) || (node.systemIn || 0) > 0;
    };

    const viaSet = (term, ctx) => {
      const value = viaCanon(term.value);
      if (VIA_VALUES.indexOf(value) < 0) {
        throw err(`未知來源「${term.value}」（可用 combat/free/position）`, term.at);
      }
      const out = new Set();
      for (let index = 0; index < ctx.count; index++) {
        if (viaPass(ctx.nodes[index], index, ctx, value)) out.add(index);
      }
      return term.op === "ne" ? complement(out, ctx) : out;
    };

    const enumSet = (term, ctx, field) => {
      if (field.id === "via") return viaSet(term, ctx);
      const value = String(term.value).toLowerCase();
      const out = new Set();
      for (let index = 0; index < ctx.count; index++) {
        const node = ctx.nodes[index];
        let pass = false;
        switch (value) {
          case "entry": case "入口": pass = node.in === 0; break;
          case "leaf": case "ending": case "結局": case "结局": pass = node.out === 0; break;
          case "orphan": case "孤立": pass = node.in === 0 && node.out === 0; break;
          case "temp": case "臨時": case "临时": pass = !!(ctx.edgeKinds[index] & 2); break;
          case "inferred": case "推斷": case "推断": pass = !!(ctx.edgeKinds[index] & 1); break;
          case "sys": case "系統": case "系统": case "place": case "場所": case "场所":
            pass = !!(ctx.edgeKinds[index] & 4) || (node.systemIn || 0) > 0;
            break;
          case "jump": case "跳轉": case "跳转": pass = node.out > 0; break;
          default:
            throw err(`未知類型「${term.value}」（可用 entry/leaf/orphan/temp/inferred/sys/jump）`, term.at);
        }
        if (pass) out.add(index);
      }
      return term.op === "ne" ? complement(out, ctx) : out;
    };

    const stringSet = (term, ctx, field) => {
      const needle = String(term.value).toLowerCase();
      const out = new Set();
      for (let index = 0; index < ctx.count; index++) {
        let haystack;
        if (field.id === "id") {
          haystack = ctx.nodes[index].id.toLowerCase();
        } else if (field.id === "chapter") {
          const chapter = ctx.chapters[ctx.nodes[index].chapter] || {};
          haystack = `${chapter.title || ""} ${chapter.id || ""}`.toLowerCase();
        } else {
          haystack = ctx.textOf(index) || "";
        }
        let pass = term.op === "eq" ? haystack === needle : haystack.indexOf(needle) >= 0;
        if (term.op === "ne") pass = !pass;
        if (pass) out.add(index);
      }
      return out;
    };

    const evalNode = (node, ctx) => {
      if (!node) return allSet(ctx);
      switch (node.t) {
        case "or": return union(evalNode(node.l, ctx), evalNode(node.r, ctx));
        case "xor": {
          const a = evalNode(node.l, ctx);
          const b = evalNode(node.r, ctx);
          const only = new Set();
          for (const value of a) if (!b.has(value)) only.add(value);
          for (const value of b) if (!a.has(value)) only.add(value);
          return only;
        }
        case "and": return intersect(evalNode(node.l, ctx), evalNode(node.r, ctx));
        case "not": return complement(evalNode(node.x, ctx), ctx);
        case "term": {
          const field = BY_ID[node.field];
          if (field.kind === "number") return numberSet(node, ctx, field);
          if (field.kind === "enum") return enumSet(node, ctx, field);
          if (field.kind === "string") return stringSet(node, ctx, field);
          return textSet(node, ctx, field);
        }
      }
      return allSet(ctx);
    };

    const evaluate = (ast, ctx) => {
      try {
        return { ok: true, set: evalNode(ast, ctx) };
      } catch (error) {
        return { ok: false, error: { message: error.message || String(error), column: (error.at || 0) + 1 } };
      }
    };

    const compile = (source, ctx) => {
      const parsed = parse(source);
      if (!parsed.ok) return parsed;
      if (!parsed.ast) return { ok: true, ast: null, set: null };
      const result = evaluate(parsed.ast, ctx);
      if (!result.ok) return result;
      return { ok: true, ast: parsed.ast, set: result.set };
    };

    const KIND_VALUES = ["entry", "leaf", "orphan", "temp", "inferred", "sys", "jump"];

    const kindCount = (ctx, value) => {
      let count = 0;
      for (let index = 0; index < ctx.count; index++) {
        const node = ctx.nodes[index];
        let pass = false;
        switch (value) {
          case "entry": pass = node.in === 0; break;
          case "leaf": pass = node.out === 0; break;
          case "orphan": pass = node.in === 0 && node.out === 0; break;
          case "temp": pass = !!(ctx.edgeKinds[index] & 2); break;
          case "inferred": pass = !!(ctx.edgeKinds[index] & 1); break;
          case "sys": pass = !!(ctx.edgeKinds[index] & 4) || (node.systemIn || 0) > 0; break;
          case "jump": pass = node.out > 0; break;
        }
        if (pass) count++;
      }
      return count;
    };

    const values = (fieldId, ctx) => {
      const field = BY_ID[fieldId];
      if (!field) return [];
      if (field.id === "kind") {
        return KIND_VALUES.map((value) => ({ value, label: "", count: kindCount(ctx, value) }))
          .sort((a, b) => b.count - a.count);
      }
      if (field.id === "via") {
        return VIA_VALUES.map((value) => {
          let count = 0;
          for (let index = 0; index < ctx.count; index++) {
            if (viaPass(ctx.nodes[index], index, ctx, value)) count++;
          }
          return { value, label: "", count };
        });
      }
      if (field.id === "chapter") {
        return ctx.chapters.map((chapter) => ({
          value: chapter.title || chapter.id,
          label: chapter.id,
          count: chapter.count || 0,
        }));
      }
      if (field.kind !== "text") return [];
      if (!ctx._values) ctx._values = {};
      if (ctx._values[field.id]) return ctx._values[field.id];

      const counts = new Map();
      for (let index = 0; index < ctx.count; index++) {
        for (const key of valuesOf(ctx.facets[index], field)) {
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      const names = ctx.names && ctx.names[field.id === "speaker" ? "speakers" : `${field.id}s`];
      const out = [];
      for (const [key, count] of counts) {
        out.push({ value: key, label: (names && names[key]) || "", count });
      }
      out.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
      ctx._values[field.id] = out;
      return out;
    };

    const termStart = (source, cursor) => {
      let start = 0;
      let quote = null;
      let index = 0;
      while (index < cursor) {
        const ch = source[index];
        if (quote) {
          if (ch === quote) quote = null;
          index++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          index++;
          continue;
        }
        if (ch === "(" || ch === ")") {
          start = index + 1;
          index++;
          continue;
        }
        const boundary = index === 0 || /[\s()]/.test(source[index - 1]);
        if (boundary) {
          const rest = source.slice(index, cursor);
          const word = /^(AND|OR|NOT|XOR)(?=[\s(]|$)/i.exec(rest) || /^(且|或|非)(?=[\s(]|$)/.exec(rest);
          if (word) {
            start = index + word[0].length;
            index = start;
            continue;
          }
        }
        index++;
      }
      while (start < cursor && /\s/.test(source[start])) start++;
      return start;
    };

    const findOperator = (segment) => {
      let quote = null;
      for (let index = 0; index < segment.length; index++) {
        const ch = segment[index];
        if (quote) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }
        if (":=><!".indexOf(ch) >= 0) return index;
      }
      return -1;
    };

    const needsQuote = (value) => !/^[A-Za-z0-9_.\-\u4e00-\u9fff]+$/.test(value);

    const formatInsert = (value, quoted) => {
      if (!quoted && !needsQuote(value)) return value;
      return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    };

    const rank = (items, prefix) => {
      const needle = String(prefix || "").toLowerCase();
      const scored = [];
      for (const item of items) {
        const text = String(item.value).toLowerCase();
        const label = String(item.label || "").toLowerCase();
        let score = -1;
        if (!needle) score = 0;
        else if (text.indexOf(needle) === 0 || label.indexOf(needle) === 0) score = 0;
        else if (text.indexOf(needle) >= 0 || label.indexOf(needle) >= 0) score = 1;
        if (score < 0) continue;
        scored.push({ item, score });
      }
      scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : (b.item.count || 0) - (a.item.count || 0)));
      return scored.map((entry) => entry.item);
    };

    const suggest = (source, cursor, ctx) => {
      source = String(source || "");
      if (cursor === undefined || cursor === null || cursor > source.length) cursor = source.length;
      const start = termStart(source, cursor);
      const segment = source.slice(start, cursor);
      const opIndex = findOperator(segment);

      if (opIndex < 0) {
        const prefix = segment.trim();
        const fields = FIELDS.map((field) => ({
          value: field.id,
          label: field.aliases.slice(1).join(" / "),
          count: null,
          insert: `${field.id}:`,
          kind: "field",
        }));
        if (!prefix) {
          fields.push({ value: "NOT", label: "", count: null, insert: "NOT ", kind: "logic" });
          fields.push({ value: "(", label: "", count: null, insert: "(", kind: "logic" });
        }
        return {
          mode: "field",
          field: null,
          from: start + (segment.length - segment.replace(/^\s+/, "").length),
          to: cursor,
          prefix,
          items: rank(fields, prefix).slice(0, 30),
        };
      }

      const fieldText = segment.slice(0, opIndex).trim();
      const field = BY_ALIAS[fieldText.toLowerCase()];
      if (!field) {
        return { mode: "field", field: null, from: start, to: cursor, prefix: fieldText, items: [] };
      }

      const rest = segment.slice(opIndex);
      const opMatch = /^(>=|<=|!=|[:=<>])/.exec(rest);
      const opEnd = opIndex + (opMatch ? opMatch[0].length : 1);
      let valueStart = start + opEnd;
      while (valueStart < cursor && /\s/.test(source[valueStart])) valueStart++;

      let quoted = false;
      if (source[valueStart] === '"' || source[valueStart] === "'") {
        quoted = true;
        valueStart += 1;
      }
      const valuePrefix = source.slice(valueStart, cursor);

      const candidates = [];
      if (field.kind === "number") {
        candidates.push({ value: "yes", label: "", count: null, insert: "yes" });
        candidates.push({ value: "no", label: "", count: null, insert: "no" });
        for (const number of [0, 1, 2, 3, 5, 10]) {
          candidates.push({ value: String(number), label: "", count: null, insert: String(number) });
        }
      } else {
        for (const entry of values(field.id, ctx)) {
          candidates.push({
            value: entry.value,
            label: entry.label,
            count: entry.count,
            insert: formatInsert(entry.value, quoted),
          });
        }
      }

      return {
        mode: "value",
        field: field.id,
        from: valueStart,
        to: cursor,
        prefix: valuePrefix,
        quoted,
        items: rank(candidates, valuePrefix).slice(0, 30),
      };
    };

    return {
      FIELDS,
      KIND_VALUES: KIND_VALUES.slice(),
      VERSION,
      VIA_VALUES: VIA_VALUES.slice(),
      compile,
      evaluate,
      fields: () => FIELDS.slice(),
      parse,
      suggest,
      values,
    };
  });
})();
