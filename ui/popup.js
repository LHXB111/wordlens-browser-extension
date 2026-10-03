import { W, V, send, mountBrand, setStatus } from "./api.js";
mountBrand();
const $ = selector => document.querySelector(selector);
let serial = 0, settings;
async function init() {
  try {
    const [config, words] = await Promise.all([send({ type: "PUBLIC_SETTINGS" }), send({ type: "GET_WORDBOOK" })]);
    settings = config; $("#enabled").checked = config.enabled;
    $("#mode-badge").textContent = config.mode === "ai" ? "AI 详解" : "免费英文词典";
    $("#word-count").textContent = words.length;
    $("#trigger-tip").textContent = { auto: "选中，即刻解释", button: "选中，再点「解释」", manual: "选中后按 Alt + T" }[config.trigger];
    $("#mode-tip").textContent = config.mode === "ai" ? `AI 释义与翻译使用${config.targetLanguage}。${config.includeContext ? "已开启周围语境。" : "仅发送选中文字。"}` : "英文词典无需 API Key。中文详解请接入 AI。";
  } catch (error) { setStatus($("#status"), error.message, true); }
}
$("#enabled").addEventListener("change", async event => {
  const enabled = event.target.checked;
  event.target.disabled = true;
  try { settings = await send({ type: "SET_ENABLED", enabled }); setStatus($("#status"), enabled ? "划词解释已开启。" : "划词解释已暂停。仍可在这里手动查询。"); }
  catch (error) { event.target.checked = !enabled; setStatus($("#status"), error.message, true); }
  finally { event.target.disabled = false; }
});
$("#open-settings").addEventListener("click", () => send({ type: "OPEN_OPTIONS" }).catch(error => setStatus($("#status"), error.message, true)));
$("#wordbook").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("ui/options.html#wordbook") }));
$("#lookup-form").addEventListener("submit", async event => {
  event.preventDefault();
  const text = W.normalizeText($("#query").value); if (!text) return;
  const token = ++serial;
  $("#result").hidden = false; $("#lookup").disabled = true; $("#status").hidden = true;
  V.loading($("#result"), text);
  try {
    const result = await send({ type: "LOOKUP", text, requestId: `popup-${token}` });
    if (token !== serial) return;
    V.render($("#result"), result, async result => { $("#word-count").textContent = await send({ type: "SAVE_WORD", result }); });
  } catch (error) {
    if (token === serial) V.error($("#result"), error.message, () => $("#lookup-form").requestSubmit(), () => send({ type: "OPEN_OPTIONS" }));
  } finally { if (token === serial) $("#lookup").disabled = false; }
});
init();
