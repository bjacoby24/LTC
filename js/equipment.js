import { getDom } from "./dom.js";
import {
  byId,
  setText,
  getValue,
  normalizeText,
  normalizeLower,
  makeId,
  escapeHtml
} from "./utils.js";
import {
  loadEquipment,
  loadDeletedEquipment,
  saveEquipment,
  saveDeletedEquipment,
  loadEquipmentColumns,
  loadEquipmentGridState,
  saveEquipmentGridSettings,
  loadWorkOrders,
  loadSettings,
  getLoggedInUser
} from "./storage.js";
import {
  getFilteredGridData,
  buildColumnFiltersGeneric,
  renderGridHeaderGeneric,
  toggleRowSelection,
  clearSelections,
  updateSelectionButtonText
} from "./gridShared.js";
import {
  getEquipmentServiceSnapshot,
  ensureEquipmentServiceHistory,
  formatDateDisplay,
  parseDate,
  dateToYMD,
  buildServiceCompletionEntry,
  applyServiceCompletionToEquipment,
  getServiceSelectorOptions,
  getTemplateTaskForServiceCode
} from "./service-tracking.js";

export async function initEquipment() {
  const dom = getDom();

  let equipmentList = [];
  let deletedEquipment = [];
  let workOrdersCache = [];

  let settingsCache = {
    companyName: "",
    defaultLocation: "",
    theme: "default",
    serviceTasks: [],
    serviceTemplates: []
  };

  let editingId = null;
  let selectedEquipmentId = null;
  let selectedEquipmentIds = new Set();
  let profileEditMode = false;
let profileEditOriginalData = null;
  let equipmentSelectionMode = false;
  let equipmentFilterUiMode = "header";

  let appModalResolver = null;
  let appModalLastFocus = null;

  let activeServiceTrackingEquipmentId = null;
  let activeServiceTrackingCode = null;
  let eventsBound = false;

  const DEFAULT_EQUIPMENT_COLUMNS = [
    { key: "unit", label: "Unit", visible: true, sortable: true, filterType: "none", custom: false },
    { key: "type", label: "Type", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "status", label: "Status", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "location", label: "Location", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "year", label: "Year", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "vin", label: "VIN", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "plate", label: "Plate", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "state", label: "State/Prov", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "pm", label: "PM Template", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "business", label: "Assigned Business", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "manufacturer", label: "Manufacturer", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "bodyClass", label: "Body Class", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "driveType", label: "Drive Type", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "fuelType", label: "Fuel Type", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "engine", label: "Engine", visible: false, sortable: true, filterType: "text", custom: false }
  ];

  let equipmentColumns = loadEquipmentColumns(DEFAULT_EQUIPMENT_COLUMNS).map(col => {
    const normalized = { ...col, custom: !!col.custom };

    if (normalized.key === "unit") {
      return { ...normalized, filterType: "none" };
    }

    if (["type", "status", "location"].includes(normalized.key)) {
      return { ...normalized, filterType: "select" };
    }

    return normalized;
  });

  if (!Array.isArray(equipmentColumns) || !equipmentColumns.length) {
    equipmentColumns = DEFAULT_EQUIPMENT_COLUMNS.map(col => ({ ...col }));
  }

  if (!equipmentColumns.some(col => col.visible)) {
    equipmentColumns = DEFAULT_EQUIPMENT_COLUMNS.map(col => ({ ...col }));
  }

  let equipmentGridState = {
    sortKey: "unit",
    sortDirection: "asc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null,
    columnWidths: {},
    ...(loadEquipmentGridState() || {})
  };

  if (
    !equipmentGridState.columnWidths ||
    typeof equipmentGridState.columnWidths !== "object" ||
    Array.isArray(equipmentGridState.columnWidths)
  ) {
    equipmentGridState.columnWidths = {};
  }

  const validEquipmentColumnKeys = new Set(
    equipmentColumns.map(col => String(col.key || "").trim()).filter(Boolean)
  );

  equipmentGridState.filters = Object.fromEntries(
    Object.entries(equipmentGridState.filters || {}).filter(([key, value]) => {
      return validEquipmentColumnKeys.has(key) && normalizeText(value);
    })
  );

  if (equipmentGridState.filters?.unit) {
    delete equipmentGridState.filters.unit;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeCssEscape(value) {
    const text = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(text);
    }

    return text.replace(/["\\]/g, "\\$&");
  }

  function addDays(date, amount) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function getDueBucket(dueDate) {
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return "unknown";

    const today = parseDate(dateToYMD(new Date()));
    const due = parseDate(dateToYMD(dueDate));

    if (!today || !due) return "unknown";
    if (today > due) return "overdue";
    if (dateToYMD(today) === dateToYMD(due)) return "due";

    const dueSoonThreshold = addDays(due, -30);
    if (today >= dueSoonThreshold) return "dueIn30Days";

    return "ok";
  }

  function suppressLiveReload(ms = 3000) {
    if (typeof window.suppressFleetLiveReload === "function") {
      window.suppressFleetLiveReload(ms);
    }
  }

  function persistGrid() {
    saveEquipmentGridSettings(equipmentColumns, equipmentGridState);
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
      ...permissions,
      equipmentView: true,
      equipmentEdit: true,
      equipmentDelete: true,
      deletedEquipmentAccess: true
    };
  }

  function canEditEquipment() {
    return !!getCurrentPermissions().equipmentEdit;
  }

  function canDeleteEquipment() {
    return !!getCurrentPermissions().equipmentDelete;
  }

  async function requirePermission(checkFn, title, message) {
    if (checkFn()) return true;
    await showMessageModal(title, message);
    return false;
  }

  function applyEquipmentPermissionUi() {
    const permissions = getCurrentPermissions();

    if (dom.openFormBtn) dom.openFormBtn.style.display = permissions.equipmentEdit ? "" : "none";
    if (dom.editProfileBtn) dom.editProfileBtn.style.display = permissions.equipmentEdit && selectedEquipmentId != null ? "" : "none";
    if (dom.deleteSelectedEquipmentBtn) dom.deleteSelectedEquipmentBtn.style.display = permissions.equipmentDelete ? "" : "none";
    if (dom.openDeletedEquipmentBtn) dom.openDeletedEquipmentBtn.style.display = permissions.deletedEquipmentAccess ? "" : "none";
    if (dom.deleteBtn) dom.deleteBtn.style.display = permissions.equipmentDelete && editingId != null ? "" : "none";
    if (dom.saveBtn) dom.saveBtn.style.display = permissions.equipmentEdit && editingId == null ? "" : "none";
    if (dom.updateBtn) dom.updateBtn.style.display = permissions.equipmentEdit && editingId != null ? "" : "none";
    if (dom.importEquipmentBtn) dom.importEquipmentBtn.style.display = permissions.equipmentEdit ? "" : "none";
  }

  async function hydrateSharedData() {
    try {
      const [equipment, deleted, settings, workOrders] = await Promise.all([
        loadEquipment(),
        loadDeletedEquipment(),
        loadSettings(),
        loadWorkOrders()
      ]);

      equipmentList = safeArray(equipment);
      deletedEquipment = safeArray(deleted);

      settingsCache = {
        companyName: "",
        defaultLocation: "",
        theme: "default",
        serviceTasks: [],
        serviceTemplates: [],
        ...safeObject(settings),
        serviceTasks: safeArray(settings?.serviceTasks),
        serviceTemplates: safeArray(settings?.serviceTemplates)
      };

      workOrdersCache = safeArray(workOrders);
    } catch (error) {
      console.error("Failed to hydrate equipment shared data:", error);

      equipmentList = [];
      deletedEquipment = [];
      workOrdersCache = [];
      settingsCache = {
        companyName: "",
        defaultLocation: "",
        theme: "default",
        serviceTasks: [],
        serviceTemplates: []
      };
    }
  }

  async function refreshSettingsCache() {
    try {
      const settings = await loadSettings();

      settingsCache = {
        ...settingsCache,
        ...safeObject(settings),
        serviceTasks: safeArray(settings?.serviceTasks),
        serviceTemplates: safeArray(settings?.serviceTemplates)
      };
    } catch (error) {
      console.error("Failed to refresh settings cache:", error);
    }
  }

  async function refreshWorkOrdersCache() {
    try {
      workOrdersCache = safeArray(await loadWorkOrders());
    } catch (error) {
      console.error("Failed to refresh work orders cache:", error);
    }
  }

  async function persistEquipment() {
    suppressLiveReload(3000);
    await saveEquipment(equipmentList);
  }

  async function persistDeletedEquipment() {
    suppressLiveReload(3000);
    await saveDeletedEquipment(deletedEquipment);
  }

  function normalizeEquipmentRecord(eq = {}) {
    return {
      ...eq,
      id: String(eq.id || makeId()),
      unit: String(eq.unit || "").trim(),
      type: String(eq.type || "").trim(),
      year: String(eq.year || "").trim(),
      vin: String(eq.vin || "").trim(),
      plate: String(eq.plate || "").trim(),
      state: String(eq.state || "").trim(),
      status: String(eq.status || "").trim(),
      location: String(eq.location || "").trim(),
      pm: String(eq.pm || "").trim(),
      business: String(eq.business || "").trim(),
      rim: String(eq.rim || "").trim(),
      size: String(eq.size || "").trim(),
      pressure: String(eq.pressure || "").trim(),
      manufacturer: String(eq.manufacturer || "").trim(),
      bodyClass: String(eq.bodyClass || "").trim(),
      driveType: String(eq.driveType || "").trim(),
      fuelType: String(eq.fuelType || "").trim(),
      engine: String(eq.engine || "").trim(),
      serviceTracking: safeObject(eq.serviceTracking),
      serviceHistory: safeObject(eq.serviceHistory)
    };
  }

  function getNormalizedEquipment() {
    return equipmentList.map(normalizeEquipmentRecord);
  }

  function getFilteredNormalizedEquipment() {
    return getFilteredGridData(getNormalizedEquipment(), equipmentColumns, equipmentGridState);
  }

  function closeEquipmentOptionsDropdown() {
    dom.equipmentOptionsDropdown?.classList.remove("show");
  }

  function closePanel(panel) {
    if (!panel) return;
    panel.classList.remove("show");
    panel.style.display = "none";
  }

  function getEquipmentFormPanel() {
  return (
    dom.formPanel ||
    byId("formPanel") ||
    byId("equipmentFormPanel") ||
    document.querySelector("#equipmentFormPanel") ||
    document.querySelector("#formPanel")
  );
}

function openPanel(panel) {
  const targetPanel = panel || getEquipmentFormPanel();

  if (!targetPanel) {
    console.warn("Unable to open panel. Equipment form panel was not found.");
    return;
  }

  targetPanel.style.display = "flex";
  targetPanel.classList.add("show");
}

  function closeAllRightPanels() {
    [
      dom.formPanel,
      dom.inventoryFormPanel,
      dom.vendorFormPanel,
      dom.workOrderFormPanel,
      dom.poFormPanel,
      dom.settingsPanel,
      dom.servicesPanel
    ].forEach(closePanel);
  }

  function hideEquipmentProfileWithoutClearingSelection() {
    if (dom.equipmentProfileModal) {
      dom.equipmentProfileModal.classList.remove("show");
    }

    if (dom.equipmentProfileSection) {
      dom.equipmentProfileSection.classList.remove("show");
    }
  }

  function renderCustomFieldInputs(values = {}) {
    if (!dom.formPanel) return;

    const formButtons = dom.formPanel.querySelector(".formButtons");
    if (!formButtons) return;

    dom.formPanel.querySelectorAll(".dynamicCustomField").forEach(el => el.remove());

    equipmentColumns.filter(col => col.custom).forEach(col => {
      const wrap = document.createElement("div");
      wrap.className = "fieldGroup dynamicCustomField";

      const label = document.createElement("label");
      label.setAttribute("for", `customField_${col.key}`);
      label.textContent = col.label;

      const input = document.createElement("input");
      input.id = `customField_${col.key}`;
      input.type = "text";
      input.placeholder = col.label;
      input.value = values[col.key] ?? "";

      wrap.appendChild(label);
      wrap.appendChild(input);
      formButtons.parentNode.insertBefore(wrap, formButtons);
    });
  }

  function clearForm() {
    [
      "unit",
      "type",
      "year",
      "vin",
      "plate",
      "state",
      "location",
      "pm",
      "business",
      "rim",
      "size",
      "pressure",
      "manufacturer",
      "bodyClass",
      "driveType",
      "fuelType",
      "engine"
    ].forEach(key => {
      if (dom[key]) dom[key].value = "";
    });

    if (dom.status) dom.status.selectedIndex = 0;
    renderCustomFieldInputs();
  }

  function toggleButtons(mode) {
    if (dom.saveBtn) dom.saveBtn.style.display = mode === "save" && canEditEquipment() ? "inline-block" : "none";
    if (dom.updateBtn) dom.updateBtn.style.display = mode === "edit" && canEditEquipment() ? "inline-block" : "none";
    if (dom.deleteBtn) dom.deleteBtn.style.display = mode === "edit" && canDeleteEquipment() ? "inline-block" : "none";
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
        if (event.target === modal) finish(false);
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

  function getFormData() {
    const data = {
      unit: getValue("unit"),
      type: getValue("type"),
      year: getValue("year"),
      vin: getValue("vin"),
      plate: getValue("plate"),
      state: getValue("state"),
      status: getValue("status"),
      location: getValue("location"),
      pm: getValue("pm"),
      business: getValue("business"),
      rim: getValue("rim"),
      size: getValue("size"),
      pressure: getValue("pressure"),
      manufacturer: getValue("manufacturer"),
      bodyClass: getValue("bodyClass"),
      driveType: getValue("driveType"),
      fuelType: getValue("fuelType"),
      engine: getValue("engine")
    };

    equipmentColumns.filter(col => col.custom).forEach(col => {
      data[col.key] = getValue(`customField_${col.key}`);
    });

    return data;
  }

  function isDuplicateUnit(unitValue, excludeId = null) {
    const clean = normalizeLower(unitValue);
    if (!clean) return false;

    return equipmentList.some(eq => {
      const sameUnit = normalizeLower(eq.unit) === clean;
      const sameRecord = excludeId !== null && String(eq.id) === String(excludeId);
      return sameUnit && !sameRecord;
    });
  }

  function refreshEquipmentSelectionUi() {
    updateSelectionButtonText({
      selectionMode: equipmentSelectionMode,
      selectedSet: selectedEquipmentIds,
      actionButton: dom.deleteSelectedEquipmentBtn,
      defaultText: "Delete Selected",
      confirmText: "Confirm Delete",
      cancelButton: dom.cancelEquipmentSelectionBtn,
      table: dom.equipmentTable
    });
  }

  function enterEquipmentSelectionMode() {
    if (!canDeleteEquipment()) return;
    equipmentSelectionMode = true;
    refreshEquipmentSelectionUi();
    renderEquipmentTable();
  }

  function exitEquipmentSelectionMode(clear = true) {
    equipmentSelectionMode = false;
    if (clear) clearSelections(selectedEquipmentIds);
    refreshEquipmentSelectionUi();
    renderEquipmentTable();
  }

  async function deleteSelectedEquipmentFromMainPage() {
    if (!(await requirePermission(canDeleteEquipment, "Permission Required", "You do not have permission to delete equipment."))) return;

    if (!equipmentSelectionMode) {
      enterEquipmentSelectionMode();
      return;
    }

    if (selectedEquipmentIds.size === 0) {
      await showMessageModal("No Equipment Selected", "Select equipment to delete.");
      return;
    }

    const confirmed = await showConfirmModal(
      "Delete Equipment",
      `Delete ${selectedEquipmentIds.size} selected equipment item(s)?`,
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    const normalizedSelectedIds = new Set([...selectedEquipmentIds].map(id => String(id)));
    const selectedRecords = equipmentList.filter(eq => normalizedSelectedIds.has(String(eq.id)));

    deletedEquipment.push(...selectedRecords);
    equipmentList = equipmentList.filter(eq => !normalizedSelectedIds.has(String(eq.id)));

    suppressLiveReload(3500);
    await persistEquipment();
    await persistDeletedEquipment();

    exitEquipmentSelectionMode(true);

    if (selectedEquipmentId != null && normalizedSelectedIds.has(String(selectedEquipmentId))) {
      closeEquipmentProfile();
    }
  }

  function clearEquipmentFilters() {
    equipmentGridState.globalSearch = "";
    equipmentGridState.filters = {};
    equipmentGridState.headerMenuOpenFor = null;

    if (dom.equipmentGlobalSearch) {
      dom.equipmentGlobalSearch.value = "";
    }

    clearSelections(selectedEquipmentIds);
    persistGrid();
    renderEquipmentTable();
  }

  function makeCustomColumnKey(label) {
    const base = normalizeText(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const safeBase = base || "custom_column";
    let key = safeBase;
    let counter = 2;

    while (equipmentColumns.some(col => col.key === key)) {
      key = `${safeBase}_${counter}`;
      counter += 1;
    }

    return key;
  }

  function clearColumnManagerMessage() {
    byId("columnManagerMessage")?.remove();
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

  async function addCustomEquipmentColumn(label) {
    if (!(await requirePermission(canEditEquipment, "Permission Required", "You do not have permission to modify equipment columns."))) {
      return false;
    }

    const cleanLabel = normalizeText(label);
    const input = byId("newCustomColumnInput");

    clearColumnManagerMessage();

    if (!cleanLabel) {
      showColumnManagerMessage("Enter a header name.");
      input?.focus();
      input?.select();
      return false;
    }

    const labelExists = equipmentColumns.some(col => normalizeLower(col.label) === cleanLabel.toLowerCase());

    if (labelExists) {
      showColumnManagerMessage("That column already exists.");
      input?.focus();
      input?.select();
      return false;
    }

    const key = makeCustomColumnKey(cleanLabel);

    equipmentColumns.push({
      key,
      label: cleanLabel,
      visible: true,
      sortable: true,
      filterType: "text",
      custom: true
    });

    equipmentList = equipmentList.map(item => ({
      ...item,
      [key]: item[key] ?? ""
    }));

    suppressLiveReload(3000);
    await persistEquipment();

    persistGrid();
    renderEquipmentTable();
    renderColumnManager();

    return true;
  }

  async function deleteCustomEquipmentColumn(key) {
    if (!(await requirePermission(canEditEquipment, "Permission Required", "You do not have permission to modify equipment columns."))) {
      return;
    }

    const column = equipmentColumns.find(col => col.key === key);
    if (!column || !column.custom) return;

    const confirmed = await showConfirmModal(
      "Delete Custom Column",
      `Delete custom column "${column.label}"?`,
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    equipmentColumns = equipmentColumns.filter(col => col.key !== key);

    equipmentList = equipmentList.map(item => {
      const updated = { ...item };
      delete updated[key];
      return updated;
    });

    if (equipmentGridState.filters?.[key]) {
      delete equipmentGridState.filters[key];
    }

    if (equipmentGridState.columnWidths?.[key]) {
      delete equipmentGridState.columnWidths[key];
    }

    if (equipmentGridState.sortKey === key) {
      equipmentGridState.sortKey = "unit";
      equipmentGridState.sortDirection = "asc";
    }

    suppressLiveReload(3000);
    await persistEquipment();

    persistGrid();
    renderEquipmentTable();
    renderColumnManager();
  }

  function renderColumnManager() {
    if (!dom.columnManagerList) return;

    dom.columnManagerList.innerHTML = "";
    clearColumnManagerMessage();

    equipmentColumns.forEach(col => {
      const row = document.createElement("div");
      row.className = "columnManagerRow";

      const left = document.createElement("label");
      left.className = "columnManagerCheck";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!col.visible;

      checkbox.addEventListener("change", () => {
        col.visible = checkbox.checked;

        const visibleCount = equipmentColumns.filter(c => c.visible).length;

        if (visibleCount === 0) {
          col.visible = true;
          checkbox.checked = true;
          showColumnManagerMessage("At least one column must remain visible.");
          return;
        }

        clearColumnManagerMessage();
        persistGrid();
        renderEquipmentTable();
      });

      const text = document.createElement("span");
      text.textContent = col.label;

      left.appendChild(checkbox);
      left.appendChild(text);
      row.appendChild(left);

      if (col.custom && canEditEquipment()) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "deleteColumnBtn";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => deleteCustomEquipmentColumn(col.key));
        row.appendChild(deleteBtn);
      }

      dom.columnManagerList.appendChild(row);
    });

    if (canEditEquipment()) {
      const addWrap = document.createElement("div");
      addWrap.className = "columnManagerActionRow";

      const input = document.createElement("input");
      input.type = "text";
      input.id = "newCustomColumnInput";
      input.placeholder = "New custom column";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Add";

      btn.addEventListener("click", async () => {
        const added = await addCustomEquipmentColumn(input.value);
        if (added) input.value = "";
      });

      input.addEventListener("keydown", async event => {
        if (event.key === "Enter") {
          event.preventDefault();
          const added = await addCustomEquipmentColumn(input.value);
          if (added) input.value = "";
        }
      });

      addWrap.appendChild(input);
      addWrap.appendChild(btn);
      dom.columnManagerList.appendChild(addWrap);
    }
  }

  function openColumnManager() {
    if (!dom.columnManagerPanel) return;

    renderColumnManager();
    dom.columnManagerPanel.style.display = "flex";
    dom.columnManagerPanel.classList.add("show");
  }

  function closeColumnManager() {
    closePanel(dom.columnManagerPanel);
  }

  function getVisibleRows() {
    return getFilteredNormalizedEquipment();
  }

  function getEquipmentColumnWidth(columnKey) {
    const savedWidth = Number(equipmentGridState.columnWidths?.[columnKey]);

    if (Number.isFinite(savedWidth) && savedWidth > 0) {
      return Math.max(70, savedWidth);
    }

    const defaultWidths = {
      unit: 120,
      type: 150,
      status: 130,
      location: 170,
      year: 100,
      vin: 220,
      plate: 130,
      state: 120,
      pm: 170,
      business: 190,
      manufacturer: 170,
      bodyClass: 160,
      driveType: 150,
      fuelType: 140,
      engine: 180
    };

    return defaultWidths[columnKey] || 150;
  }

  function setEquipmentColumnWidth(columnKey, width) {
    const safeKey = String(columnKey || "").trim();
    if (!safeKey) return;

    const safeWidth = Math.max(70, Math.round(Number(width) || 150));

    equipmentGridState.columnWidths = {
      ...(equipmentGridState.columnWidths || {}),
      [safeKey]: safeWidth
    };
  }

  function applyEquipmentColumnWidths() {
    if (!dom.equipmentTable) return;

    const visibleColumns = equipmentColumns.filter(col => col.visible);

    visibleColumns.forEach(col => {
      const width = getEquipmentColumnWidth(col.key);
      const selector = `[data-equipment-column-key="${safeCssEscape(col.key)}"]`;

      dom.equipmentTable.querySelectorAll(selector).forEach(cell => {
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;
        cell.style.maxWidth = `${width}px`;
      });
    });
  }

  function enhanceEquipmentResizableHeaders() {
    if (!dom.equipmentTableHeaderRow) return;

    const visibleColumns = equipmentColumns.filter(col => col.visible);
    const headerCells = [...dom.equipmentTableHeaderRow.querySelectorAll("th")];

    visibleColumns.forEach((col, index) => {
      const th = headerCells[index + 1];
      if (!th) return;

      th.dataset.equipmentColumnKey = col.key;
      th.classList.add("resizableGridHeader");

      const width = getEquipmentColumnWidth(col.key);
      th.style.width = `${width}px`;
      th.style.minWidth = `${width}px`;
      th.style.maxWidth = `${width}px`;

      if (th.querySelector(".gridColumnResizeHandle")) return;

      const handle = document.createElement("span");
      handle.className = "gridColumnResizeHandle";
      handle.title = "Drag to resize column";

      handle.addEventListener("mousedown", event => {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = th.offsetWidth;

        document.body.classList.add("isResizingGridColumn");

        const onMouseMove = moveEvent => {
          const diff = moveEvent.clientX - startX;
          const nextWidth = Math.max(70, startWidth + diff);

          setEquipmentColumnWidth(col.key, nextWidth);
          applyEquipmentColumnWidths();
        };

        const onMouseUp = () => {
          document.body.classList.remove("isResizingGridColumn");

          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);

          persistGrid();
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      th.appendChild(handle);
    });
  }

  function renderEquipmentTable() {
    if (!dom.equipmentTable || !dom.equipmentTableHeaderRow) return;

    const rows = getVisibleRows();
    const visibleColumns = equipmentColumns.filter(col => col.visible);

    renderGridHeaderGeneric({
      headerRow: dom.equipmentTableHeaderRow,
      table: dom.equipmentTable,
      columns: equipmentColumns,
      data: getNormalizedEquipment(),
      gridState: equipmentGridState,
      filterUiMode: equipmentFilterUiMode,
      saveFn: persistGrid,
      renderFn: renderEquipmentTable,
      selectedSet: selectedEquipmentIds,
      visibleRows: rows,
      selectAllCheckboxId: "equipmentSelectAll",
      rowIdAttribute: "equipmentId",
      columnFiltersHost: dom.equipmentColumnFilters,
      resultCountEl: dom.equipmentResultCount,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    enhanceEquipmentResizableHeaders();

    let tbody = dom.equipmentTable.querySelector("tbody");

    if (!tbody) {
      tbody = document.createElement("tbody");
      dom.equipmentTable.appendChild(tbody);
    }

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${visibleColumns.length + 1}" class="emptyCell">
            No equipment found.
          </td>
        </tr>
      `;

      applyEquipmentColumnWidths();
      refreshEquipmentSelectionUi();
      applyEquipmentPermissionUi();
      return;
    }

    rows.forEach(eq => {
      const tr = document.createElement("tr");
      tr.dataset.equipmentId = String(eq.id);

      if (equipmentSelectionMode) {
        tr.classList.toggle("selectedRow", selectedEquipmentIds.has(String(eq.id)));
      }

      const selectTd = document.createElement("td");
      selectTd.className = "selectColumnCell";

      if (equipmentSelectionMode) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = selectedEquipmentIds.has(String(eq.id));

        checkbox.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();

          toggleRowSelection(selectedEquipmentIds, eq.id);
          refreshEquipmentSelectionUi();
          renderEquipmentTable();
        });

        selectTd.appendChild(checkbox);
      }

      tr.appendChild(selectTd);

      visibleColumns.forEach(col => {
        const td = document.createElement("td");
        td.dataset.equipmentColumnKey = col.key;
        td.textContent = eq[col.key] ?? "";
        tr.appendChild(td);
      });

      tr.addEventListener("click", event => {
        if (event.target.closest(".gridRowCheckbox")) return;
        if (event.target.closest(".gridColumnResizeHandle")) return;

        if (equipmentSelectionMode) {
          toggleRowSelection(selectedEquipmentIds, eq.id);
          refreshEquipmentSelectionUi();
          renderEquipmentTable();
          return;
        }

        showEquipmentProfile(eq.id);
      });

      tbody.appendChild(tr);
    });

    applyEquipmentColumnWidths();
    refreshEquipmentSelectionUi();
    applyEquipmentPermissionUi();
  }

  function openEquipmentFormForAdd(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!canEditEquipment()) return;

    editingId = null;
    selectedEquipmentId = null;

    clearForm();
    renderCustomFieldInputs({});
    toggleButtons("save");

    if (dom.formTitle) {
      dom.formTitle.textContent = "Add Equipment";
    }

    const equipmentFormPanel = getEquipmentFormPanel();

hideEquipmentProfileWithoutClearingSelection();
closeAllRightPanels();
openPanel(equipmentFormPanel);

    setTimeout(() => {
      dom.unit?.focus();
      dom.unit?.select();
    }, 50);
  }

 function openEquipmentFormForEdit(eq) {
  console.log("OPEN EDIT FORM", eq, dom.formPanel);

  if (!canEditEquipment() || !eq) return;
    editingId = String(eq.id);
    selectedEquipmentId = String(eq.id);

    [
      "unit",
      "type",
      "year",
      "vin",
      "plate",
      "state",
      "status",
      "location",
      "pm",
      "business",
      "rim",
      "size",
      "pressure",
      "manufacturer",
      "bodyClass",
      "driveType",
      "fuelType",
      "engine"
    ].forEach(key => {
      if (dom[key]) {
        dom[key].value = eq[key] || "";
      }
    });

    renderCustomFieldInputs(eq);
    toggleButtons("edit");

    if (dom.formTitle) {
      dom.formTitle.textContent = "Edit Equipment";
    }

    const equipmentFormPanel = getEquipmentFormPanel();

hideEquipmentProfileWithoutClearingSelection();
closeAllRightPanels();
openPanel(equipmentFormPanel);
applyEquipmentPermissionUi();

    setTimeout(() => {
      dom.unit?.focus();
      dom.unit?.select();
    }, 50);
  }

  async function saveEquipmentFromForm() {
    if (!(await requirePermission(canEditEquipment, "Permission Required", "You do not have permission to save equipment."))) return;

    const data = getFormData();

    if (!normalizeText(data.unit)) {
      await showMessageModal("Missing Unit", "Enter a unit number.");
      return;
    }

    if (isDuplicateUnit(data.unit, null)) {
      await showMessageModal("Duplicate Unit", "That unit already exists.");
      return;
    }

    const record = normalizeEquipmentRecord({
      ...data,
      id: makeId(),
      serviceHistory: {},
      serviceTracking: {}
    });

    equipmentList.push(record);

    await persistEquipment();

    editingId = null;
    selectedEquipmentId = String(record.id);

    closePanel(dom.formPanel);
    renderEquipmentTable();
    showEquipmentProfile(record.id);

    try {
      window.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
    } catch (error) {
      console.warn("Unable to dispatch equipment change event:", error);
    }
  }

  async function updateEquipmentFromForm() {
    if (!(await requirePermission(canEditEquipment, "Permission Required", "You do not have permission to update equipment."))) return;
    if (editingId == null) return;

    const data = getFormData();

    if (!normalizeText(data.unit)) {
      await showMessageModal("Missing Unit", "Enter a unit number.");
      return;
    }

    if (isDuplicateUnit(data.unit, editingId)) {
      await showMessageModal("Duplicate Unit", "That unit already exists.");
      return;
    }

    const index = equipmentList.findIndex(eq => String(eq.id) === String(editingId));
    if (index < 0) return;

    equipmentList[index] = normalizeEquipmentRecord({
      ...equipmentList[index],
      ...data,
      id: editingId
    });

    await persistEquipment();

    const editedId = String(editingId);

    editingId = null;
    selectedEquipmentId = editedId;

    closePanel(dom.formPanel);
    renderEquipmentTable();
    showEquipmentProfile(editedId);

    try {
      window.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
    } catch (error) {
      console.warn("Unable to dispatch equipment change event:", error);
    }
  }

  async function deleteSingleEquipmentFromForm() {
    if (!(await requirePermission(canDeleteEquipment, "Permission Required", "You do not have permission to delete equipment."))) return;
    if (editingId == null) return;

    const eq = equipmentList.find(item => String(item.id) === String(editingId));
    if (!eq) return;

    const confirmed = await showConfirmModal("Delete Equipment", `Delete unit "${eq.unit}"?`, {
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true
    });

    if (!confirmed) return;

    deletedEquipment.push(eq);
    equipmentList = equipmentList.filter(item => String(item.id) !== String(editingId));

    await persistEquipment();
    await persistDeletedEquipment();

    editingId = null;
    selectedEquipmentId = null;

    closePanel(dom.formPanel);
    closeEquipmentProfile();
    renderEquipmentTable();

    try {
      window.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
    } catch (error) {
      console.warn("Unable to dispatch equipment change event:", error);
    }
  }

  function getSelectedEquipmentRecord() {
    if (selectedEquipmentId == null) return null;
    return equipmentList.find(eq => String(eq.id) === String(selectedEquipmentId)) || null;
  }

  function renderProfileBasics(eq) {
    if (!eq) return;

    setText("profileUnit", eq.unit || "—");
    setText("profileType", eq.type || "—");
    setText("profileYear", eq.year || "—");
    setText("profileVin", eq.vin || "—");
    setText("profilePlate", eq.plate || "—");
    setText("profileState", eq.state || "—");
    setText("profileStatus", eq.status || "—");
    setText("profileLocation", eq.location || "—");
    setText("profilePM", eq.pm || "—");
    setText("profileBusiness", eq.business || "—");
    setText("profileRim", eq.rim || "—");
    setText("profileSize", eq.size || "—");
    setText("profilePressure", eq.pressure || "—");
    setText("profileManufacturer", eq.manufacturer || "—");
    setText("profileBodyClass", eq.bodyClass || "—");
    setText("profileDriveType", eq.driveType || "—");
    setText("profileFuelType", eq.fuelType || "—");
    setText("profileEngine", eq.engine || "—");
  }

  function renderEquipmentHistory(eq) {
    const tbody = byId("equipmentHistoryTable")?.querySelector("tbody");
    if (!tbody || !eq) return;

    const unit = normalizeLower(eq.unit);

    const rows = safeArray(workOrdersCache)
      .filter(wo => {
        const woEquipmentNumber = normalizeLower(wo.equipmentNumber);
        const woEquipmentId = String(wo.equipmentId || "");
        return woEquipmentNumber === unit || woEquipmentId === String(eq.id);
      })
      .sort((a, b) => {
        return String(b.opened || b.date || b.woDate || "").localeCompare(
          String(a.opened || a.date || a.woDate || "")
        );
      });

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="emptyCell">No work order history yet.</td></tr>`;
      setText("profileRepairCount", "0");
      setText("profileRepairCost", "0.00");
      setText("filteredRepairCount", "0");
      setText("filteredRepairCost", "0.00");
      return;
    }

    rows.forEach(wo => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${escapeHtml(wo.workOrderNumber || wo.woNumber || "—")}</td>
        <td>${escapeHtml(wo.opened || wo.date || wo.woDate || "—")}</td>
        <td>${escapeHtml(wo.status || "—")}</td>
        <td>${escapeHtml(wo.notes || "—")}</td>
        <td>${escapeHtml(String(Number(wo.total || 0).toFixed(2)))}</td>
      `;

      tbody.appendChild(tr);
    });

    const totalCost = rows.reduce((sum, wo) => sum + Number(wo.total || 0), 0);

    setText("profileRepairCount", String(rows.length));
    setText("profileRepairCost", totalCost.toFixed(2));
    setText("filteredRepairCount", String(rows.length));
    setText("filteredRepairCost", totalCost.toFixed(2));
  }

  function renderEquipmentServices(equipmentId = selectedEquipmentId) {
    const tbody = byId("equipmentServicesTable")?.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));

    if (!eq) {
      tbody.innerHTML = `<tr><td colspan="8" class="emptyCell">No assigned services found for this equipment.</td></tr>`;
      return;
    }

    const snapshot = getEquipmentServiceSnapshot(
      {
        ...eq,
        serviceHistory: ensureEquipmentServiceHistory(eq, settingsCache)
      },
      settingsCache
    );

    if (!snapshot.services.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="emptyCell">No assigned services found for this equipment.</td></tr>`;
      return;
    }

    snapshot.services.forEach(service => {
      const matchedTemplateTask = getTemplateTaskForServiceCode(eq, settingsCache, service.code);
      const selectorOption = getServiceSelectorOptions(eq, settingsCache).find(item => item.code === service.code) || null;

      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${escapeHtml(eq.location || "—")}</td>
        <td>
          <strong>${escapeHtml(service.label || "Service")}</strong>
          <div class="muted">${escapeHtml(service.category || "—")}</div>
        </td>
        <td>${escapeHtml(matchedTemplateTask?.templateName || selectorOption?.templateName || "—")}</td>
        <td>${escapeHtml(service.lastCompletedAt || "—")}</td>
        <td>${escapeHtml(service.lastMeter || "—")}</td>
        <td>
          <strong>${
            service.bucket === "overdue"
              ? "Overdue"
              : service.bucket === "due"
                ? "Due"
                : service.bucket === "dueIn30Days"
                  ? "Due in 30 Days"
                  : service.bucket === "ok"
                    ? "Scheduled"
                    : "No History"
          }</strong>
          <div class="muted">${
            service.dueDate
              ? `Due ${escapeHtml(formatDateDisplay(service.dueDate))}`
              : "No completion history"
          }</div>
        </td>
        <td>${service.notes ? `<div>${escapeHtml(service.notes)}</div>` : `<div class="muted">—</div>`}</td>
        <td>${
          canEditEquipment()
            ? `<button type="button" class="smallBtn" data-update-service-code="${escapeHtml(service.code)}">Update Tracking</button>`
            : ""
        }</td>
      `;

      tbody.appendChild(row);
    });
  }
const PROFILE_EDIT_FIELDS = [
  { key: "type", elId: "profileType", label: "Type" },
  { key: "year", elId: "profileYear", label: "Year" },
  { key: "vin", elId: "profileVin", label: "VIN" },
  { key: "plate", elId: "profilePlate", label: "Plate" },
  { key: "state", elId: "profileState", label: "State" },
  { key: "status", elId: "profileStatus", label: "Status" },
  { key: "location", elId: "profileLocation", label: "Location" },
  { key: "pm", elId: "profilePM", label: "PM Template" },
  { key: "business", elId: "profileBusiness", label: "Business" },
  { key: "rim", elId: "profileRim", label: "Rim" },
  { key: "size", elId: "profileSize", label: "Size" },
  { key: "pressure", elId: "profilePressure", label: "Pressure" },
  { key: "manufacturer", elId: "profileManufacturer", label: "Manufacturer" },
  { key: "bodyClass", elId: "profileBodyClass", label: "Body Class" },
  { key: "driveType", elId: "profileDriveType", label: "Drive Type" },
  { key: "fuelType", elId: "profileFuelType", label: "Fuel Type" },
  { key: "engine", elId: "profileEngine", label: "Engine" }
];

function getProfileFieldValue(elId) {
  const el = byId(elId);
  if (!el) return "";

  const value = String(el.textContent || "").trim();
  return value === "—" ? "" : value;
}

function setProfileFieldEditable(enabled) {
  PROFILE_EDIT_FIELDS.forEach(field => {
    const el = byId(field.elId);
    if (!el) return;

    el.contentEditable = enabled ? "true" : "false";
    el.classList.toggle("profileValueEditing", enabled);

    if (enabled) {
      el.setAttribute("role", "textbox");
      el.setAttribute("aria-label", field.label);
      el.setAttribute("spellcheck", "false");
    } else {
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
      el.removeAttribute("spellcheck");
    }
  });
}

function ensureProfileEditButtons() {
  const actions = document.querySelector("#equipmentProfileModal .profileHeaderActions");
  if (!actions) return;

  let cancelBtn = byId("cancelProfileEditBtn");

  if (!cancelBtn) {
    cancelBtn = document.createElement("button");
    cancelBtn.id = "cancelProfileEditBtn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.display = "none";
    actions.insertBefore(cancelBtn, byId("closeEquipmentProfileBtn"));
  }

  cancelBtn.onclick = cancelProfileEdit;
}

function setProfileEditUi(enabled) {
  profileEditMode = enabled;
  setProfileFieldEditable(enabled);
  ensureProfileEditButtons();

  const editBtn = byId("editProfileBtn");
  const cancelBtn = byId("cancelProfileEditBtn");

  if (editBtn) {
    editBtn.textContent = enabled ? "Save Changes" : "Edit Equipment";
    editBtn.classList.toggle("successBtn", enabled);
  }

  if (cancelBtn) {
    cancelBtn.style.display = enabled ? "inline-flex" : "none";
  }

  const modal = byId("equipmentProfileModal");
  modal?.classList.toggle("profileEditing", enabled);
}

function startProfileEdit() {
  const eq = getSelectedEquipmentRecord();

  if (!eq) {
    console.warn("Cannot edit profile. No selected equipment record found.");
    return;
  }

  profileEditOriginalData = { ...eq };
  setProfileEditUi(true);

  const firstEditable = byId("profileType");
  firstEditable?.focus();
}

function cancelProfileEdit() {
  if (profileEditOriginalData) {
    renderProfileBasics(profileEditOriginalData);
  }

  profileEditOriginalData = null;
  setProfileEditUi(false);
}

async function saveProfileEdit() {
  if (!(await requirePermission(canEditEquipment, "Permission Required", "You do not have permission to update equipment."))) {
    return;
  }

  const eq = getSelectedEquipmentRecord();

  if (!eq) {
    console.warn("Cannot save profile edit. No selected equipment record found.");
    return;
  }

  const index = equipmentList.findIndex(item => String(item.id) === String(eq.id));
  if (index < 0) return;

  const updates = {};

  PROFILE_EDIT_FIELDS.forEach(field => {
    updates[field.key] = getProfileFieldValue(field.elId);
  });

  equipmentList[index] = normalizeEquipmentRecord({
    ...equipmentList[index],
    ...updates,
    id: eq.id
  });

  await persistEquipment();

  const editedId = String(eq.id);
  selectedEquipmentId = editedId;
  profileEditOriginalData = null;

  setProfileEditUi(false);
  renderEquipmentTable();
  showEquipmentProfile(editedId);

  try {
    window.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
  } catch (error) {
    console.warn("Unable to dispatch equipment change event:", error);
  }
}

function handleInlineProfileEditClick(event) {
  event.preventDefault();
  event.stopPropagation();

  if (profileEditMode) {
    saveProfileEdit();
  } else {
    startProfileEdit();
  }
}

  function showEquipmentProfile(equipmentId) {
    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));
    if (!eq) return;

    selectedEquipmentId = String(eq.id);

    if (dom.equipmentProfileModal) {
      dom.equipmentProfileModal.classList.add("show");
    } else if (dom.equipmentProfileSection) {
      dom.equipmentProfileSection.classList.add("show");
    }

    renderProfileBasics(eq);
    renderEquipmentHistory(eq);
    renderEquipmentServices(eq.id);
    applyEquipmentPermissionUi();
  }

  function closeEquipmentProfile() {
  profileEditMode = false;
  profileEditOriginalData = null;
  setProfileEditUi(false);

  selectedEquipmentId = null;

    if (dom.equipmentProfileModal) {
      dom.equipmentProfileModal.classList.remove("show");
    }

    if (dom.equipmentProfileSection) {
      dom.equipmentProfileSection.classList.remove("show");
    }

    applyEquipmentPermissionUi();
  }

  function openServiceTrackingModal(equipmentId, serviceCode) {
    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));
    if (!eq || !dom.serviceTrackingModal) return;

    const snapshot = getEquipmentServiceSnapshot(
      {
        ...eq,
        serviceHistory: ensureEquipmentServiceHistory(eq, settingsCache)
      },
      settingsCache
    );

    const service = snapshot.services.find(item => String(item.code) === String(serviceCode));
    if (!service) return;

    activeServiceTrackingEquipmentId = String(eq.id);
    activeServiceTrackingCode = String(serviceCode);

    if (dom.serviceTrackingTaskName) {
      dom.serviceTrackingTaskName.textContent = service.label || "Service";
    }

    if (dom.serviceTrackingLastDateInput) {
      dom.serviceTrackingLastDateInput.value = service.lastCompletedAt || "";
    }

    if (dom.serviceTrackingLastMilesInput) {
      dom.serviceTrackingLastMilesInput.value = service.lastMeter || "";
    }

    if (dom.serviceTrackingNotesInput) {
      dom.serviceTrackingNotesInput.value = service.notes || "";
    }

    dom.serviceTrackingModal.classList.add("show");
  }

  function closeServiceTrackingModal() {
    activeServiceTrackingEquipmentId = null;
    activeServiceTrackingCode = null;
    dom.serviceTrackingModal?.classList.remove("show");
  }

  async function saveServiceTrackingModal() {
    if (!(await requirePermission(canEditEquipment, "Permission Required", "You do not have permission to update service tracking."))) return;
    if (!activeServiceTrackingEquipmentId || !activeServiceTrackingCode) return;

    const index = equipmentList.findIndex(item => String(item.id) === String(activeServiceTrackingEquipmentId));
    if (index < 0) return;

    const eq = equipmentList[index];
    const matchedTask = getTemplateTaskForServiceCode(eq, settingsCache, activeServiceTrackingCode);

    const entry = buildServiceCompletionEntry({
      code: activeServiceTrackingCode,
      completedAt: dom.serviceTrackingLastDateInput?.value || "",
      meter: dom.serviceTrackingLastMilesInput?.value || "",
      workOrderId: "",
      workOrderNumber: "",
      notes: dom.serviceTrackingNotesInput?.value || "",
      templateId: matchedTask?.templateId || "",
      templateName: matchedTask?.templateName || "",
      sourceTaskId: matchedTask?.id || "",
      sourceTaskName: matchedTask?.task || ""
    });

    if (!entry) return;

    equipmentList[index] = applyServiceCompletionToEquipment(eq, entry);

    await persistEquipment();

    closeServiceTrackingModal();

    if (selectedEquipmentId != null) {
      const selected = getSelectedEquipmentRecord();
      if (selected) {
        renderEquipmentServices(selected.id);
      }
    }

    try {
      window.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
    } catch (error) {
      console.warn("Unable to dispatch equipment change event:", error);
    }
  }

  async function refreshEquipmentFromRemote() {
    try {
      equipmentList = safeArray(await loadEquipment());
      renderEquipmentTable();

      if (selectedEquipmentId != null) {
        const eq = equipmentList.find(item => String(item.id) === String(selectedEquipmentId));

        if (eq) {
          renderProfileBasics(eq);
          renderEquipmentHistory(eq);
          renderEquipmentServices(eq.id);
        } else {
          closeEquipmentProfile();
        }
      }
    } catch (error) {
      console.error("Unable to refresh equipment:", error);
    }
  }

  function handleEditProfileClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();

      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }

    const activeId = selectedEquipmentId;

    if (activeId == null) {
      console.warn("Edit Equipment clicked, but selectedEquipmentId is missing.");
      return;
    }

    const eq = equipmentList.find(item => String(item.id) === String(activeId));

    if (!eq) {
      console.warn("Edit Equipment clicked, but the selected equipment record was not found.");
      return;
    }

    selectedEquipmentId = String(activeId);
    openEquipmentFormForEdit(eq);
  }

  function bindEventsOnce() {
    if (eventsBound) return;
    eventsBound = true;

    if (Array.isArray(dom.profileTabs) && dom.profileTabs.length) {
      dom.profileTabs.forEach(tab => {
        tab.addEventListener("click", () => {
          const targetId = String(tab.dataset.profileTab || "").trim();
          if (!targetId) return;

          dom.profileTabs.forEach(item => item.classList.remove("active"));
          dom.profileTabContents.forEach(content => content.classList.remove("active"));

          tab.classList.add("active");
          document.getElementById(targetId)?.classList.add("active");
        });
      });
    }

    dom.openFormBtn?.addEventListener("click", openEquipmentFormForAdd);
    dom.closeBtn?.addEventListener("click", () => closePanel(dom.formPanel));
    dom.saveBtn?.addEventListener("click", saveEquipmentFromForm);
    dom.updateBtn?.addEventListener("click", updateEquipmentFromForm);
    dom.deleteBtn?.addEventListener("click", deleteSingleEquipmentFromForm);

    dom.backToEquipmentListBtn?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeEquipmentProfile();
    });

    dom.closeEquipmentProfileBtn?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      closeEquipmentProfile();
    });

    const editProfileButton = dom.editProfileBtn || byId("editProfileBtn");

editProfileButton?.addEventListener("click", handleInlineProfileEditClick);


    dom.deleteSelectedEquipmentBtn?.addEventListener("click", deleteSelectedEquipmentFromMainPage);
    dom.cancelEquipmentSelectionBtn?.addEventListener("click", () => exitEquipmentSelectionMode(true));

    dom.equipmentGlobalSearch?.addEventListener("input", () => {
      equipmentGridState.globalSearch = dom.equipmentGlobalSearch.value || "";
      persistGrid();
      renderEquipmentTable();
    });

    dom.equipmentOptionsBtn?.addEventListener("click", event => {
      event.stopPropagation();
      dom.equipmentOptionsDropdown?.classList.toggle("show");
    });

    dom.manageEquipmentColumnsBtn?.addEventListener("click", () => {
      closeEquipmentOptionsDropdown();
      openColumnManager();
    });

    dom.clearEquipmentFiltersBtn?.addEventListener("click", () => {
      closeEquipmentOptionsDropdown();
      clearEquipmentFilters();
    });

    dom.closeColumnManagerBtn?.addEventListener("click", closeColumnManager);

    dom.serviceTrackingCloseBtn?.addEventListener("click", closeServiceTrackingModal);
    dom.serviceTrackingCancelBtn?.addEventListener("click", closeServiceTrackingModal);
    dom.serviceTrackingSaveBtn?.addEventListener("click", saveServiceTrackingModal);

    byId("equipmentServicesTable")?.addEventListener("click", event => {
      const btn = event.target.closest("[data-update-service-code]");
      if (!btn || selectedEquipmentId == null) return;

      openServiceTrackingModal(selectedEquipmentId, btn.dataset.updateServiceCode);
    });

    document.addEventListener("click", event => {
      if (
        dom.equipmentOptionsDropdown &&
        dom.equipmentOptionsBtn &&
        !dom.equipmentOptionsDropdown.contains(event.target) &&
        !dom.equipmentOptionsBtn.contains(event.target)
      ) {
        closeEquipmentOptionsDropdown();
      }
    });

    window.addEventListener("fleet:equipment-changed", refreshEquipmentFromRemote);

    window.addEventListener("fleet:settings-changed", async () => {
      await refreshSettingsCache();

      if (selectedEquipmentId != null) {
        renderEquipmentServices(selectedEquipmentId);
      }
    });

    window.addEventListener("fleet:work-orders-changed", async () => {
      await refreshWorkOrdersCache();
      await refreshEquipmentFromRemote();

      if (selectedEquipmentId != null) {
        const eq = equipmentList.find(item => String(item.id) === String(selectedEquipmentId));

        if (eq) {
          renderEquipmentHistory(eq);
          renderEquipmentServices(selectedEquipmentId);
        }
      }
    });

    window.addEventListener("storage", event => {
      if (event.key === "fleetLoggedInUser") {
        applyEquipmentPermissionUi();
        renderEquipmentTable();

        if (selectedEquipmentId != null) {
          renderEquipmentServices(selectedEquipmentId);
        }
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;

      if (dom.serviceTrackingModal?.classList.contains("show")) {
        closeServiceTrackingModal();
      } else if (dom.formPanel?.classList.contains("show")) {
        closePanel(dom.formPanel);
      } else if (dom.columnManagerPanel?.classList.contains("show")) {
        closeColumnManager();
      } else if (dom.equipmentProfileModal?.classList.contains("show")) {
        closeEquipmentProfile();
      }
    });
  }

  await hydrateSharedData();

  if (dom.equipmentGlobalSearch) {
    dom.equipmentGlobalSearch.value = equipmentGridState.globalSearch || "";
  }

  bindEventsOnce();
  renderEquipmentTable();
  applyEquipmentPermissionUi();

  return {
    refresh: refreshEquipmentFromRemote,
    renderEquipmentTable,
    showEquipmentProfile,
    openEquipmentFormForAdd,
    applyEquipmentPermissionUi
  };
}