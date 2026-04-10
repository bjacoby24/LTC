console.log("APP JS LOADED");

import { getDom } from "./dom.js";
import {
  ensureDefaultUser,
  validateUserCredentials,
  setLoggedIn,
  isLoggedIn
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

  /* -------------------------
     APP VISIBILITY
  ------------------------- */
  function showApp() {
    if (dom.loginScreen) dom.loginScreen.style.display = "none";
    if (dom.appWrapper) dom.appWrapper.style.display = "flex";

    if (dom.loginUsername) dom.loginUsername.value = "";
    if (dom.loginPassword) dom.loginPassword.value = "";
    if (dom.loginError) dom.loginError.textContent = "";
  }

  function showLogin() {
    if (dom.loginScreen) dom.loginScreen.style.display = "flex";
    if (dom.appWrapper) dom.appWrapper.style.display = "none";
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
     LIVE SYNC
  ------------------------- */
  async function initLiveSync() {
    try {
      stopLiveSync = await startLiveSync({
        onRemoteChange: info => {
          console.log("[live-sync] Remote change detected:", info);

          if (!isLoggedIn()) return;

          window.location.reload();
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

      setLoggedIn(matchedUser.username);

      if (dom.loginError) {
        dom.loginError.textContent = "";
      }

      console.log("Login successful:", matchedUser.username);
      showApp();
    } catch (error) {
      console.error("Login failed:", error);
      if (dom.loginError) {
        dom.loginError.textContent = "Login failed. Try again.";
      }
    }
  }

  async function initLogin() {
    await ensureDefaultUser();

    console.log("Login DOM check:", {
      loginScreen: !!dom.loginScreen,
      appWrapper: !!dom.appWrapper,
      loginUsername: !!dom.loginUsername,
      loginPassword: !!dom.loginPassword,
      loginBtn: !!dom.loginBtn,
      loginError: !!dom.loginError
    });

    console.log("Login system initialized");
    console.log("isLoggedIn:", isLoggedIn());

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

    if (isLoggedIn()) {
      showApp();
    } else {
      showLogin();
    }
  }

  /* -------------------------
     INIT ALL MODULES
  ------------------------- */
  await runInit("Base app shell", initBaseAppShell);
  await runInit("Login", initLogin);
  await runInit("Navigation", initNavigation);
  await runInit("Settings", initSettings);

  await runInit("Equipment", initEquipment);
  await runInit("Work Orders nav", initWorkOrdersNav);
  await runInit("Inventory", initInventory);
  await runInit("Vendors", initVendors);
  await runInit("Purchase Orders nav", initPurchaseOrdersNav);
  await runInit("Deleted Equipment", initDeletedEquipment);
  await runInit("Dashboard", initDashboard);

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
});