import { getDom } from "./dom.js";
import { normalizeText } from "./utils.js";
import {
  loadSettings,
  saveSettings,
  clearLoggedIn,
  updateUserPassword,
  getLoggedInUsername,
  getLoggedInUser
} from "./storage.js";

export async function initSettings() {
  const dom = getDom() || {};

  let appModalResolver = null;
  let appModalLastFocus = null;
  let settingsCache = getDefaultSettings();
  let eventsBound = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function getDefaultSettings() {
    return {
      companyName: "",
      defaultLocation: "",
      theme: "default",
      weatherZip: "62201",
      serviceTasks: [],
      serviceTemplates: []
    };
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
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
      settingsAccess: false,
      userManagement: false,
      ...permissions
    };
  }

  function canAccessSettings() {
    return !!getCurrentPermissions().settingsAccess;
  }

  function canAccessUserManagement() {
    return !!getCurrentPermissions().userManagement;
  }

  function canAccessServices() {
    return !!getCurrentPermissions().settingsAccess;
  }

  async function showMessageModal(title = "Message", message = "") {
    const modal = dom.appModal || byId("appModal");
    const titleEl = dom.appModalTitle || byId("appModalTitle");
    const messageEl = dom.appModalMessage || byId("appModalMessage");
    const actionsEl = dom.appModalActions || byId("appModalActions");

    if (!modal || !titleEl || !messageEl || !actionsEl) {
      window.alert(message);
      return true;
    }

    return new Promise(resolve => {
      appModalResolver = resolve;
      appModalLastFocus = document.activeElement;

      titleEl.textContent = title;
      messageEl.textContent = message;
      actionsEl.innerHTML = `
        <button type="button" id="appModalOkBtn" class="primaryBtn">OK</button>
      `;

      const okBtn = byId("appModalOkBtn");
      okBtn?.addEventListener(
        "click",
        () => {
          closeMessageModal(true);
        },
        { once: true }
      );

      modal.classList.add("show");
      okBtn?.focus();
    });
  }

  async function showConfirmModal(
    title = "Confirm",
    message = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false
  ) {
    const modal = dom.appModal || byId("appModal");
    const titleEl = dom.appModalTitle || byId("appModalTitle");
    const messageEl = dom.appModalMessage || byId("appModalMessage");
    const actionsEl = dom.appModalActions || byId("appModalActions");

    if (!modal || !titleEl || !messageEl || !actionsEl) {
      return window.confirm(message);
    }

    return new Promise(resolve => {
      appModalResolver = resolve;
      appModalLastFocus = document.activeElement;

      titleEl.textContent = title;
      messageEl.textContent = message;
      actionsEl.innerHTML = `
        <button type="button" id="appModalCancelBtn">${cancelText}</button>
        <button type="button" id="appModalConfirmBtn" class="${danger ? "danger" : "primaryBtn"}">${confirmText}</button>
      `;

      const cancelBtn = byId("appModalCancelBtn");
      const confirmBtn = byId("appModalConfirmBtn");

      cancelBtn?.addEventListener(
        "click",
        () => {
          closeMessageModal(false);
        },
        { once: true }
      );

      confirmBtn?.addEventListener(
        "click",
        () => {
          closeMessageModal(true);
        },
        { once: true }
      );

      modal.classList.add("show");
      confirmBtn?.focus();
    });
  }

  function closeMessageModal(result = false) {
    const modal = dom.appModal || byId("appModal");
    const actionsEl = dom.appModalActions || byId("appModalActions");

    if (modal) {
      modal.classList.remove("show");
    }

    if (actionsEl) {
      actionsEl.innerHTML = "";
    }

    const resolver = appModalResolver;
    appModalResolver = null;

    if (appModalLastFocus && typeof appModalLastFocus.focus === "function") {
      try {
        appModalLastFocus.focus();
      } catch (error) {
        console.warn("Unable to restore modal focus:", error);
      }
    }

    appModalLastFocus = null;

    if (typeof resolver === "function") {
      resolver(result);
    }
  }

  async function requirePermission(checkFn, title, message) {
    if (checkFn()) return true;
    await showMessageModal(title, message);
    return false;
  }

  async function hydrateSettings() {
    try {
      const saved = safeObject(await loadSettings());

      settingsCache = {
        ...getDefaultSettings(),
        ...saved,
        companyName: saved.companyName || "",
        defaultLocation: saved.defaultLocation || "",
        theme: saved.theme || "default",
        weatherZip: saved.weatherZip || "62201",
        serviceTasks: Array.isArray(saved.serviceTasks) ? saved.serviceTasks : [],
        serviceTemplates: Array.isArray(saved.serviceTemplates)
          ? saved.serviceTemplates
          : []
      };
    } catch (error) {
      console.error("Failed to hydrate settings:", error);
      settingsCache = getDefaultSettings();
    }
  }

  function getSettings() {
    return {
      ...getDefaultSettings(),
      ...settingsCache,
      companyName: normalizeText(settingsCache.companyName),
      defaultLocation: normalizeText(settingsCache.defaultLocation),
      theme: normalizeText(settingsCache.theme || "default") || "default",
      weatherZip: normalizeText(settingsCache.weatherZip || "62201") || "62201",
      serviceTasks: Array.isArray(settingsCache.serviceTasks) ? settingsCache.serviceTasks : [],
      serviceTemplates: Array.isArray(settingsCache.serviceTemplates)
        ? settingsCache.serviceTemplates
        : []
    };
  }

  function applyTheme(themeValue = "default") {
    const body = document.body;
    if (!body) return;

    body.classList.remove("theme-light", "theme-dark");

    const cleanTheme = normalizeLower(themeValue);
    if (cleanTheme === "light") {
      body.classList.add("theme-light");
    } else if (cleanTheme === "dark") {
      body.classList.add("theme-dark");
    }
  }

  function populateSettingsForm() {
    const settings = getSettings();

    const companyNameInput =
      dom.companyNameInput || byId("companyNameInput");
    const defaultLocationInput =
      dom.defaultLocationInput || byId("defaultLocationInput");
    const themeSelect =
      dom.themeSelect || byId("themeSelect");
    const weatherZipInput =
      dom.weatherZipInput || byId("weatherZipInput");

    if (companyNameInput) {
      companyNameInput.value = settings.companyName || "";
    }

    if (defaultLocationInput) {
      defaultLocationInput.value = settings.defaultLocation || "";
    }

    if (themeSelect) {
      themeSelect.value = settings.theme || "default";
    }

    if (weatherZipInput) {
      weatherZipInput.value = settings.weatherZip || "62201";
    }

    applyTheme(settings.theme);
  }

  async function saveSettingsFromForm() {
    if (
      !(await requirePermission(
        canAccessSettings,
        "Settings Access Required",
        "You do not have permission to change settings."
      ))
    ) {
      return;
    }

    const companyNameInput =
      dom.companyNameInput || byId("companyNameInput");
    const defaultLocationInput =
      dom.defaultLocationInput || byId("defaultLocationInput");
    const themeSelect =
      dom.themeSelect || byId("themeSelect");
    const weatherZipInput =
      dom.weatherZipInput || byId("weatherZipInput");

    const nextSettings = {
      ...getSettings(),
      companyName: normalizeText(companyNameInput?.value || ""),
      defaultLocation: normalizeText(defaultLocationInput?.value || ""),
      theme: normalizeText(themeSelect?.value || "default") || "default",
      weatherZip: normalizeText(weatherZipInput?.value || "62201") || "62201",
      serviceTasks: Array.isArray(settingsCache.serviceTasks)
        ? settingsCache.serviceTasks
        : [],
      serviceTemplates: Array.isArray(settingsCache.serviceTemplates)
        ? settingsCache.serviceTemplates
        : []
    };

    try {
      const saved = await saveSettings(nextSettings);
      settingsCache = {
        ...getDefaultSettings(),
        ...saved
      };

      applyTheme(settingsCache.theme);
      populateSettingsForm();

      try {
        window.dispatchEvent(
          new CustomEvent("fleet:settings-changed", {
            detail: { settings: settingsCache }
          })
        );
      } catch (eventError) {
        console.warn("Unable to dispatch settings changed event:", eventError);
      }

      await showMessageModal("Settings Saved", "Settings were saved successfully.");
    } catch (error) {
      console.error("Failed to save settings:", error);
      await showMessageModal(
        "Save Failed",
        `Unable to save settings: ${error?.message || error}`
      );
    }
  }

  function openSettingsPanel() {
    const panel = dom.settingsPanel || byId("settingsPanel");
    if (!panel) return;

    panel.style.display = "block";
    panel.classList.add("show");
    populateSettingsForm();
  }

  function closeSettingsPanel() {
    const panel = dom.settingsPanel || byId("settingsPanel");
    if (!panel) return;

    panel.classList.remove("show");
    panel.style.display = "none";
  }

  function openPasswordModal() {
    const modal = dom.passwordModal || byId("passwordModal");
    const currentInput = dom.currentPasswordInput || byId("currentPasswordInput");
    const newInput = dom.newPasswordInput || byId("newPasswordInput");
    const confirmInput = dom.confirmPasswordInput || byId("confirmPasswordInput");

    if (!modal) return;

    if (currentInput) currentInput.value = "";
    if (newInput) newInput.value = "";
    if (confirmInput) confirmInput.value = "";

    modal.classList.add("show");
    currentInput?.focus();
  }

  function closePasswordModal() {
    const modal = dom.passwordModal || byId("passwordModal");
    if (!modal) return;
    modal.classList.remove("show");
  }

  async function saveNewPassword() {
    const username = getLoggedInUsername();
    const currentInput = dom.currentPasswordInput || byId("currentPasswordInput");
    const newInput = dom.newPasswordInput || byId("newPasswordInput");
    const confirmInput = dom.confirmPasswordInput || byId("confirmPasswordInput");

    const currentPassword = normalizeText(currentInput?.value || "");
    const newPassword = normalizeText(newInput?.value || "");
    const confirmPassword = normalizeText(confirmInput?.value || "");

    if (!username) {
      await showMessageModal("Password Change Failed", "No logged-in user found.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      await showMessageModal("Missing Information", "Please fill out all password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      await showMessageModal("Password Mismatch", "New password and confirmation do not match.");
      return;
    }

    if (newPassword.length < 3) {
      await showMessageModal("Password Too Short", "Password must be at least 3 characters.");
      return;
    }

    try {
      await updateUserPassword(username, newPassword);
      closePasswordModal();
      await showMessageModal("Password Updated", "Your password was updated successfully.");
    } catch (error) {
      console.error("Failed to update password:", error);
      await showMessageModal(
        "Password Change Failed",
        `Unable to update password: ${error?.message || error}`
      );
    }
  }

  async function logoutUser() {
    const confirmed = await showConfirmModal(
      "Logout",
      "Are you sure you want to log out?",
      "Logout",
      "Cancel",
      false
    );

    if (!confirmed) return;

    clearLoggedIn();
    window.location.reload();
  }

  async function openServiceTemplateWindow() {
    if (
      !(await requirePermission(
        canAccessServices,
        "Services Access Required",
        "You do not have permission to access Services."
      ))
    ) {
      return;
    }

    try {
      const url = "service-template.html";

      if (window.electronAPI?.openWindow) {
        window.electronAPI.openWindow({
          url,
          title: "Service Templates",
          width: 1400,
          height: 900
        });
        return;
      }

      window.open(
        url,
        "_blank",
        "width=1400,height=900,resizable=yes,scrollbars=yes"
      );
    } catch (error) {
      console.error("Failed to open service template window:", error);
      await showMessageModal(
        "Open Services Failed",
        `Unable to open Services: ${error?.message || error}`
      );
    }
  }

  async function openUserManagementWindow() {
    if (
      !(await requirePermission(
        canAccessUserManagement,
        "User Management Required",
        "You do not have permission to manage users."
      ))
    ) {
      return;
    }

    try {
      const url = "users.html";

      if (window.electronAPI?.openWindow) {
        window.electronAPI.openWindow({
          url,
          title: "User Management",
          width: 1200,
          height: 850
        });
        return;
      }

      window.open(
        url,
        "_blank",
        "width=1200,height=850,resizable=yes,scrollbars=yes"
      );
    } catch (error) {
      console.error("Failed to open user management window:", error);
      await showMessageModal(
        "Open User Management Failed",
        `Unable to open User Management: ${error?.message || error}`
      );
    }
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    const settingsBtn =
      dom.openSettingsBtn ||
      document.getElementById("openSettingsBtn");

    const servicesBtn =
      dom.openServicesBtn ||
      document.getElementById("openServicesBtn");

    const usersBtn =
      dom.settingsUsersBtn ||
      document.getElementById("settingsUsersBtn") ||
      dom.manageUsersBtn ||
      document.getElementById("manageUsersBtn");

    const passwordBtn =
      dom.settingsPasswordBtn ||
      document.getElementById("settingsPasswordBtn") ||
      dom.changePasswordBtn ||
      document.getElementById("changePasswordBtn");

    if (dom.settingsMenuBtn && dom.settingsDropdown) {
      dom.settingsMenuBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        dom.settingsDropdown.classList.toggle("show");
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        if (dom.settingsDropdown) {
          dom.settingsDropdown.classList.remove("show");
        }

        if (
          !(await requirePermission(
            canAccessSettings,
            "Settings Access Required",
            "You do not have permission to open Settings."
          ))
        ) {
          return;
        }

        openSettingsPanel();
      });
    }

    if (servicesBtn) {
      servicesBtn.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        if (dom.settingsDropdown) {
          dom.settingsDropdown.classList.remove("show");
        }

        await openServiceTemplateWindow();
      });
    }

    if (usersBtn) {
      usersBtn.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        if (dom.settingsDropdown) {
          dom.settingsDropdown.classList.remove("show");
        }

        await openUserManagementWindow();
      });
    }

    if (dom.closeSettingsBtn) {
      dom.closeSettingsBtn.addEventListener("click", closeSettingsPanel);
    }

    if (dom.saveSettingsBtn) {
      dom.saveSettingsBtn.addEventListener("click", () => {
        saveSettingsFromForm();
      });
    }

    if (passwordBtn) {
      passwordBtn.addEventListener("click", () => {
        openPasswordModal();
      });
    }

    if (dom.closePasswordModalBtn) {
      dom.closePasswordModalBtn.addEventListener("click", closePasswordModal);
    }

    if (dom.savePasswordBtn) {
      dom.savePasswordBtn.addEventListener("click", () => {
        saveNewPassword();
      });
    }

    if (dom.logoutBtn) {
      dom.logoutBtn.addEventListener("click", logoutUser);
    }

    document.addEventListener("click", event => {
      if (
        dom.settingsDropdown &&
        dom.settingsMenuBtn &&
        !dom.settingsDropdown.contains(event.target) &&
        !dom.settingsMenuBtn.contains(event.target)
      ) {
        dom.settingsDropdown.classList.remove("show");
      }

      if (dom.passwordModal && event.target === dom.passwordModal) {
        closePasswordModal();
      }

      if (dom.appModal && event.target === dom.appModal && appModalResolver) {
        closeMessageModal(false);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      if (dom.passwordModal?.classList.contains("show")) {
        closePasswordModal();
        return;
      }

      if (dom.appModal?.classList.contains("show") && appModalResolver) {
        closeMessageModal(false);
        return;
      }

      const panel = dom.settingsPanel || byId("settingsPanel");
      if (panel?.classList.contains("show") || panel?.style.display === "block") {
        closeSettingsPanel();
      }
    });
  }

  await hydrateSettings();
  populateSettingsForm();
  bindEvents();

  return {
    applyTheme,
    populateSettingsForm,
    openSettingsPanel,
    closeSettingsPanel,
    openUserManagementWindow,
    getSettings
  };
}