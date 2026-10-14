'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { IPC } = require('../shared/constants');
const { loadIcons } = require('./icons');
const { get: getFlag } = require('./flags');

function on(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getInfo: () => ipcRenderer.invoke(IPC.APP_INFO),
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
  onSettingsChanged: (cb) => on(IPC.SETTINGS_CHANGED, cb),
  onThemeChanged: (cb) => on(IPC.THEME_CHANGED, cb),
  hideWindow: () => ipcRenderer.send(IPC.WINDOW_HIDE),
  windowControl: (action) => ipcRenderer.invoke(IPC.WINDOW_CONTROL, { action }),
  openSettings: (section) => ipcRenderer.send(IPC.WINDOW_OPEN_SETTINGS, section),
  openDataFolder: () => ipcRenderer.invoke(IPC.OPEN_DATA_FOLDER),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  log: (text) => ipcRenderer.send(IPC.LOG_WRITE, text),
  geoLookup: (ip) => ipcRenderer.invoke(IPC.GEO_LOOKUP, ip),
  clipboard: {
    list: () => ipcRenderer.invoke(IPC.CLIPBOARD_LIST),
    copy: (id) => ipcRenderer.invoke(IPC.CLIPBOARD_COPY, id),
    clear: () => ipcRenderer.invoke(IPC.CLIPBOARD_CLEAR),
    onChanged: (cb) => on(IPC.CLIPBOARD_CHANGED, cb),
  },
  hashText: (text) => ipcRenderer.invoke(IPC.HASH_TEXT, text),
  hashFile: (file) => ipcRenderer.invoke(IPC.HASH_FILE, file),
  openFile: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE),
  openDirectory: (options) => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR, options),
  openFiles: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILES),
  // 拖拽上传用：取 File 对象的本地绝对路径（Electron 44 已移除 File.path）。
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (err) {
      return '';
    }
  },
  openTerminal: () => ipcRenderer.invoke(IPC.TERMINAL_OPEN),
  terminal: {
    start: (cols, rows, shell) => ipcRenderer.invoke(IPC.TERMINAL_START, { cols, rows, shell }),
    input: (id, data) => ipcRenderer.invoke(IPC.TERMINAL_INPUT, { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke(IPC.TERMINAL_RESIZE, { id, cols, rows }),
    interrupt: (id) => ipcRenderer.invoke(IPC.TERMINAL_INTERRUPT, { id }),
    kill: (id) => ipcRenderer.invoke(IPC.TERMINAL_KILL, { id }),
    destroy: () => ipcRenderer.invoke(IPC.TERMINAL_DESTROY),
    export: (payload) => ipcRenderer.invoke(IPC.TERMINAL_EXPORT, payload),
    copyText: (text) => ipcRenderer.invoke(IPC.TERMINAL_COPY_TEXT, { text }),
    pasteText: () => ipcRenderer.invoke(IPC.TERMINAL_PASTE_TEXT),
    openIterm: () => ipcRenderer.invoke(IPC.TERMINAL_OPEN_ITERM),
    setAlwaysOnTop: (value) => ipcRenderer.invoke(IPC.TERMINAL_SET_TOP, { value }),
    snapSize: (payload) => ipcRenderer.invoke(IPC.TERMINAL_SNAP_SIZE, payload),
    ensureSize: (payload) => ipcRenderer.invoke(IPC.TERMINAL_ENSURE_SIZE, payload),
    onRecalibrate: (cb) => on(IPC.TERMINAL_RECALIBRATE, cb),
    onDragActive: (cb) => on(IPC.TERMINAL_DRAG_ACTIVE, cb),
    onZoom: (cb) => on(IPC.TERMINAL_ZOOM, cb),
    onData: (cb) => on(IPC.TERMINAL_DATA, cb),
    onExit: (cb) => on(IPC.TERMINAL_EXIT, cb),
    onSession: (cb) => on(IPC.TERMINAL_SESSION, cb),
  },
  sftp: {
    connect: (target) => ipcRenderer.invoke(IPC.SFTP_CONNECT, { target }),
    list: (id, path) => ipcRenderer.invoke(IPC.SFTP_LIST, { id, path }),
    download: (id, path) => ipcRenderer.invoke(IPC.SFTP_DOWNLOAD, { id, path }),
    open: (id, path) => ipcRenderer.invoke(IPC.SFTP_OPEN, { id, path }),
    openVSCode: (id, path) => ipcRenderer.invoke(IPC.SFTP_OPEN_VSCODE, { id, path }),
    upload: (id, localPath, remoteDir) => ipcRenderer.invoke(IPC.SFTP_UPLOAD, { id, localPath, remoteDir }),
    close: (id) => ipcRenderer.invoke(IPC.SFTP_CLOSE, { id }),
    transferCommand: (id, paths, recursive) => ipcRenderer.invoke(IPC.SFTP_TRANSFER_COMMAND, { id, paths, recursive }),
    copyPath: (paths) => ipcRenderer.invoke(IPC.SFTP_COPY_PATH, { paths }),
    cdHistory: {
      list: (id) => ipcRenderer.invoke(IPC.CD_HISTORY_LIST, { id }),
      add: (id, path) => ipcRenderer.invoke(IPC.CD_HISTORY_ADD, { id, path }),
    },
    onProgress: (cb) => on(IPC.SFTP_PROGRESS, cb),
  },
  filesLayout: {
    get: (scope) => ipcRenderer.invoke(IPC.FILES_LAYOUT_GET, { scope }),
    set: (scope, patch) => ipcRenderer.invoke(IPC.FILES_LAYOUT_SET, { scope, patch }),
  },
  fileWindow: {
    open: (target) => ipcRenderer.invoke(IPC.FILE_WINDOW_OPEN, { target }),
    info: () => ipcRenderer.invoke(IPC.FILE_WINDOW_INFO),
    close: () => ipcRenderer.invoke(IPC.FILE_WINDOW_CLOSE),
    setAlwaysOnTop: (value) => ipcRenderer.invoke(IPC.FILE_WINDOW_SET_TOP, { value }),
    snapSize: (height) => ipcRenderer.invoke(IPC.FILE_WINDOW_SNAP_SIZE, { height }),
    onTarget: (cb) => on(IPC.FILE_WINDOW_TARGET, cb),
    onZoom: (cb) => on(IPC.FILE_WINDOW_ZOOM, cb),
  },
  ssh: {
    list: () => ipcRenderer.invoke(IPC.SSH_LIST),
    connect: (payload) => ipcRenderer.invoke(IPC.SSH_CONNECT, payload),
    detect: (payload) => ipcRenderer.invoke(IPC.SSH_DETECT, payload),
    onDetected: (cb) => on(IPC.SSH_DETECTED, cb),
  },
};

contextBridge.exposeInMainWorld('ships', api);
contextBridge.exposeInMainWorld('shipsIcons', loadIcons());
contextBridge.exposeInMainWorld('shipsFlags', { get: (code, shape) => getFlag(code, shape) });
