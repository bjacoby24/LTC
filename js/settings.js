import { getDom } from "./dom.js";
import { normalizeText } from "./utils.js";
import {
  loadSettings,
  saveSettings,
  clearLoggedIn,
  loadUsers,
  saveUsers,
  updateUserPassword,
  getLoggedInUsername
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
        serviceTemplates: Array.isArray(saved.serviceTemplates)
          ? saved.serviceTemplates
          : []
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
      serviceTasks: Array.isArray(settingsCache.serviceTasks)
        ? settingsCache.serviceTasks
        : [],
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

  async function openSettingsPanel() {
    populateSettingsForm();
    closeAllSettingsPanels();

    if (dom.settingsPanel) {
      dom.settingsPanel.style.display = "block";
    }

    if (dom.settingsDropdown) {
      dom.settingsDropdown.classList.remove("show");
    }

    await renderUsers();
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

    const currentUsername = getLoggedInUsername();

    if (!currentUsername) {
      await showMessageModal("Not Logged In", "No logged-in user was found.");
      return;
    }

    try {
      await updateUserPassword(currentUsername, newPassword);
      closePasswordModal();
      await showMessageModal("Password Updated", "Password updated.");
    } catch (error) {
      console.error("Failed to update password:", error);
      await showMessageModal("Update Failed", "Unable to update password.");
    }
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

  async function renderUsers() {
    const usersRoot = document.getElementById("usersList");
    if (!usersRoot) return;

    usersRoot.innerHTML = "";

    let users = [];
    try {
      users = await loadUsers();
    } catch (error) {
      console.error("Failed to load users:", error);
    }

    if (!users.length) {
      usersRoot.innerHTML = `<p>No users found.</p>`;
      return;
    }

    const currentUsername = getLoggedInUsername();

    users.forEach(user => {
      const row = document.createElement("div");
      row.className = "userRow";
      row.innerHTML = `
        <div>
          <strong>${user.username}</strong>
          <span>(${user.role})</span>
          ${user.active === false ? `<span> - inactive</span>` : ``}
          ${user.username === currentUsername ? `<span> - current</span>` : ``}
        </div>
        <div class="formButtons">
          <button type="button" data-user-toggle="${user.username}">
            ${user.active === false ? "Activate" : "Deactivate"}
          </button>
          <button type="button" data-user-delete="${user.username}">
            Delete
          </button>
        </div>
      `;
      usersRoot.appendChild(row);
    });

    usersRoot.querySelectorAll("[data-user-toggle]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const username = btn.getAttribute("data-user-toggle");
        const currentUsers = await loadUsers();

        const updatedUsers = currentUsers.map(user =>
          user.username === username
            ? { ...user, active: !user.active }
            : user
        );

        const activeAdmins = updatedUsers.filter(
          user => user.active && user.role === "admin"
        );

        if (!activeAdmins.length) {
          await showMessageModal(
            "Action Blocked",
            "At least one active admin user is required."
          );
          return;
        }

        try {
          await saveUsers(updatedUsers);
          await renderUsers();
        } catch (error) {
          console.error("Failed to toggle user state:", error);
          await showMessageModal("Save Failed", "Unable to update user.");
        }
      });
    });

    usersRoot.querySelectorAll("[data-user-delete]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const username = btn.getAttribute("data-user-delete");

        const confirmed = await showAppModal({
          title: "Delete User",
          message: `Delete user "${username}"?`,
          confirmText: "Delete",
          cancelText: "Cancel",
          danger: true,
          showCancel: true
        });

        if (!confirmed) return;

        const currentUsers = await loadUsers();
        const updatedUsers = currentUsers.filter(user => user.username !== username);

        const activeAdmins = updatedUsers.filter(
          user => user.active && user.role === "admin"
        );

        if (!activeAdmins.length) {
          await showMessageModal(
            "Action Blocked",
            "At least one active admin user is required."
          );
          return;
        }

        try {
          await saveUsers(updatedUsers);
          await renderUsers();
        } catch (error) {
          console.error("Failed to delete user:", error);
          await showMessageModal("Delete Failed", "Unable to delete user.");
        }
      });
    });
  }

  async function addUserFromForm() {
    const username = normalizeText(
      document.getElementById("newUserUsernameInput")?.value
    );
    const password = normalizeText(
      document.getElementById("newUserPasswordInput")?.value
    );
    const role =
      document.getElementById("newUserRoleSelect")?.value === "admin"
        ? "admin"
        : "user";

    if (!username) {
      await showMessageModal("Missing Username", "Enter a username.");
      return;
    }

    if (!password) {
      await showMessageModal("Missing Password", "Enter a password.");
      return;
    }

    const users = await loadUsers();

    if (users.some(user => user.username === username)) {
      await showMessageModal("Duplicate User", "That username already exists.");
      return;
    }

    try {
      await saveUsers([
        ...users,
        {
          id: username,
          username,
          password,
          role,
          active: true
        }
      ]);
    } catch (error) {
      console.error("Failed to add user:", error);
      await showMessageModal("Save Failed", "Unable to add user.");
      return;
    }

    const usernameInput = document.getElementById("newUserUsernameInput");
    const passwordInput = document.getElementById("newUserPasswordInput");
    const roleSelect = document.getElementById("newUserRoleSelect");

    if (usernameInput) usernameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (roleSelect) roleSelect.value = "user";

    await renderUsers();
  }

  function bindEvents() {
    const manageUsersBtn = document.getElementById("manageUsersBtn");
    const addUserBtn = document.getElementById("addUserBtn");
    const refreshUsersBtn = document.getElementById("refreshUsersBtn");

    if (dom.settingsMenuBtn && dom.settingsDropdown) {
      dom.settingsMenuBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.settingsDropdown.classList.toggle("show");
      });
    }

    if (dom.openSettingsBtn) {
      dom.openSettingsBtn.addEventListener("click", () => {
        openSettingsPanel();
      });
    }

    if (manageUsersBtn) {
      manageUsersBtn.addEventListener("click", () => {
        openSettingsPanel();
        if (dom.settingsDropdown) {
          dom.settingsDropdown.classList.remove("show");
        }
      });
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

    if (addUserBtn) {
      addUserBtn.addEventListener("click", () => {
        addUserFromForm();
      });
    }

    if (refreshUsersBtn) {
      refreshUsersBtn.addEventListener("click", () => {
        renderUsers();
      });
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
    getSettings,
    renderUsers
  };
}