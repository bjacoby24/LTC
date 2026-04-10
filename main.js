const { app, BrowserWindow } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let updateCheckInterval = null;
let updaterInitialized = false;
let installTriggered = false;

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  setupAutoUpdater();

  return mainWindow;
}

function setupAutoUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for update...");
  });

  autoUpdater.on("update-available", info => {
    installTriggered = false;
    console.log("[updater] Update available:", info?.version);
  });

  autoUpdater.on("update-not-available", info => {
    console.log("[updater] No update available:", info?.version);
  });

  autoUpdater.on("download-progress", progress => {
    console.log(`[updater] Downloaded ${Math.round(progress.percent || 0)}%`);
  });

  autoUpdater.on("update-downloaded", info => {
    console.log("[updater] Update downloaded:", info?.version);

    if (installTriggered) return;
    installTriggered = true;

    setTimeout(() => {
      try {
        // isSilent = true, isForceRunAfter = true
        autoUpdater.quitAndInstall(true, true);
      } catch (error) {
        console.error("[updater] Silent install failed:", error);
        installTriggered = false;
      }
    }, 1200);
  });

  autoUpdater.on("error", error => {
    console.error("[updater] Error:", error);
    installTriggered = false;
  });

  if (!app.isPackaged) {
    console.log("[updater] Skipping updates in development mode.");
    return;
  }

  checkForAppUpdates();

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }

  updateCheckInterval = setInterval(() => {
    checkForAppUpdates();
  }, 15 * 60 * 1000);
}

function checkForAppUpdates() {
  autoUpdater.checkForUpdates().catch(error => {
    console.error("[updater] Update check failed:", error);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});