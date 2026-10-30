(() => {
  "use strict";
  const SR = window.SR;
  const { dom } = SR.core;
  const state = SR.store.state;
  const edgeLabel = (edge) => edge.kind === "position" ? edge.label.replace("Position event:", SR.i18n.t("context") + ":") : edge.label;
  const edgeList = (title, edges, outgoing) => {
    const section = dom.h("section", { class: "context-section" }, dom.h("h3", { text: title }), dom.h("span", { class: "context-count", text: edges.length }));
    if (!edges.length) section.append(dom.h("p", { class: "context-empty", text: "—" }));
    for (const edge of edges) {
      const node = outgoing ? edge.target : edge.source;
      section.append(dom.h("button", { class: "context-link", type: "button", dataset: { story: node.id } },
        dom.h("span", { class: `relation-mark is-${edge.kind}` }),
        dom.h("span", { class: "context-link-copy" }, dom.h("strong", { text: node.id }),
          edgeLabel(edge) ? dom.h("small", { text: edgeLabel(edge) }) : null),
        dom.icon("arrow")));
    }
    return section;
  };
  const outlineRows = (beats, depth = 0) => {
    const fragment = document.createDocumentFragment();
    for (const beat of beats || []) {
      if (beat[0] === "b") {
        fragment.append(dom.h("div", { class: "outline-row", style: `--depth:${depth}` }, dom.h("span", { text: beat[1] })));
        fragment.append(outlineRows(beat[2], depth + 1));
      } else if (beat[0] === "c") {
        for (const option of beat[2]) {
          fragment.append(dom.h("div", { class: "outline-row is-choice", style: `--depth:${depth}` }, dom.h("span", { text: option[0] })));
          fragment.append(outlineRows(option[2], depth + 1));
        }
      }
    }
    return fragment;
  };
  const render = () => {
    const id = state.selectedId;
    const root = dom.byId("contextContent");
    dom.clear(root);
    document.body.classList.toggle("has-context", Boolean(id && state.contextOpen));
    if (!id) {
      root.append(dom.h("p", { class: "context-empty", text: "—" }));
      return;
    }
    const outgoing = SR.data.outgoing(id);
    const incoming = SR.data.incoming(id);
    root.append(edgeList(SR.i18n.t("outgoing"), outgoing, true));
    root.append(edgeList(SR.i18n.t("incoming"), incoming, false));
    const outline = dom.h("section", { class: "context-section context-outline" }, dom.h("h3", { text: SR.i18n.t("outline") }));
    outline.append(outlineRows(SR.reader.currentBeats));
    root.append(outline);
    const next = outgoing.find((edge) => edge.kind === "next") || outgoing[0];
    const button = dom.byId("continueButton");
    button.disabled = !outgoing.length;
    button.title = outgoing.length ? `${SR.i18n.t("next")} · ${outgoing.length}` : SR.i18n.t("noNext");
    button.dataset.next = next?.target.id || "";
    dom.byId("contextButton").classList.toggle("is-active", state.contextOpen);
  };
  const init = () => {
    dom.byId("contextButton").addEventListener("click", () => SR.store.actions.context(!state.contextOpen));
    dom.byId("contextClose").addEventListener("click", () => SR.store.actions.context(false));
    dom.byId("continueButton").addEventListener("click", () => {
      const outgoing = SR.data.outgoing(state.selectedId);
      if (!outgoing.length) return;
      if (outgoing.length === 1) SR.router.go(outgoing[0].target.id);
      else SR.store.actions.context(true);
    });
    dom.byId("historyBack").addEventListener("click", () => history.back());
    dom.byId("historyForward").addEventListener("click", () => history.forward());
  };
  SR.register("navigation", { init, render });
})();
