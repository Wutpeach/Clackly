import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
let browser;

try {
  server = await createServer({
    root: appRoot,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 }
  });
  await server.listen();
  const url = server.resolvedUrls.local.find((value) => value.startsWith("http://127.0.0.1"));
  assert.ok(url, "Vite did not expose a local preview URL");
  const edge = path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe");
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`${url}?resolve-shortcut-spike-preview=1&locale=zh-CN`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "打开快捷键测试" }).click();
  await page.getByRole("region", { name: "Resolve 快捷键测试" }).waitFor();
  await page.getByText("已读取当前 Resolve 状态。确认快捷键后即可测试。").waitFor();
  await page.getByText(/上次诊断：SendInput；已进入发送辅助；已调用 SendInput。输入 2\/6。清理 3\/3。结果：SendInput 未完整发送。/).waitFor();
  await page.getByLabel("Resolve 显示的快捷键").fill("D");
  await page.getByLabel("我已在 Resolve 的键盘自定义中确认这个快捷键。").check();
  await page.getByRole("button", { name: "读取当前 Resolve 状态" }).click();
  await page.getByText("已读取当前 Resolve 状态。确认快捷键后即可测试。").waitFor();
  const chord = page.getByLabel("Resolve 显示的快捷键");
  const confirmation = page.getByLabel("我已在 Resolve 的键盘自定义中确认这个快捷键。");
  const testButton = page.getByRole("button", { name: "测试取消全部选择" });
  assert.equal(await chord.inputValue(), "", "a refreshed context must clear the old chord");
  assert.equal(await confirmation.isChecked(), false, "a refreshed context must clear confirmation");
  assert.equal(await testButton.isDisabled(), true, "a refreshed context must be no-send");
  await chord.fill("D");
  await confirmation.check();
  await testButton.click();
  await page.getByText("测试请求已提交。请在 Resolve 中检查实际效果；按键传输本身不能证明操作成功。").waitFor();
  console.log("Shortcut-test panel preview passed with the no-send browser fixture.");
} finally {
  await browser?.close();
  await server?.close();
}
