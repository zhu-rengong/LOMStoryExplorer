(() => {
  "use strict";
  const SR = window.SR;
  const { dom } = SR.core;
  const state = SR.store.state;
  let loadId = 0;
  let currentBeats = [];
  const appendRich = (parent, text) => {
    const stack = [];
    let last = 0;
    for (const match of String(text).matchAll(/\{([^{}]*)\}/g)) {
      if (match.index > last) appendSegment(parent, text.slice(last, match.index), stack);
      const tag = match[1].trim().toLowerCase();
      if (tag.startsWith("/size")) stack.pop();
      else if (tag.startsWith("size") && tag.includes("=")) {
        const size = Number.parseFloat(tag.split("=")[1]);
        stack.push(Number.isFinite(size) ? SR.core.clamp(size / 40, 0.72, 1.9) : 1);
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) appendSegment(parent, text.slice(last), stack);
  };
  const appendSegment = (parent, text, stack) => {
    if (!text) return;
    if (!stack.length) {
      parent.append(document.createTextNode(text));
      return;
    }
    parent.append(dom.h("span", { style: `font-size:${stack.at(-1).toFixed(2)}em`, text }));
  };
  const renderSay = (beat, langPack) => {
    const [, speaker, text, mode] = beat;
    const block = dom.h("section", { class: `beat-say is-${mode}` });
    if (speaker) block.append(dom.h("div", { class: "speaker", text: langPack?.characters[speaker] || speaker }));
    const paragraph = dom.h("p", { class: "story-text" });
    appendRich(paragraph, text);
    block.append(paragraph);
    return block;
  };
  const renderBeats = (beats, langPack) => {
    const fragment = document.createDocumentFragment();
    for (const beat of beats || []) {
      const [tag] = beat;
      if (tag === "s") fragment.append(renderSay(beat, langPack));
      else if (tag === "m") fragment.append(dom.h("aside", { class: "beat-meta" }, dom.icon("spark"), dom.h("span", { text: beat[1] })));
      else if (tag === "l") fragment.append(dom.h("blockquote", { class: "beat-lore" }, dom.h("span", { class: "eyebrow", text: SR.i18n.t("lore") }), dom.h("p", { text: beat[1] })));
      else if (tag === "j") {
        const [, target, label, relation] = beat;
        fragment.append(dom.h("div", { class: "beat-jump" },
          target ? dom.h("button", { class: "text-link", type: "button", dataset: { story: target } }, dom.icon("arrow"), dom.h("span", { text: target })) :
            dom.h("span", { text: label || relation })));
      } else if (tag === "b") {
        const [, label, body, kind] = beat;
        const details = dom.h("details", { class: `story-branch is-${kind}` });
        details.append(dom.h("summary", {}, dom.h("span", { class: "branch-sigil", text: "枝" }), dom.h("span", { text: label }), dom.icon("chevron")));
        details.append(dom.h("div", { class: "branch-body" }, renderBeats(body, langPack)));
        fragment.append(details);
      } else if (tag === "c") {
        const [, menu, options] = beat;
        const group = dom.h("section", { class: "choice-group" }, dom.h("div", { class: "choice-heading" }, dom.h("span", { class: "eyebrow", text: `${SR.i18n.t("choices")} · ${menu}` })));
        for (const option of options) {
          const [text, note, body, lock, availability, index] = option;
          const details = dom.h("details", { class: "choice-option" });
          const summary = dom.h("summary", {},
            dom.h("span", { class: "option-index", text: String(index).padStart(2, "0") }),
            dom.h("span", { class: "option-copy" }, dom.h("span", { class: "option-text", text }),
              note ? dom.h("span", { class: "option-note", text: note }) : null,
              lock ? dom.h("span", { class: "option-lock", text: lock }) : null,
              availability ? dom.h("span", { class: "option-condition", text: `${SR.i18n.t("condition")}: ${availability}` }) : null),
            dom.icon("chevron"));
          details.append(summary);
          if (body.length) details.append(dom.h("div", { class: "choice-body" }, renderBeats(body, langPack)));
          group.append(details);
        }
        fragment.append(group);
      }
    }
    return fragment;
  };
  const renderEmpty = () => {
    currentBeats = [];
    dom.byId("readerTitle").textContent = SR.i18n.t("emptyTitle");
    dom.byId("readerChapter").textContent = SR.i18n.t("appSubtitle");
    dom.byId("readerId").textContent = "";
    dom.byId("readerActions").hidden = true;
    dom.clear(dom.byId("readerContent")).append(dom.h("div", { class: "reader-empty" },
      dom.h("div", { class: "empty-seal", text: "活" }),
      dom.h("h3", { text: SR.i18n.t("emptyTitle") }),
      dom.h("p", { text: SR.i18n.t("emptyBody") }),
      dom.h("button", { class: "primary-button", type: "button", onclick: () => SR.store.actions.mobileView("library") }, dom.icon("library"), SR.i18n.t("library"))));
    dom.byId("readerFooter").hidden = true;
  };
  const render = () => {
    const id = state.selectedId;
    if (!id) {
      if (state.storyStatus === "error") {
        currentBeats = [];
        dom.byId("readerTitle").textContent = SR.i18n.t("dataError");
        dom.byId("readerChapter").textContent = SR.i18n.t("appSubtitle");
        dom.byId("readerActions").hidden = true;
        dom.byId("readerFooter").hidden = true;
        dom.clear(dom.byId("readerContent")).append(dom.h("div", { class: "reader-error" },
          dom.h("h3", { text: SR.i18n.t("dataError") }), dom.h("p", { text: state.storyError }),
          dom.h("button", { class: "primary-button", type: "button", onclick: SR.router.home }, SR.i18n.t("back"))));
      } else renderEmpty();
      return;
    }
    const node = SR.data.node(id);
    const chapter = SR.data.chapter(node.chapter);
    dom.byId("readerTitle").textContent = id;
    dom.byId("readerId").textContent = id;
    dom.byId("readerChapter").textContent = [SR.i18n.chapterTitle(chapter), SR.i18n.date(node.date), SR.i18n.source(node.entry)].filter(Boolean).join(" · ");
    dom.byId("readerActions").hidden = false;
    dom.byId("readerFooter").hidden = false;
    const root = dom.byId("readerContent");
    dom.clear(root);
    if (state.storyStatus === "loading") {
      currentBeats = [];
      root.append(dom.h("div", { class: "reader-loading" }, dom.h("span", { class: "loading-ring" }), dom.h("p", { text: SR.i18n.t("loadingStory") })));
      return;
    }
    if (state.storyStatus === "error") {
      currentBeats = [];
      root.append(dom.h("div", { class: "reader-error" }, dom.h("h3", { text: SR.i18n.t("dataError") }), dom.h("p", { text: state.storyError }),
        dom.h("button", { class: "primary-button", type: "button", onclick: load }, SR.i18n.t("retry"))));
      return;
    }
    const story = SR.text.get(id, state.lang) || [];
    currentBeats = story;
    if (!story.length) root.append(dom.h("div", { class: "reader-empty" }, dom.h("p", { text: SR.i18n.t("emptySearch") })));
    else root.append(dom.h("article", { class: "story-article" }, renderBeats(story, SR.text.packOf(state.lang))));
    updateBookmark();
  };
  const updateBookmark = () => {
    const active = state.bookmarks.includes(state.selectedId);
    const button = dom.byId("bookmarkButton");
    button.classList.toggle("is-active", active);
    button.title = SR.i18n.t(active ? "bookmarkRemove" : "bookmarkAdd");
    button.setAttribute("aria-label", button.title);
  };
  const restoreProgress = () => {
    const scroller = dom.byId("readerScroll");
    const value = state.progress[state.selectedId] || 0;
    requestAnimationFrame(() => {
      const maximum = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = maximum * value;
      updateProgress();
    });
  };
  const updateProgress = () => {
    const scroller = dom.byId("readerScroll");
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const value = maximum ? scroller.scrollTop / maximum : 1;
    dom.byId("readProgress").style.transform = `scaleX(${value})`;
    dom.byId("progressLabel").textContent = `${Math.round(value * 100)}%`;
    return value;
  };
  const saveProgress = SR.core.debounce(() => {
    if (state.selectedId) SR.store.actions.progress(state.selectedId, updateProgress());
  }, 220);
  const load = async () => {
    const id = state.selectedId;
    if (!id) {
      render();
      return;
    }
    const current = ++loadId;
    const lang = state.lang;
    SR.store.actions.story("loading");
    try {
      await SR.text.loadStory(id, lang);
      if (current !== loadId || state.selectedId !== id || state.lang !== lang) return;
      SR.store.actions.story("ready");
      SR.store.actions.record(id);
      restoreProgress();
      SR.text.prefetch(SR.data.outgoing(id).map((edge) => edge.target.id), lang);
    } catch (error) {
      if (current === loadId) SR.store.actions.story("error", error.message);
    }
  };
  const init = () => {
    dom.byId("readerScroll").addEventListener("scroll", () => {
      updateProgress();
      saveProgress();
    }, { passive: true });
    dom.byId("bookmarkButton").addEventListener("click", () => SR.store.actions.bookmark(state.selectedId));
    dom.byId("copyIdButton").addEventListener("click", async () => {
      if (!state.selectedId) return;
      await SR.overlays.copyText(state.selectedId);
      SR.overlays.toast(SR.i18n.t("copied"));
    });
    dom.byId("copyLinkButton").addEventListener("click", async () => {
      await SR.overlays.copyText(location.href);
      SR.overlays.toast(SR.i18n.t("linkCopied"));
    });
  };
  SR.register("reader", { init, load, render, updateBookmark, get currentBeats() { return currentBeats; } });
})();
