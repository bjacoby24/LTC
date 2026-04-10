import { getDom } from "./dom.js";
import { normalizeText } from "./utils.js";
import {
  getStoredUser,
  loadSettings,
  saveSettings,
  clearLoggedIn,
  saveStoredUser
} from "./storage.js";

export async function initSettings() {
  const dom = getDom() || {};

  let appModalResolver = null;
  let appModalLastFocus = null;
  let settingsCache = getDefaultSettings();

  function getDefaultSettings() {
    return {
      companyName: "",
      defaultLocation: "",
      theme: "default",
      serviceTasks: [],
      serviceTemplates: []
    };
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
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
        serviceTasks: Array.isArray(saved.serviceTasks) ? saved.serviceTasks : [],
        serviceTemplates: Array.isArray(saved.serviceTemplates) ? saved.serviceTemplates : []
      };
    } catch (error) {
      console.error("Failed to load settings:", error);
      settingsCache = getDefaultSettings();
    }
  }

  function getSettings() {
    return {
      ...getDefaultSettings(),
      ...settingsCache,
      companyName: settingsCache.companyName || "",
      defaultLocation: settingsCache.defaultLocation || "",
      theme: settingsCache.theme || "default",
      serviceTasks: Array.isArray(settingsCache.serviceTasks) ? settingsCache.serviceTasks : [],
      serviceTemplates: Array.isArray(settingsCache.serviceTemplates)
        ? settingsCache.serviceTemplates
        : []
    };
  }

  async function persistSettings(updatedSettings) {
    const settings = {
      ...getDefaultSettings(),
      ...updatedSettings,
      serviceTasks: Array.isArray(updatedSettings?.serviceTasks)
        ? updatedSettings.serviceTasks
        : [],
      serviceTemplates: Array.isArray(updatedSettings?.serviceTemplates)
        ? updatedSettings.serviceTemplates
        : []
    };

    settingsCache = settings;

    try {
      await saveSettings(settings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }

    return settings;
  }

  function applyTheme(theme) {
    document.body.classList.remove("theme-dark", "theme-light");

    if (theme === "dark") {
      document.body.classList.add("theme-dark");
    } else if (theme === "light") {
      document.body.classList.add("theme-light");
    }
  }

  function closeAllSettingsPanels() {
    if (dom.settingsPanel) dom.settingsPanel.style.display = "none";
    if (dom.servicesPanel) dom.servicesPanel.style.display = "none";
  }

  function populateSettingsForm() {
    const settings = getSettings();

    if (dom.companyNameSetting) {
      dom.companyNameSetting.value = settings.companyName || "";
    }

    if (dom.defaultLocationSetting) {
      dom.defaultLocationSetting.value = settings.defaultLocation || "";
    }

    if (dom.themeSetting) {
      dom.themeSetting.value = settings.theme || "default";
    }

    applyTheme(settings.theme || "default");
  }

  async function saveSettingsFromForm() {
    const current = getSettings();

    const settings = {
      ...current,
      companyName: dom.companyNameSetting?.value || "",
      defaultLocation: dom.defaultLocationSetting?.value || "",
      theme: dom.themeSetting?.value || "default"
    };

    await persistSettings(settings);
    applyTheme(settings.theme);

    if (dom.settingsPanel) {
      dom.settingsPanel.style.display = "none";
    }
  }

  function openSettingsPanel() {
    populateSettingsForm();
    closeAllSettingsPanels();

    if (dom.settingsPanel) {
      dom.settingsPanel.style.display = "block";
    }

    if (dom.settingsDropdown) {
      dom.settingsDropdown.classList.remove("show");
    }
  }

  function closeSettingsPanel() {
    if (dom.settingsPanel) {
      dom.settingsPanel.style.display = "none";
    }
  }

  function showAppModal({
    title = "Message",
    message = "",
    confirmText = "OK",
    cancelText = "",
    danger = false,
    showCancel = false
  } = {}) {
    const modal = dom.appModal;
    const titleEl = dom.appModalTitle;
    const messageEl = dom.appModalMessage;
    const confirmBtn = dom.appModalConfirmBtn;
    const cancelBtn = dom.appModalCancelBtn;
    const closeBtn = dom.appModalCloseBtn;

    if (!modal || !titleEl || !messageEl || !confirmBtn) {
      console.warn("App modal elements are missing.");
      return Promise.resolve(showCancel ? false : true);
    }

    if (appModalResolver) {
      appModalResolver(false);
      appModalResolver = null;
    }

    appModalLastFocus = document.activeElement;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText || "OK";
    confirmBtn.classList.toggle("danger", !!danger);

    if (cancelBtn) {
      cancelBtn.textContent = cancelText || "Cancel";
      cancelBtn.style.display = showCancel ? "inline-flex" : "none";
    }

    modal.classList.add("show");

    return new Promise(resolve => {
      appModalResolver = resolve;

      const finish = result => {
        if (!appModalResolver) return;

        const currentResolve = appModalResolver;
        appModalResolver = null;
        modal.classList.remove("show");
        currentResolve(result);

        setTimeout(() => {
          if (appModalLastFocus && typeof appModalLastFocus.focus === "function") {
            appModalLastFocus.focus();
          }
          appModalLastFocus = null;
        }, 0);
      };

      confirmBtn.onclick = () => finish(true);

      if (cancelBtn) {
        cancelBtn.onclick = () => finish(false);
      }

      if (closeBtn) {
        closeBtn.onclick = () => finish(false);
      }

      modal.onclick = event => {
        if (event.target === modal) {
          finish(false);
        }
      };

      setTimeout(() => confirmBtn.focus(), 20);
    });
  }

  function showMessageModal(title, message, options = {}) {
    return showAppModal({
      title,
      message,
      confirmText: options.confirmText || "OK",
      danger: !!options.danger,
      showCancel: false
    });
  }

  function openPasswordModal() {
    if (dom.passwordModal) {
      dom.passwordModal.classList.add("show");
    }

    if (dom.newPasswordInput) {
      dom.newPasswordInput.value = "";
      setTimeout(() => dom.newPasswordInput?.focus(), 20);
    }

    if (dom.settingsDropdown) {
      dom.settingsDropdown.classList.remove("show");
    }
  }

  function closePasswordModal() {
    if (dom.passwordModal) {
      dom.passwordModal.classList.remove("show");
    }
  }

  async function saveNewPassword() {
    const newPassword = normalizeText(dom.newPasswordInput?.value);

    if (!newPassword) {
      await showMessageModal("Missing Password", "Enter a password.");
      dom.newPasswordInput?.focus();
      return;
    }

    const currentUser = getStoredUser();

    saveStoredUser({
      ...currentUser,
      password: newPassword
    });

    closePasswordModal();
    await showMessageModal("Password Updated", "Password updated.");
  }

  function logoutUser() {
    clearLoggedIn();

    if (dom.settingsDropdown) {
      dom.settingsDropdown.classList.remove("show");
    }

    if (dom.loginScreen) {
      dom.loginScreen.style.display = "flex";
    }

    if (dom.appWrapper) {
      dom.appWrapper.style.display = "none";
    }

    closeAllSettingsPanels();
  }

  function openServiceTemplateWindow(templateId = "") {
    const url = templateId
      ? `service-template.html?id=${encodeURIComponent(templateId)}`
      : "service-template.html";

    window.open(
      url,
      "ServiceTemplateWindow",
      "width=1400,height=900,resizable=yes,scrollbars=yes"
    );
  }

  function bindEvents() {
    if (dom.settingsMenuBtn && dom.settingsDropdown) {
      dom.settingsMenuBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.settingsDropdown.classList.toggle("show");
      });
    }

    if (dom.openSettingsBtn) {
      dom.openSettingsBtn.addEventListener("click", openSettingsPanel);
    }

    if (dom.openServicesBtn) {
      dom.openServicesBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        if (dom.settingsDropdown) {
          dom.settingsDropdown.classList.remove("show");
        }

        closeAllSettingsPanels();
        openServiceTemplateWindow();
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

    if (dom.changePasswordBtn) {
      dom.changePasswordBtn.addEventListener("click", openPasswordModal);
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
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      if (dom.passwordModal?.classList.contains("show")) {
        closePasswordModal();
        return;
      }

      if (dom.appModal?.classList.contains("show") && appModalResolver) {
        const resolver = appModalResolver;
        appModalResolver = null;
        dom.appModal.classList.remove("show");
        resolver(false);
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
    getSettings
  };
}