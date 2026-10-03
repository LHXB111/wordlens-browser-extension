import test from "node:test";
import assert from "node:assert/strict";
import "../lib/core.js";
const W = globalThis.WordLens;

test("supports base URLs, versioned gateways and full completion URLs", () => {
  assert.equal(W.endpointURL("https://api.deepseek.com/"), "https://api.deepseek.com/chat/completions");
  assert.equal(W.endpointURL("https://gateway.example/v1/"), "https://gateway.example/v1/chat/completions");
  assert.equal(W.endpointURL("https://gateway.example/v1/chat/completions/"), "https://gateway.example/v1/chat/completions");
  assert.equal(W.endpointURL("http://localhost:1234/v1"), "http://localhost:1234/v1/chat/completions");
  assert.equal(W.permissionOrigin("http://127.0.0.1:8000/v1"), "http://127.0.0.1/*");
});
test("rejects credentials in URLs, insecure remote URLs and unsafe protocols", () => {
  for (const url of ["not-a-url", "http://remote.example/v1", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com?key=secret", "https://example.com/#secret"]) assert.throws(() => W.endpointURL(url));
});
test("normalizes text while preserving the word length for limits", () => {
  assert.equal(W.normalizeText("  Hello\n   world  "), "Hello world");
  assert.equal(W.normalizeText(null), "");
  assert.equal(W.isWord("mother-in-law"), true);
  assert.equal(W.isWord("don't"), true);
  assert.equal(W.isWord("hello world"), false);
});
test("configuration is whitelisted and public configuration does not expose secrets", () => {
  const value = W.normalizeSettings({ apiKey: "secret", provider: "__proto__", maxChars: 999999, unrelated: "oops", excludedSites: ["EXAMPLE.COM", "*.example.com", "https://bad.com"] });
  assert.equal(value.provider, "custom"); assert.equal(value.maxChars, 4000);
  assert.deepEqual(value.excludedSites, ["example.com"]);
  assert.equal(Object.hasOwn(value, "unrelated"), false);
  const pub = W.publicSettings(value);
  for (const name of ["apiKey", "endpoint", "model", "provider"]) assert.equal(Object.hasOwn(pub, name), false);
});
test("excluded domains cover their subdomains without substring matches", () => {
  assert.equal(W.isExcluded("mail.example.com", ["example.com"]), true);
  assert.equal(W.isExcluded("example.com", ["example.com"]), true);
  assert.equal(W.isExcluded("notexample.com", ["example.com"]), false);
});
test("AI credential validation permits only local keyless services", () => {
  assert.throws(() => W.validateAI(W.normalizeSettings({ apiKey: "" })), /API Key/);
  assert.equal(W.validateAI(W.normalizeSettings({ endpoint: "http://localhost:1234/v1", model: "local" })), "http://localhost:1234/v1/chat/completions");
});
test("context is absent unless the user explicitly enables it", () => {
  const settings = W.normalizeSettings();
  assert.equal(JSON.parse(W.buildMessages("bank", "private paragraph", settings)[1].content).context, "");
  assert.equal(JSON.parse(W.buildMessages("bank", "private paragraph", { ...settings, includeContext: true })[1].content).context, "private paragraph");
  assert.equal(JSON.parse(W.buildMessages("bank", "x".repeat(1000), { ...settings, includeContext: true })[1].content).context.length, 700);
});
test("accepts JSON and fenced JSON but reports malformed/empty results", () => {
  const json = JSON.stringify({ word: "hello", translation: "你好", definitions: [{ partOfSpeech: "interj.", meaning: "问候语" }] });
  assert.equal(W.parseAI(json, "hello", "Test").translation, "你好");
  assert.equal(W.parseAI("```json\n" + json + "\n```", "hello", "Test").definitions.length, 1);
  assert.throws(() => W.parseAI("", "hello", "Test"), /空内容/);
  assert.throws(() => W.parseAI("not json", "hello", "Test"), /JSON/);
  assert.throws(() => W.parseAI('{"word":"hello"}', "hello", "Test"), /有效释义/);
});
test("dictionary merges parts of speech, examples and phonetic variants", () => {
  const result = W.fromDictionary([{ word: "test", phonetics: [{ text: "/test/", audio: "https://example.com/test-us.mp3" }], meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "an examination", example: "Take the test." }] }, { partOfSpeech: "verb", definitions: [{ definition: "to check" }] }] }], "test");
  assert.equal(result.definitions.length, 2); assert.equal(result.examples[0].text, "Take the test.");
  assert.equal(result.phoneticUS, "/test/"); assert.equal(result.source, "Free Dictionary");
});
test("bounds model fields and safely handles null entries", () => {
  const result = W.normalizeResult({ translation: "x".repeat(10000), definitions: [null, ...Array.from({ length: 20 }, () => ({ meaning: "y".repeat(2000) }))], examples: [null, { text: "example" }] }, "test");
  assert.equal(result.translation.length, 6000); assert.ok(result.definitions.length <= 6);
  assert.equal(result.definitions[0].meaning.length, 1000); assert.equal(result.examples.length, 1);
});
test("CSV escaping protects quotes, newlines and formula cells", () => {
  assert.equal(W.csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(W.csvCell("=SUM(1,1)"), '"\'=SUM(1,1)"');
  assert.equal(W.csvCell("正常文本"), '"正常文本"');
});
