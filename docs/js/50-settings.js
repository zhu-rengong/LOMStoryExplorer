(() => {
  "use strict";

  const SR = window.SR;

  const FONT_CANDIDATES = [...new Set([
    "Microsoft YaHei", "Microsoft YaHei UI", "Microsoft JhengHei", "Microsoft JhengHei UI",
    "SimSun", "SimSun-ExtB", "NSimSun", "SimHei", "KaiTi", "FangSong", "DengXian",
    "YouYuan", "LiSu", "MingLiU", "MingLiU_HKSCS", "PMingLiU", "DFKai-SB", "BiauKai",
    "STKaiti", "STSong", "STXihei", "STZhongsong", "STFangsong", "STHupo", "STLiti",
    "STXingkai", "STXinwei", "STCaiyun", "Source Han Sans TC", "Source Han Sans SC",
    "Source Han Serif TC", "Source Han Serif SC", "Noto Sans TC", "Noto Sans SC",
    "Noto Serif TC", "Noto Serif SC", "Noto Sans CJK TC", "Noto Serif CJK TC",
    "LXGW WenKai", "LXGW WenKai TC", "Sarasa Mono TC", "Sarasa Gothic TC",
    "PingFang TC", "PingFang SC", "Songti TC", "Songti SC", "Kaiti TC", "Kaiti SC",
    "Yuanti TC", "Yuanti SC", "Heiti TC", "Heiti SC", "Hiragino Sans GB",
    "Lantinghei TC", "Lantinghei SC", "HanHei TC", "HanHei SC",
    "Yu Gothic", "Yu Mincho", "Meiryo", "MS Gothic", "MS Mincho",
    "Hiragino Kaku Gothic ProN", "Hiragino Mincho ProN", "Malgun Gothic",
    "Apple SD Gothic Neo", "NanumGothic",
    "Segoe UI", "Segoe UI Variable", "Segoe UI Variable Display", "Segoe UI Variable Text",
    "Arial", "Arial Black", "Tahoma", "Verdana", "Georgia", "Times New Roman",
    "Cambria", "Calibri", "Trebuchet MS", "Palatino Linotype", "Book Antiqua",
    "Franklin Gothic Medium", "Century Gothic", "Lucida Console", "Lucida Sans Unicode",
    "Helvetica Neue", "Helvetica", "Optima", "Baskerville", "Futura", "Gill Sans",
    "Rockwell", "Consolas", "Cascadia Mono", "Cascadia Code", "Courier New",
    "SF Mono", "Menlo", "Monaco", "JetBrains Mono", "Fira Code", "Hack",
    "IBM Plex Mono", "Roboto Mono", "Source Code Pro", "Ubuntu Mono",
    "DejaVu Sans Mono", "Liberation Mono", "Noto Sans Mono", "Inconsolata",
  ])];

  const PROBE_TEXT = "mmmmmmmmmmlli WWW 中文測試";
  const BASELINES = ["monospace", "serif", "sans-serif"];
  const NOISE = /Wingdings|Webdings|Marlett|Symbol|Segoe MDL2|Segoe Fluent|Segoe UI Emoji|Segoe UI Symbol|Bookshelf Symbol|MS Reference|MT Extra|MS Outlook/i;
  const CJK_HINT = /[\u3400-\u9fff]|YaHei|JhengHei|SimSun|SimHei|KaiTi|FangSong|DengXian|YouYuan|LiSu|MingLiU|Songti|Yuanti|Heiti|PingFang|Hiragino|Noto|Source Han|Sarasa|LXGW|STKaiti|STSong|STXihei|STZhongsong|DFKai|BiauKai|Yu Gothic|Yu Mincho|Meiryo|MS Gothic|MS Mincho|Malgun|Nanum/i;

  SR.define("settings", ["prefs"], ({ prefs }) => {
    let detected = null;
    let pending = null;

    const measureWidth = (context, font) => {
      context.font = `72px ${font}`;
      return context.measureText(PROBE_TEXT).width;
    };

    const probeFamilies = () => {
      try {
        const context = document.createElement("canvas").getContext("2d");
        if (!context) return null;
        const baselines = BASELINES.map((base) => measureWidth(context, base));
        const found = [];
        for (const family of FONT_CANDIDATES) {
          const quoted = `"${family.replace(/"/g, "")}"`;
          let available = false;
          for (let index = 0; index < BASELINES.length && !available; index++) {
            if (measureWidth(context, `${quoted}, ${BASELINES[index]}`) !== baselines[index]) {
              available = true;
            }
          }
          if (available) found.push(family);
        }
        return found.length ? found : null;
      } catch {
        return null;
      }
    };

    const orderFamilies = (names) => {
      const seen = new Set();
      const unique = [];
      for (const name of names) {
        const clean = String(name || "").trim();
        if (!clean || clean.startsWith("@") || NOISE.test(clean)) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(clean);
      }
      const cjk = unique.filter((name) => CJK_HINT.test(name)).sort((a, b) => a.localeCompare(b));
      const rest = unique.filter((name) => !CJK_HINT.test(name)).sort((a, b) => a.localeCompare(b));
      return cjk.concat(rest);
    };

    const enumerateFamilies = async () => {
      if (typeof window.queryLocalFonts !== "function") return null;
      try {
        const fonts = await window.queryLocalFonts();
        const list = orderFamilies(fonts.map((font) => font.family));
        return list.length ? list : null;
      } catch {
        return null;
      }
    };

    const ensureFamilies = () => {
      if (detected) return Promise.resolve(detected);
      if (pending) return pending;
      pending = (async () => {
        const found = (await enumerateFamilies()) || probeFamilies();
        if (found && found.length) {
          detected = found;
          document.dispatchEvent(new CustomEvent("sr:fonts", { detail: { families: found } }));
        }
        pending = null;
        return detected || FONT_CANDIDATES;
      })();
      return pending;
    };

    const families = () => detected || FONT_CANDIDATES;

    return {
      ...prefs,
      ensureFamilies,
      families,
      onFamilies: (fn) => {
        const handler = (event) => fn(event.detail.families);
        document.addEventListener("sr:fonts", handler);
        return () => document.removeEventListener("sr:fonts", handler);
      },
    };
  });
})();
