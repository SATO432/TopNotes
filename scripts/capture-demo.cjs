const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "artifacts", "demo-frames");
const frames = [];

async function capture(page, name, caption, element, options = {}) {
  const box = element ? await element.boundingBox() : null;
  const file = path.join(outputDir, `${String(frames.length + 1).padStart(2, "0")}-${name}.png`);
  await page.waitForTimeout(options.wait ?? 320);
  await page.screenshot({ path: file });
  frames.push({
    file: path.relative(root, file).replace(/\\/g, "/"),
    caption,
    duration: options.duration ?? 1300,
    cursor: box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null,
    click: Boolean(options.click)
  });
}

async function main() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const executablePath =
    process.env.BROWSER_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({
    viewport: { width: 820, height: 620 },
    deviceScaleFactor: 1
  });

  await page.goto(pathToFileURL(path.join(root, "renderer", "index.html")).href);

  const collapsed = page.locator("#collapsed");
  await capture(page, "small-window", "三盏状态灯：每日任务、跨天遗留、今日负载", collapsed, { duration: 1600 });

  await collapsed.click();
  await page.waitForSelector("body.is-expanded");
  await capture(page, "expanded", "点击小窗，平滑展开到单一任务界面", collapsed, { click: true, duration: 1500 });

  const firstLine = page.locator(".line-content").first();
  await firstLine.click();
  await page.keyboard.type("完成首页功能演示");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  await page.keyboard.type("检查 Windows 安装包");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  await page.keyboard.type("安排明天 9 点发布");
  await capture(page, "tasks", "回车连续创建任务，勾选框保持同一列", page.locator(".note-line").nth(1), { duration: 1500 });

  const dailyLine = page.locator(".note-line").nth(1);
  await dailyLine.click();
  const dailyButton = page.locator('[data-format="daily"]');
  await dailyButton.click();
  await dailyLine.locator(".task-toggle").click();
  await capture(page, "daily", "每日任务跨天刷新，并记录累计完成次数", dailyLine.locator(".daily-count"), { click: true, duration: 1700 });

  const firstTask = page.locator(".note-line").first();
  await firstTask.locator(".line-content").click();
  const colorButton = page.locator("#colorButton");
  await colorButton.click();
  await capture(page, "palette", "颜色标记与粗体式强调组合，快速突出任务", colorButton, { click: true, duration: 1300 });
  await page.click('[data-color="#ffc857"]');

  const thirdLine = page.locator(".note-line").nth(2);
  await thirdLine.locator(".line-content").click({ button: "right" });
  await page.waitForSelector("#taskSettings:not(.hidden)");
  await page.fill("#taskComment", "发布资料：");
  const commentEditor = page.locator("#taskComment");
  await commentEditor.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await commentEditor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "https://example.com/release-notes");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  await capture(page, "annotation", "右键批注：直接粘贴网址生成可点击路径", commentEditor, { duration: 1700 });

  await commentEditor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["release"], "release-notes.pdf", { type: "application/pdf" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await page.waitForTimeout(300);
  await capture(page, "annotation-file", "文件或网址拖入批注，也会自动进入当前便签文件架", commentEditor, { duration: 1700 });
  await page.click("#closeTaskSettings");

  const shelfButton = page.locator("#toggleShelf");
  await shelfButton.click();
  await page.waitForSelector("#shelfDrawer:not(.hidden)");
  await capture(page, "shelf", "文件和网址分区管理，点击即可打开或定位", page.locator("#fileShelfList"), { click: true, duration: 1700 });

  const fileRow = page.locator("#fileShelfList .shelf-item").first();
  await fileRow.hover();
  await page.waitForTimeout(180);
  await capture(page, "jump-task", "带任务来源的文件可以一键跳回所属任务", fileRow.locator(".shelf-actions"), { duration: 1800 });

  await page.click("#closeShelf");
  await page.click("#collapse");
  await page.waitForSelector("body:not(.is-expanded)");
  await capture(page, "small-window-final", "收起后保持轻量小窗，不打断当前工作", collapsed, { duration: 1800 });

  fs.writeFileSync(
    path.join(outputDir, "frames.json"),
    JSON.stringify(frames, null, 2),
    "utf8"
  );
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
