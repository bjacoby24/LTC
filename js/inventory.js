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
  buildColumnFiltersGeneric,
  renderGridHeaderGeneric,
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
  let inventoryFilterUiMode = "header";

  let appModalResolver = null;
  let appModalLastFocus = null;
  let eventsBound = false;

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
      inventoryView: true,
      inventoryEdit: true,
      inventoryDelete: false,
      ...permissions
    };
  }

  function isAdminUser() {
    const loggedInUser = getLoggedInUser();
    return normalizeLower(loggedInUser?.role) === "admin";
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

  async function requirePermission(checkFn, title, message) {
    if (typeof checkFn === "function" ? checkFn() : !!checkFn) return true;
    await showMessageModal(title, message);
    return false;
  }

  function applyInventoryPermissionUi() {
    if (dom.openInventoryFormBtn) {
      dom.openInventoryFormBtn.style.display = canEditInventory() ? "" : "none";
    }

    if (dom.deleteSelectedInventoryBtn) {
      dom.deleteSelectedInventoryBtn.style.display = canDeleteInventory() ? "" : "none";
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
      dom.importInventoryBtn.style.display = canEditInventory() ? "" : "none";
    }

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

  function suppressLiveReload(ms = 3000) {
    if (typeof window.suppressFleetLiveReload === "function") {
      window.suppressFleetLiveReload(ms);
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

  function toNumber(value, fallback = 0) {
    const num = Number(value);
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

      minimumQuantity: toNumber(
        item.minimumQuantity,
        toNumber(item.reorderPoint, 0)
      ),

      quickAdjustEnabled: item.quickAdjustEnabled !== false,

      profileNotes: String(item.profileNotes || item.notes || "").trim(),
      binLocation: String(item.binLocation || "").trim(),
      manufacturer: String(item.manufacturer || "").trim(),
      partType: String(item.partType || "").trim(),
      uom: String(item.uom || "EA").trim() || "EA",

      lastPurchasedAt: normalizeDateString(item.lastPurchasedAt || getLatestDateFromHistory(purchaseHistory)),
      lastIssuedAt: normalizeDateString(item.lastIssuedAt || getLatestDateFromHistory(issueHistory)),
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

  function buildInventoryRecord(existingId = null, existingItem = null) {
    const baseExisting = normalizeInventoryRecord(existingItem || {});

    const base = normalizeInventoryRecord({
      ...baseExisting,
      id: existingId ?? baseExisting.id ?? makeId(),
      name: dom.invName?.value || "",
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
      const sameRecord =
        excludeId != null && String(item.id) === String(excludeId);

      if (sameRecord) return false;

      return buildInventoryDuplicateKey(normalizeInventoryRecord(item)) === recordKey;
    });
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

    const actionRow = dom.columnManagerList.querySelector(".columnManagerActionRow");
    if (actionRow) {
      dom.columnManagerList.insertBefore(msg, actionRow);
    } else {
      dom.columnManagerList.appendChild(msg);
    }
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

    const modeWrap = document.createElement("div");
    modeWrap.className = "columnManagerModeRow";

    const modeLabel = document.createElement("div");
    modeLabel.className = "columnManagerModeTitle";
    modeLabel.textContent = "Filter UI Mode";

    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.textContent = "Top Filter Row";
    rowBtn.disabled = inventoryFilterUiMode === "row";
    rowBtn.addEventListener("click", () => {
      inventoryFilterUiMode = "row";
      renderInventoryGrid();
      renderColumnManager();
    });

    const headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.textContent = "Header Menus";
    headerBtn.disabled = inventoryFilterUiMode === "header";
    headerBtn.addEventListener("click", () => {
      inventoryFilterUiMode = "header";
      renderInventoryGrid();
      renderColumnManager();
    });

    modeWrap.appendChild(modeLabel);
    modeWrap.appendChild(rowBtn);
    modeWrap.appendChild(headerBtn);
    dom.columnManagerList.appendChild(modeWrap);
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
    closeInventoryProfilePanel();
    await openInventoryForm(viewingInventoryId);
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

    inventory = inventory.filter(
      entry => String(entry.id) !== String(editingInventoryId)
    );
    await persistInventory();
    renderInventoryGrid();
    closeInventoryPanel();

    if (viewingInventoryId === String(editingInventoryId)) {
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
    if (dom.deleteSelectedInventoryBtn) {
      updateSelectionButtonText(
        dom.deleteSelectedInventoryBtn,
        inventorySelectionMode,
        selectedInventoryIds.size,
        "Delete Selected"
      );
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

  function exitInventorySelectionMode(clearAll = false) {
    inventorySelectionMode = false;
    if (clearAll) {
      selectedInventoryIds = new Set();
    }
    renderInventoryGrid();
  }

  async function deleteSelectedInventory() {
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
      await showMessageModal("Delete Selected", "Select one or more inventory items first.");
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

    inventory = inventory.filter(item => !selectedInventoryIds.has(String(item.id)));
    await persistInventory();

    selectedInventoryIds = new Set();
    inventorySelectionMode = false;

    if (viewingInventoryId && !inventory.some(item => String(item.id) === String(viewingInventoryId))) {
      closeInventoryProfilePanel();
    }
    if (editingInventoryId && !inventory.some(item => String(item.id) === String(editingInventoryId))) {
      closeInventoryPanel();
    }

    renderInventoryGrid();
  }

  function clearInventoryFilters() {
    inventoryGridState = {
      ...inventoryGridState,
      globalSearch: "",
      filters: {},
      headerMenuOpenFor: null
    };

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
    const headers = Object.keys(rows[0] || {
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
    });

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
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        await showMessageModal("Import Inventory", "The selected file does not contain any inventory rows.");
        return;
      }

      const headers = lines[0]
        .split(",")
        .map(cell => cell.trim().replace(/^"|"$/g, ""));

      const parsedRecords = lines.slice(1).map(line => {
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

        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ?? "";
        });
        return normalizeInventoryRecord({
          ...row,
          quantity: row.quantity,
          unitCost: row.unitCost,
          reorderPoint: row.reorderPoint,
          reorderQuantity: row.reorderQuantity,
          maximumQuantity: row.maximumQuantity,
          createdAt: row.createdAt || new Date().toISOString(),
          purchaseHistory: [],
          issueHistory: [],
          qtyAdjustmentHistory: []
        });
      });

      let importedCount = 0;
      let updatedCount = 0;

      parsedRecords.forEach(record => {
        const duplicateIndex = inventory.findIndex(item =>
          buildInventoryDuplicateKey(normalizeInventoryRecord(item)) ===
          buildInventoryDuplicateKey(record)
        );

        if (duplicateIndex >= 0) {
          const existing = normalizeInventoryRecord(inventory[duplicateIndex]);
          inventory[duplicateIndex] = normalizeInventoryRecord({
            ...existing,
            ...record,
            id: existing.id,
            purchaseHistory: existing.purchaseHistory || [],
            issueHistory: existing.issueHistory || [],
            qtyAdjustmentHistory: existing.qtyAdjustmentHistory || [],
            createdAt: existing.createdAt || record.createdAt || new Date().toISOString(),
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

  function renderInventoryGrid() {
    if (!dom.inventoryTable) return;

    const table = dom.inventoryTable;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    if (!thead || !tbody) return;

    const visibleColumns = inventoryColumns.filter(col => col.visible);
    const data = getFilteredNormalizedInventory();

    thead.innerHTML = "";
    tbody.innerHTML = "";

    renderGridHeaderGeneric({
      tableHead: thead,
      columns: visibleColumns,
      gridState: inventoryGridState,
      onSort: ({ key, direction }) => {
        inventoryGridState.sortKey = key;
        inventoryGridState.sortDirection = direction;
        persistGrid();
        renderInventoryGrid();
      },
      onFilterChange: ({ key, value }) => {
        inventoryGridState.filters = {
          ...inventoryGridState.filters,
          [key]: value
        };
        persistGrid();
        renderInventoryGrid();
      },
      onHeaderMenuToggle: key => {
        inventoryGridState.headerMenuOpenFor =
          inventoryGridState.headerMenuOpenFor === key ? null : key;
        persistGrid();
        renderInventoryGrid();
      },
      buildColumnFilters: column =>
        buildColumnFiltersGeneric(
          getNormalizedInventory(),
          column,
          inventoryColumns,
          inventoryGridState
        ),
      filterUiMode: inventoryFilterUiMode,
      includeSelectionColumn: inventorySelectionMode
    });

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

      if (inventorySelectionMode) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectionCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isRowSelected(selectedInventoryIds, item.id);

        checkbox.addEventListener("click", event => {
          event.stopPropagation();
        });

        checkbox.addEventListener("change", event => {
          toggleRowSelection(selectedInventoryIds, item.id, event.target.checked);
          refreshInventorySelectionUi();
        });

        selectTd.appendChild(checkbox);
        tr.appendChild(selectTd);
      }

      visibleColumns.forEach(column => {
        const td = document.createElement("td");
        const rawValue = item[column.key];

        if (column.key === "unitCost") {
          td.textContent = formatCurrency(rawValue);
        } else if (column.key === "lastPurchasedAt" || column.key === "lastIssuedAt") {
          td.textContent = formatDate(rawValue);
        } else {
          td.textContent = normalizeCellValue(rawValue);
        }

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

  async function refreshInventoryFromRemote() {
    try {
      await hydrateInventory();

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

      selectedInventoryIds = new Set(
        [...selectedInventoryIds].filter(id =>
          inventory.some(item => String(item.id) === String(id))
        )
      );

      renderInventoryGrid();
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

    if (dom.importInventoryBtn) {
      dom.importInventoryBtn.addEventListener("click", async () => {
        closeInventoryOptionsDropdown();

        if (!(await requirePermission(
          canEditInventory,
          "Permission Required",
          "You do not have permission to import inventory."
        ))) {
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

  if (dom.inventoryGlobalSearch) {
    dom.inventoryGlobalSearch.value = inventoryGridState.globalSearch || "";
  }

  bindEventsOnce();
  renderInventoryGrid();

  return {
    refresh: refreshInventoryFromRemote,
    applyInventoryPermissionUi,
    renderInventoryTable: renderInventoryGrid,
    renderInventoryGrid,
    openInventoryForm,
    openInventoryProfile
  };
}