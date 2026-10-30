(() => {
  "use strict";
  const SR = window.SR;
  const chapterNames = {
    scene: ["場景互動", "场景互动"], work: ["勞作雜務", "劳作杂务"], travel: ["旅途見聞", "旅途见闻"],
    free: ["自由模式", "自由模式"], section: ["場景段落", "场景段落"], misc: ["雜項事件", "杂项事件"], other: ["其他劇本", "其他剧本"],
  };
  const lang = () => SR.store.state.lang === "zh-cn" ? "zh-cn" : "zh-tw";
  const t = (key) => SR.i18nDict[lang()][key] || SR.i18nDict["zh-tw"][key] || key;
  const apply = (root = document) => {
    for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
    for (const node of root.querySelectorAll("[data-i18n-placeholder]")) node.placeholder = t(node.dataset.i18nPlaceholder);
    for (const node of root.querySelectorAll("[data-i18n-title]")) {
      node.title = t(node.dataset.i18nTitle);
      node.setAttribute("aria-label", t(node.dataset.i18nTitle));
    }
    document.documentElement.lang = lang() === "zh-cn" ? "zh-Hans" : "zh-Hant";
  };
  const chapterTitle = (chapter) => {
    if (!chapter) return "";
    if (chapterNames[chapter.id]) return chapterNames[chapter.id][lang() === "zh-cn" ? 1 : 0];
    if (lang() === "zh-cn") return chapter.title.replace("場", "场").replace("雜", "杂");
    return chapter.title;
  };
  const date = (rounds) => {
    if (!rounds) return "";
    const index = Math.max(0, rounds - 1);
    const year = Math.floor(index / 36) + 1;
    const month = Math.floor((index % 36) / 3) + 1;
    const stages = lang() === "zh-cn" ? ["上旬", "中旬", "下旬"] : ["上旬", "中旬", "下旬"];
    return `${year}年${month}月${stages[index % 3]}`;
  };
  const source = (value) => ({ "new-game": t("newGame"), "new-chapter": t("newChapter"), combat: t("combat"), free: t("free") }[value] || value);
  SR.register("i18n", { t, apply, chapterTitle, date, source });
})();
