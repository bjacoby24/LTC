const { app, BrowserWindow } = require("electron");
const path = require("path");

const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

function setupAutoUpdater(win) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for update...");
  });

  autoUpdater.on("update-available", info => {
    console.log("Update available:", info?.version);
  });

  autoUpdater.on("update-not-available", info => {
    console.log("No update available:", info?.version);
  });

  autoUpdater.on("error", err => {
    console.error("Auto-update error:", err);
  });

  autoUpdater.on("download-progress", progress => {
    console.log(`Download speed: ${progress.bytesPerSecond}`);
    console.log(`Downloaded ${progress.percent}%`);
  });

  autoUpdater.on("update-downloaded", () => {
    const result = dialog.showMessageBoxSync(win, {
      type: "info",
      buttons: ["Install and Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update Ready",
      message: "A new version has been downloaded.",
      detail: "Restart the application to apply the update."
    });

    if (result === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
  setupAutoUpdater(win);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Correct way to load index.html
  const indexPath = path.join(__dirname, "index.html");
  win.loadFile(indexPath);

  // ❌ Removed DevTools auto open
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});