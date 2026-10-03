(() => {
  "use strict";
  if (globalThis.__wordLensLoaded) return;
  globalThis.__wordLensLoaded = true;
  const W = globalThis.WordLens, V = globalThis.WordLensView;
  let settings = W.publicSettings(W.DEFAULTS);
  let host, shadow, panel, body, triggerButton, anchor, current, pinned = false, serial = 0, requestId, debounce, pointerDown = false, uiInteractionAt = 0;
  let manualPosition = null, manualSize = null, gesture = null;
  const panelPadding = 12;

  async function send(message) {
    let response;
    try { response = await chrome.runtime.sendMessage(message); }
    catch { throw new Error("插件已重新加载，请刷新网页后再使用。"); }
    if (!response?.ok) throw new Error(response?.error || "插件没有响应，请刷新网页后重试。");
    return response.data;
  }
  function allowed() { return settings.enabled && !W.isExcluded(location.hostname, settings.excludedSites); }
  function editable(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]");
  }
  function readSelection(explicitText) {
    if (editable(document.activeElement)) return null;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || editable(selection.anchorNode) || editable(selection.focusNode)) return null;
    const text = W.normalizeText(explicitText || selection.toString());
    if (!text || (selection.isCollapsed && !explicitText)) return null;
    const range = selection.getRangeAt(0);
    const rects = [...range.getClientRects()].filter(x => x.width || x.height);
    const rect = rects.at(-1) || range.getBoundingClientRect();
    if (!rect.width && !rect.height && !explicitText) return null;
    let context = "";
    if (settings.includeContext) {
      const node = selection.anchorNode?.parentElement;
      const surrounding = node?.closest("p,li,blockquote,td,h1,h2,h3") || node;
      const paragraph = W.normalizeText(surrounding?.textContent || "");
      const index = paragraph.indexOf(text);
      context = index >= 0 ? paragraph.slice(Math.max(0, index - 180), index + text.length + 180).slice(0, 700) : paragraph.slice(0, 500);
    }
    return { text, context, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
  }
  function ensureUI() {
    if (host?.isConnected) return;
    host = document.createElement("div"); host.setAttribute("data-wordlens-root", "");
    host.style.cssText = "all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;";
    shadow = host.attachShadow({ mode: "closed" });
    const style = V.element("style"); style.textContent = V.css + `
      :host{all:initial}
      .wl-panel{position:fixed;display:flex;flex-direction:column;box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);background:#fcfcf5;border:1px solid #e1e6d7;border-radius:16px;box-shadow:0 16px 52px #243b2926,0 2px 8px #243b2910;pointer-events:auto;overflow:hidden}
      .wl-topbar{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;padding:11px 14px 9px;border-bottom:1px solid #edf0e5;cursor:grab;user-select:none;touch-action:none}
      .wl-brand{display:flex;align-items:center;gap:7px;font-size:12px;color:#5c785b;font-weight:600}.wl-brand svg{width:16px;height:16px}.wl-toolbar{display:flex;gap:2px}
      .wl-body{flex:1 1 auto;min-height:0;padding:18px 20px 14px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#ccd7c4 transparent}
      .wl-panel[data-gesture=move] .wl-topbar{cursor:grabbing}.wl-panel[data-gesture=resize]{user-select:none}
      .wl-resize-handle{position:absolute;z-index:1;touch-action:none;user-select:none}
      .wl-resize-n,.wl-resize-s{left:14px;right:14px;height:6px;cursor:ns-resize}.wl-resize-n{top:0}.wl-resize-s{bottom:0}
      .wl-resize-e,.wl-resize-w{top:14px;bottom:14px;width:6px;cursor:ew-resize}.wl-resize-e{right:0}.wl-resize-w{left:0}
      .wl-resize-nw,.wl-resize-ne,.wl-resize-sw,.wl-resize-se{width:14px;height:14px}.wl-resize-nw,.wl-resize-se{cursor:nwse-resize}.wl-resize-ne,.wl-resize-sw{cursor:nesw-resize}
      .wl-resize-nw{top:0;left:0}.wl-resize-ne{top:0;right:0}.wl-resize-sw{bottom:0;left:0}.wl-resize-se{bottom:0;right:0;width:22px;height:22px}
      .wl-resize-se::after{content:"";position:absolute;right:5px;bottom:5px;width:10px;height:10px;background:repeating-linear-gradient(135deg,transparent 0 3px,#8b9d85 3px 4px,transparent 4px 6px);clip-path:polygon(100% 0,100% 100%,0 100%);opacity:.7}
      .wl-resize-se:hover::after{opacity:1}
      .wl-trigger{position:fixed;pointer-events:auto;background:#3f604b;border:1px solid #5b7c62;border-radius:10px;padding:7px 11px;color:#fff;display:flex;align-items:center;gap:6px;font-size:12px;box-shadow:0 5px 16px #1f36272b}.wl-trigger:hover{background:#304f3c}[hidden]{display:none!important}
    `;
    panel = V.element("section", "wl-panel wl-surface"); panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "拾词释义");
    const topbar = V.element("div", "wl-topbar"), brand = V.element("div", "wl-brand");
    topbar.title = "按住此处拖动浮窗";
    topbar.addEventListener("pointerdown", startDrag);
    brand.append(V.icon("book"), document.createTextNode("拾词"));
    const toolbar = V.element("div", "wl-toolbar");
    const pin = V.button("固定浮窗", "pin", () => { pinned = !pinned; pin.setAttribute("aria-pressed", String(pinned)); pin.title = pinned ? "取消固定" : "固定浮窗"; });
    pin.setAttribute("aria-pressed", "false");
    toolbar.append(pin, V.button("关闭 · Esc", "close", dismiss)); topbar.append(brand, toolbar);
    body = V.element("div", "wl-body"); panel.append(topbar, body);
    for (const direction of ["n", "s", "e", "w", "nw", "ne", "sw", "se"]) {
      const handle = V.element("div", `wl-resize-handle wl-resize-${direction}`);
      handle.dataset.direction = direction; handle.setAttribute("aria-hidden", "true");
      handle.title = direction === "se" ? "拖动调整浮窗大小 · 双击恢复默认大小" : "拖动调整浮窗大小";
      handle.addEventListener("pointerdown", startResize);
      if (direction === "se") handle.addEventListener("dblclick", resetSize);
      panel.append(handle);
    }
    panel.addEventListener("pointermove", moveGesture);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) panel.addEventListener(type, event => {
      if (event.pointerId === gesture?.pointerId) endGesture();
    });
    triggerButton = V.button("用拾词解释", "book", () => { if (current) show(current); }, "wl-trigger wl-surface");
    triggerButton.append(document.createTextNode("解释")); triggerButton.hidden = true;
    shadow.append(style, panel, triggerButton); document.documentElement.append(host);
    host.addEventListener("pointerdown", event => { pointerDown = true; uiInteractionAt = Date.now(); event.stopPropagation(); });
    host.addEventListener("pointerup", event => { pointerDown = false; uiInteractionAt = Date.now(); event.stopPropagation(); });
    host.addEventListener("pointercancel", event => { pointerDown = false; uiInteractionAt = Date.now(); event.stopPropagation(); });
    new ResizeObserver(position).observe(panel);
  }
  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0 || event.target.closest(".wl-toolbar")) return;
    beginGesture(event, "move");
  }
  function startResize(event) {
    if (!event.isPrimary || event.button !== 0) return;
    beginGesture(event, "resize");
  }
  function beginGesture(event, kind) {
    event.preventDefault(); clearTimeout(debounce); endGesture();
    const rect = panel.getBoundingClientRect();
    manualPosition = { left: rect.left, top: rect.top };
    if (kind === "resize") manualSize = { width: rect.width, height: rect.height };
    gesture = { kind, handle: event.currentTarget, pointerId: event.pointerId, direction: event.currentTarget.dataset.direction,
      startX: event.clientX, startY: event.clientY, rect };
    gesture.handle.setPointerCapture(event.pointerId);
    panel.dataset.gesture = kind;
    position();
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
  function moveGesture(event) {
    if (event.pointerId !== gesture?.pointerId) return;
    const { kind, direction, rect, startX, startY } = gesture;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if (kind === "move") manualPosition = { left: rect.left + dx, top: rect.top + dy };
    else {
      const maxRight = window.innerWidth - panelPadding, maxBottom = window.innerHeight - panelPadding;
      const minWidth = Math.min(280, Math.max(1, window.innerWidth - panelPadding * 2));
      const minHeight = Math.min(180, Math.max(1, window.innerHeight - panelPadding * 2));
      let { left, right, top, bottom } = rect;
      if (direction.includes("e")) right = clamp(right + dx, left + minWidth, maxRight);
      if (direction.includes("w")) left = clamp(left + dx, panelPadding, right - minWidth);
      if (direction.includes("s")) bottom = clamp(bottom + dy, top + minHeight, maxBottom);
      if (direction.includes("n")) top = clamp(top + dy, panelPadding, bottom - minHeight);
      manualPosition = { left, top }; manualSize = { width: right - left, height: bottom - top };
    }
    position();
  }
  function endGesture() {
    if (!gesture) return;
    const { handle, pointerId } = gesture;
    gesture = null;
    delete panel.dataset.gesture;
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    pointerDown = false; uiInteractionAt = Date.now();
  }
  function resetSize() {
    endGesture(); manualSize = null;
    panel.style.removeProperty("width"); panel.style.removeProperty("height"); position();
  }
  function position() {
    if (!anchor || !host) return;
    const padding = panelPadding, vw = window.innerWidth, vh = window.innerHeight;
    const el = !panel.hidden ? panel : triggerButton;
    if (el.hidden) return;
    if (el === panel && manualSize) {
      panel.style.width = `${Math.min(manualSize.width, Math.max(1, vw - padding * 2))}px`;
      panel.style.height = `${Math.min(manualSize.height, Math.max(1, vh - padding * 2))}px`;
    }
    const rect = el.getBoundingClientRect();
    const manual = el === panel && manualPosition;
    const left = Math.min(Math.max(padding, manual ? manual.left : anchor.left), Math.max(padding, vw - rect.width - padding));
    let top = manual ? manual.top : anchor.bottom + 9;
    if (!manual && top + rect.height > vh - padding) top = anchor.top - rect.height - 9;
    top = Math.max(padding, Math.min(top, vh - rect.height - padding));
    if (manual) manualPosition = { left, top };
    el.style.left = `${left}px`; el.style.top = `${top}px`;
  }
  function cancel() {
    serial++;
    if (requestId) send({ type: "CANCEL", requestId }).catch(() => {});
    requestId = null;
  }
  function dismiss() {
    clearTimeout(debounce); cancel(); endGesture(); manualPosition = null;
    if (panel) panel.hidden = true;
    if (triggerButton) triggerButton.hidden = true;
    current = null; pinned = false;
    shadow?.querySelector("[aria-pressed]")?.setAttribute("aria-pressed", "false");
  }
  async function show(selection) {
    if (!allowed()) return;
    ensureUI(); cancel(); endGesture();
    if (current !== selection) manualPosition = null;
    current = selection; anchor = selection.rect; triggerButton.hidden = true; panel.hidden = false;
    const token = serial;
    V.loading(body, selection.text); position();
    if (selection.text.length > settings.maxChars) {
      V.error(body, `最多可解释 ${settings.maxChars} 字。请缩短选中内容，或在设置中调整上限。`, null, openOptions); position(); return;
    }
    requestId = `${Date.now()}-${token}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await send({ type: "LOOKUP", text: selection.text, context: selection.context, requestId });
      if (token !== serial) return;
      V.render(body, result, result => send({ type: "SAVE_WORD", result }));
    } catch (error) {
      if (token !== serial) return;
      V.error(body, error.message, () => show(selection), openOptions);
    }
    if (token === serial) { requestId = null; body.scrollTop = 0; position(); }
  }
  function openOptions() { send({ type: "OPEN_OPTIONS" }).catch(() => {}); }
  function processSelection() {
    if (!allowed() || settings.trigger === "manual") return;
    const selected = readSelection();
    if (!selected) { if (!pinned) dismiss(); return; }
    if (current?.text === selected.text && panel && !panel.hidden) return;
    if (settings.trigger === "auto") { show(selected); return; }
    ensureUI(); cancel(); endGesture(); manualPosition = null; panel.hidden = true;
    current = selected; anchor = selected.rect; triggerButton.hidden = false; position();
  }
  document.addEventListener("pointerdown", event => {
    if (event.composedPath().includes(host)) return;
    pointerDown = true;
    clearTimeout(debounce);
  }, true);
  document.addEventListener("pointerup", event => {
    pointerDown = false;
    if (event.button !== 0 || event.composedPath().includes(host)) return;
    clearTimeout(debounce);
    if (pinned && !readSelection()) return;
    debounce = setTimeout(processSelection, 220);
  });
  document.addEventListener("selectionchange", () => {
    if (pointerDown || !allowed() || document.activeElement === host || Date.now() - uiInteractionAt < 500) return;
    const selection = window.getSelection();
    if (shadow?.contains(selection?.anchorNode) || shadow?.contains(selection?.focusNode)) return;
    clearTimeout(debounce);
    debounce = setTimeout(processSelection, 360);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") dismiss();
  }, true);
  document.addEventListener("scroll", event => {
    if (!event.composedPath().includes(host) && !pinned) dismiss();
  }, true);
  window.addEventListener("resize", () => { endGesture(); position(); });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "SETTINGS_CHANGED") {
      settings = message.settings; dismiss(); respond({ ok: true });
    } else if (message.type === "SHOW_SELECTION") {
      const selection = readSelection(message.text);
      if (selection && allowed()) show(selection);
      respond({ ok: !!selection && allowed() });
    }
  });
  send({ type: "PUBLIC_SETTINGS" }).then(value => { settings = value; }).catch(() => {});
})();
