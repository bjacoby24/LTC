const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  appName: "LTC Maintenance Program"
});