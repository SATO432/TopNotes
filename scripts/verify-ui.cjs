const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

async function main() {
  const executablePath =
    process.env.BROWSER_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 820, height: 620 }, deviceScaleFactor: 1 });
  const indexPath = path.resolve(__dirname, "..", "renderer", "index.html");
  await page.goto(pathToFileURL(indexPath).href);
  await page.click("#collapsed");
  await page.waitForSelector("body.is-expanded");
  await page.evaluate(() => {
    document.querySelector(".note-line").insertAdjacentHTML(
      "beforeend",
      '<button class="task-delete" type="button">x</button>'
    );
    window.normalizeTaskLines();
  });
  if ((await page.locator(".task-delete").count()) !== 0) {
    throw new Error("Legacy task delete controls should be cleaned from saved tasks");
  }
  if ((await page.locator("#hideWindow, #quickHide").count()) !== 0) {
    throw new Error("Minimize controls should not be present");
  }
  if ((await page.locator("#awakeDot").count()) !== 0) {
    throw new Error("The separate green status dot should not be present");
  }
  if ((await page.locator("#settingWindowMode").inputValue()) !== "pointer") {
    throw new Error("Pointer-triggered small window should be the default mode");
  }
  for (const removedFormat of ["bold", "italic", "strike", "code", "link", "quote", "check"]) {
    if ((await page.locator(`[data-format="${removedFormat}"]`).count()) !== 0) {
      throw new Error(`Removed toolbar action should not be present: ${removedFormat}`);
    }
  }
  if ((await page.locator(".format-tools [data-format]").first().getAttribute("data-format")) !== "daily") {
    throw new Error("Daily task action should be the first toolbar action");
  }
  const firstLine = page.locator(".note-line .line-content").first();
  await firstLine.click();
  await page.keyboard.type("整理今天最重要的目标");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
  await page.keyboard.type("按回车会生成下一条任务");
  await page.locator('[data-format="list"]').click();
  const listType = await page.locator(".note-line").nth(1).getAttribute("data-type");
  if (listType !== "bullet") {
    throw new Error(`Expected bullet line, received ${listType}`);
  }
  if (!(await page.locator(".note-line").nth(1).locator(".task-toggle").isVisible())) {
    throw new Error("Subclassification lines should retain their task checkbox");
  }
  await page.locator('[data-format="list"]').click();
  const typeAfterExit = await page.locator(".note-line").nth(1).getAttribute("data-type");
  if (typeAfterExit !== "bullet") {
    throw new Error("Exiting a subset should keep the current line in its subset style");
  }
  await page.keyboard.press("Enter");
  const nextLineType = await page.locator(".note-line").nth(2).getAttribute("data-type");
  if (nextLineType !== "task") {
    throw new Error("The next line after exiting a subset should return to a normal task");
  }
  await page.locator(".line-content").nth(1).click();
  await page.click("#colorButton");
  await page.click('[data-color="#ffc857"]');
  const colored = await page.locator('#noteEditor [color="#ffc857"], #noteEditor font[color="#ffc857"], #noteEditor span[style*="rgb(255, 200, 87)"]').count();
  if (colored < 1) {
    throw new Error("Color marker should apply to the selected task text");
  }
  await page.click('[data-format="daily"]');
  const dailyLine = page.locator(".note-line").nth(1);
  if ((await dailyLine.getAttribute("data-daily")) !== "true") {
    throw new Error("Selected task should be marked as daily");
  }
  await dailyLine.locator(".task-toggle").click();
  if (!(await dailyLine.evaluate((line) => line.classList.contains("done")))) {
    throw new Error("Daily task should be completable for the current day");
  }
  if ((await dailyLine.locator(".daily-count").textContent()) !== "×1") {
    throw new Error("Completing a daily task should increment its success count");
  }
  await dailyLine.locator(".task-toggle").click();
  await dailyLine.locator(".task-toggle").click();
  if ((await dailyLine.locator(".daily-count").textContent()) !== "×1") {
    throw new Error("Completing the same daily task twice in one day should only count once");
  }
  await dailyLine.evaluate((line) => {
    line.dataset.dailyLast = "2000-01-01";
    line.dataset.dailyCountedDate = "2000-01-01";
    window.commitEditor();
  });
  await page.evaluate(() => window.applyDailyReset());
  if (await dailyLine.evaluate((line) => line.classList.contains("done"))) {
    throw new Error("Daily task completion should reset on a new day");
  }
  await dailyLine.locator(".task-toggle").click();
  if ((await dailyLine.locator(".daily-count").textContent()) !== "×2") {
    throw new Error("Daily task success count should increment on the next day");
  }
  await dailyLine.locator(".task-toggle").click();
  await page.locator(".note-line .task-toggle").first().click();
  if ((await page.locator("#collapsedTitle").textContent()) !== "Top Notes") {
    throw new Error("Collapsed bar should use the Top Notes brand name");
  }
  if ((await page.locator("#collapsedLights .task-light").count()) !== 3) {
    throw new Error("Expected three task status lights");
  }
  const redLightCount = await page.locator("#collapsedLights .task-light.red").count();
  if (redLightCount !== 1) {
    throw new Error(`Expected only the daily-task light to be red, received ${redLightCount}`);
  }
  const folderBox = await page.locator("#toggleShelf").boundingBox();
  const metaBox = await page.locator("#noteMeta").boundingBox();
  if (!folderBox || !metaBox || folderBox.x + folderBox.width > metaBox.x) {
    throw new Error("Note file button should be to the left of the updated time");
  }
  await page.locator(".note-line").first().click({ button: "right" });
  await page.waitForSelector("#taskSettings:not(.hidden)");
  if ((await page.locator("#taskSettingsText, .task-settings-head").count()) !== 0) {
    throw new Error("Task settings should not show a title or task detail block");
  }
  if ((await page.locator("#taskReminderYear, #taskReminderDay").count()) !== 0) {
    throw new Error("Reminder controls should not be present");
  }
  await page.fill("#taskComment", "这是任务批注 ");
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "www.example.org/copied-link");
    document.getElementById("taskComment").dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer })
    );
  });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["attachment"], "task-attachment.txt", { type: "text/plain" }));
    document.getElementById("taskComment").dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer })
    );
  });
  await page.waitForTimeout(260);
  if ((await page.locator("#saveTaskSettings").count()) !== 0) {
    throw new Error("Annotation panel should save in real time without a save button");
  }
  await page.screenshot({ path: path.resolve(__dirname, "..", "artifacts", "topnotes-annotation.png") });
  await page.click("#closeTaskSettings");
  await page.waitForSelector("#taskSettings", { state: "hidden" });
  if ((await page.locator(".line-flag.comment").count()) < 1) {
    throw new Error("Expected a comment flag");
  }
  await page.locator(".note-line").nth(1).click({ button: "right" });
  await page.waitForSelector("#taskSettings:not(.hidden)");
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "https://www.example.org/copied-link");
    document.getElementById("taskComment").dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer })
    );
  });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["attachment"], "task-attachment.txt", { type: "text/plain" }));
    document.getElementById("taskComment").dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer })
    );
  });
  await page.waitForTimeout(260);
  await page.click("#closeTaskSettings");
  await page.waitForSelector("#taskSettings", { state: "hidden" });
  await page.click("#toggleShelf");
  await page.waitForSelector("#shelfDrawer:not(.hidden)");
  if ((await page.locator("#addFiles").getAttribute("title")) !== "导入文件") {
    throw new Error("File shelf import control should be clearly labeled");
  }
  if (!(await page.locator("#closeShelf").isVisible())) {
    throw new Error("File shelf should provide a close button");
  }
  if (!(await page.locator("#urlShelfList").textContent()).includes("https://www.example.org/copied-link")) {
    throw new Error("Pasted URL should be normalized and appear in the URL shelf section");
  }
  if (!(await page.locator("#fileShelfList").textContent()).includes("task-attachment.txt")) {
    throw new Error("Annotation attachment should appear in the note file shelf");
  }
  if (!(await page.locator("#fileShelfList").textContent()).includes("任务：")) {
    throw new Error("Shelf attachment should show its task origin");
  }
  if ((await page.locator("#urlShelfList .shelf-item").count()) !== 1) {
    throw new Error("Duplicate URLs should be stored only once per note");
  }
  if ((await page.locator("#fileShelfList .shelf-item").count()) !== 2) {
    throw new Error("The same file should be attachable from different tasks");
  }
  await page.screenshot({ path: path.resolve(__dirname, "..", "artifacts", "topnotes-shelf.png") });
  await page.locator("#urlShelfList .shelf-item").first().click({ button: "right" });
  await page.waitForSelector("#appDialogOverlay:not(.hidden)");
  await page.screenshot({ path: path.resolve(__dirname, "..", "artifacts", "topnotes-dialog.png") });
  await page.click("#appDialogCancel");
  await page.waitForSelector("#appDialogOverlay", { state: "hidden" });
  if ((await page.locator("#urlShelfList .shelf-item").count()) !== 1) {
    throw new Error("Canceling the in-app remove dialog should keep the URL");
  }
  const fileRow = page.locator("#fileShelfList .shelf-item").first();
  await fileRow.hover();
  const taskButton = fileRow.locator(".shelf-actions button");
  if ((await taskButton.count()) !== 1) {
    throw new Error("Task-origin files should expose a jump-to-task action");
  }
  await taskButton.click();
  if ((await page.locator(".note-line.task-locate").count()) < 1) {
    throw new Error("Jump-to-task action should locate the source task");
  }
  await page.click("#closeShelf");
  await page.waitForSelector("#shelfDrawer", { state: "hidden" });
  await page.click("#toggleSettings");
  if ((await page.locator("#settingTheme option").count()) < 5) {
    throw new Error("Expected multiple visual themes");
  }
  const graphiteBackground = await page.locator("#collapsed").evaluate((element) => getComputedStyle(element).backgroundImage);
  await page.selectOption("#settingTheme", "paper");
  const paperBackground = await page.locator("#collapsed").evaluate((element) => getComputedStyle(element).backgroundImage);
  if (graphiteBackground === paperBackground) {
    throw new Error("The collapsed small window should follow the selected theme");
  }
  await page.selectOption("#settingTheme", "midnight");
  if ((await page.locator("body").getAttribute("data-theme")) !== "midnight") {
    throw new Error("Midnight theme should apply to the app");
  }
  await page.selectOption("#settingTheme", "graphite");
  const openModeBox = await page.locator("#settingWindowMode").boundingBox();
  const launchBox = await page.locator("#settingLaunch").boundingBox();
  if (!openModeBox || !launchBox || openModeBox.y + openModeBox.height > launchBox.y) {
    throw new Error("Opening mode and launch-at-login settings overlap");
  }
  await page.click("#closeSettings");
  await page.click("#collapse");
  await page.waitForSelector("body:not(.is-expanded)");
  await page.screenshot({ path: path.resolve(__dirname, "..", "artifacts", "topnotes-collapsed.png") });
  await page.click("#collapsed");
  await page.waitForSelector("body.is-expanded");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, "..", "artifacts", "topnotes-preview.png") });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
