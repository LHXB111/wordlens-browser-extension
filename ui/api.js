import "../lib/core.js";
import "../lib/view.js";
export const W = globalThis.WordLens;
export const V = globalThis.WordLensView;
export async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "插件暂时没有响应，请重试。");
  return response.data;
}
export function mountBrand() {
  document.querySelectorAll(".brand-mark").forEach(el => el.append(V.icon("book")));
  const style = document.createElement("style"); style.textContent = V.css; document.head.append(style);
}
export function setStatus(el, text, error = false) {
  el.textContent = text; el.hidden = !text; el.classList.toggle("error", error);
}
