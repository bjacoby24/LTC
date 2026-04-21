const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let updateCheckInterval = null;
let updaterInitialized = false;
let installTriggered = false;

const ATTACHMENT_ROOTS = {
  workOrder: "I:\\Maintenance\\Platform\\Work Orders",
  purchaseOrder: "I:\\Maintenance\\Platform\\Invoices"
};

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#f3f5f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
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

  if (!app.isPackaged) {
    console.log("[updater] Skipping updates in development mode.");
    return;
  }

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
    console.log(`[updater] Downloaded ${Math.round(progress?.percent || 0)}%`);
  });

  autoUpdater.on("update-downloaded", info => {
    console.log("[updater] Update downloaded:", info?.version);

    if (installTriggered) return;
    installTriggered = true;

    setTimeout(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.removeAllListeners("close");
        }

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

  checkForAppUpdates();

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }

  updateCheckInterval = setInterval(() => {
    checkForAppUpdates();
  }, 15 * 60 * 1000);
}

function checkForAppUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.checkForUpdates().catch(error => {
    console.error("[updater] Update check failed:", error);
  });
}

/* -------------------------
   ATTACHMENT HELPERS
------------------------- */
function sanitizeFolderName(value, fallback = "Record") {
  const clean = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ");

  return clean || fallback;
}

function sanitizeFileName(value, fallback = "file") {
  const clean = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ");

  return clean || fallback;
}

function ensureAbsoluteInsideRoot(rootPath, candidatePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

async function ensureDirectoryExists(targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });
  return targetDir;
}

async function fileExists(targetPath) {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getUniqueFilePath(targetDir, originalName) {
  const parsed = path.parse(sanitizeFileName(originalName, "file"));
  const baseName = parsed.name || "file";
  const extension = parsed.ext || "";

  let attempt = 0;
  while (attempt < 1000) {
    const candidateName =
      attempt === 0
        ? `${baseName}${extension}`
        : `${baseName} (${attempt + 1})${extension}`;

    const candidatePath = path.join(targetDir, candidateName);
    if (!(await fileExists(candidatePath))) {
      return candidatePath;
    }

    attempt += 1;
  }

  throw new Error("Could not create a unique file name.");
}

function normalizeIncomingFiles(files) {
  if (!Array.isArray(files)) return [];

  return files
    .filter(file => file && typeof file === "object")
    .map(file => ({
      name: sanitizeFileName(file.name || "file"),
      type: String(file.type || "application/octet-stream"),
      data:
        typeof file.data === "string"
          ? file.data
          : typeof file.buffer === "string"
            ? file.buffer
            : "",
      size: Number(file.size || 0) || 0
    }))
    .filter(file => !!file.data);
}

function decodeBase64Payload(dataUrlOrBase64) {
  const raw = String(dataUrlOrBase64 || "");
  const base64 = raw.includes(",") ? raw.split(",").pop() : raw;
  return Buffer.from(base64, "base64");
}

async function saveAttachmentsToRoot(rootPath, files, options = {}) {
  const normalizedFiles = normalizeIncomingFiles(files);
  if (!normalizedFiles.length) {
    return {
      ok: true,
      files: [],
      rootPath
    };
  }

  const safeRecordNumber = sanitizeFolderName(
    options.recordNumber || options.subfolder || "",
    "Unassigned"
  );

  const targetDir = path.join(rootPath, safeRecordNumber);
  const safeRoot = path.resolve(rootPath);
  const safeTargetDir = path.resolve(targetDir);

  if (!ensureAbsoluteInsideRoot(safeRoot, safeTargetDir)) {
    throw new Error("Attachment target path is invalid.");
  }

  await ensureDirectoryExists(safeTargetDir);

  const savedFiles = [];
  for (const file of normalizedFiles) {
    const uniquePath = await getUniqueFilePath(safeTargetDir, file.name);
    const buffer = decodeBase64Payload(file.data);

    await fsp.writeFile(uniquePath, buffer);

    const stats = await fsp.stat(uniquePath);

    savedFiles.push({
      id: `${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      name: path.basename(uniquePath),
      originalName: file.name,
      type: file.type,
      size: stats.size,
      filePath: uniquePath,
      url: uniquePath,
      uploadedAt: new Date().toISOString(),
      source: "local_drive"
    });
  }

  return {
    ok: true,
    files: savedFiles,
    rootPath: safeRoot,
    directory: safeTargetDir
  };
}

/* -------------------------
   ATTACHMENT IPC
------------------------- */
ipcMain.handle("attachments:save-work-order", async (_event, payload = {}) => {
  try {
    return await saveAttachmentsToRoot(
      ATTACHMENT_ROOTS.workOrder,
      payload.files,
      {
        recordNumber: payload.recordNumber,
        subfolder: payload.subfolder
      }
    );
  } catch (error) {
    console.error("[attachments] save work order failed:", error);
    return {
      ok: false,
      error: error?.message || "Unable to save work order attachments."
    };
  }
});

ipcMain.handle("attachments:save-purchase-order", async (_event, payload = {}) => {
  try {
    return await saveAttachmentsToRoot(
      ATTACHMENT_ROOTS.purchaseOrder,
      payload.files,
      {
        recordNumber: payload.recordNumber,
        subfolder: payload.subfolder
      }
    );
  } catch (error) {
    console.error("[attachments] save purchase order failed:", error);
    return {
      ok: false,
      error: error?.message || "Unable to save purchase order attachments."
    };
  }
});

ipcMain.handle("attachments:open", async (_event, payload = {}) => {
  try {
    const filePath = path.resolve(String(payload.filePath || ""));
    if (!filePath) {
      throw new Error("No file path was provided.");
    }

    const exists = await fileExists(filePath);
    if (!exists) {
      throw new Error("The file could not be found.");
    }

    const result = await shell.openPath(filePath);
    if (result) {
      throw new Error(result);
    }

    return { ok: true };
  } catch (error) {
    console.error("[attachments] open failed:", error);
    return {
      ok: false,
      error: error?.message || "Unable to open the attachment."
    };
  }
});

ipcMain.handle("attachments:delete", async (_event, payload = {}) => {
  try {
    const filePath = path.resolve(String(payload.filePath || ""));
    if (!filePath) {
      throw new Error("No file path was provided.");
    }

    const allowedRoots = Object.values(ATTACHMENT_ROOTS).map(root => path.resolve(root));
    const isAllowed = allowedRoots.some(root => ensureAbsoluteInsideRoot(root, filePath));
    if (!isAllowed) {
      throw new Error("That file path is not allowed.");
    }

    const exists = await fileExists(filePath);
    if (!exists) {
      return { ok: true, deleted: false };
    }

    await fsp.unlink(filePath);

    return {
      ok: true,
      deleted: true
    };
  } catch (error) {
    console.error("[attachments] delete failed:", error);
    return {
      ok: false,
      error: error?.message || "Unable to delete the attachment."
    };
  }
});

ipcMain.handle("attachments:path-exists", async (_event, payload = {}) => {
  try {
    const targetPath = path.resolve(String(payload.targetPath || ""));
    if (!targetPath) {
      return { ok: true, exists: false };
    }

    return {
      ok: true,
      exists: await fileExists(targetPath)
    };
  } catch (error) {
    console.error("[attachments] path exists failed:", error);
    return {
      ok: false,
      error: error?.message || "Unable to check the path."
    };
  }
});

/* -------------------------
   APP LIFECYCLE
------------------------- */
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
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