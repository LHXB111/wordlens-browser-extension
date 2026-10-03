import { W, V, send, mountBrand, setStatus } from "./api.js";
mountBrand();
const $ = selector => document.querySelector(selector);
let currentSettings = W.normalizeSettings(), words = [], loaded = false;
const fields = ["provider", "endpoint", "model", "trigger"];
const saveButton = $("#save"), testButton = $("#test-connection");

function updateMode() {
  const ai = $("input[name=mode]:checked")?.value === "ai";
  $("#ai-fields").hidden = !ai; $("#dictionary-info").hidden = ai;
}
function showSettings(settings) {
  for (const id of fields) $(`#${id}`).value = settings[id];
  $("#api-key").value = settings.apiKey;
  $("#target-language").value = settings.targetLanguage;
  $("#enabled").checked = settings.enabled;
  $("#include-context").checked = settings.includeContext;
  $("#json-mode").checked = settings.jsonMode;
  $("#max-chars").value = settings.maxChars;
  $("#excluded-sites").value = settings.excludedSites.join("\n");
  $(`input[name=mode][value=${settings.mode}]`).checked = true;
  updateMode();
}
function readSettings() {
  if (!loaded) throw new Error("设置尚未加载，请稍后重试。");
  const maxChars = Number($("#max-chars").value);
  if (maxChars < 100 || maxChars > 4000 || !Number.isFinite(maxChars)) throw new Error("文字上限请填写 100–4000 之间的数字。");
  const excludedSites = $("#excluded-sites").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (excludedSites.some(x => !/^(?:\*\.)?[a-zA-Z0-9.-]+$/.test(x))) throw new Error("暂停网站请填写域名，如 example.com，不要包含 https:// 或路径。");
  const settings = W.normalizeSettings({
    ...currentSettings, ...Object.fromEntries(fields.map(id => [id, $(`#${id}`).value])),
    apiKey: $("#api-key").value, mode: $("input[name=mode]:checked").value,
    targetLanguage: $("#target-language").value, enabled: $("#enabled").checked,
    includeContext: $("#include-context").checked, jsonMode: $("#json-mode").checked,
    maxChars, excludedSites
  });
  if (settings.mode === "ai") W.validateAI(settings);
  return settings;
}
function busy(value) { saveButton.disabled = value || !loaded; testButton.disabled = value || !loaded; }

$("#settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  let settings;
  try {
    settings = readSettings();
    // Call request before the first await so the browser retains the user gesture.
    const permission = settings.mode === "ai" ? chrome.permissions.request({ origins: [W.permissionOrigin(settings.endpoint)] }) : Promise.resolve(true);
    busy(true); setStatus($("#save-status"), "正在保存…");
    if (!await permission) throw new Error("未授予 AI 地址的访问权限，设置尚未保存。请再次保存并允许访问。");
    await send({ type: "SET_SETTINGS", settings });
    currentSettings = settings;
    setStatus($("#save-status"), "已保存。打开的网页会立即使用新设置；首次加载插件后请刷新网页。");
  } catch (error) { setStatus($("#save-status"), error.message, true); }
  finally { busy(false); }
});
testButton.addEventListener("click", async () => {
  try {
    const settings = { ...readSettings(), mode: "ai" };
    W.validateAI(settings);
    const permission = chrome.permissions.request({ origins: [W.permissionOrigin(settings.endpoint)] });
    busy(true); setStatus($("#test-status"), "正在用当前配置查询 serendipity…");
    if (!await permission) throw new Error("请允许访问当前 AI 服务地址，再测试连接。");
    const result = await send({ type: "TEST_CONNECTION", settings });
    setStatus($("#test-status"), `连接成功 · ${result.translation || result.definitions[0]?.meaning || "已收到有效解释"}。当前配置还需点击「保存设置」才会用于划词。`);
  } catch (error) { setStatus($("#test-status"), error.message, true); }
  finally { busy(false); }
});
$("#provider").addEventListener("change", event => {
  const preset = W.PRESETS[event.target.value];
  $("#endpoint").value = preset.endpoint; $("#model").value = preset.model; $("#api-key").value = "";
  $("#test-status").hidden = true;
});
$("#show-key").addEventListener("click", event => {
  const visible = $("#api-key").type === "password";
  $("#api-key").type = visible ? "text" : "password";
  event.currentTarget.textContent = visible ? "隐藏" : "显示";
  event.currentTarget.setAttribute("aria-label", visible ? "隐藏 API Key" : "显示 API Key");
  event.currentTarget.setAttribute("aria-pressed", String(visible));
});
document.querySelectorAll("input[name=mode]").forEach(el => el.addEventListener("change", updateMode));

async function switchTab(tab) {
  if (!["settings", "wordbook", "help"].includes(tab)) tab = "settings";
  document.querySelectorAll(".tab-panel").forEach(el => { el.hidden = el.id !== `${tab}-tab`; });
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.tab === tab);
    if (el.dataset.tab === tab) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
  });
  if (tab === "wordbook") await loadWordbook();
}
document.querySelectorAll(".nav-item").forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.tab; }));
window.addEventListener("hashchange", () => switchTab(location.hash.slice(1)));
async function loadWordbook() {
  try { words = await send({ type: "GET_WORDBOOK" }); $("#book-count").textContent = words.length; renderWordbook(); }
  catch (error) { setStatus($("#book-status"), error.message, true); }
}
function renderWordbook() {
  const query = $("#book-search").value.toLocaleLowerCase().trim();
  const filtered = words.filter(word => W.resultToText(word).toLocaleLowerCase().includes(query));
  const list = $("#book-list"); list.replaceChildren(); $("#export").disabled = !words.length;
  if (!filtered.length) {
    const empty = V.element("div", "book-empty");
    empty.append(V.element("div", "book-empty-symbol", "✳"), V.element("h2", "", query ? "还没有找到这个词。" : "这里，等着你的第一个好词。"), V.element("p", "", query ? "换一个词或释义试试。" : "在网页中选中文字，点击释义卡片上的「收藏生词」。"));
    list.append(empty); return;
  }
  for (const word of filtered) {
    const card = V.element("article", "book-card"); const header = V.element("div", "book-card-header");
    header.append(V.element("h2", word.kind === "word" ? "" : "book-original", word.kind === "word" ? word.word : W.clean(word.text, 110)));
    header.append(V.button("移除收藏", "close", async () => {
      try { await send({ type: "DELETE_WORD", id: word.id }); await loadWordbook(); }
      catch (error) { setStatus($("#book-status"), error.message, true); }
    }));
    card.append(header);
    if (word.phonetic) card.append(V.element("p", "hint", word.phonetic));
    card.append(V.element("p", "book-meaning", W.clean(word.translation || word.definitions.map(x => `${x.partOfSpeech} ${x.meaning}`).join("；"), 200)));
    const detail = V.element("div", "book-detail wl-surface"); detail.hidden = true;
    const bottom = V.element("div", "book-bottom");
    const expand = V.button("展开解释", null, () => {
      detail.hidden = !detail.hidden; expand.textContent = detail.hidden ? "展开解释 ↓" : "收起解释 ↑";
      expand.setAttribute("aria-expanded", String(!detail.hidden));
      if (!detail.hidden) V.render(detail, word);
    }, "ghost"); expand.textContent = "展开解释 ↓"; expand.setAttribute("aria-expanded", "false");
    bottom.append(V.element("span", "book-date", new Date(word.savedAt).toLocaleDateString("zh-CN")), expand);
    card.append(bottom, detail); list.append(card);
  }
}
$("#book-search").addEventListener("input", renderWordbook);
$("#export").addEventListener("click", () => {
  const rows = [["原文", "音标", "译文", "释义", "例句", "说明", "来源", "收藏时间"], ...words.map(x => [x.text, x.phonetic, x.translation, x.definitions.map(d => `${d.partOfSpeech} ${d.meaning}`).join("；"), x.examples.map(e => `${e.text} ${e.translation}`).join("\n"), x.notes, x.source, new Date(x.savedAt).toISOString()])];
  const csv = "\ufeff" + rows.map(row => row.map(W.csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = V.element("a"); link.href = url; link.download = `拾词生词本-${new Date().toLocaleDateString("sv-SE")}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
});
const example = W.normalizeResult({ word: "serendipity", language: "en", phonetic: "/ˌserənˈdɪpəti/", translation: "不期而遇的美好；意外发现的幸运", definitions: [{ partOfSpeech: "n. 名词", meaning: "偶然发现有价值或令人愉悦事物的能力或机缘。" }], examples: [{ text: "Finding this little bookshop was pure serendipity.", translation: "偶然发现这家小书店，真是一份意外的幸运。" }], notes: "常用来描述一次美好的偶遇或意外发现。" }, "serendipity", "演示内容");
V.render($("#preview-result"), example);
busy(false);
async function init() {
  try { currentSettings = await send({ type: "GET_SETTINGS" }); showSettings(currentSettings); loaded = true; busy(false); }
  catch (error) { setStatus($("#save-status"), error.message, true); }
  await loadWordbook(); await switchTab(location.hash.slice(1));
}
init();
