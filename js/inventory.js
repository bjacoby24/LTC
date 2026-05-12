import { getDom } from "./dom.js";
import {
  byId,
  normalizeText,
  normalizeLower,
  normalizeCellValue,
  makeId
} from "./utils.js";
import {
  loadInventory,
  saveInventory,
  loadInventoryColumns,
  loadInventoryGridState,
  saveInventoryGridSettings,
  getLoggedInUser
} from "./storage.js";
import {
  getFilteredGridData,
  toggleRowSelection,
  clearSelections,
  updateSelectionButtonText,
  setGridResultCount,
  isRowSelected
} from "./gridShared.js";

export async function initInventory() {
  const dom = getDom();

  let inventory = [];
  let editingInventoryId = null;
  let viewingInventoryId = null;
  let selectedInventoryIds = new Set();
  let inventorySelectionMode = false;
  let inventoryBarcodeSelectionMode = false;
  let eventsBound = false;

  let appModalResolver = null;
  let appModalLastFocus = null;

  const DEFAULT_INVENTORY_COLUMNS = [
    { key: "partNumber", label: "Part #", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "name", label: "Part Name", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "category", label: "Category", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "quantity", label: "Qty", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "reorderPoint", label: "Reorder Point", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "reorderQuantity", label: "Reorder Qty", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "maximumQuantity", label: "Max Qty", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "unitCost", label: "Unit Cost", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "location", label: "Location", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "vendor", label: "Vendor", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "lastPurchasedAt", label: "Last Purchased", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "lastIssuedAt", label: "Last Issued", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "notes", label: "Notes", visible: false, sortable: true, filterType: "text", custom: false }
  ];

  let inventoryColumns = loadInventoryColumns(DEFAULT_INVENTORY_COLUMNS);

  if (!Array.isArray(inventoryColumns) || !inventoryColumns.length) {
    inventoryColumns = DEFAULT_INVENTORY_COLUMNS.map(col => ({ ...col }));
  }

  inventoryColumns = inventoryColumns.map(col => ({
    sortable: true,
    filterType: "text",
    custom: false,
    ...col,
    visible: col.visible !== false
  }));

  if (!inventoryColumns.some(col => col.visible)) {
    inventoryColumns = DEFAULT_INVENTORY_COLUMNS.map(col => ({ ...col }));
  }

  let inventoryGridState = loadInventoryGridState({
    sortKey: "name",
    sortDirection: "asc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

  if (!inventoryGridState || typeof inventoryGridState !== "object") {
    inventoryGridState = {
      sortKey: "name",
      sortDirection: "asc",
      globalSearch: "",
      filters: {},
      headerMenuOpenFor: null
    };
  }

  inventoryGridState.filters =
    inventoryGridState.filters && typeof inventoryGridState.filters === "object"
      ? inventoryGridState.filters
      : {};

  function getCurrentPermissions() {
  const loggedInUser = getLoggedInUser();

  const permissions =
    loggedInUser &&
    typeof loggedInUser === "object" &&
    loggedInUser.permissions &&
    typeof loggedInUser.permissions === "object"
      ? loggedInUser.permissions
      : {};

  const basePermissions = {
    inventoryView: true,
    inventoryEdit: true,
    inventoryDelete: false,
    ...permissions
  };

  if (isAdminUser()) {
    return {
      ...basePermissions,
      inventoryView: true,
      inventoryEdit: true,
      inventoryDelete: true
    };
  }

  return basePermissions;
}

 function isAdminUser() {
  const loggedInUser = getLoggedInUser();

  const role = normalizeLower(loggedInUser?.role || "");
  const username = normalizeLower(
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.displayName ||
    ""
  );

  return (
    role === "admin" ||
    role === "administrator" ||
    username === "admin" ||
    username === "admin user" ||
    username.includes("admin")
  );
}

  function canViewInventory() {
    return !!getCurrentPermissions().inventoryView;
  }

  function canEditInventory() {
    return !!getCurrentPermissions().inventoryEdit;
  }

  function canDeleteInventory() {
    return !!getCurrentPermissions().inventoryDelete;
  }

  function suppressLiveReload(ms = 3000) {
    if (typeof window.suppressFleetLiveReload === "function") {
      window.suppressFleetLiveReload(ms);
    }
  }

  function showAppModal({
    title = "Message",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
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
      return Promise.resolve(showCancel ? window.confirm(message) : true);
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

      if (cancelBtn) cancelBtn.onclick = () => finish(false);
      if (closeBtn) closeBtn.onclick = () => finish(false);

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

  async function requirePermission(checkFn, title, message) {
    if (typeof checkFn === "function" ? checkFn() : !!checkFn) return true;

    await showMessageModal(title, message);
    return false;
  }

  function toNumber(value, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const clean = String(value ?? "")
    .trim()
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^\((.*)\)$/, "-$1");

  if (!clean) return fallback;

  const num = Number(clean);

  return Number.isFinite(num) ? num : fallback;
}

  function normalizeDateString(value) {
    const clean = String(value || "").trim();
    if (!clean) return "";

    const parsed = new Date(clean);
    if (Number.isNaN(parsed.getTime())) return clean;

    return parsed.toISOString();
  }

  function formatDateTime(value) {
    const clean = String(value || "").trim();
    if (!clean) return "—";

    const parsed = new Date(clean);
    if (Number.isNaN(parsed.getTime())) return clean;

    return parsed.toLocaleString();
  }

  function formatDate(value) {
    const clean = String(value || "").trim();
    if (!clean) return "—";

    const parsed = new Date(clean);
    if (Number.isNaN(parsed.getTime())) return clean;

    return parsed.toLocaleDateString();
  }

  function formatCurrency(value) {
    const num = toNumber(value, 0);

    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD"
    }).format(num);
  }

  function sortHistoryByDateDesc(entries = []) {
    return [...entries].sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime() || 0;
      const bTime = new Date(b.date || 0).getTime() || 0;
      return bTime - aTime;
    });
  }

  function normalizeHistoryEntry(entry = {}, fallbackType = "") {
    return {
      id: String(entry.id || makeId()),
      type: String(entry.type || fallbackType || "").trim(),
      date: normalizeDateString(entry.date || entry.createdAt || entry.timestamp || ""),
      quantity: toNumber(entry.quantity, 0),
      previousQuantity: toNumber(entry.previousQuantity, 0),
      newQuantity: toNumber(entry.newQuantity, 0),
      unitCost: toNumber(entry.unitCost, 0),
      referenceNumber: String(entry.referenceNumber || "").trim(),
      referenceId: String(entry.referenceId || "").trim(),
      referenceType: String(entry.referenceType || "").trim(),
      vendor: String(entry.vendor || "").trim(),
      user: String(entry.user || "").trim(),
      notes: String(entry.notes || "").trim(),
      source: String(entry.source || "").trim()
    };
  }

  function getLatestDateFromHistory(entries = []) {
    const sorted = sortHistoryByDateDesc(entries);
    return sorted[0]?.date || "";
  }

  function normalizeInventoryRecord(item = {}) {
    const purchaseHistory = Array.isArray(item.purchaseHistory)
      ? item.purchaseHistory.map(entry => normalizeHistoryEntry(entry, "purchase"))
      : [];

    const issueHistory = Array.isArray(item.issueHistory)
      ? item.issueHistory.map(entry => normalizeHistoryEntry(entry, "issue"))
      : [];

    const qtyAdjustmentHistory = Array.isArray(item.qtyAdjustmentHistory)
      ? item.qtyAdjustmentHistory.map(entry => normalizeHistoryEntry(entry, "adjustment"))
      : [];

    const normalized = {
      ...item,
      id: String(item.id ?? makeId()),
      name: String(item.name || item.itemName || "").trim(),
      itemName: String(item.itemName || item.name || "").trim(),
      partNumber: String(item.partNumber || "").trim(),
      category: String(item.category || "").trim(),
      quantity: toNumber(item.quantity, 0),
      unitCost: toNumber(item.unitCost, 0),
      location: String(item.location || "").trim(),
      vendor: String(item.vendor || "").trim(),
      notes: String(item.notes || "").trim(),

      reorderPoint: toNumber(item.reorderPoint, 0),
      reorderQuantity: toNumber(item.reorderQuantity, 0),
      maximumQuantity: toNumber(item.maximumQuantity, 0),
      minimumQuantity: toNumber(item.minimumQuantity, toNumber(item.reorderPoint, 0)),

      quickAdjustEnabled: item.quickAdjustEnabled !== false,
      profileNotes: String(item.profileNotes || item.notes || "").trim(),
      binLocation: String(item.binLocation || "").trim(),
      manufacturer: String(item.manufacturer || "").trim(),
      partType: String(item.partType || "").trim(),
      uom: String(item.uom || "EA").trim() || "EA",

      lastPurchasedAt: normalizeDateString(
        item.lastPurchasedAt || getLatestDateFromHistory(purchaseHistory)
      ),
      lastIssuedAt: normalizeDateString(
        item.lastIssuedAt || getLatestDateFromHistory(issueHistory)
      ),
      lastPurchasedCost: toNumber(item.lastPurchasedCost, 0),

      purchaseHistory: sortHistoryByDateDesc(purchaseHistory),
      issueHistory: sortHistoryByDateDesc(issueHistory),
      qtyAdjustmentHistory: sortHistoryByDateDesc(qtyAdjustmentHistory),

      createdAt: normalizeDateString(item.createdAt || ""),
      updatedAt: normalizeDateString(item.updatedAt || "")
    };

    inventoryColumns.forEach(col => {
      if (!(col.key in normalized)) {
        normalized[col.key] = "";
      }
    });

    return normalized;
  }

  function getNormalizedInventory() {
    return inventory.map(normalizeInventoryRecord);
  }

  function getFilteredNormalizedInventory() {
    return getFilteredGridData(
      getNormalizedInventory(),
      inventoryColumns,
      inventoryGridState
    );
  }

  function getInventoryById(itemId) {
    return getNormalizedInventory().find(entry => String(entry.id) === String(itemId)) || null;
  }

  async function hydrateInventory() {
    try {
      const loaded = await loadInventory();
      inventory = Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      console.error("Failed to load inventory:", error);
      inventory = [];
    }
  }

  async function persistInventory() {
    suppressLiveReload(3000);
    inventory = await saveInventory(inventory);
  }

  function persistGrid() {
    saveInventoryGridSettings(inventoryColumns, inventoryGridState);
  }

  function closeInventoryOptionsDropdown() {
    if (dom.inventoryOptionsDropdown) {
      dom.inventoryOptionsDropdown.classList.remove("show");
    }
  }

  function closeAllRightPanels() {
    if (dom.formPanel) dom.formPanel.classList.remove("show");
    if (dom.inventoryFormPanel) dom.inventoryFormPanel.classList.remove("show");
    if (dom.vendorFormPanel) dom.vendorFormPanel.classList.remove("show");
    if (dom.workOrderFormPanel) dom.workOrderFormPanel.classList.remove("show");
    if (dom.poFormPanel) dom.poFormPanel.classList.remove("show");
    if (dom.settingsPanel) dom.settingsPanel.classList.remove("show");
    if (dom.servicesPanel) dom.servicesPanel.classList.remove("show");
  }

  function closeInventoryPanel() {
    if (dom.inventoryFormPanel) {
      dom.inventoryFormPanel.classList.remove("show");
    }

    editingInventoryId = null;
    applyInventoryPermissionUi();
  }

  function closeInventoryProfilePanel() {
    if (dom.inventoryProfilePanel) {
      dom.inventoryProfilePanel.classList.remove("show");
    }

    viewingInventoryId = null;
    applyInventoryPermissionUi();
  }

  function clearInventoryForm() {
    if (dom.invName) dom.invName.value = "";
    if (dom.invPartNumber) dom.invPartNumber.value = "";
    if (dom.invCategory) dom.invCategory.value = "";
    if (dom.invQuantity) dom.invQuantity.value = "";
    if (dom.invUnitCost) dom.invUnitCost.value = "";
    if (dom.invLocation) dom.invLocation.value = "";
    if (dom.invVendor) dom.invVendor.value = "";
    if (dom.invReorderPoint) dom.invReorderPoint.value = "";
    if (dom.invReorderQty) dom.invReorderQty.value = "";
    if (dom.invMaxQty) dom.invMaxQty.value = "";
    if (dom.invBinLocation) dom.invBinLocation.value = "";
    if (dom.invManufacturer) dom.invManufacturer.value = "";
    if (dom.invPartType) dom.invPartType.value = "";
    if (dom.invUom) dom.invUom.value = "EA";
    if (dom.invNotes) dom.invNotes.value = "";
    if (dom.invProfileNotes) dom.invProfileNotes.value = "";
  }

  function clearInventoryAdjustmentForm() {
    if (dom.inventoryAdjustType) dom.inventoryAdjustType.value = "set";
    if (dom.inventoryAdjustQty) dom.inventoryAdjustQty.value = "";
    if (dom.inventoryAdjustReason) dom.inventoryAdjustReason.value = "";
  }

  function toggleInventoryButtons(mode) {
    if (dom.saveInventoryBtn) {
      dom.saveInventoryBtn.style.display =
        mode === "save" && canEditInventory() ? "inline-block" : "none";
    }

    if (dom.updateInventoryBtn) {
      dom.updateInventoryBtn.style.display =
        mode === "edit" && canEditInventory() ? "inline-block" : "none";
    }

    if (dom.deleteInventoryBtn) {
      dom.deleteInventoryBtn.style.display =
        mode === "edit" && canDeleteInventory() ? "inline-block" : "none";
    }
  }

  function applyInventoryPermissionUi() {
    if (dom.openInventoryFormBtn) {
  dom.openInventoryFormBtn.style.display =
    canEditInventory() || isAdminUser() ? "" : "none";
}

    if (dom.deleteSelectedInventoryBtn) {
      dom.deleteSelectedInventoryBtn.style.display =
        canDeleteInventory() && !inventoryBarcodeSelectionMode ? "" : "none";
    }

    if (dom.saveInventoryBtn) {
      dom.saveInventoryBtn.style.display = canEditInventory() ? "" : "none";
    }

    if (dom.updateInventoryBtn) {
      dom.updateInventoryBtn.style.display =
        editingInventoryId != null && canEditInventory() ? "" : "none";
    }

    if (dom.deleteInventoryBtn) {
      dom.deleteInventoryBtn.style.display =
        editingInventoryId != null && canDeleteInventory() ? "" : "none";
    }

    if (dom.importInventoryBtn) {
  dom.importInventoryBtn.style.display = "";
}

console.log("Import button permission check:", {
  importButtonExists: !!dom.importInventoryBtn,
  canEditInventory: canEditInventory(),
  isAdminUser: isAdminUser(),
  display: dom.importInventoryBtn?.style.display
});

    if (dom.exportInventoryBtn) {
      dom.exportInventoryBtn.style.display = canViewInventory() ? "" : "none";
    }

    if (dom.editInventoryProfileBtn) {
      dom.editInventoryProfileBtn.style.display = canEditInventory() ? "" : "none";
    }

    if (dom.inventoryAdminQuickAdjustSection) {
      dom.inventoryAdminQuickAdjustSection.style.display =
        isAdminUser() && viewingInventoryId != null ? "" : "none";
    }

    if (dom.inventoryAdjustmentHistorySection) {
      dom.inventoryAdjustmentHistorySection.style.display =
        isAdminUser() && viewingInventoryId != null ? "" : "none";
    }
  }

  function buildInventoryRecord(existingId = null, existingItem = null) {
    const baseExisting = normalizeInventoryRecord(existingItem || {});

    const base = normalizeInventoryRecord({
      ...baseExisting,
      id: existingId ?? baseExisting.id ?? makeId(),
      name: dom.invName?.value || "",
      itemName: dom.invName?.value || "",
      partNumber: dom.invPartNumber?.value || "",
      category: dom.invCategory?.value || "",
      quantity: dom.invQuantity?.value || 0,
      unitCost: dom.invUnitCost?.value || 0,
      location: dom.invLocation?.value || "",
      vendor: dom.invVendor?.value || "",
      reorderPoint: dom.invReorderPoint?.value || 0,
      reorderQuantity: dom.invReorderQty?.value || 0,
      maximumQuantity: dom.invMaxQty?.value || 0,
      binLocation: dom.invBinLocation?.value || "",
      manufacturer: dom.invManufacturer?.value || "",
      partType: dom.invPartType?.value || "",
      uom: dom.invUom?.value || "EA",
      notes: dom.invNotes?.value || "",
      profileNotes: dom.invProfileNotes?.value || "",
      updatedAt: new Date().toISOString()
    });

    inventoryColumns.forEach(col => {
      if (!(col.key in base)) {
        base[col.key] = "";
      }
    });

    return base;
  }

  function buildInventoryDuplicateKey(item) {
    return [
      normalizeLower(item.partNumber || ""),
      normalizeLower(item.name || ""),
      normalizeLower(item.location || "")
    ].join("|");
  }

  function isDuplicateInventoryRecord(record, excludeId = null) {
    const recordKey = buildInventoryDuplicateKey(record);

    return inventory.some(item => {
      const normalized = normalizeInventoryRecord(item);
      const sameRecord =
        excludeId != null && String(normalized.id) === String(excludeId);

      if (sameRecord) return false;

      return buildInventoryDuplicateKey(normalized) === recordKey;
    });
  }

  function getFormattedCellValue(item, column) {
    const rawValue = item[column.key];

    if (column.key === "unitCost" || column.key === "lastPurchasedCost") {
      return formatCurrency(rawValue);
    }

    if (column.key === "lastPurchasedAt" || column.key === "lastIssuedAt") {
      return formatDate(rawValue);
    }

    return normalizeCellValue(rawValue);
  }

  function createSortLabel(column) {
    const isSorted = inventoryGridState.sortKey === column.key;

    if (!column.sortable) return column.label;

    if (!isSorted) return `${column.label} ↕`;

    return inventoryGridState.sortDirection === "desc"
      ? `${column.label} ↓`
      : `${column.label} ↑`;
  }

  function renderInventoryFilterRow(visibleColumns) {
    const filterWrap = dom.inventoryColumnFilters || byId("inventoryColumnFilters");
    if (!filterWrap) return;

    const activeElement = document.activeElement;
    const activeFilterKey = activeElement?.dataset?.inventoryFilterKey || "";
    const activeFilterStart =
      typeof activeElement?.selectionStart === "number"
        ? activeElement.selectionStart
        : null;
    const activeFilterEnd =
      typeof activeElement?.selectionEnd === "number"
        ? activeElement.selectionEnd
        : null;

    filterWrap.innerHTML = "";
    filterWrap.classList.add("inventoryColumnFilters");

    visibleColumns.forEach(column => {
      const filterItem = document.createElement("div");
      filterItem.className = "columnFilterItem inventoryFilterItem";

      const label = document.createElement("label");
      label.textContent = column.label;

      const input = document.createElement("input");
      input.type = "text";
      input.dataset.inventoryFilterKey = column.key;
      input.placeholder = `Filter ${column.label}`;
      input.value = inventoryGridState.filters?.[column.key] || "";

      input.addEventListener("input", event => {
        const value = String(event.target.value || "");

        inventoryGridState.filters = {
          ...inventoryGridState.filters,
          [column.key]: value
        };

        if (!value) {
          delete inventoryGridState.filters[column.key];
        }

        inventoryGridState.headerMenuOpenFor = null;
        persistGrid();
        renderInventoryGrid();
      });

      filterItem.appendChild(label);
      filterItem.appendChild(input);
      filterWrap.appendChild(filterItem);
    });

    if (activeFilterKey) {
      const nextActiveFilter = filterWrap.querySelector(
        `[data-inventory-filter-key="${activeFilterKey}"]`
      );

      if (nextActiveFilter) {
        nextActiveFilter.focus();

        if (
          activeFilterStart !== null &&
          activeFilterEnd !== null &&
          typeof nextActiveFilter.setSelectionRange === "function"
        ) {
          nextActiveFilter.setSelectionRange(activeFilterStart, activeFilterEnd);
        }
      }
    }
  }

  function renderInventoryHeader(thead, visibleColumns, data) {
    thead.innerHTML = "";

    const headerRow = document.createElement("tr");
    headerRow.id = "inventoryTableHeaderRow";

    if (inventorySelectionMode) {
      const selectTh = document.createElement("th");
      selectTh.className = "selectColumnHeader";

      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      selectAll.id = "selectAllInventoryCheckbox";

      const selectableIds = data.map(item => String(item.id));

      selectAll.checked =
        selectableIds.length > 0 &&
        selectableIds.every(id => selectedInventoryIds.has(id));

      selectAll.indeterminate =
        selectableIds.some(id => selectedInventoryIds.has(id)) &&
        !selectAll.checked;

      selectAll.addEventListener("click", event => {
        event.stopPropagation();
      });

      selectAll.addEventListener("change", event => {
        selectableIds.forEach(id => {
          if (event.target.checked) {
            selectedInventoryIds.add(id);
          } else {
            selectedInventoryIds.delete(id);
          }
        });

        renderInventoryGrid();
      });

      selectTh.appendChild(selectAll);
      headerRow.appendChild(selectTh);
    }

    visibleColumns.forEach(column => {
      const th = document.createElement("th");
      th.dataset.columnKey = column.key;

      const inner = document.createElement("div");
      inner.className = "gridHeaderCellInner";

      const sortBtn = document.createElement("button");
      sortBtn.type = "button";
      sortBtn.className = "gridHeaderSortBtn";
      sortBtn.textContent = createSortLabel(column);
      sortBtn.disabled = !column.sortable;

      if (column.sortable) {
        sortBtn.addEventListener("click", () => {
          if (inventoryGridState.sortKey === column.key) {
            inventoryGridState.sortDirection =
              inventoryGridState.sortDirection === "asc" ? "desc" : "asc";
          } else {
            inventoryGridState.sortKey = column.key;
            inventoryGridState.sortDirection = "asc";
          }

          persistGrid();
          renderInventoryGrid();
        });
      }

      inner.appendChild(sortBtn);
      th.appendChild(inner);
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
  }

  function renderInventoryGrid() {
    if (!dom.inventoryTable) return;

    const table = dom.inventoryTable;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    if (!thead || !tbody) return;

    const visibleColumns = inventoryColumns.filter(col => col.visible);
    const data = getFilteredNormalizedInventory();

    renderInventoryFilterRow(visibleColumns);
    renderInventoryHeader(thead, visibleColumns, data);

    tbody.innerHTML = "";

    if (!data.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");

      td.className = "emptyStateCell";
      td.colSpan = visibleColumns.length + (inventorySelectionMode ? 1 : 0);
      td.textContent = "No inventory items found.";

      tr.appendChild(td);
      tbody.appendChild(tr);

      setGridResultCount(dom.inventoryResultCount, 0, "records");
      refreshInventorySelectionUi();
      return;
    }

    data.forEach(item => {
      const tr = document.createElement("tr");
      tr.dataset.inventoryId = String(item.id);

      if (isRowSelected(selectedInventoryIds, item.id)) {
        tr.classList.add("selected");
      }

      if (inventorySelectionMode) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectionCell selectColumnCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = isRowSelected(selectedInventoryIds, item.id);

        checkbox.addEventListener("click", event => {
          event.stopPropagation();
        });

        checkbox.addEventListener("change", event => {
          toggleRowSelection(selectedInventoryIds, item.id, event.target.checked);
          renderInventoryGrid();
        });

        selectTd.appendChild(checkbox);
        tr.appendChild(selectTd);
      }

      visibleColumns.forEach(column => {
        const td = document.createElement("td");
        td.textContent = getFormattedCellValue(item, column);
        tr.appendChild(td);
      });

      tr.addEventListener("click", async event => {
        if (event.target.closest("input, button, a, select, textarea")) return;

        if (inventorySelectionMode) {
          toggleRowSelection(selectedInventoryIds, item.id);
          renderInventoryGrid();
          return;
        }

        await openInventoryProfile(item.id);
      });

      tbody.appendChild(tr);
    });

    setGridResultCount(dom.inventoryResultCount, data.length, "records");
    refreshInventorySelectionUi();
  }

  function clearColumnManagerMessage() {
    const msg = byId("columnManagerMessage");
    if (msg) msg.remove();
  }

  function showColumnManagerMessage(message, type = "error") {
    const existing = byId("columnManagerMessage");

    if (existing) {
      existing.textContent = message;
      existing.className = `columnManagerMessage ${type}`;
      return;
    }

    if (!dom.columnManagerList) return;

    const msg = document.createElement("div");
    msg.id = "columnManagerMessage";
    msg.className = `columnManagerMessage ${type}`;
    msg.textContent = message;

    dom.columnManagerList.appendChild(msg);
  }

  function sanitizeCustomColumnKey(label) {
    return String(label || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  async function addInventoryCustomColumn() {
    const rawLabel = dom.newCustomColumnInput?.value || "";
    const label = rawLabel.trim();

    if (!label) {
      await showMessageModal("Custom Column", "Enter a name for the new column.");
      return;
    }

    const keyBase = sanitizeCustomColumnKey(label);

    if (!keyBase) {
      await showMessageModal("Custom Column", "Enter a valid column name.");
      return;
    }

    const existingLabels = new Set(
      inventoryColumns.map(col => String(col.label || "").trim().toLowerCase())
    );

    if (existingLabels.has(label.toLowerCase())) {
      await showMessageModal("Custom Column", "A column with that name already exists.");
      return;
    }

    let key = keyBase;
    let counter = 2;
    const existingKeys = new Set(inventoryColumns.map(col => col.key));

    while (existingKeys.has(key)) {
      key = `${keyBase}_${counter}`;
      counter += 1;
    }

    inventoryColumns.push({
      key,
      label,
      visible: true,
      sortable: true,
      filterType: "text",
      custom: true
    });

    inventory = inventory.map(item => ({
      ...item,
      [key]: item[key] ?? ""
    }));

    if (dom.newCustomColumnInput) {
      dom.newCustomColumnInput.value = "";
    }

    persistGrid();
    renderColumnManager();
    renderInventoryGrid();

    await showMessageModal("Custom Column Added", `"${label}" was added.`);
  }

  function renderColumnManager() {
    if (!dom.columnManagerList) return;

    dom.columnManagerList.innerHTML = "";
    clearColumnManagerMessage();

    inventoryColumns.forEach(col => {
      const row = document.createElement("div");
      row.className = "columnManagerRow";

      const left = document.createElement("label");
      left.className = "columnManagerCheck";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!col.visible;

      checkbox.addEventListener("change", () => {
        col.visible = checkbox.checked;

        const visibleCount = inventoryColumns.filter(c => c.visible).length;

        if (visibleCount === 0) {
          col.visible = true;
          checkbox.checked = true;
          showColumnManagerMessage("At least one column must remain visible.");
          return;
        }

        clearColumnManagerMessage();
        persistGrid();
        renderInventoryGrid();
      });

      const text = document.createElement("span");
      text.textContent = col.label;

      left.appendChild(checkbox);
      left.appendChild(text);
      row.appendChild(left);

      dom.columnManagerList.appendChild(row);
    });
  }

  function openColumnManager() {
    renderColumnManager();

    if (dom.columnManagerPanel) {
      dom.columnManagerPanel.classList.add("show");
    }
  }

  function closeColumnManager() {
    if (dom.columnManagerPanel) {
      dom.columnManagerPanel.classList.remove("show");
    }
  }

  function renderHistoryTable(table, entries, columns) {
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!entries.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");

      td.colSpan = columns.length;
      td.className = "emptyStateCell";
      td.textContent = "No history available.";

      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    entries.forEach(entry => {
      const tr = document.createElement("tr");

      columns.forEach(column => {
        const td = document.createElement("td");
        td.textContent = column.format(entry);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  function fillInventoryProfile(item) {
    if (!item) return;

    if (dom.inventoryProfileTitle) {
      dom.inventoryProfileTitle.textContent = item.name || "Inventory Profile";
    }

    if (dom.inventoryProfileSubtitle) {
      dom.inventoryProfileSubtitle.textContent =
        [item.partNumber, item.location].filter(Boolean).join(" • ");
    }

    if (dom.profileInvName) dom.profileInvName.textContent = item.name || "—";
    if (dom.profileInvPartNumber) dom.profileInvPartNumber.textContent = item.partNumber || "—";
    if (dom.profileInvCategory) dom.profileInvCategory.textContent = item.category || "—";
    if (dom.profileInvQuantity) dom.profileInvQuantity.textContent = String(item.quantity ?? 0);
    if (dom.profileInvUnitCost) dom.profileInvUnitCost.textContent = formatCurrency(item.unitCost);
    if (dom.profileInvLocation) dom.profileInvLocation.textContent = item.location || "—";
    if (dom.profileInvVendor) dom.profileInvVendor.textContent = item.vendor || "—";
    if (dom.profileInvReorderPoint) dom.profileInvReorderPoint.textContent = String(item.reorderPoint ?? 0);
    if (dom.profileInvReorderQty) dom.profileInvReorderQty.textContent = String(item.reorderQuantity ?? 0);
    if (dom.profileInvMaxQty) dom.profileInvMaxQty.textContent = String(item.maximumQuantity ?? 0);
    if (dom.profileInvBinLocation) dom.profileInvBinLocation.textContent = item.binLocation || "—";
    if (dom.profileInvManufacturer) dom.profileInvManufacturer.textContent = item.manufacturer || "—";
    if (dom.profileInvPartType) dom.profileInvPartType.textContent = item.partType || "—";
    if (dom.profileInvUom) dom.profileInvUom.textContent = item.uom || "EA";
    if (dom.profileInvNotes) dom.profileInvNotes.textContent = item.notes || "—";
    if (dom.profileInvProfileNotes) dom.profileInvProfileNotes.textContent = item.profileNotes || "—";
    if (dom.profileInvLastPurchased) dom.profileInvLastPurchased.textContent = formatDateTime(item.lastPurchasedAt);
    if (dom.profileInvLastIssued) dom.profileInvLastIssued.textContent = formatDateTime(item.lastIssuedAt);

    renderHistoryTable(
      dom.inventoryPurchaseHistoryTable,
      sortHistoryByDateDesc(item.purchaseHistory || []),
      [
        { format: entry => formatDateTime(entry.date) },
        { format: entry => String(entry.quantity ?? 0) },
        { format: entry => formatCurrency(entry.unitCost ?? 0) },
        { format: entry => entry.vendor || "—" },
        { format: entry => entry.referenceNumber || "—" },
        { format: entry => entry.notes || "—" }
      ]
    );

    renderHistoryTable(
      dom.inventoryIssueHistoryTable,
      sortHistoryByDateDesc(item.issueHistory || []),
      [
        { format: entry => formatDateTime(entry.date) },
        { format: entry => String(entry.quantity ?? 0) },
        { format: entry => entry.referenceNumber || "—" },
        { format: entry => entry.referenceType || "—" },
        { format: entry => entry.user || "—" },
        { format: entry => entry.notes || "—" }
      ]
    );

    renderHistoryTable(
      dom.inventoryAdjustmentHistoryTable,
      sortHistoryByDateDesc(item.qtyAdjustmentHistory || []),
      [
        { format: entry => formatDateTime(entry.date) },
        { format: entry => entry.type || "—" },
        { format: entry => String(entry.previousQuantity ?? 0) },
        { format: entry => String(entry.newQuantity ?? 0) },
        { format: entry => entry.user || "—" },
        { format: entry => entry.notes || "—" }
      ]
    );

    applyInventoryPermissionUi();
  }

  async function openInventoryProfile(itemId) {
    if (!(await requirePermission(
      canViewInventory,
      "Permission Required",
      "You do not have permission to view inventory."
    ))) {
      return;
    }

    const item = getInventoryById(itemId);
    if (!item || !dom.inventoryProfilePanel) return;

    viewingInventoryId = String(item.id);
    clearInventoryAdjustmentForm();
    fillInventoryProfile(item);
    dom.inventoryProfilePanel.classList.add("show");
    applyInventoryPermissionUi();
  }

  async function openInventoryForm(itemId = null) {
    if (!(await requirePermission(
      canEditInventory,
      "Permission Required",
      "You do not have permission to edit inventory."
    ))) {
      return;
    }

    if (!dom.inventoryFormPanel) return;

    closeAllRightPanels();
    dom.inventoryFormPanel.classList.add("show");

    if (itemId != null) {
      const item = getInventoryById(itemId);
      if (!item) return;

      editingInventoryId = String(item.id);

      if (dom.inventoryFormTitle) dom.inventoryFormTitle.textContent = "Edit Inventory Item";
      if (dom.invName) dom.invName.value = item.name || "";
      if (dom.invPartNumber) dom.invPartNumber.value = item.partNumber || "";
      if (dom.invCategory) dom.invCategory.value = item.category || "";
      if (dom.invQuantity) dom.invQuantity.value = item.quantity ?? "";
      if (dom.invUnitCost) dom.invUnitCost.value = item.unitCost ?? "";
      if (dom.invLocation) dom.invLocation.value = item.location || "";
      if (dom.invVendor) dom.invVendor.value = item.vendor || "";
      if (dom.invReorderPoint) dom.invReorderPoint.value = item.reorderPoint ?? "";
      if (dom.invReorderQty) dom.invReorderQty.value = item.reorderQuantity ?? "";
      if (dom.invMaxQty) dom.invMaxQty.value = item.maximumQuantity ?? "";
      if (dom.invBinLocation) dom.invBinLocation.value = item.binLocation || "";
      if (dom.invManufacturer) dom.invManufacturer.value = item.manufacturer || "";
      if (dom.invPartType) dom.invPartType.value = item.partType || "";
      if (dom.invUom) dom.invUom.value = item.uom || "EA";
      if (dom.invNotes) dom.invNotes.value = item.notes || "";
      if (dom.invProfileNotes) dom.invProfileNotes.value = item.profileNotes || "";

      toggleInventoryButtons("edit");
    } else {
      editingInventoryId = null;

      if (dom.inventoryFormTitle) dom.inventoryFormTitle.textContent = "Inventory Item";

      clearInventoryForm();
      toggleInventoryButtons("save");
    }

    applyInventoryPermissionUi();
  }

  async function openInventoryEditFromProfile() {
    if (viewingInventoryId == null) return;

    const idToEdit = viewingInventoryId;
    closeInventoryProfilePanel();
    await openInventoryForm(idToEdit);
  }

  async function saveInventoryRecord() {
    if (!(await requirePermission(
      canEditInventory,
      "Permission Required",
      "You do not have permission to add inventory."
    ))) {
      return;
    }

    const record = buildInventoryRecord(null, {
      createdAt: new Date().toISOString(),
      purchaseHistory: [],
      issueHistory: [],
      qtyAdjustmentHistory: []
    });

    if (!normalizeText(record.name)) {
      await showMessageModal("Missing Item Name", "Please enter an item name.");
      return;
    }

    if (isDuplicateInventoryRecord(record)) {
      await showMessageModal(
        "Duplicate Inventory Item",
        "That inventory item already exists for this location."
      );
      return;
    }

    inventory.push(record);
    await persistInventory();

    renderInventoryGrid();
    closeInventoryPanel();
  }

  async function updateInventoryRecord() {
    if (!(await requirePermission(
      canEditInventory,
      "Permission Required",
      "You do not have permission to edit inventory."
    ))) {
      return;
    }

    if (editingInventoryId == null) return;

    const index = inventory.findIndex(
      entry => String(entry.id) === String(editingInventoryId)
    );

    if (index === -1) return;

    const existing = getInventoryById(editingInventoryId);
    const record = buildInventoryRecord(existing?.id, existing);

    if (!normalizeText(record.name)) {
      await showMessageModal("Missing Item Name", "Please enter an item name.");
      return;
    }

    if (isDuplicateInventoryRecord(record, existing?.id)) {
      await showMessageModal(
        "Duplicate Inventory Item",
        "That inventory item already exists for this location."
      );
      return;
    }

    inventory[index] = record;
    await persistInventory();

    renderInventoryGrid();
    closeInventoryPanel();

    if (viewingInventoryId === String(record.id)) {
      fillInventoryProfile(record);
      dom.inventoryProfilePanel?.classList.add("show");
    }
  }

  async function deleteInventoryRecord() {
    if (!(await requirePermission(
      canDeleteInventory,
      "Permission Required",
      "You do not have permission to delete inventory."
    ))) {
      return;
    }

    if (editingInventoryId == null) return;

    const idToDelete = editingInventoryId;

    const confirmed = await showConfirmModal(
      "Delete Inventory Item",
      "Delete this inventory item?",
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    inventory = inventory.filter(entry => String(entry.id) !== String(idToDelete));
    selectedInventoryIds.delete(String(idToDelete));

    await persistInventory();

    renderInventoryGrid();
    closeInventoryPanel();

    if (viewingInventoryId === String(idToDelete)) {
      closeInventoryProfilePanel();
    }
  }

  async function saveQuickInventoryAdjustment() {
    if (!(await requirePermission(
      isAdminUser,
      "Permission Required",
      "Only an admin can perform a quick inventory quantity adjustment."
    ))) {
      return;
    }

    if (viewingInventoryId == null) return;

    const index = inventory.findIndex(item => String(item.id) === String(viewingInventoryId));
    if (index === -1) return;

    const item = getInventoryById(viewingInventoryId);
    if (!item) return;

    const adjustType = String(dom.inventoryAdjustType?.value || "set");
    const adjustQty = toNumber(dom.inventoryAdjustQty?.value, NaN);
    const reason = String(dom.inventoryAdjustReason?.value || "").trim();

    if (!Number.isFinite(adjustQty)) {
      await showMessageModal("Quick Adjustment", "Enter a valid quantity.");
      return;
    }

    let newQuantity = item.quantity;

    if (adjustType === "set") newQuantity = adjustQty;
    if (adjustType === "add") newQuantity = item.quantity + adjustQty;
    if (adjustType === "subtract") newQuantity = item.quantity - adjustQty;

    newQuantity = Math.max(0, toNumber(newQuantity, 0));

    const loggedInUser = getLoggedInUser();

    const updatedItem = normalizeInventoryRecord({
      ...item,
      quantity: newQuantity,
      updatedAt: new Date().toISOString(),
      qtyAdjustmentHistory: [
        normalizeHistoryEntry({
          id: makeId(),
          type: adjustType,
          date: new Date().toISOString(),
          quantity: adjustQty,
          previousQuantity: item.quantity,
          newQuantity,
          user: loggedInUser?.username || "",
          notes: reason || "Quick quantity adjustment",
          source: "admin_quick_adjustment"
        }, "adjustment"),
        ...(item.qtyAdjustmentHistory || [])
      ]
    });

    inventory[index] = updatedItem;

    await persistInventory();

    renderInventoryGrid();
    fillInventoryProfile(updatedItem);
    clearInventoryAdjustmentForm();
  }

  function refreshInventorySelectionUi() {
    const previewBarcodeBtn = byId("previewInventoryBarcodesBtn");

    if (dom.deleteSelectedInventoryBtn) {
      if (inventoryBarcodeSelectionMode) {
        dom.deleteSelectedInventoryBtn.style.display = "none";
      } else {
        dom.deleteSelectedInventoryBtn.style.display = canDeleteInventory() ? "" : "none";

        updateSelectionButtonText(
          dom.deleteSelectedInventoryBtn,
          inventorySelectionMode,
          selectedInventoryIds.size,
          "Delete Selected"
        );
      }
    }

    if (previewBarcodeBtn) {
      previewBarcodeBtn.style.display =
        inventoryBarcodeSelectionMode ? "inline-flex" : "none";

      previewBarcodeBtn.textContent =
        selectedInventoryIds.size > 0
          ? `Preview Barcodes (${selectedInventoryIds.size})`
          : "Preview Barcodes";
    }

    if (dom.cancelInventorySelectionBtn) {
      dom.cancelInventorySelectionBtn.style.display = inventorySelectionMode ? "" : "none";
    }
  }

  function enterInventorySelectionMode() {
    inventorySelectionMode = true;
    selectedInventoryIds = new Set();
    renderInventoryGrid();
  }

  function exitInventorySelectionMode(clear = true) {
    inventorySelectionMode = false;
    inventoryBarcodeSelectionMode = false;

    if (clear) {
      clearSelections(selectedInventoryIds);
    }

    renderInventoryGrid();
  }

  async function deleteSelectedInventory() {
    if (inventoryBarcodeSelectionMode) {
      await previewSelectedInventoryBarcodes();
      return;
    }

    if (!(await requirePermission(
      canDeleteInventory,
      "Permission Required",
      "You do not have permission to delete inventory."
    ))) {
      return;
    }

    if (!inventorySelectionMode) {
      enterInventorySelectionMode();
      return;
    }

    if (!selectedInventoryIds.size) {
      await showMessageModal(
        "Delete Selected",
        "Select one or more inventory items to delete."
      );
      return;
    }

    const confirmed = await showConfirmModal(
      "Delete Selected Inventory",
      `Delete ${selectedInventoryIds.size} selected inventory item${selectedInventoryIds.size === 1 ? "" : "s"}?`,
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    const idsToDelete = new Set([...selectedInventoryIds].map(String));

    inventory = inventory.filter(item => !idsToDelete.has(String(item.id)));

    if (viewingInventoryId != null && idsToDelete.has(String(viewingInventoryId))) {
      closeInventoryProfilePanel();
    }

    if (editingInventoryId != null && idsToDelete.has(String(editingInventoryId))) {
      closeInventoryPanel();
    }

    clearSelections(selectedInventoryIds);
    inventorySelectionMode = false;
    inventoryBarcodeSelectionMode = false;

    await persistInventory();

    renderInventoryGrid();
  }

  function clearInventoryFilters() {
    inventoryGridState.globalSearch = "";
    inventoryGridState.filters = {};
    inventoryGridState.headerMenuOpenFor = null;

    if (dom.inventoryGlobalSearch) {
      dom.inventoryGlobalSearch.value = "";
    }

    persistGrid();
    renderInventoryGrid();
  }

  function buildExportRows() {
    return getNormalizedInventory().map(item => ({
      id: item.id,
      partNumber: item.partNumber,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitCost: item.unitCost,
      location: item.location,
      vendor: item.vendor,
      reorderPoint: item.reorderPoint,
      reorderQuantity: item.reorderQuantity,
      maximumQuantity: item.maximumQuantity,
      binLocation: item.binLocation,
      manufacturer: item.manufacturer,
      partType: item.partType,
      uom: item.uom,
      notes: item.notes,
      profileNotes: item.profileNotes,
      lastPurchasedAt: item.lastPurchasedAt,
      lastIssuedAt: item.lastIssuedAt
    }));
  }

  function exportInventoryData() {
    const rows = buildExportRows();

    const fallbackHeaders = {
      id: "",
      partNumber: "",
      name: "",
      category: "",
      quantity: "",
      unitCost: "",
      location: "",
      vendor: "",
      reorderPoint: "",
      reorderQuantity: "",
      maximumQuantity: "",
      binLocation: "",
      manufacturer: "",
      partType: "",
      uom: "",
      notes: "",
      profileNotes: "",
      lastPurchasedAt: "",
      lastIssuedAt: ""
    };

    const headers = Object.keys(rows[0] || fallbackHeaders);

    const csv = [
      headers.join(","),
      ...rows.map(row =>
        headers
          .map(key => {
            const value = row[key] ?? "";
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      )
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `inventory-export-${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current);

    return values.map(value => value.trim());
  }

  async function readImportRows(file) {
    const extension = String(file.name || "").split(".").pop().toLowerCase();

    if (extension === "xlsx" || extension === "xls") {
      if (!window.XLSX) {
        throw new Error("XLSX library is not loaded.");
      }

      const arrayBuffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map(header =>
      header.trim().replace(/^"|"$/g, "")
    );

    return lines.slice(1).map(line => {
      const values = parseCsvLine(line);

      return headers.reduce((record, header, index) => {
        record[header] = values[index] ?? "";
        return record;
      }, {});
    });
  }

  function mapImportRecord(record = {}) {
  const normalizedKeys = Object.keys(record).reduce((acc, key) => {
    const normalizedKey = normalizeLower(key)
      .replace(/[#]/g, "number")
      .replace(/[^a-z0-9]+/g, "");

    acc[normalizedKey] = record[key];
    return acc;
  }, {});

  const get = (...keys) => {
    for (const key of keys) {
      const normalizedKey = normalizeLower(key)
        .replace(/[#]/g, "number")
        .replace(/[^a-z0-9]+/g, "");

      if (normalizedKey in normalizedKeys) {
        return normalizedKeys[normalizedKey];
      }
    }

    return "";
  };

  const importedUnitCost = get(
    "unitCost",
    "unit cost",
    "unit_cost",
    "cost",
    "price",
    "unit price",
    "unit_price",
    "price each",
    "each price",
    "cost each",
    "each cost",
    "unit cost each",
    "last cost",
    "last price",
    "purchase price",
    "purchase cost",
    "current cost",
    "current price",
    "avg cost",
    "average cost"
  );

  return normalizeInventoryRecord({
    id: get("id"),
    partNumber: get(
      "partNumber",
      "part #",
      "part no",
      "part number",
      "partnumber",
      "item number",
      "item #",
      "item no",
      "sku"
    ),
    name: get(
      "name",
      "itemName",
      "item name",
      "part name",
      "description",
      "item description",
      "part description"
    ),
    category: get("category", "type", "part type"),
    quantity: get("quantity", "qty", "on hand", "onhand", "stock", "stock qty"),
    unitCost: importedUnitCost,
    lastPurchasedCost: importedUnitCost,
    location: get("location", "warehouse", "stock location"),
    vendor: get("vendor", "supplier"),
    reorderPoint: get("reorderPoint", "reorder point", "min", "minimum", "minimum quantity", "min qty"),
    reorderQuantity: get("reorderQuantity", "reorder qty", "reorder quantity", "order qty", "order quantity"),
    maximumQuantity: get("maximumQuantity", "max qty", "maximum quantity", "max"),
    binLocation: get("binLocation", "bin location", "bin", "shelf"),
    manufacturer: get("manufacturer", "mfg", "brand"),
    partType: get("partType", "part type"),
    uom: get("uom", "unit", "unit of measure", "um"),
    notes: get("notes", "comment", "comments"),
    profileNotes: get("profileNotes", "profile notes"),
    lastPurchasedAt: get("lastPurchasedAt", "last purchased", "last purchase date"),
    lastIssuedAt: get("lastIssuedAt", "last issued", "last issue date"),
    createdAt: get("createdAt", "created at"),
    updatedAt: new Date().toISOString()
  });
}

  async function handleInventoryImport(event) {
    if (!(await requirePermission(
      canEditInventory,
      "Permission Required",
      "You do not have permission to import inventory."
    ))) {
      return;
    }

    const file = event.target?.files?.[0];
    if (!file) return;

    try {
      const rows = await readImportRows(file);

      if (!rows.length) {
        await showMessageModal(
          "Import Inventory",
          "The selected file does not contain any inventory rows."
        );
        return;
      }

      let importedCount = 0;
      let updatedCount = 0;

      rows.forEach(row => {
        const record = mapImportRecord(row);

        if (!normalizeText(record.name) && !normalizeText(record.partNumber)) {
          return;
        }

        const duplicateIndex = inventory.findIndex(item => {
          const normalized = normalizeInventoryRecord(item);
          return buildInventoryDuplicateKey(normalized) === buildInventoryDuplicateKey(record);
        });

        if (duplicateIndex >= 0) {
          inventory[duplicateIndex] = normalizeInventoryRecord({
            ...inventory[duplicateIndex],
            ...record,
            id: inventory[duplicateIndex].id,
            updatedAt: new Date().toISOString()
          });

          updatedCount += 1;
        } else {
          inventory.push(normalizeInventoryRecord({
            ...record,
            id: record.id || makeId(),
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }));

          importedCount += 1;
        }
      });

      await persistInventory();
      renderInventoryGrid();

      await showMessageModal(
        "Inventory Import Complete",
        `${importedCount} item${importedCount === 1 ? "" : "s"} added. ${updatedCount} item${updatedCount === 1 ? "" : "s"} updated.`
      );
    } catch (error) {
      console.error("Inventory import failed:", error);
      await showMessageModal("Import Inventory", "The inventory import could not be completed.");
    } finally {
      if (dom.inventoryImportInput) {
        dom.inventoryImportInput.value = "";
      }
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cleanBarcodeValue(value) {
    const clean = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\-.$/+% ]/g, "");

    return clean || "NO-PART";
  }

  function getBarcodeLabelSizeClass() {
    const size = byId("inventoryBarcodeLabelSize")?.value || "2x1";
    return `barcodeSize-${size}`;
  }

  function getSelectedBarcodeItems() {
    const selectedIds = new Set([...selectedInventoryIds].map(String));

    return getNormalizedInventory().filter(item =>
      selectedIds.has(String(item.id))
    );
  }

  function buildBarcodeLabelHtml(item) {
    const partName = String(item.name || item.itemName || "Unnamed Part").trim();
    const partNumber = String(item.partNumber || "NO-PART").trim();
    const location = String(item.location || "No Location").trim();
    const price = formatCurrency(item.unitCost || 0);
    const barcodeValue = cleanBarcodeValue(partNumber);

    return `
      <div class="inventoryBarcodeLabel">
        <div class="barcodeLabelTop">
          <div class="barcodePartName">${escapeHtml(partName)}</div>
          <div class="barcodePrice">${escapeHtml(price)}</div>
        </div>

        <div class="barcodeMetaRow">
          <span>Part #</span>
          <strong>${escapeHtml(partNumber)}</strong>
        </div>

        <div class="barcodeMetaRow">
          <span>Location</span>
          <strong>${escapeHtml(location)}</strong>
        </div>

        <div class="barcodeImageWrap">
          <svg
            class="barcodeSvg"
            data-barcode-value="${escapeHtml(barcodeValue)}"
            aria-label="${escapeHtml(barcodeValue)}"
          ></svg>
        </div>

        <div class="barcodeHumanText">${escapeHtml(barcodeValue)}</div>
      </div>
    `;
  }

  function generateBarcodeSvgs() {
    const barcodeType = byId("inventoryBarcodeType")?.value || "CODE128";

    const barcodeSvgs = document.querySelectorAll(
      "#inventoryBarcodePreview .barcodeSvg"
    );

    barcodeSvgs.forEach(svg => {
      const value = cleanBarcodeValue(svg.dataset.barcodeValue || "");

      if (window.JsBarcode) {
        try {
          window.JsBarcode(svg, value, {
            format: barcodeType,
            displayValue: false,
            margin: 0,
            width: 1.4,
            height: 36
          });
        } catch (error) {
          console.warn("Failed to render JsBarcode. Falling back to text barcode.", error);
          svg.outerHTML = `<div class="barcodeFallback">${escapeHtml(value)}</div>`;
        }
      } else {
        svg.outerHTML = `<div class="barcodeFallback">${escapeHtml(value)}</div>`;
      }
    });
  }

  function renderInventoryBarcodePreview() {
    const preview = byId("inventoryBarcodePreview");
    if (!preview) return;

    const items = getSelectedBarcodeItems();
    const copies = Math.max(1, Number(byId("inventoryBarcodeCopiesInput")?.value || 1));
    const sizeClass = getBarcodeLabelSizeClass();

    preview.className = `barcodePreviewSheet ${sizeClass}`;
    preview.innerHTML = "";

    if (!items.length) {
      preview.innerHTML = `
        <div class="emptyBarcodePreview">
          Select one or more inventory items to preview barcodes.
        </div>
      `;
      return;
    }

    items.forEach(item => {
      for (let copy = 0; copy < copies; copy += 1) {
        const wrapper = document.createElement("div");
        wrapper.className = "barcodePreviewItem";
        wrapper.innerHTML = buildBarcodeLabelHtml(item);
        preview.appendChild(wrapper);
      }
    });

    generateBarcodeSvgs();
  }

  function openInventoryBarcodePreview() {
    const modal = byId("inventoryBarcodeModal");

    if (!modal) {
      console.warn("Missing #inventoryBarcodeModal in index.html");
      showMessageModal(
        "Barcode Preview",
        "The barcode preview modal is missing from index.html."
      );
      return;
    }

    renderInventoryBarcodePreview();
    modal.classList.add("show");
  }

  function closeInventoryBarcodePreview() {
    byId("inventoryBarcodeModal")?.classList.remove("show");
  }

  async function startInventoryBarcodeSelection() {
    inventoryBarcodeSelectionMode = true;
    inventorySelectionMode = true;
    selectedInventoryIds = new Set();

    renderInventoryGrid();

    await showMessageModal(
      "Print Barcodes",
      "Select the inventory items you want to print barcode labels for, then click Preview Barcodes."
    );
  }

  async function previewSelectedInventoryBarcodes() {
    if (!selectedInventoryIds.size) {
      await showMessageModal(
        "Barcode Preview",
        "Select one or more inventory items first."
      );
      return;
    }

    openInventoryBarcodePreview();
  }

  let inventoryBarcodePrintInProgress = false;

function getBarcodePrintSize() {
  const size = byId("inventoryBarcodeLabelSize")?.value || "2x1";

  if (size === "3x1") {
    return {
      width: "3in",
      height: "1in",
      labelClass: "barcodeSize-3x1"
    };
  }

  if (size === "4x2") {
    return {
      width: "4in",
      height: "2in",
      labelClass: "barcodeSize-4x2"
    };
  }

  return {
    width: "2in",
    height: "1in",
    labelClass: "barcodeSize-2x1"
  };
}

function printInventoryBarcodePreview() {
  const items = getSelectedBarcodeItems();

  if (!items.length) {
    showMessageModal("Print Barcodes", "Select one or more inventory items first.");
    return;
  }

  if (inventoryBarcodePrintInProgress) {
    return;
  }

  inventoryBarcodePrintInProgress = true;

  renderInventoryBarcodePreview();

  const preview = byId("inventoryBarcodePreview");
  const copies = Math.max(1, Number(byId("inventoryBarcodeCopiesInput")?.value || 1));
  const expectedLabelCount = items.length * copies;
  const { width, height, labelClass } = getBarcodePrintSize();

  if (!preview) {
    inventoryBarcodePrintInProgress = false;
    return;
  }

  const previewItems = Array.from(preview.querySelectorAll(".barcodePreviewItem"));

  if (previewItems.length !== expectedLabelCount) {
    inventoryBarcodePrintInProgress = false;
    showMessageModal(
      "Barcode Count Error",
      `Expected ${expectedLabelCount} label${expectedLabelCount === 1 ? "" : "s"}, but the preview contains ${previewItems.length}. Refresh the preview and try again.`
    );
    return;
  }

  const labelsHtml = previewItems
    .slice(0, expectedLabelCount)
    .map(item => item.outerHTML)
    .join("");

  const printWindow = window.open("", "_blank", "width=500,height=500");

  if (!printWindow) {
    inventoryBarcodePrintInProgress = false;
    showMessageModal(
      "Print Barcodes",
      "The barcode print window was blocked. Allow popups for this app and try again."
    );
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Inventory Barcodes</title>
        <style>
          @page {
            size: ${width} ${height};
            margin: 0;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            width: ${width};
            background: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
          }

          * {
            box-sizing: border-box;
          }

          .barcodePreviewSheet {
            display: block;
            margin: 0;
            padding: 0;
            width: ${width};
            background: #ffffff;
          }

          .barcodePreviewItem {
            width: ${width};
            height: ${height};
            margin: 0;
            padding: 0;
            display: block;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            background: #ffffff;
            border: none;
            box-shadow: none;
          }

          .barcodePreviewItem:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .inventoryBarcodeLabel {
            width: 100%;
            height: 100%;
            padding: 0.075in;
            color: #000000;
            background: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          .barcodeLabelTop {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            align-items: flex-start;
          }

          .barcodePartName {
            font-size: 8pt;
            font-weight: 900;
            line-height: 1.05;
            max-height: 18pt;
            overflow: hidden;
            color: #000000;
          }

          .barcodePrice {
            font-size: 8pt;
            font-weight: 900;
            white-space: nowrap;
            color: #000000;
          }

          .barcodeMetaRow {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            font-size: 6.5pt;
            line-height: 1.1;
            color: #000000;
          }

          .barcodeMetaRow span {
            font-weight: 700;
          }

          .barcodeMetaRow strong {
            font-weight: 900;
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .barcodeImageWrap {
            height: 0.32in;
            width: 100%;
            overflow: hidden;
          }

          .barcodeSvg {
            width: 100%;
            height: 100%;
            display: block;
          }

          .barcodeHumanText {
            font-size: 7pt;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-align: center;
            line-height: 1;
            color: #000000;
          }

          .barcodeSize-3x1 .barcodePartName {
            font-size: 9pt;
          }

          .barcodeSize-3x1 .barcodePrice {
            font-size: 9pt;
          }

          .barcodeSize-3x1 .barcodeMetaRow {
            font-size: 7pt;
          }

          .barcodeSize-3x1 .barcodeImageWrap {
            height: 0.34in;
          }

          .barcodeSize-3x1 .barcodeHumanText {
            font-size: 7.5pt;
          }

          .barcodeSize-4x2 .inventoryBarcodeLabel {
            padding: 0.12in;
          }

          .barcodeSize-4x2 .barcodePartName {
            font-size: 13pt;
            max-height: 30pt;
          }

          .barcodeSize-4x2 .barcodePrice {
            font-size: 12pt;
          }

          .barcodeSize-4x2 .barcodeMetaRow {
            font-size: 10pt;
          }

          .barcodeSize-4x2 .barcodeImageWrap {
            height: 0.65in;
          }

          .barcodeSize-4x2 .barcodeHumanText {
            font-size: 11pt;
          }
        </style>
      </head>

      <body>
        <div class="barcodePreviewSheet ${labelClass}">
          ${labelsHtml}
        </div>

        <script>
          let didPrint = false;

          window.onload = function () {
            setTimeout(function () {
              if (didPrint) return;
              didPrint = true;
              window.print();
            }, 300);
          };

          window.onafterprint = function () {
            setTimeout(function () {
              window.close();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();

  setTimeout(() => {
    inventoryBarcodePrintInProgress = false;
  }, 5000);
}

function ensureInventoryImportControls() {
  const dropdown = byId("inventoryOptionsDropdown");

  if (!dropdown) {
    console.warn("Missing #inventoryOptionsDropdown");
    return;
  }

  let importBtn = byId("importInventoryBtn");

  if (!importBtn) {
    importBtn = document.createElement("button");
    importBtn.id = "importInventoryBtn";
    importBtn.type = "button";
    importBtn.textContent = "Import";

    const exportBtn = byId("exportInventoryBtn");

    if (exportBtn && exportBtn.parentElement === dropdown) {
      dropdown.insertBefore(importBtn, exportBtn);
    } else {
      dropdown.appendChild(importBtn);
    }
  }

  let importInput = byId("inventoryImportInput");

  if (!importInput) {
    importInput = document.createElement("input");
    importInput.id = "inventoryImportInput";
    importInput.type = "file";
    importInput.accept = ".csv,.xlsx,.xls";
    importInput.style.display = "none";

    document.body.appendChild(importInput);
  }

  dom.importInventoryBtn = importBtn;
  dom.inventoryImportInput = importInput;
}

async function refreshInventoryFromRemote() {
  try {
    await hydrateInventory();

    selectedInventoryIds = new Set(
      [...selectedInventoryIds].filter(id =>
        inventory.some(item => String(item.id) === String(id))
      )
    );

    if (editingInventoryId != null) {
      const stillExists = inventory.some(
        item => String(item.id) === String(editingInventoryId)
      );

      if (!stillExists) {
        closeInventoryPanel();
      }
    }

    if (viewingInventoryId != null) {
      const item = getInventoryById(viewingInventoryId);

      if (!item) {
        closeInventoryProfilePanel();
      } else if (dom.inventoryProfilePanel?.classList.contains("show")) {
        fillInventoryProfile(item);
      }
    }

    renderInventoryGrid();
    applyInventoryPermissionUi();
  } catch (error) {
    console.error("Inventory remote refresh failed:", error);
  }
}

  function bindEventsOnce() {
    if (eventsBound) return;
    eventsBound = true;

    if (dom.openInventoryFormBtn) {
      dom.openInventoryFormBtn.addEventListener("click", () => openInventoryForm());
    }

    if (dom.saveInventoryBtn) {
      dom.saveInventoryBtn.addEventListener("click", () => {
        saveInventoryRecord();
      });
    }

    if (dom.updateInventoryBtn) {
      dom.updateInventoryBtn.addEventListener("click", () => {
        updateInventoryRecord();
      });
    }

    if (dom.deleteInventoryBtn) {
      dom.deleteInventoryBtn.addEventListener("click", () => {
        deleteInventoryRecord();
      });
    }

    if (dom.closeInventoryBtn) {
      dom.closeInventoryBtn.addEventListener("click", closeInventoryPanel);
    }

    if (dom.closeInventoryProfileBtn) {
      dom.closeInventoryProfileBtn.addEventListener("click", closeInventoryProfilePanel);
    }

    if (dom.inventoryProfilePanel) {
      dom.inventoryProfilePanel.addEventListener("click", event => {
        if (event.target === dom.inventoryProfilePanel) {
          closeInventoryProfilePanel();
        }
      });
    }

    if (dom.editInventoryProfileBtn) {
      dom.editInventoryProfileBtn.addEventListener("click", () => {
        openInventoryEditFromProfile();
      });
    }

    if (dom.saveInventoryAdjustmentBtn) {
      dom.saveInventoryAdjustmentBtn.addEventListener("click", () => {
        saveQuickInventoryAdjustment();
      });
    }

    if (dom.inventoryOptionsBtn) {
      dom.inventoryOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.inventoryOptionsDropdown?.classList.toggle("show");
      });
    }

    if (dom.manageInventoryColumnsBtn) {
      dom.manageInventoryColumnsBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();
        openColumnManager();
      });
    }

    if (dom.clearInventoryFiltersBtn) {
      dom.clearInventoryFiltersBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();
        clearInventoryFilters();
      });
    }

    const printInventoryBarcodesBtn = byId("printInventoryBarcodesBtn");
    if (printInventoryBarcodesBtn) {
      printInventoryBarcodesBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();

        if (inventoryBarcodeSelectionMode && selectedInventoryIds.size > 0) {
          openInventoryBarcodePreview();
          return;
        }

        startInventoryBarcodeSelection();
      });
    }

    const previewInventoryBarcodesBtn = byId("previewInventoryBarcodesBtn");
    if (previewInventoryBarcodesBtn) {
      previewInventoryBarcodesBtn.addEventListener("click", () => {
        previewSelectedInventoryBarcodes();
      });
    }

    const closeInventoryBarcodeModalBtn = byId("closeInventoryBarcodeModalBtn");
    if (closeInventoryBarcodeModalBtn) {
      closeInventoryBarcodeModalBtn.addEventListener("click", closeInventoryBarcodePreview);
    }

    const refreshInventoryBarcodePreviewBtn = byId("refreshInventoryBarcodePreviewBtn");
    if (refreshInventoryBarcodePreviewBtn) {
      refreshInventoryBarcodePreviewBtn.addEventListener("click", renderInventoryBarcodePreview);
    }

    const printInventoryBarcodePreviewBtn = byId("printInventoryBarcodePreviewBtn");
    if (printInventoryBarcodePreviewBtn) {
      printInventoryBarcodePreviewBtn.addEventListener("click", printInventoryBarcodePreview);
    }

    const inventoryBarcodeCopiesInput = byId("inventoryBarcodeCopiesInput");
    if (inventoryBarcodeCopiesInput) {
      inventoryBarcodeCopiesInput.addEventListener("input", renderInventoryBarcodePreview);
    }

    const inventoryBarcodeLabelSize = byId("inventoryBarcodeLabelSize");
    if (inventoryBarcodeLabelSize) {
      inventoryBarcodeLabelSize.addEventListener("change", renderInventoryBarcodePreview);
    }

    const inventoryBarcodeType = byId("inventoryBarcodeType");
    if (inventoryBarcodeType) {
      inventoryBarcodeType.addEventListener("change", renderInventoryBarcodePreview);
    }

    const inventoryBarcodeModal = byId("inventoryBarcodeModal");
    if (inventoryBarcodeModal) {
      inventoryBarcodeModal.addEventListener("click", event => {
        if (event.target === inventoryBarcodeModal) {
          closeInventoryBarcodePreview();
        }
      });
    }

    if (dom.importInventoryBtn) {
  dom.importInventoryBtn.addEventListener("click", async () => {
    closeInventoryOptionsDropdown();

    if (!canEditInventory() && !isAdminUser()) {
      await showMessageModal(
        "Permission Required",
        "You do not have permission to import inventory."
      );
      return;
    }

    dom.inventoryImportInput?.click();
  });
}

    if (dom.exportInventoryBtn) {
      dom.exportInventoryBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();
        exportInventoryData();
      });
    }

    if (dom.inventoryImportInput) {
      dom.inventoryImportInput.addEventListener("change", handleInventoryImport);
    }

    if (dom.deleteSelectedInventoryBtn) {
      dom.deleteSelectedInventoryBtn.addEventListener("click", () => {
        deleteSelectedInventory();
      });
    }

    if (dom.cancelInventorySelectionBtn) {
      dom.cancelInventorySelectionBtn.addEventListener("click", () => {
        exitInventorySelectionMode(true);
      });
    }

    if (dom.inventoryGlobalSearch) {
      dom.inventoryGlobalSearch.addEventListener("input", event => {
        inventoryGridState.globalSearch = String(event.target.value || "");
        persistGrid();
        renderInventoryGrid();
      });
    }

    if (dom.closeColumnManagerBtn) {
      dom.closeColumnManagerBtn.addEventListener("click", closeColumnManager);
    }

    if (dom.addCustomColumnBtn) {
      dom.addCustomColumnBtn.addEventListener("click", () => {
        addInventoryCustomColumn();
      });
    }

    if (dom.newCustomColumnInput) {
      dom.newCustomColumnInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          addInventoryCustomColumn();
        }
      });
    }

    document.addEventListener("click", event => {
      if (
        dom.inventoryOptionsDropdown &&
        dom.inventoryOptionsBtn &&
        !dom.inventoryOptionsDropdown.contains(event.target) &&
        !dom.inventoryOptionsBtn.contains(event.target)
      ) {
        closeInventoryOptionsDropdown();
      }
    });

    window.addEventListener("fleet:inventory-changed", () => {
      refreshInventoryFromRemote();
    });

    window.addEventListener("storage", event => {
      if (event.key === "fleetLoggedInUser") {
        applyInventoryPermissionUi();
        renderInventoryGrid();
      }
    });
  }

  await hydrateInventory();

ensureInventoryImportControls();

if (dom.inventoryGlobalSearch) {
  dom.inventoryGlobalSearch.value = inventoryGridState.globalSearch || "";
}

bindEventsOnce();
renderInventoryGrid();
applyInventoryPermissionUi();

  return {
    refresh: refreshInventoryFromRemote,
    applyInventoryPermissionUi,
    renderInventoryTable: renderInventoryGrid,
    renderInventoryGrid,
    openInventoryForm,
    openInventoryProfile,
    openInventoryBarcodePreview
  };
}