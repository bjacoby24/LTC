import {
  getLoggedInUser,
  loadWorkOrders,
  saveWorkOrders
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

function byId(id) {
  return document.getElementById(id);
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeCellValue(value) {
  if (value == null) return "";
  return String(value).trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  const amount = Number(value || 0) || 0;
  return `$${amount.toFixed(2)}`;
}

function canEditWorkOrders() {
  const user = getLoggedInUser();
  const permissions =
    user &&
    typeof user === "object" &&
    user.permissions &&
    typeof user.permissions === "object"
      ? user.permissions
      : {};

  return !!permissions.workOrdersEdit;
}

function canDeleteWorkOrders() {
  const user = getLoggedInUser();
  const permissions =
    user &&
    typeof user === "object" &&
    user.permissions &&
    typeof user.permissions === "object"
      ? user.permissions
      : {};

  return !!permissions.workOrdersDelete;
}

const WORK_ORDER_COLUMNS_KEY = "fleetWorkOrderColumns";
const WORK_ORDER_GRID_STATE_KEY = "fleetWorkOrderGridState";

const DEFAULT_WORK_ORDER_COLUMNS = [
  { key: "workOrderNumber", label: "WO #", visible: true, sortable: true, filterType: "text" },
  { key: "equipmentNumber", label: "Equipment", visible: true, sortable: true, filterType: "text" },
  { key: "status", label: "Status", visible: true, sortable: true, filterType: "select" },
  { key: "assignee", label: "Assignee", visible: true, sortable: true, filterType: "text" },
  { key: "type", label: "Type", visible: true, sortable: true, filterType: "select" },
  { key: "opened", label: "Opened", visible: true, sortable: true, filterType: "text" },
  { key: "totalDisplay", label: "Total", visible: true, sortable: true, filterType: "text" }
];

function loadWorkOrderColumns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORK_ORDER_COLUMNS_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map(col => ({
        sortable: true,
        filterType: "text",
        visible: true,
        ...col
      }));
    }
  } catch (error) {
    console.warn("Failed to load work order columns:", error);
  }

  return DEFAULT_WORK_ORDER_COLUMNS.map(col => ({ ...col }));
}

function saveWorkOrderColumns(columns) {
  localStorage.setItem(
    WORK_ORDER_COLUMNS_KEY,
    JSON.stringify(Array.isArray(columns) ? columns : DEFAULT_WORK_ORDER_COLUMNS)
  );
}

function loadWorkOrderGridState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORK_ORDER_GRID_STATE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.warn("Failed to load work order grid state:", error);
    return {};
  }
}

function saveWorkOrderGridState(state) {
  localStorage.setItem(
    WORK_ORDER_GRID_STATE_KEY,
    JSON.stringify(state && typeof state === "object" ? state : {})
  );
}

let isOpeningWorkOrder = false;
let workOrders = [];
let workOrderColumns = loadWorkOrderColumns();
let workOrderGridState = {
  globalSearch: "",
  filters: {},
  sortKey: "",
  sortDirection: "asc",
  headerMenuOpenFor: null,
  ...loadWorkOrderGridState()
};
let workOrderSelectionMode = false;
let selectedWorkOrderIds = new Set();
let workOrdersOptionsBound = false;
let workOrdersDeleteBound = false;
let workOrdersSearchBound = false;
let workOrdersColumnManagerBound = false;

let appModalResolver = null;
let appModalLastFocus = null;

function showAppConfirm({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "OK",
  cancelText = "Cancel",
  danger = false
} = {}) {
  const modal = byId("appModal");
  const titleEl = byId("appModalTitle");
  const messageEl = byId("appModalMessage");
  const confirmBtn = byId("appModalConfirmBtn");
  const cancelBtn = byId("appModalCancelBtn");
  const closeBtn = byId("appModalCloseBtn");

  if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !closeBtn) {
    return Promise.resolve(window.confirm(message));
  }

  if (appModalResolver) {
    appModalResolver(false);
    appModalResolver = null;
  }

  appModalLastFocus = document.activeElement;

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  cancelBtn.style.display = "";
  confirmBtn.classList.toggle("danger", !!danger);

  modal.classList.add("show");

  return new Promise(resolve => {
    let settled = false;

    const finish = result => {
      if (settled) return;
      settled = true;

      modal.classList.remove("show");
      confirmBtn.classList.remove("danger");

      closeBtn.removeEventListener("click", onCancel);
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeyDown);

      appModalResolver = null;

      if (appModalLastFocus && typeof appModalLastFocus.focus === "function") {
        appModalLastFocus.focus();
      }

      resolve(result);
    };

    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = event => {
      if (event.target === modal) {
        finish(false);
      }
    };
    const onKeyDown = event => {
      if (!modal.classList.contains("show")) return;

      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }

      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      }
    };

    appModalResolver = finish;

    closeBtn.addEventListener("click", onCancel);
    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeyDown);

    confirmBtn.focus();
  });
}

function getColumnByKey(key) {
  return workOrderColumns.find(col => col.key === key) || null;
}

function getVisibleWorkOrderColumns() {
  return workOrderColumns.filter(col => col.visible);
}

function persistWorkOrderGridSettings() {
  saveWorkOrderColumns(workOrderColumns);
  saveWorkOrderGridState(workOrderGridState);
}

function openWorkOrderWindow(id = "") {
  if (isOpeningWorkOrder) return;
  isOpeningWorkOrder = true;

  const fileName = "workorder.html";
  const url = id
    ? `${fileName}?id=${encodeURIComponent(id)}`
    : fileName;

  const features = "width=1400,height=900,resizable=yes,scrollbars=yes";

  try {
    if (window.electronAPI?.openWindow) {
      window.electronAPI.openWindow({
        url,
        title: id ? `Work Order ${id}` : "Work Order",
        width: 1400,
        height: 900
      });
      return;
    }

    window.open(url, "_blank", features);
  } catch (error) {
    console.warn("openWorkOrderWindow failed", error);
    window.open(url, "_blank", features);
  } finally {
    setTimeout(() => {
      isOpeningWorkOrder = false;
    }, 500);
  }
}

function normalizeWorkOrderRow(item = {}) {
  const total = Number(item.total ?? item.grandTotal ?? item.totalCharges ?? 0) || 0;

  return {
    ...item,
    id: String(item.id ?? ""),
    workOrderNumber: item.workOrderNumber || item.woNumber || "",
    equipmentNumber: item.equipmentNumber || "",
    status: item.status || "",
    assignee: item.assignee || "",
    type: item.woType || item.type || "",
    opened: item.opened || item.date || item.woDate || "",
    total,
    totalDisplay: total.toFixed(2)
  };
}

function getFilteredWorkOrders() {
  const searchValue = byId("woGlobalSearch")?.value || "";
  workOrderGridState.globalSearch = searchValue;

  return getFilteredGridData(workOrders, workOrderColumns, workOrderGridState);
}

function updateWorkOrderSelectionUi(visibleRows = []) {
  updateSelectionButtonText({
    selectionMode: workOrderSelectionMode,
    selectedSet: selectedWorkOrderIds,
    actionButton: byId("deleteSelectedWOBtn"),
    defaultText: "Delete Selected",
    confirmText: "Delete Selected",
    cancelButton: byId("cancelWOSelectionBtn"),
    table: byId("workOrdersTable")
  });

  const deleteBtn = byId("deleteSelectedWOBtn");
  if (deleteBtn) {
    deleteBtn.disabled =
      !canDeleteWorkOrders() ||
      (workOrderSelectionMode && selectedWorkOrderIds.size === 0);
  }

  const visibleIds = new Set(visibleRows.map(row => String(row.id)));
  selectedWorkOrderIds.forEach(id => {
    if (!workOrders.some(row => String(row.id) === String(id))) {
      selectedWorkOrderIds.delete(id);
    }
  });

  qsa("#workOrdersTable tbody tr[data-work-order-id]").forEach(row => {
    const id = String(row.dataset.workOrderId || "");
    row.classList.toggle("selectedRow", selectedWorkOrderIds.has(id));
    const checkbox = qs(".gridRowCheckbox", row);
    if (checkbox) {
      checkbox.checked = selectedWorkOrderIds.has(id);
    }
  });

  const selectAllCheckbox = byId("workOrdersSelectAll");
  if (selectAllCheckbox) {
    const selectedVisibleCount = visibleRows.filter(row =>
      selectedWorkOrderIds.has(String(row.id))
    ).length;

    selectAllCheckbox.checked =
      visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;

    selectAllCheckbox.indeterminate =
      selectedVisibleCount > 0 && selectedVisibleCount < visibleRows.length;
  }
}

function clearWorkOrderFilters() {
  workOrderGridState.globalSearch = "";
  workOrderGridState.filters = {};
  workOrderGridState.sortKey = "";
  workOrderGridState.sortDirection = "asc";
  workOrderGridState.headerMenuOpenFor = null;

  const searchInput = byId("woGlobalSearch");
  if (searchInput) {
    searchInput.value = "";
  }

  persistWorkOrderGridSettings();
  renderWorkOrdersNavTable();
}

function toggleWorkOrdersOptionsDropdown(forceOpen = null) {
  const button = byId("workOrdersOptionsBtn");
  const dropdown = byId("workOrdersOptionsDropdown");
  if (!button || !dropdown) return;

  const shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : !dropdown.classList.contains("show");

  dropdown.classList.toggle("show", shouldOpen);
  button.classList.toggle("active", shouldOpen);
  button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

function openWorkOrderColumnManager() {
  const panel = byId("columnManagerPanel");
  const title = qs("#columnManagerPanel .columnManagerHeader h3");
  const list = byId("columnManagerList");
  const newInput = byId("newCustomColumnInput");
  const addBtn = byId("addCustomColumnBtn");

  if (!panel || !list) return;

  if (title) {
    title.textContent = "Manage Work Order Columns";
  }

  list.innerHTML = "";

  workOrderColumns.forEach((column, index) => {
    const row = document.createElement("div");
    row.className = "columnManagerRow";

    const left = document.createElement("div");
    left.className = "columnManagerRowLeft";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!column.visible;
    checkbox.addEventListener("change", () => {
      workOrderColumns[index].visible = checkbox.checked;
      persistWorkOrderGridSettings();
      renderWorkOrdersNavTable();
      openWorkOrderColumnManager();
    });

    const label = document.createElement("span");
    label.textContent = column.label;

    left.appendChild(checkbox);
    left.appendChild(label);

    row.appendChild(left);
    list.appendChild(row);
  });

  if (newInput) {
    newInput.value = "";
    newInput.placeholder = "New custom column";
  }

  if (addBtn) {
    addBtn.style.display = "none";
  }

  panel.classList.add("show");
}

function closeWorkOrderColumnManager() {
  byId("columnManagerPanel")?.classList.remove("show");
}

function bindWorkOrderColumnManagerEvents() {
  if (workOrdersColumnManagerBound) return;
  workOrdersColumnManagerBound = true;

  byId("closeColumnManagerBtn")?.addEventListener("click", () => {
    closeWorkOrderColumnManager();
  });

  byId("columnManagerPanel")?.addEventListener("click", event => {
    if (event.target === byId("columnManagerPanel")) {
      closeWorkOrderColumnManager();
    }
  });
}

function renderWorkOrdersNavTable() {
  const table = byId("workOrdersTable");
  const tableBody = table?.querySelector("tbody");
  const headerRow = byId("workOrdersTableHeaderRow");
  const resultCount = byId("woResultCount");
  const filtersHost = byId("woColumnFilters");

  if (!table || !tableBody || !headerRow) return;

  const visibleRows = getFilteredWorkOrders();

  renderGridHeaderGeneric({
    headerRow,
    table,
    columns: workOrderColumns,
    data: workOrders,
    gridState: workOrderGridState,
    filterUiMode: "row",
    saveFn: persistWorkOrderGridSettings,
    renderFn: renderWorkOrdersNavTable,
    selectedSet: selectedWorkOrderIds,
    visibleRows,
    selectAllCheckboxId: "workOrdersSelectAll",
    rowIdAttribute: "workOrderId",
    sortable: true,
    selectionMode: true,
    columnFiltersHost: filtersHost,
    resultCountEl: resultCount,
    buildColumnFiltersFn: buildColumnFiltersGeneric
  });

  const visibleColumns = getVisibleWorkOrderColumns();

  if (!visibleRows.length) {
    const colSpan = visibleColumns.length + 1;
    tableBody.innerHTML = `
      <tr>
        <td colspan="${colSpan}" class="emptyCell">No work orders found</td>
      </tr>
    `;
    updateWorkOrderSelectionUi([]);
    setGridResultCount(resultCount, 0);
    return;
  }

  tableBody.innerHTML = visibleRows
    .map(item => {
      const rowId = String(item.id || "");
      const selectedClass = isRowSelected(selectedWorkOrderIds, rowId)
        ? " selectedRow"
        : "";

      const cells = visibleColumns
        .map(col => {
          let value = item[col.key];

          if (col.key === "totalDisplay") {
            value = formatMoney(item.total);
          }

          return `<td>${escapeHtml(value ?? "")}</td>`;
        })
        .join("");

      return `
        <tr data-work-order-id="${escapeHtml(rowId)}" class="workOrderNavRow${selectedClass}">
          <td class="selectColumnCell">
            <input
              type="checkbox"
              class="gridRowCheckbox"
              data-row-id="${escapeHtml(rowId)}"
              ${isRowSelected(selectedWorkOrderIds, rowId) ? "checked" : ""}
            />
          </td>
          ${cells}
        </tr>
      `;
    })
    .join("");

  tableBody.querySelectorAll("tr[data-work-order-id]").forEach(row => {
    row.addEventListener("click", event => {
      if (event.target.closest(".gridRowCheckbox")) {
        return;
      }

      const rowId = String(row.dataset.workOrderId || "");
      if (!rowId) return;

      if (workOrderSelectionMode) {
        toggleRowSelection(selectedWorkOrderIds, rowId);
        workOrderSelectionMode = selectedWorkOrderIds.size > 0;
        updateWorkOrderSelectionUi(getFilteredWorkOrders());
        return;
      }

      openWorkOrderWindow(rowId);
    });
  });

  tableBody.querySelectorAll(".gridRowCheckbox").forEach(checkbox => {
    checkbox.addEventListener("change", event => {
      event.stopPropagation();

      const rowId = String(checkbox.dataset.rowId || "");
      if (!rowId) return;

      if (checkbox.checked) {
        selectedWorkOrderIds.add(rowId);
      } else {
        selectedWorkOrderIds.delete(rowId);
      }

      workOrderSelectionMode = selectedWorkOrderIds.size > 0;
      updateWorkOrderSelectionUi(getFilteredWorkOrders());
    });

    checkbox.addEventListener("click", event => {
      event.stopPropagation();
    });
  });

  updateWorkOrderSelectionUi(visibleRows);
  setGridResultCount(resultCount, visibleRows);
}

async function deleteSelectedWorkOrders() {
  if (!canDeleteWorkOrders()) return;
  if (!selectedWorkOrderIds.size) return;

  const idsToDelete = new Set(Array.from(selectedWorkOrderIds).map(String));
  const nextWorkOrders = workOrders.filter(item => !idsToDelete.has(String(item.id)));

  await saveWorkOrders(nextWorkOrders);
  workOrders = nextWorkOrders;

  clearSelections(selectedWorkOrderIds);
  workOrderSelectionMode = false;
  renderWorkOrdersNavTable();

  try {
    window.dispatchEvent(new CustomEvent("fleet:work-orders-changed"));
  } catch (error) {
    console.warn("Unable to dispatch work orders changed event:", error);
  }
}

function applyWorkOrderPermissionUi() {
  const canEdit = canEditWorkOrders();
  const canDelete = canDeleteWorkOrders();

  const openBtn = byId("openQuickWOFormBtn");
  const deleteBtn = byId("deleteSelectedWOBtn");
  const optionsBtn = byId("workOrdersOptionsBtn");

  if (openBtn) {
    openBtn.style.display = canEdit ? "" : "none";
  }

  if (deleteBtn) {
    deleteBtn.style.display = canDelete ? "" : "none";
  }

  if (optionsBtn) {
    optionsBtn.style.display = "";
  }

  updateWorkOrderSelectionUi(getFilteredWorkOrders());
}

function bindDeleteSelectedButton() {
  if (workOrdersDeleteBound) return;
  workOrdersDeleteBound = true;

  const deleteBtn = byId("deleteSelectedWOBtn");
  const cancelBtn = byId("cancelWOSelectionBtn");

  deleteBtn?.addEventListener("click", async () => {
    console.log("Delete Selected clicked", {
      canDelete: canDeleteWorkOrders(),
      workOrderSelectionMode,
      selectedCount: selectedWorkOrderIds.size,
      selectedIds: Array.from(selectedWorkOrderIds)
    });

    if (!canDeleteWorkOrders()) return;

    if (!workOrderSelectionMode) {
      console.log("Entering selection mode");
      workOrderSelectionMode = true;
      clearSelections(selectedWorkOrderIds);
      renderWorkOrdersNavTable();
      return;
    }

    if (!selectedWorkOrderIds.size) {
      console.log("No selected work orders");
      return;
    }

    console.log("Opening app modal confirm");

    const confirmed = await showAppConfirm({
      title: "Delete Work Orders",
      message: `Delete ${selectedWorkOrderIds.size} selected work order${selectedWorkOrderIds.size === 1 ? "" : "s"}?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true
    });

    console.log("Modal result:", confirmed);

    if (!confirmed) return;

    await deleteSelectedWorkOrders();
  });

  cancelBtn?.addEventListener("click", () => {
    workOrderSelectionMode = false;
    clearSelections(selectedWorkOrderIds);
    renderWorkOrdersNavTable();
  });
}

function bindWorkOrdersOptionsMenu() {
  if (workOrdersOptionsBound) return;
  workOrdersOptionsBound = true;

  const optionsBtn = byId("workOrdersOptionsBtn");
  const dropdown = byId("workOrdersOptionsDropdown");
  const manageColumnsBtn = byId("manageWOColumnsBtn");
  const clearFiltersBtn = byId("clearWOFiltersBtn");

  optionsBtn?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleWorkOrdersOptionsDropdown();
  });

  manageColumnsBtn?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleWorkOrdersOptionsDropdown(false);
    openWorkOrderColumnManager();
  });

  clearFiltersBtn?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleWorkOrdersOptionsDropdown(false);
    clearWorkOrderFilters();
  });

  document.addEventListener("click", event => {
    if (!dropdown || !optionsBtn) return;

    const insideDropdown = dropdown.contains(event.target);
    const onButton = optionsBtn.contains(event.target);

    if (!insideDropdown && !onButton) {
      toggleWorkOrdersOptionsDropdown(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      toggleWorkOrdersOptionsDropdown(false);
      closeWorkOrderColumnManager();
    }
  });
}

function bindSearchInput() {
  if (workOrdersSearchBound) return;
  workOrdersSearchBound = true;

  const searchInput = byId("woGlobalSearch");
  if (!searchInput) return;

  searchInput.value = workOrderGridState.globalSearch || "";
  searchInput.addEventListener("input", () => {
    workOrderGridState.globalSearch = searchInput.value || "";
    persistWorkOrderGridSettings();
    renderWorkOrdersNavTable();
  });
}

async function refreshWorkOrders() {
  const rows = await loadWorkOrders();
  workOrders = Array.isArray(rows) ? rows.map(normalizeWorkOrderRow) : [];
  renderWorkOrdersNavTable();
}

export function initWorkOrdersNav() {
  const openBtn = byId("openQuickWOFormBtn");

  openBtn?.addEventListener("click", () => {
    openWorkOrderWindow();
  });

  bindSearchInput();
  bindWorkOrdersOptionsMenu();
  bindDeleteSelectedButton();
  bindWorkOrderColumnManagerEvents();

  window.addEventListener("fleet:work-orders-changed", async () => {
    await refreshWorkOrders();
  });

  applyWorkOrderPermissionUi();

  refreshWorkOrders().catch(error => {
    console.error("Failed to initialize work orders nav:", error);
    renderWorkOrdersNavTable();
  });

  return {
    openWorkOrderWindow,
    applyWorkOrderPermissionUi,
    renderWorkOrdersNavTable,
    clearWorkOrderSelection() {
      workOrderSelectionMode = false;
      clearSelections(selectedWorkOrderIds);
      renderWorkOrdersNavTable();
    }
  };
}