(() => {
  "use strict";
  const SR = window.SR;
  if (!SR || !SR.core) return;

  const $ = SR.core.$;
  const el = SR.core.el;
  const overlay = SR.overlay;
  const stepNext = SR.reader.stepNext;
  const stepPrev = SR.actions.stepPrev;
  const t = SR.i18n.t;
  const toggleSelectedBookmark = SR.actions.toggleSelectedBookmark;

  let helpOpen = false;

  const HELP_GROUPS = [
    {
      title: "helpGroupNav",
      rows: [
        ["/", "hkSearch"],
        ["← / →", "hkHistory"],
      ],
    },
    {
      title: "helpGroupRead",
      rows: [
        ["[", "hkPrev"],
        ["]", "hkNext"],
        ["B", "hkBookmark"],
        ["?", "hkHelp"],
        ["Esc", "hkEsc"],
        ["Tab", "hkTab"],
      ],
    },
    {
      title: "helpGroupFilter",
      rows: [
        ["speaker:…", "hkFilterExpr"],
        ["Ctrl+Enter", "hkFilterApply"],
      ],
    },
  ];

  const renderHelp = () => {
    const body = $("helpBody");
    if (!body) return;
    body.replaceChildren();
    HELP_GROUPS.forEach((group) => {
      const section = el("section", "help-group");
      section.appendChild(el("h3", "help-group-title", t(group.title)));
      const list = el("dl", "help-list");
      group.rows.forEach((row) => {
        list.appendChild(el("dt", "help-key", row[0]));
        list.appendChild(el("dd", "help-desc", t(row[1])));
      });
      section.appendChild(list);
      body.appendChild(section);
    });
  };

  const hideHelpRaw = () => {
    const panel = $("helpPanel");
    if (panel) panel.hidden = true;
    helpOpen = false;
    const btn = $("helpBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  };

  const openHelp = () => {
    const panel = $("helpPanel");
    if (!panel || helpOpen) return;
    renderHelp();
    helpOpen = true;
    const btn = $("helpBtn");
    if (btn) btn.setAttribute("aria-expanded", "true");
    overlay.open("help", { trigger: btn, autofocus: "helpClose" });
  };

  const closeHelp = () => {
    if (!overlay.close("help")) hideHelpRaw();
  };

  const toggleHelp = () => {
    if (helpOpen) closeHelp();
    else openHelp();
  };

  const typingInField = () => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = (active.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || active.isContentEditable;
  };

  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "?" && !typingInField()) {
      event.preventDefault();
      toggleHelp();
      return;
    }
    if (typingInField()) return;
    if (event.key === "[") {
      event.preventDefault();
      stepPrev();
      return;
    }
    if (event.key === "]") {
      event.preventDefault();
      stepNext();
      return;
    }
    const lower = String(event.key || "").toLowerCase();
    if (lower === "b") {
      event.preventDefault();
      toggleSelectedBookmark();
    }
  };

  const init = () => {
    const helpBtn = $("helpBtn");
    if (helpBtn) helpBtn.addEventListener("click", toggleHelp);
    const helpClose = $("helpClose");
    if (helpClose) helpClose.addEventListener("click", closeHelp);
    document.addEventListener("keydown", onKeyDown);
  };

  overlay.register("help", {
    id: "helpPanel",
    triggerId: "helpBtn",
    group: "modal",
    hide: hideHelpRaw,
    autofocus: "helpClose",
  });

  SR.register("extras", {
    init: init,
    openHelp: openHelp,
    closeHelp: closeHelp,
    toggleHelp: toggleHelp,
    isHelpOpen: () => helpOpen,
  });
})();
