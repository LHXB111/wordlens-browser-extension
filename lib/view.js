(() => {
  "use strict";
  const W = globalThis.WordLens;
  const icons = {
    sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    pin: '<path d="m16 3 5 5-4 1-4 5-3 1-1 3-3-3 3-1 1-3 5-4 1-4ZM8 16l-5 5"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    book: '<path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Z"/>'
  };
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function icon(name) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", stroke: "currentColor", "stroke-width": "1.65", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) el.setAttribute(name, value);
    // Only constant, locally-authored SVG paths are used here. Model text uses textContent.
    el.innerHTML = icons[name] || icons.book;
    return el;
  }
  function button(label, iconName, callback, className = "wl-icon-button") {
    const el = element("button", className);
    el.type = "button"; el.title = label; el.setAttribute("aria-label", label);
    if (iconName) el.append(icon(iconName));
    else el.textContent = label;
    el.addEventListener("click", callback);
    return el;
  }
  const css = `
    .wl-surface{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#25372f;font-size:14px;line-height:1.65;text-align:left;font-weight:400;letter-spacing:normal;word-break:normal;color-scheme:light}
    .wl-surface *{box-sizing:border-box}.wl-surface button{font:inherit;cursor:pointer}.wl-surface button:focus-visible{outline:2px solid #598c71;outline-offset:3px}
    .wl-surface button:disabled{opacity:.55;cursor:default}.wl-icon-button{border:0;background:transparent;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;padding:7px;border-radius:9px;color:#74847a;transition:background .15s,color .15s}.wl-icon-button:hover{background:#e8eee6;color:#315c46}.wl-icon-button[aria-pressed=true]{background:#e5ece1;color:#3c6c4d}
    .wl-word-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.wl-word{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:32px;line-height:1.2;margin:0 0 8px;letter-spacing:-.6px;overflow-wrap:anywhere}.wl-original{font-size:16px;font-weight:500;line-height:1.6;margin:0 0 12px;max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
    .wl-phonetics{display:flex;flex-wrap:wrap;gap:4px 14px;color:#7a847d;font-size:12px;line-height:1.5;margin-bottom:17px}.wl-phonetic-label{font-size:10px;font-weight:600;color:#637867;margin-right:5px}.wl-translation{background:#edf2e7;border-left:3px solid #81a27e;border-radius:0 8px 8px 0;padding:11px 13px;margin:0 0 20px;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}.wl-section-title{font-size:10px;color:#7c877d;letter-spacing:1.4px;font-weight:600;margin:18px 0 10px}.wl-definition{display:flex;gap:12px;align-items:flex-start;margin:12px 0}.wl-pos{background:#edf0e8;color:#5c765f;font-family:inherit;flex-shrink:0;max-width:100px;font-size:10px;line-height:1.6;padding:3px 7px;border-radius:5px;overflow-wrap:anywhere}.wl-meaning{margin:0;font-size:13px;line-height:1.75;overflow-wrap:anywhere}.wl-explanation{color:#8b928b;font-size:12px;margin:3px 0 0;overflow-wrap:anywhere}.wl-example{margin:9px 0 13px;padding-left:12px;border-left:2px solid #d9e2d0}.wl-example-text{margin:0;font-size:13px;font-style:italic;overflow-wrap:anywhere}.wl-example-translation{margin:4px 0 0;font-size:12px;color:#839080;overflow-wrap:anywhere}.wl-note{background:#f4f3ed;padding:11px 12px;border-radius:8px;margin-top:18px;color:#788377;font-size:11px;overflow-wrap:anywhere}
    .wl-actions{display:flex;gap:8px;margin-top:20px;padding-top:13px;border-top:1px solid #e6e8de}.wl-action{background:transparent;color:#667967;border:1px solid #dce3d6;border-radius:7px;padding:6px 10px;display:inline-flex;gap:7px;align-items:center;font-size:11px}.wl-action:hover{background:#edf2e7}.wl-action svg{width:14px;height:14px}.wl-source{display:flex;justify-content:space-between;gap:8px;margin-top:14px;font-size:10px;color:#9bA496}.wl-notice{font-size:11px;color:#6d8269;min-height:16px;margin:7px 0 0}.wl-loading{padding:22px 0}.wl-loading-line{height:9px;background:#e9ede3;border-radius:8px;margin:14px 0;animation:wl-pulse 1.3s infinite}.wl-loading-line:nth-child(2){width:72%}.wl-loading-line:nth-child(3){width:88%}.wl-loading-label{color:#80907b;font-size:12px}.wl-error-title{font-size:17px;margin:5px 0 9px;font-weight:500}.wl-error-message{color:#7f8a7b;font-size:13px;margin:0 0 16px;overflow-wrap:anywhere}.wl-error-actions{display:flex;gap:8px}.wl-primary{background:#43664f;color:#fff;border:0;border-radius:7px;padding:8px 13px;font-size:12px}.wl-secondary{background:#edf0e7;color:#526c53;border:0;border-radius:7px;padding:8px 13px;font-size:12px}@keyframes wl-pulse{50%{opacity:.4}}@media(prefers-reduced-motion:reduce){.wl-loading-line{animation:none}}
  `;
  function loading(container, text) {
    container.replaceChildren();
    const wrap = element("div", "wl-loading");
    wrap.setAttribute("role", "status");
    wrap.append(element("div", "wl-loading-label", `正在理解「${W.clean(text, 35)}${text.length > 35 ? "…" : ""}」`));
    for (let i = 0; i < 3; i++) wrap.append(element("div", "wl-loading-line"));
    container.append(wrap);
  }
  function error(container, message, retry, options) {
    container.replaceChildren();
    const wrap = element("div"); wrap.setAttribute("role", "alert");
    wrap.append(element("h3", "wl-error-title", "暂时没有找到解释"), element("p", "wl-error-message", message));
    const actions = element("div", "wl-error-actions");
    if (retry) actions.append(button("再试一次", null, retry, "wl-primary"));
    if (options) actions.append(button("打开设置", null, options, "wl-secondary"));
    wrap.append(actions); container.append(wrap);
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    const textarea = element("textarea"); textarea.value = text; textarea.style.cssText = "position:fixed;opacity:0";
    document.body.append(textarea); textarea.select();
    const copied = document.execCommand("copy"); textarea.remove();
    if (!copied) throw new Error("浏览器未允许复制，请手动选择文字复制。");
  }
  function render(container, result, onSave) {
    container.replaceChildren();
    const heading = element("div", "wl-word-heading");
    heading.append(element(result.kind === "word" ? "h2" : "p", result.kind === "word" ? "wl-word" : "wl-original", result.kind === "word" ? result.word : result.text));
    const notice = element("p", "wl-notice"); notice.setAttribute("role", "status");
    if ("speechSynthesis" in globalThis) {
      const speak = button("朗读原文", "sound", () => {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(result.text);
        utterance.lang = result.language || (/\p{Script=Han}/u.test(result.text) ? "zh-CN" : "en-US");
        utterance.rate = .9; utterance.onerror = () => { notice.textContent = "暂时无法朗读，请检查浏览器或系统语音。"; };
        speechSynthesis.speak(utterance);
      }); heading.append(speak);
    }
    container.append(heading);
    const phonetics = element("div", "wl-phonetics");
    for (const [label, value] of [["英", result.phoneticUK], ["美", result.phoneticUS], ["", !result.phoneticUK && !result.phoneticUS ? result.phonetic : ""]]) {
      if (value) { const item = element("span"); if (label) item.append(element("span", "wl-phonetic-label", label)); item.append(document.createTextNode(value)); phonetics.append(item); }
    }
    if (phonetics.childNodes.length) container.append(phonetics);
    if (result.translation) container.append(element("p", "wl-translation", result.translation));
    if (result.definitions.length) {
      container.append(element("p", "wl-section-title", "释义 · MEANINGS"));
      for (const item of result.definitions) {
        const row = element("div", "wl-definition");
        if (item.partOfSpeech) row.append(element("span", "wl-pos", item.partOfSpeech));
        const body = element("div"); body.append(element("p", "wl-meaning", item.meaning));
        if (item.explanation) body.append(element("p", "wl-explanation", item.explanation));
        row.append(body); container.append(row);
      }
    }
    if (result.examples.length) {
      container.append(element("p", "wl-section-title", "例句 · IN CONTEXT"));
      for (const item of result.examples) {
        const row = element("div", "wl-example"); row.append(element("p", "wl-example-text", item.text));
        if (item.translation) row.append(element("p", "wl-example-translation", item.translation));
        container.append(row);
      }
    }
    if (result.notes) container.append(element("div", "wl-note", result.notes));
    const actions = element("div", "wl-actions");
    if (onSave) {
      const save = button("收藏生词", "star", async () => {
        save.disabled = true;
        try { await onSave(result); save.replaceChildren(icon("star"), document.createTextNode("已收藏")); notice.textContent = "已保存到你的生词本。"; }
        catch (error) { save.disabled = false; notice.textContent = error.message; }
      }, "wl-action"); save.append(document.createTextNode("收藏生词")); actions.append(save);
    }
    const copy = button("复制解释", "copy", async () => {
      try { await copyText(W.resultToText(result)); notice.textContent = "解释已复制。"; } catch (error) { notice.textContent = error.message; }
    }, "wl-action"); copy.append(document.createTextNode("复制解释")); actions.append(copy);
    container.append(actions, notice);
    const source = element("div", "wl-source"); source.append(element("span", "", `来自 ${result.source}${result.cached ? " · 缓存" : ""}`), element("span", "", result.source === "Free Dictionary" ? "英文词典" : "AI 生成 · 仅供学习参考")); container.append(source);
  }
  globalThis.WordLensView = Object.freeze({ element, icon, button, css, loading, error, render, copyText });
})();
