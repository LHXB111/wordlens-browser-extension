import "./lib/core.js";

const W = globalThis.WordLens;
const requests = new Map();
const cache = new Map();
let wordbookQueue = Promise.resolve();
const ready = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

async function getSettings() {
  await ready;
  const { settings } = await chrome.storage.local.get("settings");
  return W.normalizeSettings(settings);
}
function trusted(sender) {
  return sender.id === chrome.runtime.id && ["ui/options.html", "ui/popup.html"].some(path => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(path));
}
function requestKey(sender) { return `${sender.tab?.id ?? sender.url ?? "extension"}:${sender.frameId ?? 0}`; }
function errorMessage(error) {
  if (error.name === "AbortError") return "请求已取消或超时，请重试。";
  if (error instanceof TypeError) return "无法连接服务，请检查网络、API 地址及浏览器的访问权限。";
  return error.message || "查询失败，请重试。";
}
async function fetchJSON(url, init, signal) {
  const response = await fetch(url, { ...init, signal, credentials: "omit", redirect: "error" });
  if (!response.ok) {
    const error = new Error(({ 400: "请求参数不被服务支持，请检查模型名称和 JSON 模式。", 401: "API Key 无效或已过期。", 403: "服务拒绝访问，请检查账号、模型权限或地区限制。", 404: "没有找到 API 路径或模型，请检查 API 地址和模型名称。", 429: "请求过于频繁或额度不足，请稍后重试并检查账号余额。" })[response.status] || `服务暂时不可用（HTTP ${response.status}），请稍后重试。`);
    error.status = response.status;
    // Never return provider error bodies: they can contain request headers or secrets.
    throw error;
  }
  const content = await response.text();
  if (content.length > 500000) throw new Error("服务返回内容过大，请更换接口。");
  try { return JSON.parse(content); } catch { throw new Error("服务没有返回 JSON 数据，请检查 API 地址是否为接口地址。"); }
}
async function lookup(message, sender, override) {
  const settings = override || await getSettings();
  const text = W.normalizeText(message.text);
  if (!text) throw new Error("请先选中一些文字。");
  if (text.length > settings.maxChars) throw new Error(`选中文字超过 ${settings.maxChars} 字，请缩短后重试。`);
  const key = requestKey(sender);
  requests.get(key)?.controller.abort();
  const controller = new AbortController();
  const active = { controller, id: message.requestId };
  requests.set(key, active);
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    let endpoint = "";
    if (settings.mode === "ai") {
      endpoint = W.validateAI(settings);
      if (!await chrome.permissions.contains({ origins: [W.permissionOrigin(endpoint)] })) throw new Error("AI 服务的访问权限尚未授权，请在设置页重新保存并允许访问。");
    } else if (!W.isWord(text)) throw new Error("免费词典支持英文单词。短语、中文解释和整句翻译请在设置中启用 AI。");
    const context = settings.includeContext ? W.clean(message.context, 700) : "";
    // Credential belongs to the in-memory cache key only; it is never persisted or exposed.
    const cacheKey = JSON.stringify([settings.mode, endpoint, settings.model, settings.apiKey, settings.jsonMode, settings.targetLanguage, text, context]);
    if (!override && cache.has(cacheKey)) return { ...cache.get(cacheKey), cached: true };
    let result;
    if (settings.mode === "dictionary") {
      let data;
      try { data = await fetchJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text.toLowerCase().replaceAll("’", "'"))}`, {}, controller.signal); }
      catch (error) { if (error.status === 404) throw new Error("词典没有找到这个单词，请尝试原形或切换到 AI 详解。"); throw error; }
      result = W.fromDictionary(data, text);
    } else {
      const body = { model: settings.model, messages: W.buildMessages(text, context, settings), stream: false };
      // Omit optional sampling/token parameters for broad model compatibility.
      if (settings.jsonMode) body.response_format = { type: "json_object" };
      if (settings.provider === "deepseek" && /^(deepseek-flash|deepseek-v4-pro)$/.test(settings.model)) body.thinking = { type: "disabled" };
      const headers = { "Content-Type": "application/json" };
      if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
      const data = await fetchJSON(endpoint, { method: "POST", headers, body: JSON.stringify(body) }, controller.signal);
      if (data.choices?.[0]?.finish_reason === "length") throw new Error("AI 输出被截断，请更换模型或提高服务端输出上限。");
      result = W.parseAI(data.choices?.[0]?.message?.content, text, W.PRESETS[settings.provider]?.label || "AI");
    }
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!override) {
      if (cache.size >= 64) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, result);
    }
    return result;
  } finally {
    clearTimeout(timeout);
    if (requests.get(key) === active) requests.delete(key);
  }
}
function modifyWordbook(callback) {
  const pending = wordbookQueue.then(async () => {
    await ready;
    const { wordbook = [] } = await chrome.storage.local.get("wordbook");
    const next = callback(wordbook);
    await chrome.storage.local.set({ wordbook: next });
    return next.length;
  });
  wordbookQueue = pending.catch(() => {});
  return pending;
}
async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") throw new Error("无效请求。");
  switch (message.type) {
    case "PUBLIC_SETTINGS": return W.publicSettings(await getSettings());
    case "GET_SETTINGS": if (!trusted(sender)) throw new Error("无权读取设置。"); return getSettings();
    case "SET_SETTINGS": {
      if (!trusted(sender)) throw new Error("无权更改设置。");
      const settings = W.normalizeSettings(message.settings);
      if (settings.mode === "ai") W.validateAI(settings);
      await ready;
      await chrome.storage.local.set({ settings });
      return W.publicSettings(settings);
    }
    case "SET_ENABLED": {
      if (!trusted(sender)) throw new Error("无权更改设置。");
      const settings = await getSettings();
      settings.enabled = message.enabled === true;
      await chrome.storage.local.set({ settings });
      return W.publicSettings(settings);
    }
    case "LOOKUP": return lookup(message, sender);
    case "TEST_CONNECTION": {
      if (!trusted(sender)) throw new Error("无权测试连接。");
      return lookup({ text: "serendipity", requestId: "test" }, sender, { ...W.normalizeSettings(message.settings), mode: "ai" });
    }
    case "CANCEL": {
      const active = requests.get(requestKey(sender));
      if (active?.id === message.requestId) active.controller.abort();
      return true;
    }
    case "SAVE_WORD": {
      const result = W.normalizeResult(message.result, W.clean(message.result?.text, 4000), W.clean(message.result?.source, 100));
      if (!result.text) throw new Error("没有可收藏的内容。");
      return modifyWordbook(words => [{ ...result, id: result.text.toLocaleLowerCase(), savedAt: Date.now() }, ...words.filter(x => x.id !== result.text.toLocaleLowerCase())].slice(0, 500));
    }
    case "GET_WORDBOOK": {
      if (!trusted(sender)) throw new Error("无权读取生词本。");
      await ready;
      const { wordbook = [] } = await chrome.storage.local.get("wordbook"); return wordbook;
    }
    case "DELETE_WORD": {
      if (!trusted(sender)) throw new Error("无权更改生词本。");
      return modifyWordbook(words => words.filter(x => x.id !== message.id));
    }
    case "OPEN_OPTIONS": await chrome.runtime.openOptionsPage(); return true;
    default: throw new Error("未知请求。");
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "wordlens-lookup", title: "用拾词解释「%s」", contexts: ["selection"] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "wordlens-lookup" && tab?.id) chrome.tabs.sendMessage(tab.id, { type: "SHOW_SELECTION", text: info.selectionText }, { frameId: info.frameId ?? 0 }).catch(() => {});
});
chrome.commands.onCommand.addListener(async command => {
  if (command !== "lookup-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "SHOW_SELECTION" }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  cache.clear();
  for (const active of requests.values()) active.controller.abort();
  const settings = W.publicSettings(changes.settings.newValue);
  chrome.tabs.query({}).then(tabs => Promise.allSettled(tabs.filter(x => x.id).map(tab => chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_CHANGED", settings })))).catch(() => {});
});
