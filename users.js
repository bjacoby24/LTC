import {
  loadUsers,
  saveUsers,
  updateUserPassword,
  getLoggedInUsername
} from "./js/storage.js";

function byId(id) {
  return document.getElementById(id);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function makeId(prefix = "user") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getDefaultPermissions() {
  return {
    dashboardView: true,
    settingsAccess: false,
    userManagement: false,

    equipmentView: true,
    equipmentEdit: false,
    equipmentDelete: false,
    deletedEquipmentAccess: false,

    workOrdersView: true,
    workOrdersEdit: false,
    workOrdersDelete: false,

    inventoryView: true,
    inventoryEdit: false,
    inventoryDelete: false,
    vendorsAccess: false,
    purchaseOrdersAccess: false
  };
}

function getUserPresetPermissions() {
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
    purchaseOrdersAccess: true
  };
}

function getManagerPresetPermissions() {
  return {
    dashboardView: true,
    settingsAccess: true,
    userManagement: false,

    equipmentView: true,
    equipmentEdit: true,
    equipmentDelete: true,
    deletedEquipmentAccess: true,

    workOrdersView: true,
    workOrdersEdit: true,
    workOrdersDelete: true,

    inventoryView: true,
    inventoryEdit: true,
    inventoryDelete: true,
    vendorsAccess: true,
    purchaseOrdersAccess: true
  };
}

function getAdminPresetPermissions() {
  return {
    dashboardView: true,
    settingsAccess: true,
    userManagement: true,

    equipmentView: true,
    equipmentEdit: true,
    equipmentDelete: true,
    deletedEquipmentAccess: true,

    workOrdersView: true,
    workOrdersEdit: true,
    workOrdersDelete: true,

    inventoryView: true,
    inventoryEdit: true,
    inventoryDelete: true,
    vendorsAccess: true,
    purchaseOrdersAccess: true
  };
}

function normalizeRole(role) {
  const clean = normalizeLower(role);
  if (clean === "admin") return "admin";
  if (clean === "manager") return "manager";
  return "user";
}

function getPermissionsForRole(role) {
  const cleanRole = normalizeRole(role);

  if (cleanRole === "admin") return getAdminPresetPermissions();
  if (cleanRole === "manager") return getManagerPresetPermissions();
  return getUserPresetPermissions();
}

function normalizePermissions(permissions = {}, role = "user") {
  return {
    ...getDefaultPermissions(),
    ...getPermissionsForRole(role),
    ...(permissions && typeof permissions === "object" ? permissions : {})
  };
}

function normalizeUserRecord(user = {}) {
  const role = normalizeRole(user.role);

  return {
    id: normalizeText(user.id || user.username || makeId("user")),
    username: normalizeText(user.username),
    password: normalizeText(user.password),
    firstName: normalizeText(user.firstName),
    lastName: normalizeText(user.lastName),
    role,
    active: user.active !== false,
    permissions: normalizePermissions(user.permissions, role)
  };
}

function buildFullName(user = {}) {
  return [normalizeText(user.firstName), normalizeText(user.lastName)]
    .filter(Boolean)
    .join(" ");
}

function getRoleBadgeClass(role) {
  const cleanRole = normalizeRole(role);
  if (cleanRole === "admin") return "role-admin";
  if (cleanRole === "manager") return "role-manager";
  return "role-user";
}

function getRoleLabel(role) {
  const cleanRole = normalizeRole(role);
  if (cleanRole === "admin") return "Admin";
  if (cleanRole === "manager") return "Manager";
  return "User";
}

function getStatusBadgeClass(active) {
  return active ? "status-active" : "status-inactive";
}

function getStatusLabel(active) {
  return active ? "Active" : "Inactive";
}

document.addEventListener("DOMContentLoaded", async () => {
  const state = {
    users: [],
    filteredUsers: [],
    selectedUserId: "",
    currentEditUser: null,
    modalResolver: null
  };

  const dom = {
    newUserBtn: byId("newUserBtn"),
    refreshUsersWindowBtn: byId("refreshUsersWindowBtn"),
    closeUsersWindowBtn: byId("closeUsersWindowBtn"),

    usersSearchInput: byId("usersSearchInput"),
    usersRoleFilter: byId("usersRoleFilter"),
    usersStatusFilter: byId("usersStatusFilter"),
    usersWindowList: byId("usersWindowList"),

    usersEditorTitle: byId("usersEditorTitle"),
    usersEditorSubtitle: byId("usersEditorSubtitle"),
    selectedUserRoleBadge: byId("selectedUserRoleBadge"),
    selectedUserStatusBadge: byId("selectedUserStatusBadge"),

    userFirstNameInput: byId("userFirstNameInput"),
    userLastNameInput: byId("userLastNameInput"),
    userUsernameInput: byId("userUsernameInput"),
    userPasswordInput: byId("userPasswordInput"),
    userRoleSelect: byId("userRoleSelect"),
    userActiveSelect: byId("userActiveSelect"),

    selectedUserIdText: byId("selectedUserIdText"),
    permissionPresetText: byId("permissionPresetText"),

    permDashboardView: byId("permDashboardView"),
    permSettingsAccess: byId("permSettingsAccess"),
    permUserManagement: byId("permUserManagement"),

    permEquipmentView: byId("permEquipmentView"),
    permEquipmentEdit: byId("permEquipmentEdit"),
    permEquipmentDelete: byId("permEquipmentDelete"),
    permDeletedEquipmentAccess: byId("permDeletedEquipmentAccess"),

    permWorkOrdersView: byId("permWorkOrdersView"),
    permWorkOrdersEdit: byId("permWorkOrdersEdit"),
    permWorkOrdersDelete: byId("permWorkOrdersDelete"),

    permInventoryView: byId("permInventoryView"),
    permInventoryEdit: byId("permInventoryEdit"),
    permInventoryDelete: byId("permInventoryDelete"),
    permVendorsAccess: byId("permVendorsAccess"),
    permPurchaseOrdersAccess: byId("permPurchaseOrdersAccess"),

    applyUserPresetBtn: byId("applyUserPresetBtn"),
    applyManagerPresetBtn: byId("applyManagerPresetBtn"),
    applyAdminPresetBtn: byId("applyAdminPresetBtn"),

    saveUserDetailsBtn: byId("saveUserDetailsBtn"),
    resetUserPasswordBtn: byId("resetUserPasswordBtn"),
    deactivateUserBtn: byId("deactivateUserBtn"),
    deleteUserWindowBtn: byId("deleteUserWindowBtn"),
    clearUserEditorBtn: byId("clearUserEditorBtn"),

    usersWindowMessage: byId("usersWindowMessage"),

    usersAppModal: byId("usersAppModal"),
    usersAppModalTitle: byId("usersAppModalTitle"),
    usersAppModalMessage: byId("usersAppModalMessage"),
    usersAppModalConfirmBtn: byId("usersAppModalConfirmBtn"),
    usersAppModalCancelBtn: byId("usersAppModalCancelBtn"),
    usersAppModalCloseBtn: byId("usersAppModalCloseBtn")
  };

  function setMessage(message = "", type = "") {
    if (!dom.usersWindowMessage) return;
    dom.usersWindowMessage.textContent = message;
    dom.usersWindowMessage.className = "usersWindowMessage";
    if (type) {
      dom.usersWindowMessage.classList.add(type);
    }
  }

  function getSelectedUser() {
    return state.users.find(user => String(user.id) === String(state.selectedUserId)) || null;
  }

  function getPermissionInputs() {
    return {
      dashboardView: dom.permDashboardView,
      settingsAccess: dom.permSettingsAccess,
      userManagement: dom.permUserManagement,

      equipmentView: dom.permEquipmentView,
      equipmentEdit: dom.permEquipmentEdit,
      equipmentDelete: dom.permEquipmentDelete,
      deletedEquipmentAccess: dom.permDeletedEquipmentAccess,

      workOrdersView: dom.permWorkOrdersView,
      workOrdersEdit: dom.permWorkOrdersEdit,
      workOrdersDelete: dom.permWorkOrdersDelete,

      inventoryView: dom.permInventoryView,
      inventoryEdit: dom.permInventoryEdit,
      inventoryDelete: dom.permInventoryDelete,
      vendorsAccess: dom.permVendorsAccess,
      purchaseOrdersAccess: dom.permPurchaseOrdersAccess
    };
  }

  function readPermissionsFromForm() {
    const permissionInputs = getPermissionInputs();
    const permissions = getDefaultPermissions();

    Object.entries(permissionInputs).forEach(([key, input]) => {
      permissions[key] = !!input?.checked;
    });

    return permissions;
  }

  function writePermissionsToForm(permissions = {}, role = "user") {
    const normalized = normalizePermissions(permissions, role);
    const permissionInputs = getPermissionInputs();

    Object.entries(permissionInputs).forEach(([key, input]) => {
      if (input) {
        input.checked = !!normalized[key];
      }
    });
  }

  function setPermissionPresetText(text) {
    if (dom.permissionPresetText) {
      dom.permissionPresetText.textContent = text;
    }
  }

  function updateEditorHeader(user) {
    const currentUser = normalizeUserRecord(user || {});

    if (dom.usersEditorTitle) {
      dom.usersEditorTitle.textContent = currentUser.username ? "Edit User" : "User Details";
    }

    if (dom.usersEditorSubtitle) {
      const fullName = buildFullName(currentUser);
      dom.usersEditorSubtitle.textContent = currentUser.username
        ? (fullName || currentUser.username)
        : "Select a user to edit or create a new account.";
    }

    if (dom.selectedUserRoleBadge) {
      dom.selectedUserRoleBadge.textContent = getRoleLabel(currentUser.role);
      dom.selectedUserRoleBadge.className = `roleBadge ${getRoleBadgeClass(currentUser.role)}`;
    }

    if (dom.selectedUserStatusBadge) {
      dom.selectedUserStatusBadge.textContent = getStatusLabel(currentUser.active !== false);
      dom.selectedUserStatusBadge.className = `statusBadge ${getStatusBadgeClass(currentUser.active !== false)}`;
    }

    if (dom.selectedUserIdText) {
      dom.selectedUserIdText.textContent = currentUser.username
        ? (currentUser.id || currentUser.username)
        : "New User";
    }

    if (dom.deactivateUserBtn) {
      dom.deactivateUserBtn.textContent = currentUser.active === false ? "Activate" : "Deactivate";
    }
  }

  function populateUserForm(user) {
    const currentUser = normalizeUserRecord(user || {});

    state.currentEditUser = currentUser;
    state.selectedUserId = currentUser.username ? currentUser.id : "";

    if (dom.userFirstNameInput) dom.userFirstNameInput.value = currentUser.firstName || "";
    if (dom.userLastNameInput) dom.userLastNameInput.value = currentUser.lastName || "";
    if (dom.userUsernameInput) dom.userUsernameInput.value = currentUser.username || "";
    if (dom.userPasswordInput) dom.userPasswordInput.value = currentUser.password || "";
    if (dom.userRoleSelect) dom.userRoleSelect.value = currentUser.role || "user";
    if (dom.userActiveSelect) dom.userActiveSelect.value = currentUser.active === false ? "false" : "true";

    writePermissionsToForm(currentUser.permissions, currentUser.role);
    setPermissionPresetText("Role-based");
    updateEditorHeader(currentUser);
    renderUsersList();
  }

  function clearUserForm() {
    state.selectedUserId = "";
    state.currentEditUser = null;

    if (dom.userFirstNameInput) dom.userFirstNameInput.value = "";
    if (dom.userLastNameInput) dom.userLastNameInput.value = "";
    if (dom.userUsernameInput) dom.userUsernameInput.value = "";
    if (dom.userPasswordInput) dom.userPasswordInput.value = "";
    if (dom.userRoleSelect) dom.userRoleSelect.value = "user";
    if (dom.userActiveSelect) dom.userActiveSelect.value = "true";

    writePermissionsToForm(getUserPresetPermissions(), "user");
    setPermissionPresetText("New user");
    updateEditorHeader({
      role: "user",
      active: true
    });
    renderUsersList();
  }

  function getRoleFromFilter() {
    return normalizeLower(dom.usersRoleFilter?.value || "all");
  }

  function getStatusFromFilter() {
    return normalizeLower(dom.usersStatusFilter?.value || "all");
  }

  function getSearchText() {
    return normalizeLower(dom.usersSearchInput?.value || "");
  }

  function getFilteredUsers() {
    const roleFilter = getRoleFromFilter();
    const statusFilter = getStatusFromFilter();
    const searchText = getSearchText();

    return state.users.filter(user => {
      const matchesRole =
        roleFilter === "all" ? true : normalizeLower(user.role) === roleFilter;

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? user.active !== false
            : user.active === false;

      const fullName = buildFullName(user);
      const matchesSearch =
        !searchText ||
        normalizeLower(user.username).includes(searchText) ||
        normalizeLower(fullName).includes(searchText) ||
        normalizeLower(user.role).includes(searchText);

      return matchesRole && matchesStatus && matchesSearch;
    });
  }

  function renderUsersList() {
    if (!dom.usersWindowList) return;

    state.filteredUsers = getFilteredUsers();
    dom.usersWindowList.innerHTML = "";

    if (!state.filteredUsers.length) {
      const empty = document.createElement("div");
      empty.className = "usersEmptyState";
      empty.textContent = "No users match the current filters.";
      dom.usersWindowList.appendChild(empty);
      return;
    }

    const currentLoggedInUsername = normalizeLower(getLoggedInUsername());

    state.filteredUsers.forEach(user => {
      const card = document.createElement("div");
      card.className = "userListCard";

      if (String(user.id) === String(state.selectedUserId)) {
        card.classList.add("active");
      }

      const fullName = buildFullName(user);
      const isCurrent = normalizeLower(user.username) === currentLoggedInUsername;

      card.innerHTML = `
        <div class="userListCardTop">
          <div class="userListNameBlock">
            <div class="userListName">${fullName || user.username}</div>
            <div class="userListUsername">@${user.username}${isCurrent ? " • current" : ""}</div>
          </div>
          <span class="roleBadge ${getRoleBadgeClass(user.role)}">${getRoleLabel(user.role)}</span>
        </div>

        <div class="userListMeta">
          <span class="statusBadge ${getStatusBadgeClass(user.active !== false)}">
            ${getStatusLabel(user.active !== false)}
          </span>
        </div>
      `;

      card.addEventListener("click", () => {
        populateUserForm(user);
        setMessage("");
      });

      dom.usersWindowList.appendChild(card);
    });
  }

  async function hydrateUsers() {
    try {
      const users = await loadUsers();

      state.users = safeArray(users)
        .map(normalizeUserRecord)
        .sort((a, b) => normalizeLower(a.username).localeCompare(normalizeLower(b.username)));

      renderUsersList();

      if (state.selectedUserId) {
        const selected = getSelectedUser();
        if (selected) {
          populateUserForm(selected);
        } else {
          clearUserForm();
        }
      }
    } catch (error) {
      console.error("Failed to load users:", error);
      state.users = [];
      renderUsersList();
      setMessage("Unable to load users.", "error");
    }
  }

  function buildUserFromForm() {
    const existing = getSelectedUser();

    const username = normalizeText(dom.userUsernameInput?.value);
    const role = normalizeRole(dom.userRoleSelect?.value || "user");
    const password = normalizeText(dom.userPasswordInput?.value);
    const firstName = normalizeText(dom.userFirstNameInput?.value);
    const lastName = normalizeText(dom.userLastNameInput?.value);
    const active = String(dom.userActiveSelect?.value || "true") !== "false";

    return normalizeUserRecord({
      id: existing?.id || username || makeId("user"),
      username,
      password: password || existing?.password || "",
      firstName,
      lastName,
      role,
      active,
      permissions: readPermissionsFromForm()
    });
  }

  function validateUser(user) {
    if (!user.firstName) return "First name is required.";
    if (!user.lastName) return "Last name is required.";
    if (!user.username) return "Username is required.";
    if (!user.password) return "Password is required.";
    return "";
  }

  function countActiveAdmins(users) {
    return users.filter(user => user.active !== false && normalizeRole(user.role) === "admin").length;
  }

  async function saveUserDetails() {
    const user = buildUserFromForm();
    const validationMessage = validateUser(user);

    if (validationMessage) {
      setMessage(validationMessage, "error");
      return;
    }

    const usernameTaken = state.users.some(existingUser => {
      const isSameRecord =
        state.selectedUserId &&
        String(existingUser.id) === String(state.selectedUserId);

      if (isSameRecord) return false;

      return normalizeLower(existingUser.username) === normalizeLower(user.username);
    });

    if (usernameTaken) {
      setMessage("That username already exists.", "error");
      return;
    }

    const existingSelected = getSelectedUser();

    const nextUsers = existingSelected
      ? state.users.map(existingUser =>
          String(existingUser.id) === String(existingSelected.id)
            ? { ...existingUser, ...user, id: existingSelected.id }
            : existingUser
        )
      : [...state.users, user];

    if (countActiveAdmins(nextUsers) === 0) {
      setMessage("At least one active admin user is required.", "error");
      return;
    }

    try {
      const savedUsers = await saveUsers(nextUsers);

      state.users = safeArray(savedUsers)
        .map(normalizeUserRecord)
        .sort((a, b) => normalizeLower(a.username).localeCompare(normalizeLower(b.username)));

      const savedUser = state.users.find(
        existingUser => normalizeLower(existingUser.username) === normalizeLower(user.username)
      );

      if (savedUser) {
        populateUserForm(savedUser);
      }

      setMessage("User saved successfully.", "success");
    } catch (error) {
      console.error("Failed to save user:", error);
      setMessage("Unable to save user.", "error");
    }
  }

  async function resetSelectedUserPassword() {
    const selected = getSelectedUser();

    if (!selected) {
      setMessage("Select a user first.", "error");
      return;
    }

    const enteredPassword = normalizeText(dom.userPasswordInput?.value);

    if (!enteredPassword) {
      setMessage("Enter a password to reset.", "error");
      return;
    }

    const confirmed = await showModal({
      title: "Reset Password",
      message: `Reset password for "${selected.username}"?`,
      confirmText: "Reset",
      cancelText: "Cancel",
      showCancel: true
    });

    if (!confirmed) return;

    try {
      await updateUserPassword(selected.username, enteredPassword);

      const nextUsers = state.users.map(user =>
        String(user.id) === String(selected.id)
          ? { ...user, password: enteredPassword }
          : user
      );

      const savedUsers = await saveUsers(nextUsers);

      state.users = safeArray(savedUsers)
        .map(normalizeUserRecord)
        .sort((a, b) => normalizeLower(a.username).localeCompare(normalizeLower(b.username)));

      const refreshedUser = state.users.find(user => String(user.id) === String(selected.id));
      if (refreshedUser) {
        populateUserForm(refreshedUser);
      }

      setMessage("Password reset successfully.", "success");
    } catch (error) {
      console.error("Failed to reset password:", error);
      setMessage("Unable to reset password.", "error");
    }
  }

  async function toggleSelectedUserActive() {
    const selected = getSelectedUser();

    if (!selected) {
      setMessage("Select a user first.", "error");
      return;
    }

    const targetActive = selected.active === false;
    const actionLabel = targetActive ? "Activate" : "Deactivate";

    const confirmed = await showModal({
      title: `${actionLabel} User`,
      message: `${actionLabel} "${selected.username}"?`,
      confirmText: actionLabel,
      cancelText: "Cancel",
      showCancel: true
    });

    if (!confirmed) return;

    const nextUsers = state.users.map(user =>
      String(user.id) === String(selected.id)
        ? { ...user, active: targetActive }
        : user
    );

    if (countActiveAdmins(nextUsers) === 0) {
      setMessage("At least one active admin user is required.", "error");
      return;
    }

    try {
      const savedUsers = await saveUsers(nextUsers);

      state.users = safeArray(savedUsers)
        .map(normalizeUserRecord)
        .sort((a, b) => normalizeLower(a.username).localeCompare(normalizeLower(b.username)));

      const refreshedUser = state.users.find(user => String(user.id) === String(selected.id));
      if (refreshedUser) {
        populateUserForm(refreshedUser);
      }

      setMessage(`User ${targetActive ? "activated" : "deactivated"} successfully.`, "success");
    } catch (error) {
      console.error("Failed to update user state:", error);
      setMessage("Unable to update user status.", "error");
    }
  }

  async function deleteSelectedUser() {
    const selected = getSelectedUser();

    if (!selected) {
      setMessage("Select a user first.", "error");
      return;
    }

    const currentLoggedInUsername = normalizeLower(getLoggedInUsername());

    if (normalizeLower(selected.username) === currentLoggedInUsername) {
      setMessage("You cannot delete the currently logged-in user.", "error");
      return;
    }

    const confirmed = await showModal({
      title: "Delete User",
      message: `Delete user "${selected.username}"?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
      showCancel: true
    });

    if (!confirmed) return;

    const nextUsers = state.users.filter(user => String(user.id) !== String(selected.id));

    if (countActiveAdmins(nextUsers) === 0) {
      setMessage("At least one active admin user is required.", "error");
      return;
    }

    try {
      const savedUsers = await saveUsers(nextUsers);

      state.users = safeArray(savedUsers)
        .map(normalizeUserRecord)
        .sort((a, b) => normalizeLower(a.username).localeCompare(normalizeLower(b.username)));

      clearUserForm();
      setMessage("User deleted successfully.", "success");
    } catch (error) {
      console.error("Failed to delete user:", error);
      setMessage("Unable to delete user.", "error");
    }
  }

  function applyPreset(role) {
    const cleanRole = normalizeRole(role);
    const permissions = getPermissionsForRole(cleanRole);

    if (dom.userRoleSelect) {
      dom.userRoleSelect.value = cleanRole;
    }

    writePermissionsToForm(permissions, cleanRole);
    setPermissionPresetText(`${getRoleLabel(cleanRole)} preset`);

    updateEditorHeader({
      ...buildUserFromForm(),
      role: cleanRole
    });

    setMessage(`${getRoleLabel(cleanRole)} preset applied.`, "success");
  }

  function syncHeaderFromForm() {
    updateEditorHeader({
      ...buildUserFromForm()
    });
  }

  function bindFilterEvents() {
    dom.usersSearchInput?.addEventListener("input", renderUsersList);
    dom.usersRoleFilter?.addEventListener("change", renderUsersList);
    dom.usersStatusFilter?.addEventListener("change", renderUsersList);
  }

  function bindFormEvents() {
    dom.newUserBtn?.addEventListener("click", () => {
      clearUserForm();
      setMessage("");
      dom.userFirstNameInput?.focus();
    });

    dom.refreshUsersWindowBtn?.addEventListener("click", async () => {
      setMessage("");
      await hydrateUsers();
    });

    dom.closeUsersWindowBtn?.addEventListener("click", () => {
      window.close();
    });

    dom.userRoleSelect?.addEventListener("change", syncHeaderFromForm);
    dom.userActiveSelect?.addEventListener("change", syncHeaderFromForm);
    dom.userFirstNameInput?.addEventListener("input", syncHeaderFromForm);
    dom.userLastNameInput?.addEventListener("input", syncHeaderFromForm);
    dom.userUsernameInput?.addEventListener("input", syncHeaderFromForm);

    dom.applyUserPresetBtn?.addEventListener("click", () => applyPreset("user"));
    dom.applyManagerPresetBtn?.addEventListener("click", () => applyPreset("manager"));
    dom.applyAdminPresetBtn?.addEventListener("click", () => applyPreset("admin"));

    dom.saveUserDetailsBtn?.addEventListener("click", saveUserDetails);
    dom.resetUserPasswordBtn?.addEventListener("click", resetSelectedUserPassword);
    dom.deactivateUserBtn?.addEventListener("click", toggleSelectedUserActive);
    dom.deleteUserWindowBtn?.addEventListener("click", deleteSelectedUser);

    dom.clearUserEditorBtn?.addEventListener("click", () => {
      clearUserForm();
      setMessage("");
    });
  }

  function showModal({
    title = "Message",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
    danger = false,
    showCancel = false
  } = {}) {
    if (
      !dom.usersAppModal ||
      !dom.usersAppModalTitle ||
      !dom.usersAppModalMessage ||
      !dom.usersAppModalConfirmBtn
    ) {
      return Promise.resolve(true);
    }

    if (state.modalResolver) {
      state.modalResolver(false);
      state.modalResolver = null;
    }

    dom.usersAppModalTitle.textContent = title;
    dom.usersAppModalMessage.textContent = message;
    dom.usersAppModalConfirmBtn.textContent = confirmText || "OK";
    dom.usersAppModalConfirmBtn.classList.toggle("danger", !!danger);

    if (dom.usersAppModalCancelBtn) {
      dom.usersAppModalCancelBtn.textContent = cancelText || "Cancel";
      dom.usersAppModalCancelBtn.style.display = showCancel ? "inline-flex" : "none";
    }

    dom.usersAppModal.classList.add("show");

    return new Promise(resolve => {
      state.modalResolver = resolve;

      const finish = result => {
        if (!state.modalResolver) return;
        const currentResolve = state.modalResolver;
        state.modalResolver = null;
        dom.usersAppModal.classList.remove("show");
        currentResolve(result);
      };

      dom.usersAppModalConfirmBtn.onclick = () => finish(true);

      if (dom.usersAppModalCancelBtn) {
        dom.usersAppModalCancelBtn.onclick = () => finish(false);
      }

      if (dom.usersAppModalCloseBtn) {
        dom.usersAppModalCloseBtn.onclick = () => finish(false);
      }

      dom.usersAppModal.onclick = event => {
        if (event.target === dom.usersAppModal) {
          finish(false);
        }
      };
    });
  }

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      dom.usersAppModal?.classList.contains("show") &&
      state.modalResolver
    ) {
      const resolver = state.modalResolver;
      state.modalResolver = null;
      dom.usersAppModal.classList.remove("show");
      resolver(false);
    }
  });

  bindFilterEvents();
  bindFormEvents();
  clearUserForm();
  await hydrateUsers();
});