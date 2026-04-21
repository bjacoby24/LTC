console.log("APP JS LOADED");

import { getDom } from "./dom.js";
import {
  ensureDefaultUser,
  repairAdminPermissions,
  loadUsers,
  setLoggedIn,
  isLoggedIn,
  getLoggedInUser,
  clearLoggedIn
} from "./storage.js";
import { startLiveSync } from "./live-sync.js";

import { initNavigation } from "./navigation.js";
import { initSettings } from "./settings.js";
import { initDashboard } from "./dashboard.js";
import { initEquipment } from "./equipment.js";
import { initInventory } from "./inventory.js";
import { initVendors } from "./vendors.js";
import { initDeletedEquipment } from "./deletedEquipment.js";
import { initWorkOrdersNav } from "./workorders-nav.js";
import { initPurchaseOrdersNav } from "./purchaseorders-nav.js";

/* -------------------------
   INIT WRAPPER
------------------------- */
async function runInit(name, fn) {
  try {
    console.log(`Starting ${name}...`);

    if (typeof fn !== "function") {
      console.warn(`${name} init is missing`);
      return null;
    }

    const result = await fn();
    console.log(`${name} initialized`);
    return result;
  } catch (error) {
    console.error(`${name} failed to initialize`, error);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const dom = getDom();

  let stopLiveSync = null;
  let suppressRemoteReloadUntil = 0;
  let loginEventsBound = false;

  let navigationApi = null;
  let dashboardApi = null;
  let settingsApi = null;
  let equipmentApi = null;
  let inventoryApi = null;
  let vendorsApi = null;
  let deletedEquipmentApi = null;
  let workOrdersApi = null;
  let purchaseOrdersApi = null;

  /* -------------------------
     APP VISIBILITY
  ------------------------- */
  function clearLoginFields() {
    if (dom.loginUsername) dom.loginUsername.value = "";
    if (dom.loginPassword) dom.loginPassword.value = "";
    if (dom.loginError) dom.loginError.textContent = "";
  }

  function showApp() {
    if (dom.loginScreen) dom.loginScreen.style.display = "none";
    if (dom.appWrapper) dom.appWrapper.style.display = "flex";
    clearLoginFields();
  }

  function showLogin() {
    if (dom.loginScreen) dom.loginScreen.style.display = "flex";
    if (dom.appWrapper) dom.appWrapper.style.display = "none";
  }

  function hasValidSession() {
    if (!isLoggedIn()) return false;

    const loggedInUser = getLoggedInUser();
    return !!loggedInUser?.username;
  }

  function getCurrentPermissions() {
    const loggedInUser = getLoggedInUser();
    const permissions =
      loggedInUser &&
      typeof loggedInUser === "object" &&
      loggedInUser.permissions &&
      typeof loggedInUser.permissions === "object"
        ? loggedInUser.permissions
        : {};

    return {
      dashboardView: true,
      settingsAccess: false,
      userManagement: false,

      equipmentView: true,
      equipmentEdit: true,
      equipmentDelete: false,
      deletedEquipmentAccess: false,

      workOrdersView: true,
      workOrdersEdit: true,
      workOrdersDelete: false,

      inventoryView: true,
      inventoryEdit: true,
      inventoryDelete: false,
      vendorsAccess: true,
      purchaseOrdersAccess: true,

      ...permissions
    };
  }

  function applyGlobalPermissionVisibility() {
    const permissions = getCurrentPermissions();

    if (dom.settingsBtn) {
      dom.settingsBtn.style.display = permissions.settingsAccess ? "" : "none";
    }

    if (dom.settingsUsersBtn) {
      dom.settingsUsersBtn.style.display = permissions.userManagement ? "" : "none";
    }
  }

  async function syncAppPermissionsAndView() {
    applyGlobalPermissionVisibility();

    if (navigationApi?.applyNavigationPermissions) {
      navigationApi.applyNavigationPermissions();
    }

    if (equipmentApi?.applyEquipmentPermissionUi) {
      equipmentApi.applyEquipmentPermissionUi();
    }

    if (workOrdersApi?.applyWorkOrderPermissionUi) {
      workOrdersApi.applyWorkOrderPermissionUi();
    }

    if (inventoryApi?.applyInventoryPermissionUi) {
      inventoryApi.applyInventoryPermissionUi();
    }

    if (vendorsApi?.applyVendorPermissionUi) {
      vendorsApi.applyVendorPermissionUi();
    }

    if (purchaseOrdersApi?.applyPurchaseOrderPermissionUi) {
      purchaseOrdersApi.applyPurchaseOrderPermissionUi();
    }

    if (deletedEquipmentApi?.applyDeletedEquipmentPermissionUi) {
      deletedEquipmentApi.applyDeletedEquipmentPermissionUi();
    }

    if (equipmentApi?.renderEquipmentTable) {
      equipmentApi.renderEquipmentTable();
    }

    if (workOrdersApi?.renderWorkOrdersNavTable) {
      workOrdersApi.renderWorkOrdersNavTable();
    }

    if (inventoryApi?.renderInventoryTable) {
      inventoryApi.renderInventoryTable();
    }

    if (vendorsApi?.renderVendorsGrid) {
      vendorsApi.renderVendorsGrid();
    }

    if (purchaseOrdersApi?.renderPurchaseOrdersNavTable) {
      purchaseOrdersApi.renderPurchaseOrdersNavTable();
    }

    if (deletedEquipmentApi?.renderDeletedEquipment) {
      deletedEquipmentApi.renderDeletedEquipment();
    }

    const targetView = navigationApi?.getFirstAccessibleView
      ? navigationApi.getFirstAccessibleView()
      : "dashboardView";

    if (navigationApi?.showView) {
      navigationApi.showView(targetView);
    }

    await refreshDashboardIfAvailable();
  }

  function resetInvalidSession() {
    clearLoggedIn();
    showLogin();
    applyGlobalPermissionVisibility();
  }

  /* -------------------------
     BASE SHELL
  ------------------------- */
  function initBaseAppShell() {
    if (!dom.appWrapper || !dom.loginScreen) {
      console.warn("App shell elements are missing");
    }
  }

  /* -------------------------
     LIVE SYNC HELPERS
  ------------------------- */
  function suppressRemoteReload(ms = 3000) {
    const duration = Number(ms) > 0 ? Number(ms) : 3000;
    suppressRemoteReloadUntil = Date.now() + duration;
    console.log(`[live-sync] Suppressing remote refresh for ${duration}ms`);
  }

  function shouldSuppressRemoteReload() {
    return Date.now() < suppressRemoteReloadUntil;
  }

  window.suppressFleetLiveReload = suppressRemoteReload;

  async function refreshLoggedInSessionFromUsers() {
    if (!isLoggedIn()) return false;

    const sessionUser = getLoggedInUser();
    const sessionUsername = String(sessionUser?.username || "")
      .trim()
      .toLowerCase();

    if (!sessionUsername) return false;

    try {
      const users = await loadUsers();
      const freshUser = users.find(
        user =>
          String(user?.username || "")
            .trim()
            .toLowerCase() === sessionUsername
      );

      if (freshUser && freshUser.active !== false) {
        setLoggedIn(freshUser);
        console.log("Session refreshed from users collection:", freshUser.username);
        return true;
      }

      console.warn("Logged-in user no longer exists or is inactive.");
      resetInvalidSession();
      return false;
    } catch (error) {
      console.error("Failed to refresh logged-in session:", error);
      return false;
    }
  }

  async function refreshDashboardIfAvailable() {
    if (dashboardApi?.updateDashboard) {
      try {
        await dashboardApi.updateDashboard();
        return;
      } catch (error) {
        console.error("Dashboard refresh failed:", error);
      }
    }

    try {
      window.dispatchEvent(new CustomEvent("fleet:settings-changed"));
      window.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
      window.dispatchEvent(new CustomEvent("fleet:work-orders-changed"));
      window.dispatchEvent(new CustomEvent("fleet:purchase-orders-changed"));
    } catch (error) {
      console.error("Dashboard event refresh failed:", error);
    }
  }

  async function handleRemoteChange(info) {
    if (!hasValidSession()) return;

    if (shouldSuppressRemoteReload()) {
      console.log("[live-sync] Remote refresh suppressed:", info);
      return;
    }

    console.log("[live-sync] Remote change detected:", info);

    switch (info?.key) {
      case "equipment":
        window.dispatchEvent(new CustomEvent("fleet:equipment-changed", { detail: info }));
        await refreshDashboardIfAvailable();
        break;

      case "deletedEquipment":
        window.dispatchEvent(
          new CustomEvent("fleet:deleted-equipment-changed", { detail: info })
        );
        await refreshDashboardIfAvailable();
        break;

      case "inventory":
        window.dispatchEvent(new CustomEvent("fleet:inventory-changed", { detail: info }));
        await refreshDashboardIfAvailable();
        break;

      case "vendors":
        window.dispatchEvent(new CustomEvent("fleet:vendors-changed", { detail: info }));
        break;

      case "purchaseOrders":
        window.dispatchEvent(
          new CustomEvent("fleet:purchase-orders-changed", { detail: info })
        );
        await refreshDashboardIfAvailable();
        break;

      case "workOrders":
        window.dispatchEvent(new CustomEvent("fleet:work-orders-changed", { detail: info }));
        await refreshDashboardIfAvailable();
        break;

      case "settings":
        window.dispatchEvent(new CustomEvent("fleet:settings-changed", { detail: info }));
        await refreshDashboardIfAvailable();
        break;

      case "users": {
        const sessionStillValid = await refreshLoggedInSessionFromUsers();
        if (sessionStillValid) {
          await syncAppPermissionsAndView();
          window.dispatchEvent(new CustomEvent("fleet:users-changed", { detail: info }));
        }
        break;
      }

      default:
        break;
    }
  }

  async function initLiveSync() {
    try {
      stopLiveSync = await startLiveSync({
        onRemoteChange: async info => {
          await handleRemoteChange(info);
        },
        onReady: payload => {
          console.log("[live-sync] ready:", payload);
        },
        onError: error => {
          console.error("[live-sync] listener error:", error);
        }
      });

      console.log("[live-sync] initialized");
    } catch (error) {
      console.error("[live-sync] failed to initialize", error);
    }
  }

  /* -------------------------
     LOGIN
  ------------------------- */
  async function validateUserCredentials(username, password) {
    const cleanUsername = String(username || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (!cleanUsername || !cleanPassword) return null;

    const users = await loadUsers();

    return (
      users.find(user => {
        return (
          String(user?.username || "").trim().toLowerCase() === cleanUsername &&
          String(user?.password || "") === cleanPassword &&
          user?.active !== false
        );
      }) || null
    );
  }

  async function loginUser() {
    const username = (dom.loginUsername?.value || "").trim();
    const password = dom.loginPassword?.value || "";

    if (!username || !password) {
      if (dom.loginError) {
        dom.loginError.textContent = "Enter username and password.";
      }
      return;
    }

    try {
      const matchedUser = await validateUserCredentials(username, password);

      if (!matchedUser) {
        if (dom.loginError) {
          dom.loginError.textContent = "Invalid username or password.";
        }
        return;
      }

      setLoggedIn(matchedUser);

      if (dom.loginError) {
        dom.loginError.textContent = "";
      }

      console.log("Login successful:", matchedUser.username);
      showApp();

      await syncAppPermissionsAndView();
      await refreshDashboardIfAvailable();
    } catch (error) {
      console.error("Login failed:", error);

      if (dom.loginError) {
        dom.loginError.textContent = "Login failed. Try again.";
      }
    }
  }

  function bindLoginEvents() {
    if (loginEventsBound) return;
    loginEventsBound = true;

    if (dom.loginBtn) {
      dom.loginBtn.addEventListener("click", async () => {
        await loginUser();
      });
    } else {
      console.warn("loginBtn not found");
    }

    if (dom.loginPassword) {
      dom.loginPassword.addEventListener("keydown", async event => {
        if (event.key === "Enter") {
          event.preventDefault();
          await loginUser();
        }
      });
    } else {
      console.warn("loginPassword not found");
    }
  }

  async function initLogin() {
    try {
      await ensureDefaultUser();
      await repairAdminPermissions();
    } catch (error) {
      console.error("Login startup preparation failed:", error);
    }

    console.log("Login DOM check:", {
      loginScreen: !!dom.loginScreen,
      appWrapper: !!dom.appWrapper,
      loginUsername: !!dom.loginUsername,
      loginPassword: !!dom.loginPassword,
      loginBtn: !!dom.loginBtn,
      loginError: !!dom.loginError
    });

    bindLoginEvents();

    clearLoggedIn();
    showLogin();
    applyGlobalPermissionVisibility();

    console.log("Login system initialized");
    console.log("Session cleared on startup. Login required.");
  }

  /* -------------------------
     INIT ALL MODULES
  ------------------------- */
  await runInit("Base app shell", initBaseAppShell);
  await runInit("Login", initLogin);

  navigationApi = await runInit("Navigation", initNavigation);
  settingsApi = await runInit("Settings", initSettings);
  equipmentApi = await runInit("Equipment", initEquipment);
  workOrdersApi = await runInit("Work Orders nav", initWorkOrdersNav);
  inventoryApi = await runInit("Inventory", initInventory);
  vendorsApi = await runInit("Vendors", initVendors);
  purchaseOrdersApi = await runInit("Purchase Orders nav", initPurchaseOrdersNav);
  deletedEquipmentApi = await runInit("Deleted Equipment", initDeletedEquipment);
  dashboardApi = await runInit("Dashboard", initDashboard);

  applyGlobalPermissionVisibility();

  await runInit("Live sync", initLiveSync);

  window.addEventListener("beforeunload", () => {
    if (typeof stopLiveSync === "function") {
      try {
        stopLiveSync();
      } catch (error) {
        console.error("[live-sync] cleanup failed", error);
      }
    }
  });

  /* -------------------------
     OPTIONAL DEBUG EXPOSURE
  ------------------------- */
  window.fleetAppDebug = {
    get navigationApi() {
      return navigationApi;
    },
    get dashboardApi() {
      return dashboardApi;
    },
    get settingsApi() {
      return settingsApi;
    },
    get equipmentApi() {
      return equipmentApi;
    },
    get inventoryApi() {
      return inventoryApi;
    },
    get vendorsApi() {
      return vendorsApi;
    },
    get deletedEquipmentApi() {
      return deletedEquipmentApi;
    },
    get workOrdersApi() {
      return workOrdersApi;
    },
    get purchaseOrdersApi() {
      return purchaseOrdersApi;
    },
    refreshSession: refreshLoggedInSessionFromUsers,
    syncAppPermissionsAndView,
    hasValidSession
  };
});