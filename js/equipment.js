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
  normalizeEquipmentType,
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
    if (normalized.key === "unit") return { ...normalized, filterType: "none" };
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
    ...(loadEquipmentGridState() || {})
  };

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
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function addYears(date, amount) {
    const next = new Date(date.getTime());
    next.setFullYear(next.getFullYear() + amount);
    return next;
  }

  function addMonths(date, amount) {
    const next = new Date(date.getTime());
    next.setMonth(next.getMonth() + amount);
    return next;
  }

  function addWeeks(date, amount) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + amount * 7);
    return next;
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

  function canViewEquipment() {
    return !!getCurrentPermissions().equipmentView;
  }

  function canEditEquipment() {
    return !!getCurrentPermissions().equipmentEdit;
  }

  function canDeleteEquipment() {
    return !!getCurrentPermissions().equipmentDelete;
  }

  function canAccessDeletedEquipment() {
    return !!getCurrentPermissions().deletedEquipmentAccess;
  }

  async function requirePermission(checkFn, title, message) {
    if (checkFn()) return true;
    await showMessageModal(title, message);
    return false;
  }

  function applyEquipmentPermissionUi() {
    const permissions = getCurrentPermissions();

    if (dom.openFormBtn) {
      dom.openFormBtn.style.display = permissions.equipmentEdit ? "" : "none";
    }

    if (dom.editProfileBtn) {
      dom.editProfileBtn.style.display =
        permissions.equipmentEdit && selectedEquipmentId != null ? "" : "none";
    }

    if (dom.deleteSelectedEquipmentBtn) {
      dom.deleteSelectedEquipmentBtn.style.display = permissions.equipmentDelete ? "" : "none";
    }

    if (dom.openDeletedEquipmentBtn) {
      dom.openDeletedEquipmentBtn.style.display = permissions.deletedEquipmentAccess ? "" : "none";
    }

    if (dom.deleteBtn) {
      dom.deleteBtn.style.display =
        permissions.equipmentDelete && editingId != null ? "" : "none";
    }

    if (dom.saveBtn) {
      dom.saveBtn.style.display =
        permissions.equipmentEdit && editingId == null ? "" : "none";
    }

    if (dom.updateBtn) {
      dom.updateBtn.style.display =
        permissions.equipmentEdit && editingId != null ? "" : "none";
    }

    if (dom.importEquipmentBtn) {
      dom.importEquipmentBtn.style.display = permissions.equipmentEdit ? "" : "none";
    }
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
      const workOrders = await loadWorkOrders();
      workOrdersCache = safeArray(workOrders);
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
    return getFilteredGridData(
      getNormalizedEquipment(),
      equipmentColumns,
      equipmentGridState
    );
  }

  function closeEquipmentOptionsDropdown() {
    if (dom.equipmentOptionsDropdown) {
      dom.equipmentOptionsDropdown.classList.remove("show");
    }
  }

  function closeAllRightPanels() {
    if (dom.formPanel) dom.formPanel.style.display = "none";
    if (dom.inventoryFormPanel) dom.inventoryFormPanel.style.display = "none";
    if (dom.vendorFormPanel) dom.vendorFormPanel.style.display = "none";
    if (dom.workOrderFormPanel) dom.workOrderFormPanel.style.display = "none";
    if (dom.poFormPanel) dom.poFormPanel.style.display = "none";
    if (dom.settingsPanel) dom.settingsPanel.style.display = "none";
    if (dom.servicesPanel) dom.servicesPanel.style.display = "none";
  }

  function clearForm() {
    if (dom.unit) dom.unit.value = "";
    if (dom.type) dom.type.value = "";
    if (dom.year) dom.year.value = "";
    if (dom.vin) dom.vin.value = "";
    if (dom.plate) dom.plate.value = "";
    if (dom.state) dom.state.value = "";
    if (dom.status) dom.status.selectedIndex = 0;
    if (dom.location) dom.location.value = "";
    if (dom.pm) dom.pm.value = "";
    if (dom.business) dom.business.value = "";
    if (dom.rim) dom.rim.value = "";
    if (dom.size) dom.size.value = "";
    if (dom.pressure) dom.pressure.value = "";
    if (dom.manufacturer) dom.manufacturer.value = "";
    if (dom.bodyClass) dom.bodyClass.value = "";
    if (dom.driveType) dom.driveType.value = "";
    if (dom.fuelType) dom.fuelType.value = "";
    if (dom.engine) dom.engine.value = "";
    renderCustomFieldInputs();
  }

  function toggleButtons(mode) {
    if (dom.saveBtn) {
      dom.saveBtn.style.display =
        mode === "save" && canEditEquipment() ? "inline-block" : "none";
    }
    if (dom.updateBtn) {
      dom.updateBtn.style.display =
        mode === "edit" && canEditEquipment() ? "inline-block" : "none";
    }
    if (dom.deleteBtn) {
      dom.deleteBtn.style.display =
        mode === "edit" && canDeleteEquipment() ? "inline-block" : "none";
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

    equipmentColumns
      .filter(col => col.custom)
      .forEach(col => {
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
    if (clear) {
      clearSelections(selectedEquipmentIds);
    }
    refreshEquipmentSelectionUi();
    renderEquipmentTable();
  }

  async function deleteSelectedEquipmentFromMainPage() {
    if (!(await requirePermission(
      canDeleteEquipment,
      "Permission Required",
      "You do not have permission to delete equipment."
    ))) {
      return;
    }

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

    const normalizedSelectedIds = new Set(
      [...selectedEquipmentIds].map(id => String(id))
    );

    const selectedRecords = equipmentList.filter(eq =>
      normalizedSelectedIds.has(String(eq.id))
    );

    deletedEquipment.push(...selectedRecords);

    equipmentList = equipmentList.filter(
      eq => !normalizedSelectedIds.has(String(eq.id))
    );

    suppressLiveReload(3500);
    await persistEquipment();
    await persistDeletedEquipment();

    exitEquipmentSelectionMode(true);

    if (
      selectedEquipmentId != null &&
      normalizedSelectedIds.has(String(selectedEquipmentId))
    ) {
      selectedEquipmentId = null;
      if (dom.equipmentProfileSection) dom.equipmentProfileSection.style.display = "none";
      if (dom.equipmentListSection) dom.equipmentListSection.style.display = "block";
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

  async function addCustomEquipmentColumn(label) {
    if (!(await requirePermission(
      canEditEquipment,
      "Permission Required",
      "You do not have permission to modify equipment columns."
    ))) {
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

    const labelExists = equipmentColumns.some(
      col => normalizeLower(col.label) === cleanLabel.toLowerCase()
    );

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
    if (!(await requirePermission(
      canEditEquipment,
      "Permission Required",
      "You do not have permission to modify equipment columns."
    ))) {
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

  function renderCustomFieldInputs(values = {}) {
    if (!dom.formPanel) return;
    const formButtons = dom.formPanel.querySelector(".formButtons");
    if (!formButtons) return;

    dom.formPanel.querySelectorAll(".dynamicCustomField").forEach(el => el.remove());

    const customColumns = equipmentColumns.filter(col => col.custom);
    if (!customColumns.length) return;

    customColumns.forEach(col => {
      const wrap = document.createElement("div");
      wrap.className = "dynamicCustomField";

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
        deleteBtn.addEventListener("click", () => {
          deleteCustomEquipmentColumn(col.key);
        });
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
    dom.columnManagerPanel.style.display = "block";
  }

  function closeColumnManager() {
    if (!dom.columnManagerPanel) return;
    dom.columnManagerPanel.style.display = "none";
  }

  function getVisibleRows() {
    return getFilteredNormalizedEquipment();
  }

  function renderEquipmentTable() {
    if (!dom.equipmentTable || !dom.equipmentTableHeaderRow) return;

    const rows = getVisibleRows();

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

    let tbody = dom.equipmentTable.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      dom.equipmentTable.appendChild(tbody);
    }

    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${equipmentColumns.filter(col => col.visible).length + 1}" class="emptyCell">
            No equipment found.
          </td>
        </tr>
      `;
      return;
    }

    rows.forEach(eq => {
      const tr = document.createElement("tr");
      tr.dataset.equipmentId = String(eq.id);

      if (equipmentSelectionMode) {
        tr.classList.toggle("selectedRow", selectedEquipmentIds.has(String(eq.id)));
      }

      let html = "";

      html += `
        <td class="selectColumnCell">
          ${equipmentSelectionMode
            ? `<input type="checkbox" class="gridRowCheckbox" ${selectedEquipmentIds.has(String(eq.id)) ? "checked" : ""} />`
            : ""}
        </td>
      `;

      equipmentColumns.filter(col => col.visible).forEach(col => {
        html += `<td>${escapeHtml(eq[col.key] ?? "")}</td>`;
      });

      tr.innerHTML = html;

      tr.addEventListener("click", event => {
        if (equipmentSelectionMode) {
          if (event.target.closest(".gridRowCheckbox")) {
            toggleRowSelection(selectedEquipmentIds, eq.id);
            refreshEquipmentSelectionUi();
            renderEquipmentTable();
            return;
          }

          toggleRowSelection(selectedEquipmentIds, eq.id);
          refreshEquipmentSelectionUi();
          renderEquipmentTable();
          return;
        }

        showEquipmentProfile(eq.id);
      });

      tbody.appendChild(tr);
    });

    refreshEquipmentSelectionUi();
    applyEquipmentPermissionUi();
  }

  function openEquipmentFormForAdd() {
    if (!canEditEquipment()) return;

    editingId = null;
    clearForm();
    renderCustomFieldInputs({});
    toggleButtons("save");

    if (dom.formTitle) dom.formTitle.textContent = "Add Equipment";

    closeAllRightPanels();
    if (dom.formPanel) dom.formPanel.style.display = "block";
  }

  function openEquipmentFormForEdit(eq) {
    if (!canEditEquipment()) return;
    if (!eq) return;

    editingId = String(eq.id);

    if (dom.unit) dom.unit.value = eq.unit || "";
    if (dom.type) dom.type.value = eq.type || "";
    if (dom.year) dom.year.value = eq.year || "";
    if (dom.vin) dom.vin.value = eq.vin || "";
    if (dom.plate) dom.plate.value = eq.plate || "";
    if (dom.state) dom.state.value = eq.state || "";
    if (dom.status) dom.status.value = eq.status || "";
    if (dom.location) dom.location.value = eq.location || "";
    if (dom.pm) dom.pm.value = eq.pm || "";
    if (dom.business) dom.business.value = eq.business || "";
    if (dom.rim) dom.rim.value = eq.rim || "";
    if (dom.size) dom.size.value = eq.size || "";
    if (dom.pressure) dom.pressure.value = eq.pressure || "";
    if (dom.manufacturer) dom.manufacturer.value = eq.manufacturer || "";
    if (dom.bodyClass) dom.bodyClass.value = eq.bodyClass || "";
    if (dom.driveType) dom.driveType.value = eq.driveType || "";
    if (dom.fuelType) dom.fuelType.value = eq.fuelType || "";
    if (dom.engine) dom.engine.value = eq.engine || "";

    renderCustomFieldInputs(eq);
    toggleButtons("edit");

    if (dom.formTitle) dom.formTitle.textContent = "Edit Equipment";

    closeAllRightPanels();
    if (dom.formPanel) dom.formPanel.style.display = "block";
  }

  async function saveEquipmentFromForm() {
    if (!(await requirePermission(
      canEditEquipment,
      "Permission Required",
      "You do not have permission to save equipment."
    ))) {
      return;
    }

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
    if (dom.formPanel) dom.formPanel.style.display = "none";
    renderEquipmentTable();
  }

  async function updateEquipmentFromForm() {
    if (!(await requirePermission(
      canEditEquipment,
      "Permission Required",
      "You do not have permission to update equipment."
    ))) {
      return;
    }

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

    if (dom.formPanel) dom.formPanel.style.display = "none";
    renderEquipmentTable();

    if (selectedEquipmentId != null && String(selectedEquipmentId) === String(editingId)) {
      showEquipmentProfile(editingId);
    }
  }

  async function deleteSingleEquipmentFromForm() {
    if (!(await requirePermission(
      canDeleteEquipment,
      "Permission Required",
      "You do not have permission to delete equipment."
    ))) {
      return;
    }

    if (editingId == null) return;

    const eq = equipmentList.find(item => String(item.id) === String(editingId));
    if (!eq) return;

    const confirmed = await showConfirmModal(
      "Delete Equipment",
      `Delete unit "${eq.unit}"?`,
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    deletedEquipment.push(eq);
    equipmentList = equipmentList.filter(item => String(item.id) !== String(editingId));

    await persistEquipment();
    await persistDeletedEquipment();

    editingId = null;
    if (dom.formPanel) dom.formPanel.style.display = "none";
    renderEquipmentTable();
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
    if (!tbody) return;

    const unit = normalizeLower(eq.unit);
    const rows = safeArray(workOrdersCache)
      .filter(wo => normalizeLower(wo.equipmentNumber) === unit)
      .sort((a, b) =>
        String(b.opened || b.date || b.woDate || "").localeCompare(
          String(a.opened || a.date || a.woDate || "")
        )
      );

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
        <td>${escapeHtml(String(wo.total || "0.00"))}</td>
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
      const selectorOption =
        getServiceSelectorOptions(eq, settingsCache).find(item => item.code === service.code) || null;

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
          <div class="muted">${service.dueDate ? `Due ${escapeHtml(formatDateDisplay(service.dueDate))}` : "No completion history"}</div>
        </td>
        <td>
          ${service.notes ? `<div>${escapeHtml(service.notes)}</div>` : `<div class="muted">—</div>`}
        </td>
        <td>
          ${canEditEquipment() ? `<button type="button" class="smallBtn" data-update-service-code="${escapeHtml(service.code)}">Update Tracking</button>` : ""}
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  function showEquipmentProfile(equipmentId) {
    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));
    if (!eq) return;

    selectedEquipmentId = String(eq.id);

    if (dom.equipmentListSection) dom.equipmentListSection.style.display = "none";
    if (dom.equipmentProfileSection) dom.equipmentProfileSection.style.display = "block";

    renderProfileBasics(eq);
    renderEquipmentHistory(eq);
    renderEquipmentServices(eq.id);
    applyEquipmentPermissionUi();
  }

  function closeEquipmentProfile() {
    selectedEquipmentId = null;
    if (dom.equipmentProfileSection) dom.equipmentProfileSection.style.display = "none";
    if (dom.equipmentListSection) dom.equipmentListSection.style.display = "block";
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

    activeServiceTrackingEquipmentId = String(equipmentId);
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
    if (!(await requirePermission(
      canEditEquipment,
      "Permission Required",
      "You do not have permission to update service tracking."
    ))) {
      return;
    }

    if (!activeServiceTrackingEquipmentId || !activeServiceTrackingCode) return;

    const index = equipmentList.findIndex(
      item => String(item.id) === String(activeServiceTrackingEquipmentId)
    );
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

    if (dom.openFormBtn) {
      dom.openFormBtn.addEventListener("click", openEquipmentFormForAdd);
    }

    if (dom.closeBtn) {
      dom.closeBtn.addEventListener("click", () => {
        if (dom.formPanel) dom.formPanel.style.display = "none";
      });
    }

    if (dom.saveBtn) {
      dom.saveBtn.addEventListener("click", saveEquipmentFromForm);
    }

    if (dom.updateBtn) {
      dom.updateBtn.addEventListener("click", updateEquipmentFromForm);
    }

    if (dom.deleteBtn) {
      dom.deleteBtn.addEventListener("click", deleteSingleEquipmentFromForm);
    }

    if (dom.backToEquipmentListBtn) {
      dom.backToEquipmentListBtn.addEventListener("click", closeEquipmentProfile);
    }

    if (dom.editProfileBtn) {
      dom.editProfileBtn.addEventListener("click", () => {
        const eq = getSelectedEquipmentRecord();
        if (eq) openEquipmentFormForEdit(eq);
      });
    }

    if (dom.deleteSelectedEquipmentBtn) {
      dom.deleteSelectedEquipmentBtn.addEventListener("click", deleteSelectedEquipmentFromMainPage);
    }

    if (dom.cancelEquipmentSelectionBtn) {
      dom.cancelEquipmentSelectionBtn.addEventListener("click", () => {
        exitEquipmentSelectionMode(true);
      });
    }

    if (dom.equipmentGlobalSearch) {
      dom.equipmentGlobalSearch.addEventListener("input", () => {
        equipmentGridState.globalSearch = dom.equipmentGlobalSearch.value || "";
        persistGrid();
        renderEquipmentTable();
      });
    }

    if (dom.equipmentOptionsBtn) {
      dom.equipmentOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.equipmentOptionsDropdown?.classList.toggle("show");
      });
    }

    if (dom.manageColumnsBtn) {
      dom.manageColumnsBtn.addEventListener("click", () => {
        closeEquipmentOptionsDropdown();
        openColumnManager();
      });
    }

    if (dom.clearEquipmentFiltersBtn) {
      dom.clearEquipmentFiltersBtn.addEventListener("click", () => {
        closeEquipmentOptionsDropdown();
        clearEquipmentFilters();
      });
    }

    if (dom.closeColumnManagerBtn) {
      dom.closeColumnManagerBtn.addEventListener("click", closeColumnManager);
    }

    if (dom.serviceTrackingCloseBtn) {
      dom.serviceTrackingCloseBtn.addEventListener("click", closeServiceTrackingModal);
    }

    if (dom.serviceTrackingCancelBtn) {
      dom.serviceTrackingCancelBtn.addEventListener("click", closeServiceTrackingModal);
    }

    if (dom.serviceTrackingSaveBtn) {
      dom.serviceTrackingSaveBtn.addEventListener("click", () => {
        saveServiceTrackingModal();
      });
    }

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

    window.addEventListener("fleet:equipment-changed", () => {
      refreshEquipmentFromRemote();
    });

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
      if (event.key === "Escape" && dom.serviceTrackingModal?.classList.contains("show")) {
        closeServiceTrackingModal();
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