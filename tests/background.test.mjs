import test from "node:test";
import assert from "node:assert/strict";

const events = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
const storage = {}; let fetchImpl, fetchCount = 0, permissionGranted = true, accessLevel;
const storageChanges = events(), messages = events();
const extensionId = "test-extension";
globalThis.chrome = {
  runtime: { id: extensionId, getURL: path => `chrome-extension://${extensionId}/${path}`, onMessage: messages, onInstalled: events(), openOptionsPage: async () => {} },
  storage: {
    local: {
      setAccessLevel: async value => { accessLevel = value.accessLevel; },
      get: async key => Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, structuredClone(storage[k])])),
      set: async value => {
        const changes = {};
        for (const [key, item] of Object.entries(value)) { changes[key] = { oldValue: storage[key], newValue: item }; storage[key] = structuredClone(item); }
        storageChanges.listeners.forEach(fn => fn(changes, "local"));
      }
    }, onChanged: storageChanges
  },
  permissions: { contains: async () => permissionGranted },
  tabs: { query: async () => [], sendMessage: async () => {} },
  contextMenus: { onClicked: events(), removeAll: callback => callback(), create: () => {} },
  commands: { onCommand: events() }
};
globalThis.fetch = (...args) => { fetchCount++; return fetchImpl(...args); };
await import("../background.js");
const W = globalThis.WordLens;
const page = { id: extensionId, url: `chrome-extension://${extensionId}/ui/options.html`, tab: { id: 99 } };
const content = { id: extensionId, url: "https://example.com/article", tab: { id: 1 }, frameId: 0 };
const send = (message, sender = page) => new Promise(resolve => messages.listeners[0](message, sender, resolve));
const dictionary = [{ word: "hello", phonetic: "/həˈləʊ/", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "a greeting", example: "Say hello." }] }] }];
const jsonResponse = value => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
const aiResponse = (text = "你好") => jsonResponse({ choices: [{ message: { content: JSON.stringify({ translation: text, phonetic: "/hello/", definitions: [{ partOfSpeech: "interj.", meaning: text }] }) }, finish_reason: "stop" }] });
async function configure(settings = {}) {
  permissionGranted = true;
  const result = await send({ type: "SET_SETTINGS", settings: W.normalizeSettings(settings) });
  assert.equal(result.ok, true);
}

test("restricts local storage and never exposes credentials to content scripts", async () => {
  await configure({ apiKey: "private-secret" });
  assert.equal(accessLevel, "TRUSTED_CONTEXTS");
  const pub = await send({ type: "PUBLIC_SETTINGS" }, content);
  assert.equal(pub.ok, true); assert.equal(JSON.stringify(pub).includes("private-secret"), false);
  const denied = await send({ type: "GET_SETTINGS" }, content); assert.equal(denied.ok, false);
  assert.equal((await send({ type: "SET_SETTINGS", settings: {} }, content)).ok, false);
  assert.equal((await send({ type: "GET_SETTINGS" }, { ...page, id: "another-extension" })).ok, false);
});
test("dictionary request, normalized word and memory caching", async () => {
  await configure(); fetchCount = 0;
  fetchImpl = async (url, init) => { assert.equal(url, "https://api.dictionaryapi.dev/api/v2/entries/en/hello"); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); return jsonResponse(dictionary); };
  const first = await send({ type: "LOOKUP", text: "hello", requestId: "a" }, content);
  const second = await send({ type: "LOOKUP", text: "hello", requestId: "b" }, content);
  assert.equal(first.ok, true); assert.equal(second.data.cached, true); assert.equal(fetchCount, 1);
});
test("phrases and excessive selections fail before networking", async () => {
  await configure({ maxChars: 100 }); fetchCount = 0;
  assert.equal((await send({ type: "LOOKUP", text: "hello world" }, content)).ok, false);
  assert.equal((await send({ type: "LOOKUP", text: "a".repeat(101) }, content)).ok, false);
  assert.equal(fetchCount, 0);
});
test("sends compatible AI request with auth, target language and no default context", async () => {
  await configure({ mode: "ai", apiKey: "secret", provider: "deepseek" });
  fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions"); assert.equal(init.headers.Authorization, "Bearer secret");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "deepseek-flash"); assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(JSON.parse(body.messages[1].content).context, "");
    return aiResponse();
  };
  const result = await send({ type: "LOOKUP", text: "hello", context: "private surrounding text", requestId: "ai-1" }, content);
  assert.equal(result.ok, true); assert.equal(result.data.translation, "你好");
});
test("honors explicit context, keyless local API, and disabling JSON mode", async () => {
  await configure({ mode: "ai", provider: "custom", endpoint: "http://localhost:1234/v1", model: "local", includeContext: true, jsonMode: false });
  fetchImpl = async (url, init) => {
    assert.equal(url, "http://localhost:1234/v1/chat/completions"); assert.equal(Object.hasOwn(init.headers, "Authorization"), false);
    const body = JSON.parse(init.body); assert.equal(Object.hasOwn(body, "response_format"), false);
    assert.equal(Object.hasOwn(body, "thinking"), false);
    assert.equal(JSON.parse(body.messages[1].content).context, "at the river bank"); return aiResponse("河岸");
  };
  const result = await send({ type: "LOOKUP", text: "bank", context: "at the river bank" }, content);
  assert.equal(result.data.translation, "河岸");
});
test("ungranted endpoint permissions stop the request", async () => {
  await configure({ mode: "ai", apiKey: "secret" }); permissionGranted = false; fetchCount = 0;
  const result = await send({ type: "LOOKUP", text: "hello" }, content);
  assert.equal(result.ok, false); assert.match(result.error, /权限/); assert.equal(fetchCount, 0);
});
test("reports provider status without returning body or secret", async () => {
  await configure({ mode: "ai", apiKey: "secret" });
  fetchImpl = async () => new Response("echo: Bearer secret", { status: 401 });
  const result = await send({ type: "LOOKUP", text: "hello" }, content);
  assert.equal(result.ok, false); assert.match(result.error, /API Key/); assert.equal(result.error.includes("secret"), false);
});
test("malformed and truncated AI responses show actionable errors", async () => {
  await configure({ mode: "ai", apiKey: "secret" });
  fetchImpl = async () => jsonResponse({ choices: [{ message: { content: "oops" } }] });
  assert.match((await send({ type: "LOOKUP", text: "hello" }, content)).error, /JSON/);
  fetchImpl = async () => jsonResponse({ choices: [{ message: { content: '{}' }, finish_reason: "length" }] });
  assert.match((await send({ type: "LOOKUP", text: "hello" }, content)).error, /截断/);
});
test("rapid selections abort previous fetch while returning the newest result", async () => {
  await configure();
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  fetchImpl = async (_url, init) => {
    if (_url.endsWith("/hello")) {
      started(); return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    }
    return jsonResponse([{ ...dictionary[0], word: "world" }]);
  };
  const older = send({ type: "LOOKUP", text: "hello", requestId: "older" }, content);
  await pending;
  const newer = await send({ type: "LOOKUP", text: "world", requestId: "newer" }, content);
  assert.equal((await older).ok, false); assert.equal(newer.data.text, "world");
});
test("cancellation is scoped to request ID and browser frame", async () => {
  await configure(); let started;
  const pending = new Promise(resolve => { started = resolve; });
  fetchImpl = async (_url, init) => { started(); return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })); };
  const lookup = send({ type: "LOOKUP", text: "hello", requestId: "cancel-me" }, content); await pending;
  await send({ type: "CANCEL", requestId: "cancel-me" }, { ...content, frameId: 1 });
  await send({ type: "CANCEL", requestId: "cancel-me" }, content);
  assert.equal((await lookup).ok, false);
});
test("hung networking times out instead of keeping the request open", async t => {
  await configure(); let started;
  const pending = new Promise(resolve => { started = resolve; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  fetchImpl = async (_url, init) => { started(); return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })); };
  const lookup = send({ type: "LOOKUP", text: "hello", requestId: "timeout" }, content);
  await pending; t.mock.timers.tick(25001);
  const result = await lookup; assert.equal(result.ok, false); assert.match(result.error, /超时/);
});
test("concurrent saves do not lose words and repeated words replace rather than duplicate", async () => {
  const result = W.fromDictionary(dictionary, "hello");
  const other = { ...result, text: "world", word: "world" };
  await Promise.all([send({ type: "SAVE_WORD", result }, content), send({ type: "SAVE_WORD", result: other }, content)]);
  await send({ type: "SAVE_WORD", result }, content);
  const book = await send({ type: "GET_WORDBOOK" }); assert.equal(book.data.length, 2);
  assert.equal((await send({ type: "GET_WORDBOOK" }, content)).ok, false);
  await send({ type: "DELETE_WORD", id: "world" }); assert.equal((await send({ type: "GET_WORDBOOK" })).data.length, 1);
});
