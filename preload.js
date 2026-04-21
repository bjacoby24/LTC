const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  appName: "LTC Maintenance Program",

  isAdminUser(user) {
    const role = String(user?.role || "").trim().toLowerCase();
    return role === "admin";
  },

  saveWorkOrderAttachments(files, options = {}) {
    return ipcRenderer.invoke("attachments:save-work-order", {
      files,
      recordNumber: options.recordNumber || "",
      subfolder: options.subfolder || ""
    });
  },

  savePurchaseOrderAttachments(files, options = {}) {
    return ipcRenderer.invoke("attachments:save-purchase-order", {
      files,
      recordNumber: options.recordNumber || "",
      subfolder: options.subfolder || ""
    });
  },

  openAttachment(filePath) {
    return ipcRenderer.invoke("attachments:open", {
      filePath
    });
  },

  deleteAttachment(filePath) {
    return ipcRenderer.invoke("attachments:delete", {
      filePath
    });
  },

  pathExists(targetPath) {
    return ipcRenderer.invoke("attachments:path-exists", {
      targetPath
    });
  }
});