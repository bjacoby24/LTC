console.log("APP JS LOADED");

import { getDom } from "./dom.js";
import {
  ensureDefaultUser,
  getStoredUser,
  setLoggedIn,
  isLoggedIn
} from "./storage.js";

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

  /* -------------------------
     APP VISIBILITY
  ------------------------- */
  function showApp() {
    if (dom.loginScreen) dom.loginScreen.style.display = "none";
    if (dom.appWrapper) dom.appWrapper.style.display = "flex";

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
     LOGIN
  ------------------------- */
  function loginUser() {
    const username = (dom.loginUsername?.value || "").trim();
    const password = dom.loginPassword?.value || "";
    const storedUser = getStoredUser();

    console.log("Attempting login with:", { username });
    console.log("Stored user:", storedUser);

    if (!storedUser || !storedUser.username || !storedUser.password) {
      console.error("Stored user is missing or invalid:", storedUser);
      if (dom.loginError) {
        dom.loginError.textContent = "Login setup error. No stored user found.";
      }
      return;
    }

    if (username === storedUser.username && password === storedUser.password) {
      setLoggedIn(username);

      if (dom.loginError) {
        dom.loginError.textContent = "";
      }

      console.log("Login successful");
      showApp();
    } else {
      console.warn("Invalid login attempt");
      if (dom.loginError) {
        dom.loginError.textContent = "Invalid username or password.";
      }
    }
  }

  function initLogin() {
    ensureDefaultUser();

    console.log("Login DOM check:", {
      loginScreen: !!dom.loginScreen,
      appWrapper: !!dom.appWrapper,
      loginUsername: !!dom.loginUsername,
      loginPassword: !!dom.loginPassword,
      loginBtn: !!dom.loginBtn,
      loginError: !!dom.loginError
    });

    console.log("Stored user before login init:", getStoredUser());
    console.log("isLoggedIn:", isLoggedIn());

    if (dom.loginBtn) {
      dom.loginBtn.addEventListener("click", loginUser);
    } else {
      console.warn("loginBtn not found");
    }

    if (dom.loginPassword) {
      dom.loginPassword.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          loginUser();
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
});