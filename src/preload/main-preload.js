'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { IPC } = require('../shared/constants');
const { loadIcons, loadBallIcons } = require('./icons');
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
  openPath: (target) => ipcRenderer.invoke(IPC.OPEN_PATH, target),
  log: (text) => ipcRenderer.send(IPC.LOG_WRITE, text),
  copyImage: (dataUrl) => ipcRenderer.invoke(IPC.COPY_IMAGE, dataUrl),
  saveImage: (payload) => ipcRenderer.invoke(IPC.SAVE_IMAGE, payload),
  geoLookup: (ip) => ipcRenderer.invoke(IPC.GEO_LOOKUP, ip),
  clipboard: {
    list: () => ipcRenderer.invoke(IPC.CLIPBOARD_LIST),
    copy: (id) => ipcRenderer.invoke(IPC.CLIPBOARD_COPY, id),
    clear: () => ipcRenderer.invoke(IPC.CLIPBOARD_CLEAR),
    onChanged: (cb) => on(IPC.CLIPBOARD_CHANGED, cb),
  },
  hashText: (text) => ipcRenderer.invoke(IPC.HASH_TEXT, text),
  nutrient: {
    get: () => ipcRenderer.invoke(IPC.NUTRIENT_GET),
    saveProduct: (product) => ipcRenderer.invoke(IPC.NUTRIENT_SAVE_PRODUCT, product),
    deleteProduct: (name) => ipcRenderer.invoke(IPC.NUTRIENT_DELETE_PRODUCT, { name }),
    saveTdee: (tdee) => ipcRenderer.invoke(IPC.NUTRIENT_SAVE_TDEE, tdee),
  },
  hashFile: (file) => ipcRenderer.invoke(IPC.HASH_FILE, file),
  totp: {
    list: () => ipcRenderer.invoke(IPC.TOTP_LIST),
    add: (input) => ipcRenderer.invoke(IPC.TOTP_ADD, input),
    remove: (id) => ipcRenderer.invoke(IPC.TOTP_REMOVE, id),
    codes: () => ipcRenderer.invoke(IPC.TOTP_CODES),
  },
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
    onFocusInput: (cb) => on(IPC.TERMINAL_FOCUS_INPUT, cb),
    onData: (cb) => on(IPC.TERMINAL_DATA, cb),
    onExit: (cb) => on(IPC.TERMINAL_EXIT, cb),
    onSession: (cb) => on(IPC.TERMINAL_SESSION, cb),
    setBallActive: (active) => ipcRenderer.send(IPC.TERMINAL_BALL_ACTIVE, { active }),
    onBall: (cb) => on(IPC.TERMINAL_BALL, cb),
    ballDrag: (payload) => ipcRenderer.send(IPC.TERMINAL_BALL_DRAG, payload),
    restoreBall: () => ipcRenderer.invoke(IPC.TERMINAL_BALL_RESTORE),
    setBallPin: (value) => ipcRenderer.invoke(IPC.TERMINAL_BALL_PIN, { value }),
  },
  sftp: {
    // target: ssh 目标 token（兼容旧调用）或完整连接参数对象
    // { target, username, host, port, auth: 'password'|'key', password, identityFile }。
    connect: (target, extra) => {
      const payload = target && typeof target === 'object' ? target : { target };
      return ipcRenderer.invoke(IPC.SFTP_CONNECT, Object.assign({}, payload, extra || {}));
    },
    list: (id, path) => ipcRenderer.invoke(IPC.SFTP_LIST, { id, path }),
    download: (id, path) => ipcRenderer.invoke(IPC.SFTP_DOWNLOAD, { id, path }),
    open: (id, path) => ipcRenderer.invoke(IPC.SFTP_OPEN, { id, path }),
    openVSCode: (id, path) => ipcRenderer.invoke(IPC.SFTP_OPEN_VSCODE, { id, path }),
    upload: (id, localPath, remoteDir) => ipcRenderer.invoke(IPC.SFTP_UPLOAD, { id, localPath, remoteDir }),
    close: (id) => ipcRenderer.invoke(IPC.SFTP_CLOSE, { id }),
    transferCommand: (id, paths, recursive) => ipcRenderer.invoke(IPC.SFTP_TRANSFER_COMMAND, { id, paths, recursive }),
    copyPath: (paths) => ipcRenderer.invoke(IPC.SFTP_COPY_PATH, { paths }),
    copyText: (text) => ipcRenderer.invoke(IPC.SFTP_COPY_TEXT, { text }),
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
    open: (target, path) => ipcRenderer.invoke(IPC.FILE_WINDOW_OPEN, { target, path }),
    info: () => ipcRenderer.invoke(IPC.FILE_WINDOW_INFO),
    close: () => ipcRenderer.invoke(IPC.FILE_WINDOW_CLOSE),
    setAlwaysOnTop: (value) => ipcRenderer.invoke(IPC.FILE_WINDOW_SET_TOP, { value }),
    snapSize: (height) => ipcRenderer.invoke(IPC.FILE_WINDOW_SNAP_SIZE, { height }),
    onTarget: (cb) => on(IPC.FILE_WINDOW_TARGET, cb),
    onZoom: (cb) => on(IPC.FILE_WINDOW_ZOOM, cb),
  },
  ssh: {
    list: () => ipcRenderer.invoke(IPC.SSH_LIST),
    edit: (alias) => ipcRenderer.invoke(IPC.SSH_EDIT, { alias }),
    connect: (payload) => ipcRenderer.invoke(IPC.SSH_CONNECT, payload),
    detect: (payload) => ipcRenderer.invoke(IPC.SSH_DETECT, payload),
    onDetected: (cb) => on(IPC.SSH_DETECTED, cb),
    onConfigChanged: (cb) => on(IPC.SSH_CONFIG_CHANGED, cb),
  },
};

contextBridge.exposeInMainWorld('ships', api);
contextBridge.exposeInMainWorld('shipsIcons', loadIcons());
contextBridge.exposeInMainWorld('shipsBallIcons', loadBallIcons());
contextBridge.exposeInMainWorld('shipsFlags', { get: (code, shape) => getFlag(code, shape) });
