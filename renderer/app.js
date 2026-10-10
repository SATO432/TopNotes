const STORAGE_KEY = "topnotes-fallback-state";
const COLORS = ["#8fe3bd", "#9fc4ff", "#ffc875", "#ff9fae", "#c4a7ff", "#7fd7d0"];

const isElectron = Boolean(window.topNotes?.isElectron);
const api = window.topNotes || createBrowserFallback();

let state = createDefaultState();
let expanded = false;
let saveTimer = null;
let searchQuery = "";
let savedRange = null;
let activeLineElement = null;
let taskSettingsTarget = null;
let lastActivitySentAt = 0;
let savedAnnotationRange = null;
let annotationSaveTimer = null;
let dialogResolver = null;
let editorMode = "task";

const els = {
  body: document.body,
  collapsed: document.getElementById("collapsed"),
  collapsedLights: document.getElementById("collapsedLights"),
  collapsedTitle: document.getElementById("collapsedTitle"),
  collapsedMeta: document.getElementById("collapsedMeta"),
  brandLights: document.getElementById("brandLights"),
  quickNew: document.getElementById("quickNew"),
  tabs: document.getElementById("tabs"),
  newTab: document.getElementById("newTab"),
  noteTitle: document.getElementById("noteTitle"),
  noteMeta: document.getElementById("noteMeta"),
  noteEditor: document.getElementById("noteEditor"),
  searchRow: document.getElementById("searchRow"),
  searchInput: document.getElementById("searchInput"),
  searchCount: document.getElementById("searchCount"),
  toggleSearch: document.getElementById("toggleSearch"),
  toggleShelf: document.getElementById("toggleShelf"),
  shelfDrawer: document.getElementById("shelfDrawer"),
  settingsDrawer: document.getElementById("settingsDrawer"),
  shelfCount: document.getElementById("shelfCount"),
  urlShelfList: document.getElementById("urlShelfList"),
  fileShelfList: document.getElementById("fileShelfList"),
  addFiles: document.getElementById("addFiles"),
  closeShelf: document.getElementById("closeShelf"),
  filePicker: document.getElementById("filePicker"),
  dropZone: document.getElementById("dropZone"),
  keepAwake: document.getElementById("keepAwake"),
  alwaysOnTop: document.getElementById("alwaysOnTop"),
  toggleSettings: document.getElementById("toggleSettings"),
  exportNote: document.getElementById("exportNote"),
  colorButton: document.getElementById("colorButton"),
  colorPalette: document.getElementById("colorPalette"),
  colorReset: document.getElementById("colorReset"),
  closeSettings: document.getElementById("closeSettings"),
  collapse: document.getElementById("collapse"),
  quitApp: document.getElementById("quitApp"),
  settingWindowMode: document.getElementById("settingWindowMode"),
  settingLaunch: document.getElementById("settingLaunch"),
  settingTop: document.getElementById("settingTop"),
  settingAwake: document.getElementById("settingAwake"),
  settingOpacity: document.getElementById("settingOpacity"),
  settingTheme: document.getElementById("settingTheme"),
  lastSaved: document.getElementById("lastSaved"),
  taskSettings: document.getElementById("taskSettings"),
  taskComment: document.getElementById("taskComment"),
  closeTaskSettings: document.getElementById("closeTaskSettings"),
  appDialogOverlay: document.getElementById("appDialogOverlay"),
  appDialogTitle: document.getElementById("appDialogTitle"),
  appDialogMessage: document.getElementById("appDialogMessage"),
  appDialogInput: document.getElementById("appDialogInput"),
  appDialogClose: document.getElementById("appDialogClose"),
  appDialogCancel: document.getElementById("appDialogCancel"),
  appDialogConfirm: document.getElementById("appDialogConfirm"),
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineHtml(type = "task", text = "", done = false) {
  const safeType = ["task", "bullet", "number", "quote", "text"].includes(type) ? type : "task";
  return [
    `<div class="note-line${done ? " done" : ""}" data-type="${safeType}" data-task-id="${uid()}" data-created-date="${todayKey()}">`,
    `<button class="task-toggle" type="button" contenteditable="false" aria-pressed="${done ? "true" : "false"}"></button>`,
    `<span class="line-marker" contenteditable="false"></span>`,
    `<div class="line-content" contenteditable="true">${escapeHtml(text)}</div>`,
    `<span class="line-flags" contenteditable="false"></span>`,
    "</div>"
  ].join("");
}

function createDefaultState() {
  const now = new Date().toISOString();
  const tabs = [
    {
      id: uid(),
      title: "工作",
      color: COLORS[0],
      html: lineHtml("task"),
      content: "",
      shelf: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: uid(),
      title: "生活",
      color: COLORS[2],
      html: lineHtml("task"),
      content: "",
      shelf: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: uid(),
      title: "灵感",
      color: COLORS[1],
      html: lineHtml("task"),
      content: "",
      shelf: [],
      createdAt: now,
      updatedAt: now
    }
  ];

  return {
    version: 2,
    activeTabId: tabs[0].id,
    tabs,
    settings: {
      windowMode: "pointer",
      launchAtLogin: false,
      alwaysOnTop: true,
      keepAwake: false,
      opacity: 0.98,
      theme: "graphite"
    }
  };
}

function createBrowserFallback() {
  return {
    isElectron: false,
    getPathForFile: (file) => file?.name || "",
    loadState: async () => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      } catch {
        return null;
      }
    },
    saveState: async (nextState) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return true;
    },
    inspectFiles: async (paths) =>
      paths.map((itemPath) => ({
        id: uid(),
        path: itemPath,
        name: itemPath.split(/[\\/]/).pop() || itemPath,
        extension: (itemPath.split(".").pop() || "").toLowerCase(),
        size: 0,
        isDirectory: false,
        addedAt: new Date().toISOString()
      })),
    openFile: async () => true,
    openUrl: async () => true,
    revealFile: async () => true,
    startDrag: () => {},
    exportNote: async () => true,
    getLaunchAtLogin: async () => false,
    setLaunchAtLogin: async (enabled) => enabled,
    setKeepAwake: async (enabled) => enabled,
    setAlwaysOnTop: async (enabled) => enabled,
    setExpanded: () => {},
    setWindowMode: async (mode) => mode,
    notifyActivity: () => {},
    quitApp: () => {},
    onExpandedChanged: () => () => {},
    onAlwaysOnTopChanged: () => () => {},
    onKeepAwakeChanged: () => () => {}
  };
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    const task = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.*)$/);
    if (task) {
      html.push(lineHtml("task", task[2], task[1].toLowerCase() === "x"));
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      html.push(lineHtml("bullet", bullet[1]));
      continue;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      html.push(lineHtml("number", numbered[1]));
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      html.push(lineHtml("quote", quote[1]));
      continue;
    }
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      html.push(`<div class="note-line" data-type="text" data-task-id="${uid()}" data-created-date="${todayKey()}"><button class="task-toggle" type="button" contenteditable="false"></button><span class="line-marker" contenteditable="false"></span><div class="line-content" contenteditable="true"><strong>${escapeHtml(heading[1])}</strong></div><span class="line-flags" contenteditable="false"></span></div>`);
      continue;
    }
    html.push(lineHtml("text", line));
  }

  return html.join("") || lineHtml("task");
}

function normalizeStoredHtml(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html || "";
  wrapper.querySelectorAll(".task-delete").forEach((button) => button.remove());
  wrapper.querySelectorAll(".note-line").forEach((line) => {
    if (!line.dataset.taskId) {
      line.dataset.taskId = uid();
    }
    if (!line.dataset.createdDate) {
      line.dataset.createdDate = todayKey();
    }
  });
  return wrapper.innerHTML;
}

function mergeState(saved) {
  const fallback = createDefaultState();
  if (!saved || typeof saved !== "object") {
    return fallback;
  }

  const tabs = Array.isArray(saved.tabs) && saved.tabs.length ? saved.tabs : fallback.tabs;
  const migratedTabs = tabs.map((tab) => ({
    ...tab,
    html: normalizeStoredHtml(tab.html || markdownToHtml(tab.content)),
    content: tab.content || "",
    shelf: Array.isArray(tab.shelf) ? tab.shelf : []
  }));
  const activeTabId = migratedTabs.some((tab) => tab.id === saved.activeTabId)
    ? saved.activeTabId
    : migratedTabs[0].id;

  const result = {
    ...fallback,
    ...saved,
    version: 2,
    tabs: migratedTabs,
    activeTabId,
    settings: {
      ...fallback.settings,
      ...(saved.settings || {})
    }
  };

  if (Array.isArray(saved.shelf) && saved.shelf.length) {
    const active = migratedTabs.find((tab) => tab.id === activeTabId) || migratedTabs[0];
    const existing = new Set(active.shelf.map((item) => item.path));
    active.shelf.push(...saved.shelf.filter((item) => !existing.has(item.path)));
  }

  return result;
}

function activeTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0];
}

function formatTime(value) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function htmlToText(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html || "";
  return wrapper.textContent || "";
}

function scheduleSave(message = "已保存") {
  els.lastSaved.textContent = "保存中";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await api.saveState(state);
    els.lastSaved.textContent = message;
  }, 220);
}

function renderAll() {
  renderCollapsed();
  renderTabs();
  renderEditor();
  renderShelf();
  renderSettings();
  renderActiveTools();
}

function renderCollapsed() {
  const stats = taskStats();
  els.collapsedTitle.textContent = "Top Notes";
  const summary = [];
  if (stats.dailyIncomplete) summary.push(`每日 ${stats.dailyIncomplete}`);
  if (stats.carryoverIncomplete) summary.push(`遗留 ${stats.carryoverIncomplete}`);
  if (stats.todayRemaining) summary.push(`今日 ${stats.todayRemaining}`);
  els.collapsedMeta.textContent = summary.length ? summary.join(" · ") : "今日状态良好";
  renderTaskLights(stats);
}

function taskStats() {
  const today = todayKey();
  let dailyIncomplete = 0;
  let carryoverIncomplete = 0;
  let todayRemaining = 0;

  state.tabs.forEach((tab) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = tab.html || "";
    wrapper.querySelectorAll('.note-line:not([data-type="text"])').forEach((line) => {
      if (!line.querySelector(".line-content")?.textContent.trim()) {
        return;
      }
      const done = line.classList.contains("done");
      const daily = line.dataset.daily === "true";
      const createdDate = line.dataset.createdDate || today;

      if (daily && !done) {
        dailyIncomplete += 1;
        todayRemaining += 1;
      } else if (!daily && !done) {
        if (createdDate < today) {
          carryoverIncomplete += 1;
        }
        if (createdDate === today) {
          todayRemaining += 1;
        }
      }
    });
  });

  return { dailyIncomplete, carryoverIncomplete, todayRemaining };
}

function renderTaskLights(stats) {
  const redStates = [
    stats.dailyIncomplete > 0,
    stats.carryoverIncomplete > 0,
    stats.todayRemaining >= 3
  ];

  [els.collapsedLights, els.brandLights].forEach((container) => {
    container.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const light = document.createElement("span");
      light.className = `task-light${redStates[index] ? " red" : ""}`;
      light.title = [
        `每日任务未完成：${stats.dailyIncomplete}`,
        `跨天遗留：${stats.carryoverIncomplete}`,
        `今日剩余：${stats.todayRemaining}`
      ][index];
      container.append(light);
    }
    container.setAttribute(
      "aria-label",
      `每日任务未完成 ${stats.dailyIncomplete}，跨天遗留 ${stats.carryoverIncomplete}，今日剩余 ${stats.todayRemaining}`
    );
  });
}

function renderTabs() {
  els.tabs.replaceChildren();
  const query = searchQuery.trim().toLowerCase();
  const visibleTabs = state.tabs.filter((tab) => {
    if (!query) {
      return true;
    }
    const searchable = `${tab.title}\n${htmlToText(tab.html)}`.toLowerCase();
    return searchable.includes(query);
  });

  els.searchCount.textContent = query ? `${visibleTabs.length} 个结果` : "";

  visibleTabs.forEach((tab, index) => {
    const button = document.createElement("button");
    button.className = `tab${tab.id === state.activeTabId ? " active" : ""}`;
    button.type = "button";
    button.style.setProperty("--tab-color", tab.color || COLORS[index % COLORS.length]);
    button.title = "单击切换，双击重命名，右键删除";
    const label = document.createElement("span");
    label.textContent = tab.title || "未命名";
    button.append(label);

    button.addEventListener("click", () => {
      state.activeTabId = tab.id;
      renderAll();
      scheduleSave();
    });
    button.addEventListener("dblclick", () => renameTab(tab.id));
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      deleteTab(tab.id);
    });
    els.tabs.append(button);
  });
}

function renderEditor() {
  const tab = activeTab();
  if (!tab) {
    return;
  }
  els.noteTitle.value = tab.title || "";
  els.noteEditor.innerHTML = tab.html || lineHtml("task");
  els.noteEditor.querySelectorAll(".line-content").forEach((content) => {
    content.contentEditable = "true";
  });
  const cleanedLegacyControls = normalizeTaskLines();
  renderAllLineFlags();
  activeLineElement = els.noteEditor.querySelector(".note-line");
  editorMode = "task";
  els.noteMeta.textContent = tab.updatedAt ? `更新于 ${formatTime(tab.updatedAt)}` : "";
  renumberLines();
  updateEditorEmptyState();
  renderFormatMode();
  if (cleanedLegacyControls) {
    tab.html = els.noteEditor.innerHTML;
    scheduleSave();
  }
}

function updateEditorEmptyState() {
  els.noteEditor.classList.toggle("empty", !els.noteEditor.textContent.trim());
}

function normalizeTaskLines() {
  let changed = false;
  els.noteEditor.querySelectorAll(".note-line").forEach((line) => {
    if (!line.dataset.taskId) {
      line.dataset.taskId = uid();
      changed = true;
    }
    if (!line.dataset.createdDate) {
      line.dataset.createdDate = todayKey();
      changed = true;
    }
    if (!line.querySelector(".line-flags")) {
      const flags = document.createElement("span");
      flags.className = "line-flags";
      flags.contentEditable = "false";
      line.append(flags);
      changed = true;
    }
    const legacyDelete = line.querySelector(".task-delete");
    if (legacyDelete) {
      legacyDelete.remove();
      changed = true;
    }
  });
  return changed;
}

function renderAllLineFlags() {
  els.noteEditor.querySelectorAll(".note-line").forEach(renderLineFlags);
}

function renderLineFlags(line) {
  const flags = line.querySelector(".line-flags");
  if (!flags) {
    return;
  }
  flags.replaceChildren();

  if (line.dataset.daily === "true") {
    const dailyFlag = createLineFlag("i-calendar-days", "每日任务 · 每天刷新", "daily");
    const count = Number(line.dataset.dailyCount || 0);
    if (count > 0) {
      const countLabel = document.createElement("span");
      countLabel.className = "daily-count";
      countLabel.textContent = `×${count}`;
      dailyFlag.append(countLabel);
      dailyFlag.title = `每日任务 · 已成功完成 ${count} 次`;
    }
    flags.append(dailyFlag);
  }

  if (line.dataset.comment?.trim()) {
    flags.append(createLineFlag("i-message", line.dataset.comment, "comment"));
  }

}

function todayKey() {
  const now = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function setDailyForSelected() {
  const lines = selectedLines();
  if (!lines.length) {
    return;
  }
  const allDaily = lines.every((line) => line.dataset.daily === "true");
  lines.forEach((line) => {
    if (allDaily) {
      delete line.dataset.daily;
      delete line.dataset.dailyLast;
      delete line.dataset.dailyCount;
      delete line.dataset.dailyCountedDate;
    } else {
      line.dataset.daily = "true";
      line.dataset.dailyLast = todayKey();
      line.dataset.dailyCount = line.dataset.dailyCount || "0";
      delete line.dataset.dailyCountedDate;
      line.classList.remove("done");
      line.querySelector(".task-toggle")?.setAttribute("aria-pressed", "false");
    }
  });
  renderAllLineFlags();
  renderFormatMode();
  commitEditor();
}

function applyDailyReset() {
  const today = todayKey();
  let stateChanged = false;
  let activeChanged = false;

  state.tabs.forEach((tab) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = tab.html || "";
    let changed = false;

    wrapper.querySelectorAll('.note-line[data-daily="true"]').forEach((line) => {
      if (line.dataset.dailyLast === today) {
        return;
      }
      line.dataset.dailyLast = today;
      line.classList.remove("done");
      line.querySelector(".task-toggle")?.setAttribute("aria-pressed", "false");
      changed = true;
    });

    if (changed) {
      tab.html = wrapper.innerHTML;
      stateChanged = true;
      if (tab.id === state.activeTabId) {
        activeChanged = true;
      }
    }
  });

  if (activeChanged) {
    els.noteEditor.querySelectorAll('.note-line[data-daily="true"]').forEach((line) => {
      line.dataset.dailyLast = today;
      line.classList.remove("done");
      line.querySelector(".task-toggle")?.setAttribute("aria-pressed", "false");
    });
    renderAllLineFlags();
    commitEditor();
  } else if (stateChanged) {
    scheduleSave();
  }
}

function createLineFlag(symbol, title, className) {
  const flag = document.createElement("span");
  flag.className = `line-flag ${className}`.trim();
  flag.title = title;
  flag.innerHTML = `<svg><use href="#${symbol}"></use></svg>`;
  return flag;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间无效";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function taskText(line) {
  return lineContent(line)?.textContent.trim() || "未命名任务";
}

function openTaskSettings(line, clientX, clientY) {
  if (!line) {
    return;
  }
  taskSettingsTarget = line;
  activeLineElement = line;
  els.taskComment.innerHTML =
    line.dataset.commentHtml ||
    (line.dataset.comment ? escapeHtml(line.dataset.comment) : "");
  els.taskSettings.classList.remove("hidden");

  const width = Math.min(330, window.innerWidth - 28);
  const height = 260;
  const left = Math.max(8, Math.min(clientX, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(clientY, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8));
  els.taskSettings.style.left = `${left}px`;
  els.taskSettings.style.top = `${top}px`;
  els.taskSettings.style.right = "auto";
  els.taskSettings.style.bottom = "auto";
  els.taskComment.focus();
  placeCaretAtEnd(els.taskComment);
}

function closeTaskSettings() {
  persistAnnotation();
  els.taskSettings.classList.add("hidden");
  taskSettingsTarget = null;
  savedAnnotationRange = null;
}

function persistAnnotation() {
  const line = taskSettingsTarget;
  if (!line) {
    return;
  }
  const comment = els.taskComment.innerText.trim();
  const commentHtml = els.taskComment.innerHTML.trim();
  if (comment || els.taskComment.querySelector(".annotation-token")) {
    line.dataset.comment = comment;
    line.dataset.commentHtml = commentHtml;
  } else {
    delete line.dataset.comment;
    delete line.dataset.commentHtml;
  }

  renderLineFlags(line);
  commitEditor();
}

function scheduleAnnotationSave() {
  window.clearTimeout(annotationSaveTimer);
  annotationSaveTimer = window.setTimeout(persistAnnotation, 180);
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  savedAnnotationRange = range.cloneRange();
}

function annotationToken(kind, href, label) {
  const token = document.createElement("span");
  token.className = "annotation-token";
  token.contentEditable = "false";
  token.dataset.kind = kind;
  token.dataset.href = href;
  token.textContent = label;
  token.title = href;
  return token;
}

function insertAnnotationToken(kind, href, label) {
  const token = annotationToken(kind, href, label);
  const selection = window.getSelection();
  const range =
    savedAnnotationRange && els.taskComment.contains(savedAnnotationRange.commonAncestorContainer)
      ? savedAnnotationRange
      : null;

  if (range) {
    range.deleteContents();
    range.insertNode(token);
    range.setStartAfter(token);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedAnnotationRange = range.cloneRange();
  } else {
    els.taskComment.append(document.createTextNode(" "), token, document.createTextNode(" "));
    placeCaretAtEnd(els.taskComment);
  }
}

function normalizeUrl(value) {
  const text = String(value || "").trim().replace(/^[<"']+|[>"']+$/g, "");
  if (!text) {
    return "";
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }
  if (/^www\.[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(text)) {
    return `https://${text}`;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(text)) {
    return `https://${text}`;
  }
  return "";
}

function extractUrlFromClipboard(dataTransfer) {
  const uri = dataTransfer
    ?.getData("text/uri-list")
    ?.split(/\r?\n/)
    .map(normalizeUrl)
    .find(Boolean);
  if (uri) {
    return uri;
  }

  const html = dataTransfer?.getData("text/html") || "";
  if (html) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const href = wrapper.querySelector("a[href]")?.getAttribute("href");
    const normalizedHref = normalizeUrl(href);
    if (normalizedHref) {
      return normalizedHref;
    }
  }

  const text = dataTransfer?.getData("text/plain") || "";
  return text
    .split(/\r?\n/)
    .map(normalizeUrl)
    .find(Boolean) || "";
}

function commitEditor() {
  const tab = activeTab();
  if (!tab) {
    return;
  }
  tab.html = els.noteEditor.innerHTML;
  tab.content = els.noteEditor.innerText;
  tab.updatedAt = new Date().toISOString();
  els.noteMeta.textContent = `更新于 ${formatTime(tab.updatedAt)}`;
  renderCollapsed();
  renderTabs();
  updateEditorEmptyState();
  scheduleSave();
}

function currentLine(container = document.activeElement) {
  const element = container?.nodeType === Node.ELEMENT_NODE ? container : container?.parentElement;
  return element?.closest?.(".note-line") || null;
}

function lineContent(line) {
  return line?.querySelector(".line-content") || null;
}

function focusLine(line, atStart = true) {
  const content = lineContent(line);
  if (!content) {
    return;
  }
  content.tabIndex = -1;
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(atStart);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  content.focus();
  savedRange = range.cloneRange();
  activeLineElement = line;
}

function createLine(type = "task", done = false) {
  const line = document.createElement("div");
  line.className = `note-line${done ? " done" : ""}`;
  line.dataset.type = type;

  const toggle = document.createElement("button");
  toggle.className = "task-toggle";
  toggle.type = "button";
  toggle.contentEditable = "false";
  toggle.setAttribute("aria-pressed", done ? "true" : "false");

  const marker = document.createElement("span");
  marker.className = "line-marker";
  marker.contentEditable = "false";

  const content = document.createElement("div");
  content.className = "line-content";
  content.contentEditable = "true";

  const flags = document.createElement("span");
  flags.className = "line-flags";
  flags.contentEditable = "false";

  line.dataset.taskId = uid();
  line.dataset.createdDate = todayKey();
  line.append(toggle, marker, content, flags);
  return line;
}

function splitCurrentLine() {
  const line = currentLine() || activeLineElement;
  if (!line) {
    const next = createLine("task");
    els.noteEditor.append(next);
    focusLine(next);
    return;
  }

  const nextLine = createLine(editorMode);
  line.after(nextLine);
  renumberLines();
  commitEditor();
  window.setTimeout(() => focusLine(nextLine, true), 0);
}

function handleBackspace(event) {
  const line = currentLine() || activeLineElement;
  if (!line) {
    return;
  }
  const content = lineContent(line);
  if (!content || content.textContent !== "") {
    return;
  }
  const lines = Array.from(els.noteEditor.querySelectorAll(".note-line"));
  if (lines.length <= 1) {
    return;
  }
  event.preventDefault();
  const index = lines.indexOf(line);
  const previous = lines[Math.max(0, index - 1)];
  line.remove();
  renumberLines();
  focusLine(previous, false);
  commitEditor();
}

function selectedLines() {
  const selection = window.getSelection();
  const anchorLine = activeLineElement || currentLine(selection?.anchorNode);
  const focusLineNode = currentLine(selection?.focusNode);
  const lines = Array.from(els.noteEditor.querySelectorAll(".note-line"));
  if (!anchorLine) {
    return lines.length ? [lines[0]] : [];
  }
  const first = lines.indexOf(anchorLine);
  const second = focusLineNode ? lines.indexOf(focusLineNode) : first;
  const from = Math.max(0, Math.min(first, second));
  const to = Math.max(0, Math.max(first, second));
  return lines.slice(from, to + 1);
}

function setSubsetMode(type) {
  const lines = selectedLines();
  if (!lines.length) {
    return;
  }
  if (editorMode === type) {
    editorMode = "task";
    renderFormatMode();
    return;
  }
  editorMode = type;
  lines.forEach((line) => {
    line.dataset.type = type;
  });
  renumberLines();
  renderFormatMode();
  commitEditor();
}

function renderFormatMode() {
  document.querySelectorAll('[data-format="daily"], [data-format="list"], [data-format="ordered"]').forEach((button) => {
    if (button.dataset.format === "daily") {
      button.classList.toggle("active", activeLineElement?.dataset.daily === "true");
    } else {
      button.classList.toggle("active", button.dataset.format === editorMode);
    }
  });
}

function toggleLineDone(line, forced) {
  if (!line) {
    return;
  }
  const next = typeof forced === "boolean" ? forced : !line.classList.contains("done");
  line.classList.toggle("done", next);
  line.querySelector(".task-toggle")?.setAttribute("aria-pressed", String(next));
  if (next && line.dataset.daily === "true" && line.dataset.dailyCountedDate !== todayKey()) {
    const count = Number(line.dataset.dailyCount || 0) + 1;
    line.dataset.dailyCount = String(count);
    line.dataset.dailyCountedDate = todayKey();
    renderLineFlags(line);
  }
  commitEditor();
}

function renumberLines() {
  let number = 1;
  els.noteEditor.querySelectorAll(".note-line").forEach((line) => {
    const marker = line.querySelector(".line-marker");
    if (line.dataset.type === "number") {
      marker.textContent = `${number}.`;
      number += 1;
    } else {
      marker.textContent = "";
      number = 1;
    }
  });
}

function restoreSelection() {
  if (
    savedRange &&
    activeLineElement &&
    !activeLineElement.contains(savedRange.commonAncestorContainer)
  ) {
    focusLine(activeLineElement, false);
    return;
  }
  if (!savedRange) {
    if (activeLineElement) {
      focusLine(activeLineElement, false);
    }
    return;
  }
  lineContent(activeLineElement)?.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
}

function rememberSelection() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !els.noteEditor.contains(selection.anchorNode)) {
    return;
  }
  savedRange = selection.getRangeAt(0).cloneRange();
}

function handleFormat(kind) {
  if (kind === "daily") {
    setDailyForSelected();
  } else if (kind === "list") {
    setSubsetMode("bullet");
  } else if (kind === "ordered") {
    setSubsetMode("number");
  }
}

function applyTextColor(color) {
  let selection = window.getSelection();
  const selectedFromDom = currentLine(selection?.anchorNode);
  if (selectedFromDom) {
    activeLineElement = selectedFromDom;
  }
  if (!selection?.rangeCount || selection.isCollapsed || !els.noteEditor.contains(selection.anchorNode)) {
    restoreSelection();
    selection = window.getSelection();
  }
  const line = activeLineElement || currentLine(selection?.anchorNode);
  if (selection?.isCollapsed && line) {
    const range = document.createRange();
    range.selectNodeContents(lineContent(line));
    selection.removeAllRanges();
    selection.addRange(range);
  }
  if (color) {
    document.execCommand("foreColor", false, color);
  } else {
    document.execCommand("removeFormat", false);
  }
  commitEditor();
}

function addTab() {
  const now = new Date().toISOString();
  const index = state.tabs.length;
  const tab = {
    id: uid(),
    title: "新便签",
    color: COLORS[index % COLORS.length],
    html: lineHtml("task"),
    content: "",
    createdAt: now,
    updatedAt: now
  };
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderAll();
  scheduleSave();
  expand(true);
  window.setTimeout(() => {
    els.noteTitle.focus();
    els.noteTitle.select();
  }, 20);
}

async function renameTab(id) {
  const tab = state.tabs.find((entry) => entry.id === id);
  if (!tab) {
    return;
  }
  const next = await promptAppDialog({
    title: "重命名便签",
    message: "输入新的便签名称",
    inputValue: tab.title,
    confirmText: "保存"
  });
  if (next === null) {
    return;
  }
  tab.title = next.trim() || "未命名";
  tab.updatedAt = new Date().toISOString();
  renderAll();
  scheduleSave();
}

async function deleteTab(id) {
  if (state.tabs.length <= 1) {
    return;
  }
  const tab = state.tabs.find((entry) => entry.id === id);
  if (!tab) {
    return;
  }
  const confirmed = await confirmAppDialog({
    title: "删除便签",
    message: `删除“${tab.title}”？此操作无法撤销。`,
    confirmText: "删除",
    danger: true
  });
  if (!confirmed) {
    return;
  }
  state.tabs = state.tabs.filter((entry) => entry.id !== id);
  if (state.activeTabId === id) {
    state.activeTabId = state.tabs[0].id;
  }
  renderAll();
  scheduleSave();
}

function lineToMarkdown(line) {
  const type = line.dataset.type || "task";
  const text = htmlToMarkdown(lineContent(line)?.innerHTML || "");
  if (type === "task") {
    return `- [${line.classList.contains("done") ? "x" : " "}] ${text}`;
  }
  if (type === "bullet") {
    return `  - [${line.classList.contains("done") ? "x" : " "}] ${text}`;
  }
  if (type === "number") {
    return `  1. [${line.classList.contains("done") ? "x" : " "}] ${text}`;
  }
  if (type === "quote") {
    return `> ${text}`;
  }
  return text;
}

function htmlToMarkdown(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  wrapper.querySelectorAll("strong, b").forEach((node) => node.replaceWith(`**${node.textContent}**`));
  wrapper.querySelectorAll("em, i").forEach((node) => node.replaceWith(`*${node.textContent}*`));
  wrapper.querySelectorAll("del, s, strike").forEach((node) => node.replaceWith(`~~${node.textContent}~~`));
  wrapper.querySelectorAll("code").forEach((node) => node.replaceWith(`\`${node.textContent}\``));
  wrapper.querySelectorAll("a").forEach((node) => node.replaceWith(`[${node.textContent}](${node.href})`));
  return wrapper.textContent || "";
}

function noteToMarkdown(tab) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = tab?.html || "";
  return Array.from(wrapper.querySelectorAll(".note-line")).map(lineToMarkdown).join("\n");
}

function renderShelf() {
  const tab = activeTab();
  const shelf = tab?.shelf || [];
  els.shelfCount.textContent = String(shelf.length);
  renderShelfGroup(
    els.urlShelfList,
    shelf.filter((item) => item.kind === "url" || /^https?:\/\//i.test(item.path || "")),
    "暂无网址"
  );
  renderShelfGroup(
    els.fileShelfList,
    shelf.filter((item) => item.kind !== "url" && !/^https?:\/\//i.test(item.path || "")),
    "暂无文件"
  );
}

function renderShelfGroup(container, items, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-shelf";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const isUrl = item.kind === "url" || /^https?:\/\//i.test(item.path || "");
    const row = document.createElement("div");
    row.className = "shelf-item";
    row.draggable = true;
    row.title = item.path || item.name;

    const badge = document.createElement("span");
    badge.className = "file-badge";
    badge.textContent = isUrl ? "URL" : item.isDirectory ? "DIR" : (item.extension || "FILE").slice(0, 3);

    const copy = document.createElement("div");
    copy.className = "shelf-copy";
    const name = document.createElement("strong");
    name.textContent = item.name || item.path || "未命名";
    const meta = document.createElement("span");
    const taskLabel = item.taskText ? ` · 任务：${item.taskText}` : "";
    meta.textContent = `${isUrl ? "网址" : item.isDirectory ? "文件夹" : formatBytes(item.size)} · ${formatTime(item.addedAt)}${taskLabel}`;
    copy.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "shelf-actions";
    if (item.taskId) {
      const taskButton = iconButton("i-list-checks", "跳转到对应任务");
      taskButton.addEventListener("click", (event) => {
        event.stopPropagation();
        locateTask(item.taskId);
      });
      actions.append(taskButton);
    }

    row.addEventListener("click", () => {
      if (isUrl) {
        api.openUrl(item.path);
      } else {
        api.revealFile(item.path);
      }
    });
    row.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      const confirmed = await confirmAppDialog({
        title: isUrl ? "移除网址" : "移除文件",
        message: `从当前便签移除“${item.name || item.path}”？`,
        confirmText: "移除",
        danger: true
      });
      if (!confirmed) {
        return;
      }
      const current = activeTab();
      if (current) {
        current.shelf = (current.shelf || []).filter((entry) => entry.id !== item.id);
      }
      renderShelf();
      scheduleSave();
    });
    row.addEventListener("dragstart", (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", item.path || item.name);
      }
      if (!isUrl) {
        api.startDrag(item.path);
      }
    });

    row.append(badge, copy, actions);
    container.append(row);
  });
}

function locateTask(taskId) {
  if (!taskId) {
    return;
  }
  const line = els.noteEditor.querySelector(`.note-line[data-task-id="${taskId}"]`);
  if (!line) {
    return;
  }
  els.noteEditor.querySelectorAll(".task-locate").forEach((entry) => entry.classList.remove("task-locate"));
  line.classList.add("task-locate");
  line.scrollIntoView({ behavior: "smooth", block: "center" });
  lineContent(line)?.focus();
  window.setTimeout(() => line.classList.remove("task-locate"), 1800);
}

function iconButton(symbol, label) {
  const button = document.createElement("button");
  button.className = "icon-button";
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg><use href="#${symbol}"></use></svg>`;
  return button;
}

function showAppDialog({
  title = "确认",
  message = "",
  confirmText = "确认",
  cancelText = "取消",
  inputValue = null,
  placeholder = "",
  danger = false
} = {}) {
  if (dialogResolver) {
    dialogResolver(inputValue === null ? false : null);
    dialogResolver = null;
  }

  els.appDialogTitle.textContent = title;
  els.appDialogMessage.textContent = message;
  els.appDialogConfirm.textContent = confirmText;
  els.appDialogCancel.textContent = cancelText;
  els.appDialogConfirm.classList.toggle("danger", Boolean(danger));
  els.appDialogInput.classList.toggle("hidden", inputValue === null);
  els.appDialogInput.value = inputValue ?? "";
  els.appDialogInput.placeholder = placeholder;
  els.appDialogOverlay.classList.remove("hidden");

  return new Promise((resolve) => {
    dialogResolver = resolve;
    if (inputValue !== null) {
      els.appDialogInput.focus();
      els.appDialogInput.select();
    } else {
      els.appDialogConfirm.focus();
    }
  });
}

function closeAppDialog(result) {
  if (!dialogResolver) {
    return;
  }
  const resolve = dialogResolver;
  dialogResolver = null;
  els.appDialogOverlay.classList.add("hidden");
  resolve(result);
}

function confirmAppDialog(options) {
  return showAppDialog(options);
}

function promptAppDialog(options) {
  return showAppDialog({ ...options, inputValue: options?.inputValue ?? "" });
}

function renderSettings() {
  const settings = state.settings;
  els.body.dataset.theme = settings.theme || "graphite";
  document.documentElement.style.setProperty("--app-opacity", String(settings.opacity ?? 0.98));
  els.settingWindowMode.value = settings.windowMode === "persistent" ? "persistent" : "pointer";
  els.collapsed.setAttribute("aria-label", "点击展开 TopNotes");
  els.settingLaunch.checked = Boolean(settings.launchAtLogin);
  els.settingTop.checked = Boolean(settings.alwaysOnTop);
  els.settingAwake.checked = Boolean(settings.keepAwake);
  els.settingOpacity.value = String(settings.opacity ?? 0.98);
  els.settingTheme.value = settings.theme || "graphite";
}

function renderActiveTools() {
  els.keepAwake.classList.toggle("active", Boolean(state.settings.keepAwake));
  els.alwaysOnTop.classList.toggle("active", Boolean(state.settings.alwaysOnTop));
  renderFormatMode();
}

function expand(manual = true) {
  if (expanded) {
    return;
  }
  expanded = true;
  els.body.classList.add("is-expanded");
  api.setExpanded(true);
  api.notifyActivity();
  window.setTimeout(() => {
    if (els.noteEditor.contains(document.activeElement)) {
      return;
    }
    const firstLine = els.noteEditor.querySelector(".note-line");
    if (firstLine) {
      focusLine(firstLine, true);
    }
  }, 60);
}

function collapse() {
  if (!expanded) {
    return;
  }
  expanded = false;
  els.body.classList.remove("is-expanded");
  api.setExpanded(false);
  api.notifyActivity();
}

els.collapsed.addEventListener("click", (event) => {
  if (event.target.closest("#quickNew")) {
    addTab();
    return;
  }
  expand(true);
});

els.quickNew.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    addTab();
  }
});

els.collapse.addEventListener("click", collapse);
els.quitApp.addEventListener("click", () => api.quitApp());
els.newTab.addEventListener("click", addTab);

els.toggleSearch.addEventListener("click", () => {
  els.searchRow.classList.toggle("hidden");
  els.body.classList.toggle("search-open", !els.searchRow.classList.contains("hidden"));
  if (!els.searchRow.classList.contains("hidden")) {
    els.searchInput.focus();
  } else {
    searchQuery = "";
    els.searchInput.value = "";
    renderTabs();
  }
});

els.searchInput.addEventListener("input", () => {
  searchQuery = els.searchInput.value;
  renderTabs();
});

els.toggleShelf.addEventListener("click", () => toggleDrawer("shelf"));
els.closeShelf.addEventListener("click", () => toggleDrawer("shelf", false));
els.toggleSettings.addEventListener("click", () => toggleDrawer("settings"));
els.closeSettings.addEventListener("click", () => toggleDrawer("settings", false));

els.noteTitle.addEventListener("input", () => {
  const tab = activeTab();
  if (!tab) {
    return;
  }
  tab.title = els.noteTitle.value;
  tab.updatedAt = new Date().toISOString();
  renderCollapsed();
  renderTabs();
  els.noteMeta.textContent = `更新于 ${formatTime(tab.updatedAt)}`;
  scheduleSave();
});

els.noteEditor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    splitCurrentLine();
    return;
  }
  if (event.key === "Backspace") {
    handleBackspace(event);
  }
});

els.noteEditor.addEventListener("input", (event) => {
  rememberSelection();
  commitEditor();
});

els.noteEditor.addEventListener("mouseup", rememberSelection);

els.noteEditor.addEventListener("pointerdown", (event) => {
  const line = event.target.closest(".note-line");
  if (line) {
    activeLineElement = line;
    editorMode = ["bullet", "number"].includes(line.dataset.type) ? line.dataset.type : "task";
    renderFormatMode();
  }
});

els.noteEditor.addEventListener("contextmenu", (event) => {
  const line = event.target.closest(".note-line");
  if (!line) {
    return;
  }
  event.preventDefault();
  activeLineElement = line;
  openTaskSettings(line, event.clientX, event.clientY);
});

els.noteEditor.addEventListener("paste", (event) => {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  document.execCommand("insertText", false, text);
});

els.noteEditor.addEventListener("click", (event) => {
  const toggle = event.target.closest(".task-toggle");
  if (toggle) {
    event.preventDefault();
    toggleLineDone(toggle.closest(".note-line"));
  }
});

document.addEventListener("selectionchange", () => {
  rememberSelection();
  const selection = window.getSelection();
  if (selection?.rangeCount && els.taskComment.contains(selection.anchorNode)) {
    savedAnnotationRange = selection.getRangeAt(0).cloneRange();
  }
});

document.querySelectorAll("[data-format]").forEach((button) => {
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", () => handleFormat(button.dataset.format));
});
els.colorButton.addEventListener("mousedown", (event) => event.preventDefault());
els.colorButton.addEventListener("click", () => {
  els.colorPalette.classList.toggle("hidden");
});
document.querySelectorAll(".color-swatch").forEach((swatch) => {
  swatch.addEventListener("mousedown", (event) => event.preventDefault());
  swatch.addEventListener("click", () => {
    applyTextColor(swatch.dataset.color);
    els.colorPalette.classList.add("hidden");
  });
});
els.colorReset.addEventListener("mousedown", (event) => event.preventDefault());
els.colorReset.addEventListener("click", () => {
  applyTextColor("");
  els.colorPalette.classList.add("hidden");
});
document.addEventListener("pointerdown", (event) => {
  if (
    !els.colorPalette.classList.contains("hidden") &&
    !els.colorPalette.contains(event.target) &&
    !els.colorButton.contains(event.target)
  ) {
    els.colorPalette.classList.add("hidden");
  }
});

els.closeTaskSettings.addEventListener("click", closeTaskSettings);
els.appDialogConfirm.addEventListener("click", () => {
  closeAppDialog(els.appDialogInput.classList.contains("hidden") ? true : els.appDialogInput.value);
});
els.appDialogCancel.addEventListener("click", () => {
  closeAppDialog(els.appDialogInput.classList.contains("hidden") ? false : null);
});
els.appDialogClose.addEventListener("click", () => {
  closeAppDialog(els.appDialogInput.classList.contains("hidden") ? false : null);
});
els.appDialogOverlay.addEventListener("pointerdown", (event) => {
  if (event.target === els.appDialogOverlay) {
    closeAppDialog(els.appDialogInput.classList.contains("hidden") ? false : null);
  }
});
els.appDialogInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    closeAppDialog(els.appDialogInput.value);
  }
});
els.taskComment.addEventListener("input", () => {
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    savedAnnotationRange = selection.getRangeAt(0).cloneRange();
  }
  scheduleAnnotationSave();
});
els.taskComment.addEventListener("keyup", () => {
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    savedAnnotationRange = selection.getRangeAt(0).cloneRange();
  }
});
els.taskComment.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    savedAnnotationRange = selection.getRangeAt(0).cloneRange();
  }
});
els.taskComment.addEventListener("blur", persistAnnotation);
els.taskComment.addEventListener("paste", (event) => {
  const url = extractUrlFromClipboard(event.clipboardData);
  if (url && taskSettingsTarget) {
    event.preventDefault();
    const item = addUrlToShelf(url, {
      taskId: taskSettingsTarget.dataset.taskId,
      taskText: taskText(taskSettingsTarget)
    });
    if (item) {
      insertAnnotationToken("url", item.path, item.name);
      renderShelf();
      persistAnnotation();
    }
    return;
  }
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") || "");
  scheduleAnnotationSave();
});
els.taskComment.addEventListener("click", (event) => {
  const token = event.target.closest(".annotation-token");
  if (!token) {
    return;
  }
  event.preventDefault();
  if (token.dataset.kind === "url") {
    api.openUrl(token.dataset.href);
  } else {
    api.revealFile(token.dataset.href);
  }
});

async function handleAnnotationDrop(event) {
  event.preventDefault();
  els.taskComment.classList.remove("dragover");
  if (!taskSettingsTarget) {
    return;
  }
  const task = {
    taskId: taskSettingsTarget.dataset.taskId,
    taskText: taskText(taskSettingsTarget)
  };
  const url = extractUrlFromClipboard(event.dataTransfer);
  if (url) {
    const item = addUrlToShelf(url, task);
    if (item) {
      insertAnnotationToken("url", item.path, item.name);
    }
  }
  const paths = Array.from(event.dataTransfer?.files || [])
    .map((file) => api.getPathForFile(file))
    .filter(Boolean);
  const files = await addFilesToShelf(paths, task);
  files?.forEach((item) => insertAnnotationToken("file", item.path, item.name));
  renderShelf();
  persistAnnotation();
}

els.taskComment.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.taskComment.classList.add("dragover");
});
els.taskComment.addEventListener("dragleave", () => els.taskComment.classList.remove("dragover"));
els.taskComment.addEventListener("drop", handleAnnotationDrop);

document.addEventListener("pointerdown", (event) => {
  if (els.taskSettings.classList.contains("hidden")) {
    return;
  }
  if (!els.taskSettings.contains(event.target) && !event.target.closest(".note-line")) {
    closeTaskSettings();
  }
});

els.keepAwake.addEventListener("click", async () => {
  state.settings.keepAwake = !state.settings.keepAwake;
  await api.setKeepAwake(state.settings.keepAwake);
  renderSettings();
  renderActiveTools();
  scheduleSave();
});

els.alwaysOnTop.addEventListener("click", async () => {
  state.settings.alwaysOnTop = !state.settings.alwaysOnTop;
  await api.setAlwaysOnTop(state.settings.alwaysOnTop);
  renderSettings();
  renderActiveTools();
  scheduleSave();
});

els.exportNote.addEventListener("click", async () => {
  const tab = activeTab();
  await api.exportNote({ title: tab?.title, content: noteToMarkdown(tab) });
});

els.addFiles.addEventListener("click", () => els.filePicker.click());
els.filePicker.addEventListener("change", async () => {
  const paths = Array.from(els.filePicker.files || [])
    .map((file) => api.getPathForFile(file))
    .filter(Boolean);
  els.filePicker.value = "";
  await addFilesToShelf(paths);
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragover");
  });
});

els.dropZone.addEventListener("drop", async (event) => {
  const paths = Array.from(event.dataTransfer?.files || [])
    .map((file) => api.getPathForFile(file))
    .filter(Boolean);
  await addFilesToShelf(paths);
});

els.settingWindowMode.addEventListener("change", async () => {
  state.settings.windowMode = els.settingWindowMode.value === "persistent" ? "persistent" : "pointer";
  await api.setWindowMode(state.settings.windowMode);
  renderSettings();
  scheduleSave();
});

els.settingLaunch.addEventListener("change", async () => {
  state.settings.launchAtLogin = await api.setLaunchAtLogin(els.settingLaunch.checked);
  renderSettings();
  scheduleSave();
});

els.settingTop.addEventListener("change", async () => {
  state.settings.alwaysOnTop = await api.setAlwaysOnTop(els.settingTop.checked);
  renderSettings();
  renderActiveTools();
  scheduleSave();
});

els.settingAwake.addEventListener("change", async () => {
  state.settings.keepAwake = await api.setKeepAwake(els.settingAwake.checked);
  renderSettings();
  renderActiveTools();
  scheduleSave();
});

els.settingOpacity.addEventListener("input", () => {
  state.settings.opacity = Number(els.settingOpacity.value);
  document.documentElement.style.setProperty("--app-opacity", String(state.settings.opacity));
  scheduleSave();
});

els.settingTheme.addEventListener("change", () => {
  state.settings.theme = els.settingTheme.value;
  renderSettings();
  scheduleSave();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!els.appDialogOverlay.classList.contains("hidden")) {
      closeAppDialog(els.appDialogInput.classList.contains("hidden") ? false : null);
    } else if (!els.taskSettings.classList.contains("hidden")) {
      closeTaskSettings();
    } else {
      collapse();
    }
  }
  if (event.ctrlKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    addTab();
  }
  if (event.ctrlKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    els.searchRow.classList.remove("hidden");
    els.body.classList.add("search-open");
    els.searchInput.focus();
  }
});

function notifyPointerActivity() {
  const now = Date.now();
  if (now - lastActivitySentAt < 250) {
    return;
  }
  lastActivitySentAt = now;
  api.notifyActivity();
}

document.addEventListener("pointermove", notifyPointerActivity, { passive: true });
document.addEventListener("pointerdown", notifyPointerActivity, { passive: true });
document.addEventListener("wheel", notifyPointerActivity, { passive: true });
document.addEventListener("keydown", notifyPointerActivity);
document.addEventListener("input", notifyPointerActivity);

function toggleDrawer(name, forced) {
  const shelfOpen = !els.shelfDrawer.classList.contains("hidden");
  const settingsOpen = !els.settingsDrawer.classList.contains("hidden");
  const showShelf = forced === undefined ? !shelfOpen && name === "shelf" : forced && name === "shelf";
  const showSettings = forced === undefined ? !settingsOpen && name === "settings" : forced && name === "settings";

  els.shelfDrawer.classList.toggle("hidden", !showShelf);
  els.settingsDrawer.classList.toggle("hidden", !showSettings);
  document.querySelector(".workspace").classList.toggle("with-drawer", showShelf || showSettings);
  els.toggleShelf.classList.toggle("active", showShelf);
  els.toggleSettings.classList.toggle("active", showSettings);
}

async function addFilesToShelf(paths, task = null) {
  if (!paths.length) {
    return [];
  }
  const tab = activeTab();
  if (!tab) {
    return [];
  }
  const shelf = tab.shelf || [];
  const taskId = task?.taskId || "";
  const existing = new Set(shelf.map((item) => `${item.path}\u0000${item.taskId || ""}`));
  const seen = new Set();
  const newPaths = paths.filter((itemPath) => {
    const key = `${itemPath}\u0000${taskId}`;
    if (!itemPath || existing.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const inspected = await api.inspectFiles(newPaths);
  const enriched = inspected.map((item) => ({
    ...item,
    kind: "file",
    taskId,
    taskText: task?.taskText || ""
  }));
  tab.shelf = shelf.concat(enriched);
  renderShelf();
  scheduleSave();
  return enriched;
}

function addUrlToShelf(url, task = null) {
  const tab = activeTab();
  if (!tab || !url) {
    return null;
  }
  const normalizedUrl = normalizeUrl(url) || url;
  const existing = (tab.shelf || []).find(
    (item) => item.kind === "url" && normalizeUrl(item.path) === normalizedUrl
  );
  if (existing) {
    return existing;
  }
  const item = {
    id: uid(),
    kind: "url",
    path: normalizedUrl,
    name: normalizedUrl,
    taskId: task?.taskId || "",
    taskText: task?.taskText || "",
    addedAt: new Date().toISOString()
  };
  tab.shelf = (tab.shelf || []).concat(item);
  scheduleSave();
  return item;
}

api.onExpandedChanged((nextExpanded) => {
  expanded = Boolean(nextExpanded);
  els.body.classList.toggle("is-expanded", expanded);
});

api.onAlwaysOnTopChanged((enabled) => {
  state.settings.alwaysOnTop = Boolean(enabled);
  renderSettings();
  renderActiveTools();
});

api.onKeepAwakeChanged((enabled) => {
  state.settings.keepAwake = Boolean(enabled);
  renderSettings();
  renderActiveTools();
});

async function boot() {
  const saved = await api.loadState();
  state = mergeState(saved);
  if (!isElectron) {
    state.settings.launchAtLogin = false;
  }
  renderAll();
  applyDailyReset();
  window.setInterval(applyDailyReset, 60 * 1000);
  await api.setWindowMode(state.settings.windowMode);
}

boot();
