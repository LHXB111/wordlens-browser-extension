# 拾词 · WordLens

一个可以直接加载到 **Chrome / Edge** 的划词解释插件。选中文字后，在旁边显示释义卡片；支持音标、词性、例句、朗读、复制、生词收藏和 AI 翻译。

## 安装（无需编译）

1. Chrome 地址栏打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启 **开发者模式**，点击 **加载已解压的扩展程序**。
3. 下载并解压本仓库，选择解压后包含 `manifest.json` 的文件夹。
4. 建议把「拾词」固定到浏览器工具栏。**刷新已打开的网页**。
5. 选中一个英文单词，即可看到音标、词性和英文释义。

## 接入 AI，获得中文解释和整句翻译

点击工具栏的拾词图标 → **API 设置** → **AI 详解**。

| 配置 | DeepSeek | OpenAI / 自定义服务 |
| --- | --- | --- |
| API 地址 | `https://api.deepseek.com` | OpenAI：`https://api.openai.com/v1`；自定义：服务商提供的基础地址 |
| API Key | 服务商生成的密钥 | 服务商生成的密钥 |
| 模型 | 预填 `deepseek-flash`，可以修改 | 填写你账号可用的模型名 |
| 解释语言 | 默认简体中文 | 可选简体中文、繁体中文、英文、日文 |

点击 **测试连接** 验证当前表单，再点击 **保存设置**。浏览器要求访问 API 域名时，允许该服务地址。测试也会调用一次 API，消耗服务商额度。密钥只需在浏览器设置页输入。

- 基础地址会自动补上 `/chat/completions`，也支持直接填写完整路径。不会自动猜测 `/v1`，请按服务商说明填写。
- 使用兼容 Chat Completions 的 JSON 接口（`messages` → `choices[0].message.content`）。不直接支持原生 Claude、Gemini 接口；可使用兼容网关。
- 接口不支持 `response_format` 时，关闭 **请求 JSON 输出模式**。系统提示仍要求模型返回约定的 JSON。
- 自定义支持 `http://localhost:端口/v1` 或 `http://127.0.0.1:端口/v1`；本地无需鉴权时，可留空密钥。其他地址须使用 HTTPS。
- 更换服务商会清空表单内的密钥，避免把同一把密钥误发到其他服务。API 地址只能填你信任的服务商。
- API 模型、权限和额度以你的服务商账号为准；请求 25 秒后超时。没有内置任何付费密钥。

## 使用

- **自动显示**：选中文字，稍等片刻即可查看解释。
- **小按钮模式**：选中文字后点击「解释」，适合控制 AI 调用次数。
- **手动模式**：选中后按 `Alt + T`，或使用右键菜单。
- **拖动浮窗**：按住顶部「拾词」标题栏拖动，松开即可停在新位置；翻译加载完成后保留位置，窗口缩小时自动保持在可见范围内。查询新的选中文字时，浮窗会重新出现在选区旁。
- **调整大小**：拖动浮窗四边或四角，右下角有缩放手柄；最小为 280 × 180 像素，最大不超出浏览器可见区域，小窗口会自动适配。内容自动换行，放不下时可在浮窗内滚动。当前网页会记住调整后的大小，双击右下角恢复默认大小。
- **Esc / 点击空白处**：关闭浮窗；滚动页面也会关闭，固定后保留。
- **朗读**：使用浏览器 / 系统语音，语音是否可用取决于本机环境。
- **生词本**：点击「收藏生词」，从工具栏进入生词本，支持搜索、移除、导出 UTF-8 CSV，最多 500 条。
- **网站暂停列表**：按域名配置，包含其子域名。输入框、密码框、网页编辑器默认不会触发。
- 工具栏弹窗也支持手动输入查询。

**免费词典仅查询英文单词，返回英文释义；中文解释、短语、句子和多语言翻译需配置 AI。** 免费词典依赖网络和公共 API 可用性，没有找到词时可尝试词根 / 原形或 AI。

浏览器内部页面、扩展商店、内置 PDF 阅读器无法注入普通划词脚本。扫描图片与图片中的文字没有 OCR。首次加载或重新加载插件后，请刷新网页。

## 隐私

API Key 和生词本存储在 `chrome.storage.local`，不进行账号云同步。密钥未加密，适合个人本机使用；网页内容脚本无法读取完整设置或本地存储。所有联网请求由扩展后台发送，API Key 不会插入网页或返回给网页脚本。

词典模式把查询的英文单词发送到 `api.dictionaryapi.dev`。AI 模式把选中文字发送到你配置的服务；**周围语境默认关闭**，开启后额外发送附近最多 700 字。不会上传整页内容、网页 URL、生词本或浏览历史。自动模式的划词会自动发起查询，点击按钮模式则需要点击后才发送。结果仅在后台内存中缓存最多 64 条；生词只在手动收藏时保存。卸载插件会删除本地密钥、设置和生词本，建议先导出收藏。

扩展需要普通网页的内容脚本访问能力以检测选区；只默认授予公共词典地址的网络访问权限，自定义 AI 地址在保存 / 测试时按需申请。浏览器的网页内容脚本权限有时也会覆盖相同网站的主机权限。

## 本地检查与体验页

普通用户无需安装 Node.js，也无需编译。开发检查使用 Node.js 22+，以下命令无需 npm 安装依赖：

```powershell
npm test
npm run check
npm run demo
```

打开 `http://127.0.0.1:8765/demo.html`，加载插件后即可体验选词和选句。直接双击 `demo.html` 是文件页面，默认不在注入范围内，请使用本地 HTTP 地址。`Ctrl+C` 停止体验服务器。

已通过 23 项自动化逻辑测试和 11 组独立 Edge 浏览器交互测试。浏览器测试使用模拟词典 / AI 响应，并模拟无界面环境中的主机权限弹窗；真实扩展加载、消息通信、本地存储、划词、浮窗拖动与缩放、收藏和导出均在浏览器中验证。没有使用真实付费 API Key，实际 AI 服务连通性需在设置页通过「测试连接」确认。高级浏览器测试为 `npm run test:browser`，需要可用的 Playwright 包及 Chromium / Edge。

## 结构

```text
manifest.json       Manifest V3 / Chrome 与 Edge
background.js       网络请求、权限、配置、缓存、收藏
content.js          选区监听与 Shadow DOM 浮窗
lib/core.js         文本与接口处理、提示词、结果校验
lib/view.js         共用释义卡片、朗读与复制
ui/popup.html       工具栏查询弹窗
ui/options.html     设置、生词本、使用指南
icons/              本地插件图标
tests/              请求、解析、隐私与并发测试
demo.html           划词体验页
```

## 接口参考

- [Chrome 扩展权限](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) 与 [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Free Dictionary API](https://dictionaryapi.dev/)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) 与 [JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/cli/resources/chat/subresources/completions) 与 [Structured Outputs / JSON mode](https://developers.openai.com/api/docs/guides/structured-outputs)
