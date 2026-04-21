import { getDom } from "./dom.js";
import {
  setText,
  normalizeCellValue
} from "./utils.js";
import {
  loadEquipment,
  loadDeletedEquipment,
  saveEquipment,
  saveDeletedEquipment,
  getLoggedInUser
} from "./storage.js";
import {
  getFilteredGridData,
  buildColumnFiltersGeneric,
  renderGridHeaderGeneric,
  toggleRowSelection,
  clearSelections,
  updateSelectionButtonText,
  setGridResultCount,
  isRowSelected
} from "./gridShared.js";

const DELETED_EQUIPMENT_STORAGE_KEYS = {
  columns: "fleetDeletedEquipmentColumns",
  gridState: "fleetDeletedEquipmentGridState"
};

function safeParse(value, fallback) {
  try {
    if (value == null || value === "") return fallback;
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadDeletedEquipmentColumnsLocal(defaultColumns = []) {
  const saved = safeParse(
    localStorage.getItem(DELETED_EQUIPMENT_STORAGE_KEYS.columns),
    defaultColumns
  );
  return Array.isArray(saved) ? saved : defaultColumns;
}

function loadDeletedEquipmentGridStateLocal(defaultState = {}) {
  const saved = safeParse(
    localStorage.getItem(DELETED_EQUIPMENT_STORAGE_KEYS.gridState),
    defaultState
  );
  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved
    : defaultState;
}

function saveDeletedEquipmentGridSettingsLocal(columns, state) {
  localStorage.setItem(
    DELETED_EQUIPMENT_STORAGE_KEYS.columns,
    JSON.stringify(Array.isArray(columns) ? columns : [])
  );

  localStorage.setItem(
    DELETED_EQUIPMENT_STORAGE_KEYS.gridState,
    JSON.stringify(
      state && typeof state === "object" && !Array.isArray(state) ? state : {}
    )
  );
}

export async function initDeletedEquipment() {
  const dom = getDom() || {};

  let equipmentList = [];
  let deletedEquipment = [];

  let selectedDeletedEquipmentId = null;
  let selectedDeletedEquipmentIds = new Set();
  let deletedEquipmentSelectionMode = false;
  let deletedEquipmentFilterUiMode = "header";

  let appModalResolver = null;
  let appModalLastFocus = null;

  const DEFAULT_DELETED_EQUIPMENT_COLUMNS = [
    { key: "unit", label: "Unit", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "type", label: "Type", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "status", label: "Status", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "location", label: "Location", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "year", label: "Year", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "vin", label: "VIN", visible: false, sortable: true, filterType: "text", custom: false }
  ];

  let deletedEquipmentColumns = loadDeletedEquipmentColumnsLocal(
    DEFAULT_DELETED_EQUIPMENT_COLUMNS
  );

  let deletedEquipmentGridState = loadDeletedEquipmentGridStateLocal({
    sortKey: "unit",
    sortDirection: "asc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

  function getCurrentPermissions() {
  const loggedInUser = getLoggedInUser();
  const role = String(loggedInUser?.role || "").trim().toLowerCase();

  const permissions =
    loggedInUser &&
    typeof loggedInUser === "object" &&
    loggedInUser.permissions &&
    typeof loggedInUser.permissions === "object"
      ? loggedInUser.permissions
      : {};

  if (role === "admin") {
    return {
      deletedEquipmentAccess: true,
      equipmentEdit: true,
      equipmentDelete: true
    };
  }

  return {
    deletedEquipmentAccess: false,
    equipmentEdit: true,
    equipmentDelete: false,
    ...permissions
  };
}

  function canViewDeletedEquipment() {
    return !!getCurrentPermissions().deletedEquipmentAccess;
  }

  function canRestoreDeletedEquipment() {
    return !!getCurrentPermissions().equipmentEdit;
  }

  function canPermanentlyDeleteDeletedEquipment() {
    return !!getCurrentPermissions().equipmentDelete;
  }

  async function requirePermission(checkFn, title, message) {
    if (checkFn()) return true;
    await showMessageModal(title, message);
    return false;
  }

  function applyDeletedEquipmentPermissionUi() {
    const canView = canViewDeletedEquipment();
    const canRestore = canRestoreDeletedEquipment();
    const canDelete = canPermanentlyDeleteDeletedEquipment();

    if (dom.restoreSelectedEquipmentBtn) {
      dom.restoreSelectedEquipmentBtn.style.display = canView && canRestore ? "" : "none";
    }

    if (dom.permanentlyDeleteSelectedEquipmentBtn) {
      dom.permanentlyDeleteSelectedEquipmentBtn.style.display = canView && canDelete ? "" : "none";
    }

    if (dom.cancelDeletedSelectionBtn) {
      dom.cancelDeletedSelectionBtn.style.display = "none";
    }

    if (dom.restoreDeletedEquipmentBtn) {
      dom.restoreDeletedEquipmentBtn.style.display = canView && canRestore ? "" : "none";
    }

    if (dom.permanentlyDeleteEquipmentBtn) {
      dom.permanentlyDeleteEquipmentBtn.style.display = canView && canDelete ? "" : "none";
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

  function showConfirmModal(title, message, options = {}) {
    return showAppModal({
      title,
      message,
      confirmText: options.confirmText || "Confirm",
      cancelText: options.cancelText || "Cancel",
      danger: !!options.danger,
      showCancel: true
    });
  }

  async function hydrateDeletedEquipmentData() {
    try {
      const [equipment, deleted] = await Promise.all([
        loadEquipment(),
        loadDeletedEquipment()
      ]);

      equipmentList = Array.isArray(equipment) ? equipment : [];
      deletedEquipment = Array.isArray(deleted) ? deleted : [];
    } catch (error) {
      console.error("Failed to load deleted equipment data:", error);
      equipmentList = [];
      deletedEquipment = [];
    }
  }

  async function persistDeletedEquipment() {
    await saveDeletedEquipment(deletedEquipment);
  }

  async function persistEquipment() {
    await saveEquipment(equipmentList);
  }

  function persistGrid() {
    saveDeletedEquipmentGridSettingsLocal(
      deletedEquipmentColumns,
      deletedEquipmentGridState
    );
  }

  function suppressLiveReload(ms = 3000) {
    if (typeof window.suppressFleetLiveReload === "function") {
      window.suppressFleetLiveReload(ms);
    }
  }

  function getFilteredDeletedEquipmentData() {
    return getFilteredGridData(
      deletedEquipment,
      deletedEquipmentColumns,
      deletedEquipmentGridState
    );
  }

  function refreshDeletedEquipmentSelectionUi() {
    updateSelectionButtonText({
      selectionMode: deletedEquipmentSelectionMode,
      selectedSet: selectedDeletedEquipmentIds,
      actionButton: dom.permanentlyDeleteSelectedEquipmentBtn,
      defaultText: "Delete Selected",
      confirmText: "Confirm Delete",
      cancelButton: dom.cancelDeletedSelectionBtn,
      table: dom.deletedEquipmentTable
    });
  }

  function enterDeletedEquipmentSelectionMode() {
    deletedEquipmentSelectionMode = true;
    refreshDeletedEquipmentSelectionUi();
    renderDeletedEquipment();
  }

  function exitDeletedEquipmentSelectionMode(clear = true) {
    deletedEquipmentSelectionMode = false;
    if (clear) {
      clearSelections(selectedDeletedEquipmentIds);
    }
    refreshDeletedEquipmentSelectionUi();
    renderDeletedEquipment();
  }

  async function showDeletedEquipment(equipmentId) {
    if (!(await requirePermission(
      canViewDeletedEquipment,
      "Permission Required",
      "You do not have permission to view deleted equipment."
    ))) {
      return;
    }

    const eq = deletedEquipment.find(e => String(e.id) === String(equipmentId));
    if (!eq) return;

    selectedDeletedEquipmentId = eq.id;

    if (dom.deletedEquipmentPanel) {
      dom.deletedEquipmentPanel.style.display = "block";
    }

    setText("deletedProfileUnit", eq.unit || "");
    setText("deletedProfileType", eq.type || "");
    setText("deletedProfileYear", eq.year || "");
    setText("deletedProfileVin", eq.vin || "");
    setText("deletedProfilePlate", eq.plate || "");
    setText("deletedProfileState", eq.state || "");
    setText("deletedProfileStatus", eq.status || "");
    setText("deletedProfileLocation", eq.location || "");
    setText("deletedProfilePM", eq.pm || "");
    setText("deletedProfileBusiness", eq.business || "");
    setText("deletedProfileRim", eq.rim || "");
    setText("deletedProfileSize", eq.size || "");
    setText("deletedProfilePressure", eq.pressure || "");
  }

  async function restoreDeletedEquipment(id) {
    if (!(await requirePermission(
      canRestoreDeletedEquipment,
      "Permission Required",
      "You do not have permission to restore deleted equipment."
    ))) {
      return;
    }

    const normalizedId = String(id);
    const eq = deletedEquipment.find(e => String(e.id) === normalizedId);
    if (!eq) return;

    equipmentList.push(eq);
    deletedEquipment = deletedEquipment.filter(
      e => String(e.id) !== normalizedId
    );

    suppressLiveReload(3500);
    await persistEquipment();
    await persistDeletedEquipment();

    if (dom.deletedEquipmentPanel) {
      dom.deletedEquipmentPanel.style.display = "none";
    }

    selectedDeletedEquipmentId = null;
    renderDeletedEquipment();
  }

  async function permanentlyDeleteEquipment(id) {
    if (!(await requirePermission(
      canPermanentlyDeleteDeletedEquipment,
      "Permission Required",
      "You do not have permission to permanently delete equipment."
    ))) {
      return;
    }

    const normalizedId = String(id);

    const confirmed = await showConfirmModal(
      "Delete Equipment Permanently",
      "Permanently delete this equipment?",
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    deletedEquipment = deletedEquipment.filter(
      e => String(e.id) !== normalizedId
    );

    suppressLiveReload(3500);
    await persistDeletedEquipment();

    if (dom.deletedEquipmentPanel) {
      dom.deletedEquipmentPanel.style.display = "none";
    }

    selectedDeletedEquipmentId = null;
    renderDeletedEquipment();
  }

  async function restoreSelectedDeletedEquipment() {
    if (!(await requirePermission(
      canRestoreDeletedEquipment,
      "Permission Required",
      "You do not have permission to restore deleted equipment."
    ))) {
      return;
    }

    if (!deletedEquipmentSelectionMode) {
      enterDeletedEquipmentSelectionMode();
      return;
    }

    if (selectedDeletedEquipmentIds.size === 0) {
      await showMessageModal("No Equipment Selected", "Select equipment to restore.");
      return;
    }

    const normalizedSelectedIds = new Set(
      [...selectedDeletedEquipmentIds].map(id => String(id))
    );

    const recordsToRestore = deletedEquipment.filter(eq =>
      normalizedSelectedIds.has(String(eq.id))
    );

    equipmentList.push(...recordsToRestore);
    deletedEquipment = deletedEquipment.filter(
      eq => !normalizedSelectedIds.has(String(eq.id))
    );

    suppressLiveReload(3500);
    await persistEquipment();
    await persistDeletedEquipment();
    exitDeletedEquipmentSelectionMode(true);
  }

  async function permanentlyDeleteSelectedDeletedEquipment() {
    if (!(await requirePermission(
      canPermanentlyDeleteDeletedEquipment,
      "Permission Required",
      "You do not have permission to permanently delete equipment."
    ))) {
      return;
    }

    if (!deletedEquipmentSelectionMode) {
      enterDeletedEquipmentSelectionMode();
      return;
    }

    if (selectedDeletedEquipmentIds.size === 0) {
      await showMessageModal("No Equipment Selected", "Select equipment to permanently delete.");
      return;
    }

    const confirmed = await showConfirmModal(
      "Delete Equipment Permanently",
      `Permanently delete ${selectedDeletedEquipmentIds.size} selected equipment item(s)?`,
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    const normalizedSelectedIds = new Set(
      [...selectedDeletedEquipmentIds].map(id => String(id))
    );

    deletedEquipment = deletedEquipment.filter(
      eq => !normalizedSelectedIds.has(String(eq.id))
    );

    suppressLiveReload(3500);
    await persistDeletedEquipment();
    exitDeletedEquipmentSelectionMode(true);
  }

  function clearDeletedEquipmentFilters() {
    deletedEquipmentGridState.globalSearch = "";
    deletedEquipmentGridState.filters = {};
    deletedEquipmentGridState.headerMenuOpenFor = null;

    if (dom.deletedEquipmentGlobalSearch) {
      dom.deletedEquipmentGlobalSearch.value = "";
    }

    clearSelections(selectedDeletedEquipmentIds);
    persistGrid();
    renderDeletedEquipment();
  }

  function renderDeletedEquipment() {
    if (!dom.deletedEquipmentTableBody) return;

    const canView = canViewDeletedEquipment();
    const rows = canView ? getFilteredDeletedEquipmentData() : [];

    renderGridHeaderGeneric({
      table: dom.deletedEquipmentTable,
      headerRow: dom.deletedEquipmentTableHeaderRow,
      columnFiltersHost: dom.deletedEquipmentColumnFilters,
      columns: deletedEquipmentColumns,
      gridState: deletedEquipmentGridState,
      filterUiMode: deletedEquipmentFilterUiMode,
      selectionMode: deletedEquipmentSelectionMode && canPermanentlyDeleteDeletedEquipment(),
      selectAllCheckboxId: "selectAllDeletedEquipmentCheckbox",
      visibleRows: rows,
      selectedSet: selectedDeletedEquipmentIds,
      resultCountEl: dom.deletedEquipmentResultCount,
      persistGrid,
      renderFn: renderDeletedEquipment,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    dom.deletedEquipmentTableBody.innerHTML = "";

    if (!canView) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="${Math.max(1, deletedEquipmentColumns.filter(col => col.visible).length + 1)}" class="emptyCell">You do not have permission to view deleted equipment.</td>`;
      dom.deletedEquipmentTableBody.appendChild(row);
      setGridResultCount(dom.deletedEquipmentResultCount, []);
      refreshDeletedEquipmentSelectionUi();
      return;
    }

    rows.forEach(eq => {
      const row = document.createElement("tr");
      row.dataset.deletedEquipmentId = eq.id;

      if (deletedEquipmentSelectionMode && canPermanentlyDeleteDeletedEquipment()) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectColumnCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = isRowSelected(
          selectedDeletedEquipmentIds,
          String(eq.id)
        );

        checkbox.addEventListener("click", event => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          toggleRowSelection(
            selectedDeletedEquipmentIds,
            String(eq.id)
          );
          refreshDeletedEquipmentSelectionUi();
        });

        selectTd.appendChild(checkbox);
        row.appendChild(selectTd);
      }

      deletedEquipmentColumns
        .filter(col => col.visible)
        .forEach(col => {
          const td = document.createElement("td");
          td.textContent = normalizeCellValue(eq[col.key]);
          row.appendChild(td);
        });

      row.addEventListener("click", async () => {
        if (deletedEquipmentSelectionMode && canPermanentlyDeleteDeletedEquipment()) {
          toggleRowSelection(
            selectedDeletedEquipmentIds,
            String(eq.id)
          );
          renderDeletedEquipment();
        } else {
          await showDeletedEquipment(eq.id);
        }
      });

      if (
        isRowSelected(
          selectedDeletedEquipmentIds,
          String(eq.id)
        )
      ) {
        row.classList.add("selectedRow");
      }

      dom.deletedEquipmentTableBody.appendChild(row);
    });

    setGridResultCount(dom.deletedEquipmentResultCount, rows);
    refreshDeletedEquipmentSelectionUi();
  }

  function bindEvents() {
    if (dom.deletedEquipmentGlobalSearch) {
      dom.deletedEquipmentGlobalSearch.value =
        deletedEquipmentGridState.globalSearch || "";

      dom.deletedEquipmentGlobalSearch.addEventListener("input", () => {
        deletedEquipmentGridState.globalSearch =
          dom.deletedEquipmentGlobalSearch.value || "";
        persistGrid();
        renderDeletedEquipment();
      });
    }

    if (dom.clearDeletedEquipmentFiltersBtn) {
      dom.clearDeletedEquipmentFiltersBtn.addEventListener(
        "click",
        clearDeletedEquipmentFilters
      );
    }

    if (dom.restoreSelectedEquipmentBtn) {
      dom.restoreSelectedEquipmentBtn.addEventListener("click", () => {
        restoreSelectedDeletedEquipment();
      });
    }

    if (dom.permanentlyDeleteSelectedEquipmentBtn) {
      dom.permanentlyDeleteSelectedEquipmentBtn.addEventListener("click", () => {
        permanentlyDeleteSelectedDeletedEquipment();
      });
    }

    if (dom.cancelDeletedSelectionBtn) {
      dom.cancelDeletedSelectionBtn.addEventListener("click", () => {
        exitDeletedEquipmentSelectionMode(true);
      });
    }

    if (dom.restoreDeletedEquipmentBtn) {
      dom.restoreDeletedEquipmentBtn.addEventListener("click", () => {
        if (selectedDeletedEquipmentId != null) {
          restoreDeletedEquipment(selectedDeletedEquipmentId);
        }
      });
    }

    if (dom.permanentlyDeleteEquipmentBtn) {
      dom.permanentlyDeleteEquipmentBtn.addEventListener("click", () => {
        if (selectedDeletedEquipmentId != null) {
          permanentlyDeleteEquipment(selectedDeletedEquipmentId);
        }
      });
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (dom.appModal?.classList.contains("show") && appModalResolver) {
          const resolver = appModalResolver;
          appModalResolver = null;
          dom.appModal.classList.remove("show");
          resolver(false);
        }
      }
    });
  }

  bindEvents();
  await hydrateDeletedEquipmentData();
  applyDeletedEquipmentPermissionUi();
  renderDeletedEquipment();

  return {
    renderDeletedEquipment,
    showDeletedEquipment,
    applyDeletedEquipmentPermissionUi
  };
}