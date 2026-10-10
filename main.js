const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  powerSaveBlocker,
  screen,
  shell,
  dialog
} = require("electron");
const fs = require("fs");
const path = require("path");

const COLLAPSED_SIZE = { width: 380, height: 46 };
const EXPANDED_SIZE = { width: 780, height: 570 };
const APP_NAME = "TopNotes";

let mainWindow = null;
let tray = null;
let keepAwake = false;
let powerBlockerId = null;
let isQuitting = false;
let alwaysOnTop = true;
let windowMode = "pointer";
let isExpanded = false;
let pointerPollTimer = null;
let pointerHideTimer = null;
let idleRetractTimer = null;
let boundsAnimationTimer = null;
let opacityAnimationTimer = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function createAppIcon(size) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#111315"/>
      <rect x="10" y="13" width="44" height="38" rx="9" fill="#f3f5f2"/>
      <path d="M19 25h26M19 33h19M19 41h22" stroke="#111315" stroke-width="4" stroke-linecap="round"/>
      <circle cx="47" cy="18" r="7" fill="#8fe3bd"/>
    </svg>`;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  );
  return size ? image.resize({ width: size, height: size }) : image;
}

function appIcon(size) {
  const iconPath = path.join(__dirname, "TopNotes.ico");
  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return size ? image.resize({ width: size, height: size }) : image;
    }
  }
  return createAppIcon(size);
}

function getStatePath() {
  return path.join(app.getPath("userData"), "topnotes-state.json");
}

async function readState() {
  try {
    const raw = await fs.promises.readFile(getStatePath(), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to read state:", error);
    }
    return null;
  }
}

async function writeState(state) {
  const statePath = getStatePath();
  const tmpPath = `${statePath}.tmp`;
  await fs.promises.mkdir(path.dirname(statePath), { recursive: true });
  await fs.promises.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await fs.promises.rename(tmpPath, statePath);
}

function getTargetBounds(expanded = false) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
  const x = Math.round(workArea.x + (workArea.width - size.width) / 2);
  const y = workArea.y;

  return { x, y, width: size.width, height: size.height };
}

function stopBoundsAnimation() {
  if (boundsAnimationTimer) {
    clearInterval(boundsAnimationTimer);
    boundsAnimationTimer = null;
  }
}

function animateBounds(target, duration = 300) {
  if (!mainWindow || mainWindow.isDestroyed() || !target) {
    return;
  }
  stopBoundsAnimation();
  const start = mainWindow.getBounds();
  const startedAt = Date.now();
  boundsAnimationTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopBoundsAnimation();
      return;
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    mainWindow.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased)
    });
    if (progress >= 1) {
      stopBoundsAnimation();
    }
  }, 16);
}

function positionWindow(expanded = false, animate = false) {
  const target = getTargetBounds(expanded);
  if (!target) {
    return;
  }
  if (animate) {
    animateBounds(target, expanded ? 320 : 260);
  } else {
    stopBoundsAnimation();
    mainWindow.setBounds(target);
  }
}

function stopOpacityAnimation() {
  if (opacityAnimationTimer) {
    clearInterval(opacityAnimationTimer);
    opacityAnimationTimer = null;
  }
}

function animateWindowOpacity(from, to, duration = 220, done) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  stopOpacityAnimation();
  const startedAt = Date.now();
  mainWindow.setOpacity(from);
  opacityAnimationTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopOpacityAnimation();
      return;
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    mainWindow.setOpacity(from + (to - from) * eased);
    if (progress >= 1) {
      stopOpacityAnimation();
      done?.();
    }
  }, 16);
}

function setExpanded(expanded) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  isExpanded = Boolean(expanded);
  positionWindow(expanded, true);
  mainWindow.webContents.send("window:expanded-changed", Boolean(expanded));
  if (isExpanded) {
    cancelPointerHide();
    mainWindow.show();
    animateWindowOpacity(0.88, 1, 220);
    mainWindow.focus();
    resetIdleRetract();
  } else if (windowMode === "pointer") {
    resetIdleRetract();
  }
}

function cancelPointerHide() {
  if (pointerHideTimer) {
    clearTimeout(pointerHideTimer);
    pointerHideTimer = null;
  }
}

function hidePointerWindow(fade = true) {
  if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "pointer" || isExpanded) {
    return;
  }
  cancelPointerHide();
  clearIdleRetract();
  if (fade) {
    animateWindowOpacity(1, 0, 180, () => {
      if (windowMode === "pointer" && !isExpanded) {
        mainWindow.hide();
        mainWindow.setOpacity(1);
      }
    });
  } else {
    mainWindow.hide();
    mainWindow.setOpacity(1);
  }
  updateTrayMenu();
}

function schedulePointerHide(delay = 650) {
  if (!mainWindow || windowMode !== "pointer" || isExpanded) {
    return;
  }
  cancelPointerHide();
  pointerHideTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "pointer" || isExpanded) {
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    const inside =
      cursor.x >= bounds.x &&
      cursor.x <= bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y <= bounds.y + bounds.height;
    if (!inside) {
      hidePointerWindow();
    }
  }, delay);
}

function clearIdleRetract() {
  if (idleRetractTimer) {
    clearTimeout(idleRetractTimer);
    idleRetractTimer = null;
  }
}

function resetIdleRetract() {
  clearIdleRetract();
  if (windowMode !== "pointer" || !mainWindow?.isVisible()) {
    return;
  }
  const delay = isExpanded ? 8000 : 4000;
  idleRetractTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "pointer") {
      return;
    }
    if (isExpanded) {
      setExpanded(false);
      setTimeout(() => hidePointerWindow(), 320);
    } else {
      hidePointerWindow();
    }
  }, delay);
}

function markActivity() {
  if (windowMode !== "pointer" || !mainWindow?.isVisible()) {
    return;
  }
  resetIdleRetract();
}

function startPointerWatcher() {
  if (pointerPollTimer) {
    return;
  }
  pointerPollTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || windowMode !== "pointer") {
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const workArea = display.workArea;
    const left = workArea.x + workArea.width * 0.05;
    const right = workArea.x + workArea.width * 0.95;
    const atTop = cursor.y <= workArea.y + 2;
    const inTriggerZone = cursor.x >= left && cursor.x <= right;

    if (atTop && inTriggerZone && !mainWindow.isVisible()) {
      mainWindow.showInactive();
      mainWindow.setOpacity(0);
      positionWindow(false);
      isExpanded = false;
      mainWindow.webContents.send("window:expanded-changed", false);
      animateWindowOpacity(0, 1, 220);
      resetIdleRetract();
      updateTrayMenu();
      return;
    }

    if (mainWindow.isVisible() && !isExpanded) {
      const bounds = mainWindow.getBounds();
      const inside =
        cursor.x >= bounds.x &&
        cursor.x <= bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + bounds.height;
      if (inside) {
        cancelPointerHide();
      } else {
        schedulePointerHide();
      }
    }
  }, 120);
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示 TopNotes",
        click: () => {
          if (!mainWindow) {
            return;
          }
          mainWindow.show();
          mainWindow.focus();
          updateTrayMenu();
        }
      },
      {
        label: "展开便签",
        click: () => {
          if (!mainWindow) {
            return;
          }
          mainWindow.show();
          mainWindow.focus();
          setExpanded(true);
          updateTrayMenu();
        }
      },
      { type: "separator" },
      {
        label: "始终置顶",
        type: "checkbox",
        checked: alwaysOnTop,
        click: (item) => {
          alwaysOnTop = item.checked;
          mainWindow?.setAlwaysOnTop(alwaysOnTop, "floating");
          mainWindow?.webContents.send("settings:always-on-top", alwaysOnTop);
        }
      },
      {
        label: "保持屏幕唤醒",
        type: "checkbox",
        checked: keepAwake,
        click: (item) => {
          keepAwake = item.checked;
          setKeepAwake(keepAwake);
          mainWindow?.webContents.send("settings:keep-awake", keepAwake);
        }
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function setKeepAwake(enabled) {
  keepAwake = Boolean(enabled);
  if (keepAwake && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start("prevent-display-sleep");
  } else if (!keepAwake && powerBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
    powerBlockerId = null;
  }
}

function createTray() {
  tray = new Tray(appIcon(16));
  tray.setToolTip("TopNotes");
  tray.on("click", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.show();
    mainWindow.focus();
    setExpanded(true);
    updateTrayMenu();
  });
  updateTrayMenu();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...COLLAPSED_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: "#00000000",
    icon: appIcon(64),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setAlwaysOnTop(alwaysOnTop, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  positionWindow(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (windowMode === "persistent") {
      mainWindow.show();
    }
    updateTrayMenu();
  });

  mainWindow.on("show", () => {
    cancelPointerHide();
    updateTrayMenu();
  });
  mainWindow.on("hide", updateTrayMenu);
  mainWindow.on("blur", () => {
    if (windowMode === "pointer" && !isExpanded) {
      schedulePointerHide(700);
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("state:load", () => readState());
  ipcMain.handle("state:save", (_event, state) => writeState(state));
  ipcMain.handle("settings:get-launch-at-login", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("settings:set-launch-at-login", (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle("settings:set-keep-awake", (_event, enabled) => {
    setKeepAwake(enabled);
    updateTrayMenu();
    return keepAwake;
  });
  ipcMain.handle("settings:set-always-on-top", (_event, enabled) => {
    alwaysOnTop = Boolean(enabled);
    mainWindow?.setAlwaysOnTop(alwaysOnTop, "floating");
    updateTrayMenu();
    return alwaysOnTop;
  });
  ipcMain.handle("settings:set-window-mode", (_event, mode) => {
    windowMode = mode === "persistent" ? "persistent" : "pointer";
    if (windowMode === "persistent") {
      cancelPointerHide();
      clearIdleRetract();
      mainWindow?.show();
    } else {
      resetIdleRetract();
    }
    updateTrayMenu();
    return windowMode;
  });
  ipcMain.handle("files:inspect", async (_event, paths) => {
    const safePaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
    const results = [];
    for (const itemPath of safePaths) {
      try {
        const stats = await fs.promises.stat(itemPath);
        results.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          path: itemPath,
          name: path.basename(itemPath),
          extension: path.extname(itemPath).slice(1).toLowerCase(),
          size: stats.size,
          isDirectory: stats.isDirectory(),
          addedAt: new Date().toISOString()
        });
      } catch (error) {
        results.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          path: itemPath,
          name: path.basename(itemPath) || itemPath,
          extension: path.extname(itemPath).slice(1).toLowerCase(),
          size: 0,
          isDirectory: false,
          missing: true,
          addedAt: new Date().toISOString()
        });
      }
    }
    return results;
  });
  ipcMain.handle("files:open", async (_event, itemPath) => {
    if (!itemPath) {
      return false;
    }
    const error = await shell.openPath(itemPath);
    return error || true;
  });
  ipcMain.handle("url:open", async (_event, url) => {
    if (!/^https?:\/\//i.test(url || "")) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("files:reveal", (_event, itemPath) => {
    if (itemPath) {
      shell.showItemInFolder(itemPath);
    }
  });
  ipcMain.handle("note:export", async (_event, note) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出 Markdown",
      defaultPath: `${(note?.title || "note").replace(/[\\/:*?"<>|]/g, "-")}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (result.canceled || !result.filePath) {
      return false;
    }
    const body = `# ${note?.title || "Untitled"}\n\n${note?.content || ""}\n`;
    await fs.promises.writeFile(result.filePath, body, "utf8");
    return true;
  });

  ipcMain.on("files:start-drag", (event, itemPath) => {
    if (!itemPath || !fs.existsSync(itemPath)) {
      return;
    }
    event.sender.startDrag({
      file: itemPath,
      icon: appIcon(32)
    });
  });

  ipcMain.on("window:set-expanded", (_event, expanded) => {
    setExpanded(Boolean(expanded));
  });
  ipcMain.on("window:activity", markActivity);
  ipcMain.on("window:quit", () => {
    isQuitting = true;
    app.quit();
  });
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  setExpanded(true);
});

app.whenReady().then(() => {
  app.setAppUserModelId("com.topnotes.windows");
  registerIpc();
  createWindow();
  createTray();
  startPointerWatcher();

  globalShortcut.register("CommandOrControl+Alt+N", () => {
    if (!mainWindow) {
      return;
    }
    mainWindow.show();
    mainWindow.focus();
    setExpanded(true);
    updateTrayMenu();
  });
});

app.on("activate", () => {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (pointerPollTimer) {
    clearInterval(pointerPollTimer);
    pointerPollTimer = null;
  }
  cancelPointerHide();
  clearIdleRetract();
  stopBoundsAnimation();
  stopOpacityAnimation();
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
