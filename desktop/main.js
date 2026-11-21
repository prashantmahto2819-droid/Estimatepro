/* Estimate Pro for Windows — a window on the live app. The app's own service worker keeps it working offline
   after the first start; sign-in, licence and device limit are the same as on the web. */
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("path");
const HOME = "https://estimatepro.prashantmahto2819.workers.dev/app?src=desktop";
const HOST = new URL(HOME).host;
let win = null;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(create);
  app.on("window-all-closed", () => app.quit());
}

function create() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 900, minHeight: 600, show: false, backgroundColor: "#f5f7fa",
    title: "Estimate Pro", icon: path.join(__dirname, "icon.png"), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + " EstimateProDesktop/" + app.getVersion());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "App", submenu: [
      { label: "Reload", accelerator: "Ctrl+R", click: () => win.webContents.reload() },
      { label: "Reload and clear the saved copy", click: async () => { await win.webContents.session.clearCache(); win.webContents.reloadIgnoringCache(); } },
      { label: "Full screen", accelerator: "F11", click: () => win.setFullScreen(!win.isFullScreen()) },
      { type: "separator" },
      { label: "Zoom in", accelerator: "Ctrl+=", click: () => win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5) },
      { label: "Zoom out", accelerator: "Ctrl+-", click: () => win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5) },
      { label: "Actual size", accelerator: "Ctrl+0", click: () => win.webContents.setZoomLevel(0) },
      { type: "separator" },
      { label: "About", click: () => dialog.showMessageBox(win, { type: "info", title: "Estimate Pro", message: "Estimate Pro for Windows " + app.getVersion(), detail: "The app updates itself from the website each time it starts with internet." }) },
      { label: "Quit", accelerator: "Alt+F4", click: () => app.quit() }
    ] }
  ]));
  /* links to other sites open in the normal browser; the app's own pages and pop-ups (PDF, print) stay inside */
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { const u = new URL(url); if (u.protocol === "blob:" || u.protocol === "data:" || u.host === HOST) return { action: "allow" }; } catch (e) {}
    shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.on("will-navigate", (ev, url) => { try { const u = new URL(url); if (u.host !== HOST && u.protocol !== "file:") { ev.preventDefault(); shell.openExternal(url); } } catch (e) {} });
  /* camera (GPS camera, scanner), location and clipboard are asked by the app itself */
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(["media", "geolocation", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "notifications"].includes(perm)));
  /* downloads (PDF, DXF, Excel, video) ask where to save */
  win.webContents.session.on("will-download", (ev, item) => { item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("documents"), item.getFilename()) }); });
  win.webContents.on("did-fail-load", (ev, code, desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html")); });
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  win.loadURL(HOME);
}
