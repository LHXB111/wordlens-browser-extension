import { createRequire } from "node:module";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(process.env.WORDLENS_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }
let executablePath = playwright.chromium.executablePath();
try { await access(executablePath); }
catch { executablePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"; }
const artifacts = resolve(root, "artifacts"); await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "wordlens-browser-test-"));
const server = spawn(process.execPath, [resolve(root, "scripts/serve.mjs")], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
await new Promise((resolvePromise, reject) => {
  server.stdout.once("data", resolvePromise); server.once("error", reject);
  server.stderr.once("data", data => reject(new Error(data.toString())));
});
let browser;
const errors = [], checks = [];
try {
  browser = await playwright.chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: { width: 1380, height: 1100 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, "--no-first-run"],
    ignoreDefaultArgs: ["--disable-extensions"]
  });
  let [worker] = browser.serviceWorkers();
  if (!worker) worker = await browser.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(() => { globalThis.__testRequests = []; globalThis.__testFail = false; const original = globalThis.fetch; globalThis.fetch = async (url, init = {}) => {
    globalThis.__testRequests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.startsWith("https://api.dictionaryapi.dev/")) return new Response(JSON.stringify([{ word: decodeURIComponent(url.split("/").at(-1)), phonetic: "/ˌserənˈdɪpəti/", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "The occurrence of happy discoveries by chance.", example: "Finding this bookshop was serendipity." }] }] }]), { status: 200 });
    if (url.startsWith("http://127.0.0.1:8765/v1/")) {
      if (globalThis.__testFail) return new Response("test secret", { status: 401 });
      const data = JSON.parse(init.body); const selected = JSON.parse(data.messages[1].content).selectedText;
      if (globalThis.__testHold) {
        globalThis.__testHold = false;
        await new Promise(resolveResponse => { globalThis.__testRelease = resolveResponse; });
        globalThis.__testRelease = null;
      }
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ word: selected, language: "en", phonetic: "/ˌserənˈdɪpəti/", translation: selected.includes(" ") ? "学习最好的方式，是保持好奇。" : "不期而遇的美好；意外发现的幸运", definitions: [{ partOfSpeech: "n. 名词", meaning: "偶然发现美好事物的机缘。" }], examples: [{ text: "Finding this little bookshop was pure serendipity.", translation: "偶然发现这家小书店，真是一份意外的幸运。" }], notes: "<img src=x onerror=alert('xss')> 是文本，不是网页代码。" }) } }] }), { status: 200 });
    }
    return original(url, init);
  }; });
  const settings = await browser.newPage();
  settings.on("pageerror", error => errors.push(error.message));
  await settings.addInitScript(() => { globalThis.__requestedOrigins = []; chrome.permissions.request = async details => { globalThis.__requestedOrigins.push(...details.origins); return true; }; });
  // Native host permission dialogs cannot be answered in headless mode.
  // Unit tests separately verify rejection and the background permission gate.
  await worker.evaluate(() => { const contains = chrome.permissions.contains.bind(chrome.permissions); chrome.permissions.contains = details => details.origins?.includes("http://127.0.0.1/*") ? Promise.resolve(true) : contains(details); });
  await settings.goto(`chrome-extension://${extensionId}/ui/options.html`);
  await settings.locator("#save").waitFor({ state: "visible" });
  await settings.waitForFunction(() => !document.querySelector("#save").disabled);
  assert.equal(await settings.locator("#enabled").isChecked(), true);
  assert.equal(await settings.locator("input[name=mode][value=dictionary]").isChecked(), true);
  await settings.screenshot({ path: resolve(artifacts, "settings-dictionary.png"), fullPage: true, animations: "disabled" });
  checks.push("实际 MV3 扩展加载、设置页初始化与免费词典模式");

  const popup = await browser.newPage(); popup.on("pageerror", error => errors.push(error.message));
  await popup.setViewportSize({ width: 380, height: 590 });
  await popup.goto(`chrome-extension://${extensionId}/ui/popup.html`);
  await popup.locator("#mode-badge").filter({ hasText: "免费英文词典" }).waitFor();
  await popup.screenshot({ path: resolve(artifacts, "popup.png"), animations: "disabled" });
  await popup.locator("#query").fill("hello"); await popup.locator("#lookup").click();
  await popup.locator("#result .wl-word").waitFor();
  assert.equal(await popup.locator("#result .wl-word").textContent(), "hello");
  checks.push("工具栏弹窗手动查询与词典结果");

  await settings.locator("input[name=mode][value=ai]").check();
  await settings.locator("#provider").selectOption("custom");
  await settings.locator("#endpoint").fill("http://127.0.0.1:8765/v1");
  await settings.locator("#model").fill("test-model");
  // Exercise permissions.request from the real click handler's user gesture.
  await settings.locator("#test-connection").click();
  await settings.waitForFunction(() => !document.querySelector("#test-connection").disabled, { timeout: 30000 });
  assert.match(await settings.locator("#test-status").textContent(), /连接成功/);
  assert.equal(await settings.evaluate(() => __requestedOrigins.at(-1)), "http://127.0.0.1/*");
  await settings.screenshot({ path: resolve(artifacts, "settings-ai.png"), fullPage: true });
  await settings.locator("#save").click();
  await settings.locator("#save-status").filter({ hasText: "已保存" }).waitFor();
  checks.push("自定义本地 AI、权限申请参数、连接测试与配置保存（原生权限弹窗模拟）");

  const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("http://127.0.0.1:8765/demo.html");
  const cdp = await browser.newCDPSession(page);
  async function shadowCall(func, ...args) {
    const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    function find(node) {
      if (node.attributes?.includes("data-wordlens-root")) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const result = find(child); if (result) return result; }
    }
    const host = find(doc.root);
    assert.ok(host?.shadowRoots?.[0], "closed Shadow DOM exists");
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: host.shadowRoots[0].backendNodeId });
    const response = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: func, arguments: args.map(value => ({ value })), returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
  async function select(selector) {
    await page.evaluate(selector => { const el = document.querySelector(selector); const range = document.createRange(); range.selectNodeContents(el); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); }, selector);
  }
  async function waitPanel(text) {
    for (let i = 0; i < 40; i++) {
      try { if (await shadowCall('function(t){return !this.querySelector(".wl-panel").hidden && this.textContent.includes(t)}', text)) return; } catch {}
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
    throw new Error(`Panel did not show: ${text}`);
  }
  async function panelBounds() {
    return shadowCall('function(){const r=this.querySelector(".wl-panel").getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};}');
  }
  async function dragPanel(left, top) {
    const handle = await shadowCall('function(){const r=this.querySelector(".wl-topbar").getBoundingClientRect();return {x:r.left+50,y:r.top+r.height/2};}');
    const bounds = await panelBounds();
    await page.mouse.move(handle.x, handle.y); await page.mouse.down();
    await page.mouse.move(left + handle.x - bounds.left, top + handle.y - bounds.top, { steps: 8 });
    await page.mouse.up();
    return panelBounds();
  }
  async function clickPanel(selector) {
    const center = await shadowCall('function(s){const r=this.querySelector(s).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}', selector);
    await page.mouse.click(center.x, center.y);
  }
  async function resizePanel(direction, dx, dy) {
    const center = await shadowCall('function(s){const r=this.querySelector(s).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}', `.wl-resize-${direction}`);
    await page.mouse.move(center.x, center.y); await page.mouse.down();
    await page.mouse.move(center.x + dx, center.y + dy, { steps: 8 }); await page.mouse.up();
    return panelBounds();
  }
  function panelSize(bounds) { return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }; }
  await page.locator("#demo-word").dblclick(); await waitPanel("不期而遇");
  assert.equal(await page.locator("[data-wordlens-root]").evaluate(el => el.shadowRoot), null);
  const bounds = await shadowCall('function(){const r=this.querySelector(".wl-panel").getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};}');
  assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= 1100 && bounds.bottom <= 900);
  assert.equal(await shadowCall('function(){return this.querySelectorAll("img").length;}'), 0);
  await page.screenshot({ path: resolve(artifacts, "selection.png") });
  await shadowCall('function(){this.querySelector(".wl-action").click();}');
  await waitPanel("已保存到你的生词本");
  checks.push("真实网页划词、中文释义、音标、例句、收藏、边界定位与 XSS 文本处理");
  await page.keyboard.press("Escape");
  assert.equal(await shadowCall('function(){return this.querySelector(".wl-panel").hidden;}'), true);

  // Hold a fresh lookup while moving the loading card, then render a taller result.
  await page.locator("#demo-word").evaluate(el => { el.textContent = "curiosity"; });
  await worker.evaluate(() => { globalThis.__testHold = true; });
  await page.locator("#demo-word").dblclick(); await waitPanel("正在理解");
  const selectionBeforeDrag = await page.evaluate(() => getSelection().toString());
  const requestsBeforeDrag = await worker.evaluate(() => globalThis.__testRequests.length);
  const moved = await dragPanel(90, 24);
  assert.equal(Math.round(moved.left), 90); assert.equal(Math.round(moved.top), 24);
  await worker.evaluate(() => { if (!globalThis.__testRelease) throw new Error("Lookup was not held"); globalThis.__testRelease(); });
  await waitPanel("不期而遇");
  const rendered = await panelBounds();
  assert.equal(rendered.left, moved.left); assert.equal(rendered.top, moved.top);
  assert.equal(await page.evaluate(() => getSelection().toString()), selectionBeforeDrag);
  assert.equal(await worker.evaluate(() => globalThis.__testRequests.length), requestsBeforeDrag);
  // Reading/selecting the result does not move the card.
  const textPoint = await shadowCall('function(){const r=this.querySelector(".wl-translation").getBoundingClientRect();return {x:r.left+15,y:r.top+r.height/2};}');
  await page.mouse.move(textPoint.x, textPoint.y); await page.mouse.down();
  await page.mouse.move(textPoint.x + 55, textPoint.y, { steps: 5 }); await page.mouse.up();
  assert.deepEqual(await panelBounds(), rendered);
  const upperLeft = await dragPanel(-500, -500);
  assert.equal(upperLeft.left, 12); assert.equal(upperLeft.top, 12);
  const lowerRight = await dragPanel(1600, 1400);
  assert.ok(lowerRight.right <= 1088 && lowerRight.bottom <= 888);
  await page.mouse.move(100, 100);
  assert.deepEqual(await panelBounds(), lowerRight, "Releasing the pointer stops dragging");
  await clickPanel("[aria-pressed]");
  assert.equal(await shadowCall('function(){return this.querySelector("[aria-pressed]").getAttribute("aria-pressed");}'), "true");
  assert.deepEqual(await panelBounds(), lowerRight, "The pin button does not start dragging");
  await page.evaluate(() => scrollBy(0, 120));
  assert.equal(await shadowCall('function(){return this.querySelector(".wl-panel").hidden;}'), false);
  assert.deepEqual(await panelBounds(), lowerRight);
  await page.setViewportSize({ width: 460, height: 480 });
  await page.waitForFunction(() => innerWidth === 460);
  // ResizeObserver also clamps the larger result to the smaller viewport.
  await page.waitForTimeout(100);
  const resized = await panelBounds();
  assert.ok(resized.left >= 12 && resized.top >= 12 && resized.right <= 448 && resized.bottom <= 468);
  await page.screenshot({ path: resolve(artifacts, "draggable-panel.png") });
  await clickPanel('[aria-label="关闭 · Esc"]');
  assert.equal(await shadowCall('function(){return this.querySelector(".wl-panel").hidden;}'), true);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator("#demo-word").evaluate(el => { el.textContent = "serendipity"; });
  await page.waitForTimeout(550);
  checks.push("真实鼠标拖动、加载后位置保留、正文选字、边缘限制、松手停止、固定/关闭按钮与窗口缩放");

  await page.locator("#demo-word").evaluate(el => { el.textContent = "beautiful"; });
  await worker.evaluate(() => { globalThis.__testHold = true; });
  await page.locator("#demo-word").dblclick(); await waitPanel("正在理解");
  await dragPanel(60, 24);
  const loadingSize = panelSize(await panelBounds());
  const enlarged = await resizePanel("se", 520 - loadingSize.width, 400 - loadingSize.height);
  assert.deepEqual(panelSize(enlarged), { width: 520, height: 400 });
  const requestsBeforeResize = await worker.evaluate(() => globalThis.__testRequests.length);
  await worker.evaluate(() => { if (!globalThis.__testRelease) throw new Error("Lookup was not held"); globalThis.__testRelease(); });
  await waitPanel("不期而遇");
  assert.deepEqual(await panelBounds(), enlarged, "Rendering keeps the chosen size and position");
  const bodyBounds = await shadowCall('function(){const el=this.querySelector(".wl-body"),r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,overflow:el.scrollHeight>el.clientHeight};}');
  assert.equal(bodyBounds.overflow, true);
  await page.mouse.move(bodyBounds.x, bodyBounds.y); await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(100);
  assert.equal(await shadowCall('function(){const el=this.querySelector(".wl-body");return el.scrollTop>0 && el.scrollTop+el.clientHeight>=el.scrollHeight-1;}'), true);
  assert.equal(await shadowCall('function(){return this.querySelector(".wl-panel").hidden;}'), false);
  const movedAfterResize = await dragPanel(100, 100);
  assert.deepEqual(panelSize(movedAfterResize), { width: 520, height: 400 });
  const westResize = await resizePanel("w", -60, 0);
  assert.equal(westResize.left, 40); assert.equal(westResize.right, movedAfterResize.right);
  const northResize = await resizePanel("n", 0, -50);
  assert.equal(northResize.top, 50); assert.equal(northResize.bottom, westResize.bottom);
  const minimum = await resizePanel("se", -2000, -2000);
  assert.deepEqual(panelSize(minimum), { width: 280, height: 180 });
  assert.equal(minimum.left, northResize.left); assert.equal(minimum.top, northResize.top);
  const maximum = await resizePanel("se", 2000, 2000);
  assert.ok(maximum.right <= 1088 && maximum.bottom <= 888);
  await page.mouse.move(100, 100);
  assert.deepEqual(await panelBounds(), maximum, "Releasing the pointer stops resizing");
  assert.equal(await worker.evaluate(() => globalThis.__testRequests.length), requestsBeforeResize);
  await page.setViewportSize({ width: 320, height: 300 }); await page.waitForTimeout(100);
  const compact = await panelBounds();
  assert.ok(compact.left >= 12 && compact.top >= 12 && compact.right <= 308 && compact.bottom <= 288);
  assert.equal(await shadowCall('function(){const el=this.querySelector(".wl-body");return el.scrollWidth<=el.clientWidth;}'), true);
  const grip = await shadowCall('function(){const r=this.querySelector(".wl-resize-se").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}');
  await page.mouse.dblclick(grip.x, grip.y);
  await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForTimeout(100);
  const restored = panelSize(await panelBounds());
  assert.equal(restored.width, 360); assert.ok(restored.height > 180, "Double-click restores the natural height");
  await dragPanel(60, 24);
  await resizePanel("se", 430 - restored.width, 300 - restored.height);
  await page.screenshot({ path: resolve(artifacts, "resizable-panel.png") });
  await clickPanel('[aria-label="关闭 · Esc"]');
  await page.locator("#demo-word").evaluate(el => { el.textContent = "serendipity"; });
  await page.waitForTimeout(550);
  checks.push("浮窗边缘与角落缩放、最小/最大尺寸、加载后保留大小、内容滚动、缩放后移动与双击恢复默认");

  await select("#demo-sentence"); await waitPanel("学习最好的方式");
  assert.deepEqual(panelSize(await panelBounds()), { width: 430, height: 300 }, "The current page remembers the chosen size for new lookups");
  assert.notEqual((await panelBounds()).top, moved.top, "A new selection resets the manual position");
  await shadowCall('function(){this.querySelector("[aria-pressed]").click();}');
  await page.evaluate(() => scrollBy(0, 300));
  assert.equal(await shadowCall('function(){return this.querySelector(".wl-panel").hidden;}'), false);
  await page.keyboard.press("Escape");
  const before = await worker.evaluate(() => globalThis.__testRequests.length);
  await page.locator("textarea").fill("serendipity"); await page.locator("textarea").selectText();
  await new Promise(resolvePromise => setTimeout(resolvePromise, 450));
  assert.equal(await worker.evaluate(() => globalThis.__testRequests.length), before);
  checks.push("整句翻译、固定、Esc 关闭与输入区域保护");

  await settings.locator('[data-tab="wordbook"]').click();
  await settings.locator(".book-card").waitFor();
  await settings.screenshot({ path: resolve(artifacts, "wordbook.png"), fullPage: true });
  await settings.locator("#book-search").fill("不存在的词");
  await settings.locator(".book-empty").waitFor();
  await settings.locator("#book-search").fill("");
  const downloadPromise = settings.waitForEvent("download");
  await settings.locator("#export").click(); const download = await downloadPromise;
  await download.saveAs(resolve(artifacts, "wordbook-test.csv"));
  assert.ok((await readFile(resolve(artifacts, "wordbook-test.csv"), "utf8")).includes("serendipity"));
  await settings.locator('[aria-label="移除收藏"]').click();
  await settings.locator(".book-empty").waitFor();
  checks.push("生词本搜索、UTF-8 CSV 导出与移除");

  await settings.locator('[data-tab="settings"]').click();
  await settings.locator("#trigger").selectOption("button"); await settings.locator("#save").click();
  await settings.locator("#save-status").filter({ hasText: "已保存" }).waitFor();
  await page.reload(); await page.locator("textarea").blur(); await select("#demo-word");
  for (let i = 0; i < 30; i++) { try { if (await shadowCall('function(){return !this.querySelector(".wl-trigger").hidden;}')) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.equal(await shadowCall('function(){return this.querySelector(".wl-panel").hidden;}'), true);
  await shadowCall('function(){this.querySelector(".wl-trigger").click();}'); await waitPanel("不期而遇");
  checks.push("选中后小按钮模式，点击后才查询");

  await settings.locator("#trigger").selectOption("manual"); await settings.locator("#save").click();
  await settings.locator("#save-status").filter({ hasText: "已保存" }).waitFor();
  await page.reload(); await select("#demo-word");
  await page.bringToFront();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: "SHOW_SELECTION" }), tabId); await waitPanel("不期而遇");
  checks.push("手动查询消息通路");

  await settings.locator("#excluded-sites").fill("127.0.0.1"); await settings.locator("#save").click();
  await settings.locator("#save-status").filter({ hasText: "已保存" }).waitFor();
  const response = await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: "SHOW_SELECTION" }), tabId);
  assert.equal(response.ok, false);
  checks.push("暂停网站配置即时生效");

  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, "browser-report.json"), JSON.stringify({ browser: executablePath, extensionId, checks, errors, network: "Dictionary and AI responses plus native optional permission dialogs are mocked; actual extension loading, messaging, storage and DOM are exercised." }, null, 2));
  console.log(`Passed ${checks.length} browser scenarios with no page errors. Screenshots: ${artifacts}`);
} finally { await browser?.close(); server.kill(); }
