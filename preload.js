const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("topNotes", {
  isElectron: true,
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  inspectFiles: (paths) => ipcRenderer.invoke("files:inspect", paths),
  openFile: (path) => ipcRenderer.invoke("files:open", path),
  openUrl: (url) => ipcRenderer.invoke("url:open", url),
  revealFile: (path) => ipcRenderer.invoke("files:reveal", path),
  startDrag: (path) => ipcRenderer.send("files:start-drag", path),
  exportNote: (note) => ipcRenderer.invoke("note:export", note),
  getLaunchAtLogin: () => ipcRenderer.invoke("settings:get-launch-at-login"),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("settings:set-launch-at-login", enabled),
  setKeepAwake: (enabled) => ipcRenderer.invoke("settings:set-keep-awake", enabled),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("settings:set-always-on-top", enabled),
  setWindowMode: (mode) => ipcRenderer.invoke("settings:set-window-mode", mode),
  setExpanded: (expanded) => ipcRenderer.send("window:set-expanded", expanded),
  notifyActivity: () => ipcRenderer.send("window:activity"),
  quitApp: () => ipcRenderer.send("window:quit"),
  onExpandedChanged: (callback) => {
    const handler = (_event, expanded) => callback(expanded);
    ipcRenderer.on("window:expanded-changed", handler);
    return () => ipcRenderer.removeListener("window:expanded-changed", handler);
  },
  onAlwaysOnTopChanged: (callback) => {
    const handler = (_event, enabled) => callback(enabled);
    ipcRenderer.on("settings:always-on-top", handler);
    return () => ipcRenderer.removeListener("settings:always-on-top", handler);
  },
  onKeepAwakeChanged: (callback) => {
    const handler = (_event, enabled) => callback(enabled);
    ipcRenderer.on("settings:keep-awake", handler);
    return () => ipcRenderer.removeListener("settings:keep-awake", handler);
  }
});
