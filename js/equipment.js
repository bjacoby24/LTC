import { getDom } from "./dom.js";
import {
  byId,
  setText,
  setValue,
  getValue,
  normalizeText,
  normalizeLower,
  normalizeCellValue,
  makeId
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
  loadSettings
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

export async function initEquipment() {
  const dom = getDom();

  let equipmentList = [];
  let deletedEquipment = [];
  let settingsCache = {
    companyName: "",
    defaultLocation: "",
    theme: "default",
    serviceTasks: [],
    serviceTemplates: []
  };
  let workOrdersCache = [];

  let editingId = null;
  let selectedEquipmentId = null;
  let selectedEquipmentIds = new Set();
  let equipmentSelectionMode = false;
  let equipmentFilterUiMode = "header";

  let appModalResolver = null;
  let appModalLastFocus = null;
  let activeServiceTrackingEquipmentId = null;
  let activeServiceTrackingTaskId = null;

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

  let equipmentGridState = loadEquipmentGridState({
    sortKey: "unit",
    sortDirection: "asc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

  if (equipmentGridState.filters?.unit) {
    delete equipmentGridState.filters.unit;
  }

  function persistGrid() {
    saveEquipmentGridSettings(equipmentColumns, equipmentGridState);
  }

  async function hydrateSharedData() {
    try {
      const [equipment, deleted, settings, workOrders] = await Promise.all([
        loadEquipment(),
        loadDeletedEquipment(),
        loadSettings(),
        loadWorkOrders()
      ]);

      equipmentList = Array.isArray(equipment) ? equipment : [];
      deletedEquipment = Array.isArray(deleted) ? deleted : [];
      settingsCache =
        settings && typeof settings === "object" && !Array.isArray(settings)
          ? settings
          : {
              companyName: "",
              defaultLocation: "",
              theme: "default",
              serviceTasks: [],
              serviceTemplates: []
            };
      workOrdersCache = Array.isArray(workOrders) ? workOrders : [];
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
      settingsCache =
        settings && typeof settings === "object" && !Array.isArray(settings)
          ? settings
          : settingsCache;
    } catch (error) {
      console.error("Failed to refresh settings cache:", error);
    }
  }

  async function refreshWorkOrdersCache() {
    try {
      const workOrders = await loadWorkOrders();
      workOrdersCache = Array.isArray(workOrders) ? workOrders : [];
    } catch (error) {
      console.error("Failed to refresh work orders cache:", error);
    }
  }

  async function persistEquipment() {
    await saveEquipment(equipmentList);
  }

  async function persistDeletedEquipment() {
    await saveDeletedEquipment(deletedEquipment);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function normalizeEquipmentRecord(eq = {}) {
    return {
      ...eq,
      id: eq.id || makeId(),
      unit: eq.unit || "",
      type: eq.type || "",
      year: eq.year || "",
      vin: eq.vin || "",
      plate: eq.plate || "",
      state: eq.state || "",
      status: eq.status || "",
      location: eq.location || "",
      pm: eq.pm || "",
      business: eq.business || "",
      rim: eq.rim || "",
      size: eq.size || "",
      pressure: eq.pressure || "",
      manufacturer: eq.manufacturer || "",
      bodyClass: eq.bodyClass || "",
      driveType: eq.driveType || "",
      fuelType: eq.fuelType || "",
      engine: eq.engine || "",
      serviceTracking: safeObject(eq.serviceTracking)
    };
  }

  function normalizeServiceTask(task = {}) {
    const legacyLocation = String(task.location || "").trim();
    const normalizedLocations = Array.isArray(task.locations)
      ? task.locations.map(value => String(value || "").trim()).filter(Boolean)
      : legacyLocation
        ? [legacyLocation]
        : [];

    const appliesToAllLocations =
      typeof task.appliesToAllLocations === "boolean"
        ? task.appliesToAllLocations
        : normalizedLocations.length === 0;

    return {
      ...task,
      id: task.id || "",
      task: task.task || "",
      status: task.status || "Active",
      appliesToAllLocations,
      locations: appliesToAllLocations ? [] : [...new Set(normalizedLocations)],
      dateTrackingMode: task.dateTrackingMode || "every",
      dateEveryValue: task.dateEveryValue || "",
      dateEveryUnit: task.dateEveryUnit || "Days",
      dateOnValue: task.dateOnValue || "",
      dateNoticeValue: task.dateNoticeValue || "7",
      milesTrackingMode: task.milesTrackingMode || "every",
      milesEveryValue: task.milesEveryValue || "",
      milesAtValue: task.milesAtValue || "",
      milesNoticeValue: task.milesNoticeValue || "0",
      linkedTaskId: task.linkedTaskId || "",
      parentTaskId: task.parentTaskId || ""
    };
  }

  function getNormalizedEquipment() {
    return equipmentList.map(normalizeEquipmentRecord);
  }

  function getFilteredNormalizedEquipment() {
    return getFilteredGridData(getNormalizedEquipment(), equipmentColumns, equipmentGridState);
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
    if (dom.saveBtn) dom.saveBtn.style.display = mode === "save" ? "inline-block" : "none";
    if (dom.updateBtn) dom.updateBtn.style.display = mode === "edit" ? "inline-block" : "none";
    if (dom.deleteBtn) dom.deleteBtn.style.display = mode === "edit" ? "inline-block" : "none";
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

  function openServiceTrackingModal(equipmentId, taskId) {
    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));
    if (!eq) return;

    const tasks = getServiceTasksForEquipment(eq);
    const task = tasks.find(item => String(item.id) === String(taskId));
    if (!task) return;

    const currentTracking = getTaskTracking(eq, taskId);

    activeServiceTrackingEquipmentId = equipmentId;
    activeServiceTrackingTaskId = taskId;

    if (dom.serviceTrackingModalTitle) {
      dom.serviceTrackingModalTitle.textContent = `Update ${task.task || "Service Task"}`;
    }

    if (dom.serviceTrackingTaskName) {
      dom.serviceTrackingTaskName.textContent = task.task || "Untitled Task";
    }

    if (dom.serviceTrackingLastDateInput) {
      dom.serviceTrackingLastDateInput.value = currentTracking.lastCompletedDate || "";
    }

    if (dom.serviceTrackingLastMilesInput) {
      dom.serviceTrackingLastMilesInput.value = currentTracking.lastCompletedMiles || "";
    }

    if (dom.serviceTrackingNotesInput) {
      dom.serviceTrackingNotesInput.value = currentTracking.notes || "";
    }

    if (dom.serviceTrackingModal) {
      dom.serviceTrackingModal.classList.add("show");
    }

    setTimeout(() => {
      dom.serviceTrackingLastDateInput?.focus?.();
    }, 20);
  }

  function closeServiceTrackingModal() {
    activeServiceTrackingEquipmentId = null;
    activeServiceTrackingTaskId = null;

    if (dom.serviceTrackingModal) {
      dom.serviceTrackingModal.classList.remove("show");
    }
  }

  async function saveServiceTrackingModal() {
    if (activeServiceTrackingEquipmentId == null || !activeServiceTrackingTaskId) {
      closeServiceTrackingModal();
      return;
    }

    await updateTaskTracking(activeServiceTrackingEquipmentId, activeServiceTrackingTaskId, {
      lastCompletedDate: String(dom.serviceTrackingLastDateInput?.value || "").trim(),
      lastCompletedMiles: String(dom.serviceTrackingLastMilesInput?.value || "").trim(),
      notes: String(dom.serviceTrackingNotesInput?.value || "").trim()
    });

    renderEquipmentServices(activeServiceTrackingEquipmentId);
    closeServiceTrackingModal();
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

  function findEquipmentByUnit(unitValue) {
    const clean = normalizeLower(unitValue);
    if (!clean) return null;

    return equipmentList.find(eq => normalizeLower(eq.unit) === clean) || null;
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

    const selectedRecords = equipmentList.filter(eq => selectedEquipmentIds.has(String(eq.id)));
    deletedEquipment.push(...selectedRecords);
    equipmentList = equipmentList.filter(eq => !selectedEquipmentIds.has(String(eq.id)));

    await persistEquipment();
    await persistDeletedEquipment();
    exitEquipmentSelectionMode(true);
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
      counter++;
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

    const actionRow = dom.columnManagerList.querySelector(".columnManagerActionRow");
    if (actionRow) {
      dom.columnManagerList.insertBefore(msg, actionRow);
    } else {
      dom.columnManagerList.appendChild(msg);
    }
  }

  async function addCustomEquipmentColumn(label) {
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

    await persistEquipment();
    persistGrid();
    renderEquipmentTable();
    renderColumnManager();
    return true;
  }

  async function deleteCustomEquipmentColumn(key) {
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
        renderColumnManager();
      });

      const text = document.createElement("span");
      text.textContent = col.label;

      left.appendChild(checkbox);
      left.appendChild(text);
      row.appendChild(left);

      if (col.custom) {
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

    const addWrap = document.createElement("div");
    addWrap.className = "columnManagerActionRow";

    const addTitle = document.createElement("div");
    addTitle.className = "columnManagerModeTitle";
    addTitle.textContent = "Add Custom Header";

    const addRow = document.createElement("div");
    addRow.className = "columnManagerAddRow";

    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.id = "newCustomColumnInput";
    addInput.placeholder = "Enter header name";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "+ Add";

    function submitCustomColumn() {
      addCustomEquipmentColumn(addInput.value).then(added => {
        if (added) addInput.value = "";
      });
    }

    addBtn.addEventListener("click", submitCustomColumn);
    addInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitCustomColumn();
      }
    });

    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    addWrap.appendChild(addTitle);
    addWrap.appendChild(addRow);
    dom.columnManagerList.appendChild(addWrap);

    const modeWrap = document.createElement("div");
    modeWrap.className = "columnManagerModeRow";

    const modeLabel = document.createElement("div");
    modeLabel.className = "columnManagerModeTitle";
    modeLabel.textContent = "Filter UI Mode";

    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.textContent = "Top Filter Row";
    rowBtn.disabled = equipmentFilterUiMode === "row";
    rowBtn.addEventListener("click", () => {
      equipmentFilterUiMode = "row";
      renderEquipmentTable();
      renderColumnManager();
    });

    const headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.textContent = "Header Menus";
    headerBtn.disabled = equipmentFilterUiMode === "header";
    headerBtn.addEventListener("click", () => {
      equipmentFilterUiMode = "header";
      renderEquipmentTable();
      renderColumnManager();
    });

    modeWrap.appendChild(modeLabel);
    modeWrap.appendChild(rowBtn);
    modeWrap.appendChild(headerBtn);
    dom.columnManagerList.appendChild(modeWrap);
  }

  function openColumnManager() {
    renderColumnManager();
    if (dom.columnManagerPanel) dom.columnManagerPanel.classList.add("show");
  }

  function closeColumnManager() {
    if (dom.columnManagerPanel) dom.columnManagerPanel.classList.remove("show");
  }

  function openEquipmentFormForAdd() {
    closeAllRightPanels();
    clearForm();
    editingId = null;
    if (dom.formTitle) dom.formTitle.textContent = "Add Equipment";
    toggleButtons("save");
    if (dom.formPanel) dom.formPanel.style.display = "block";
  }

  function openEdit(eq) {
    if (!eq || !dom.formPanel) return;

    closeAllRightPanels();
    dom.formPanel.style.display = "block";

    setValue("unit", eq.unit || "");
    setValue("type", eq.type || "");
    setValue("year", eq.year || "");
    setValue("vin", eq.vin || "");
    setValue("plate", eq.plate || "");
    setValue("state", eq.state || "");
    setValue("status", eq.status || "");
    setValue("location", eq.location || "");
    setValue("pm", eq.pm || "");
    setValue("business", eq.business || "");
    setValue("rim", eq.rim || "");
    setValue("size", eq.size || "");
    setValue("pressure", eq.pressure || "");
    setValue("manufacturer", eq.manufacturer || "");
    setValue("bodyClass", eq.bodyClass || "");
    setValue("driveType", eq.driveType || "");
    setValue("fuelType", eq.fuelType || "");
    setValue("engine", eq.engine || "");

    renderCustomFieldInputs(eq);

    if (dom.formTitle) dom.formTitle.textContent = "Edit Equipment";
    editingId = eq.id;
    toggleButtons("edit");
  }

  function getServiceTrackingMap(eq) {
    return safeObject(eq?.serviceTracking);
  }

  function setServiceTrackingMap(eq, trackingMap) {
    return {
      ...eq,
      serviceTracking: safeObject(trackingMap)
    };
  }

  function getTaskTracking(eq, taskId) {
    const trackingMap = getServiceTrackingMap(eq);
    const entry = trackingMap[taskId];

    return entry && typeof entry === "object" && !Array.isArray(entry)
      ? {
          lastCompletedDate: entry.lastCompletedDate || "",
          lastCompletedMiles: entry.lastCompletedMiles || "",
          notes: entry.notes || ""
        }
      : {
          lastCompletedDate: "",
          lastCompletedMiles: "",
          notes: ""
        };
  }

  async function updateTaskTracking(equipmentId, taskId, updates = {}) {
    const index = equipmentList.findIndex(eq => String(eq.id) === String(equipmentId));
    if (index === -1) return;

    const eq = normalizeEquipmentRecord(equipmentList[index]);
    const currentTrackingMap = getServiceTrackingMap(eq);
    const currentTaskTracking = getTaskTracking(eq, taskId);

    const nextTrackingMap = {
      ...currentTrackingMap,
      [taskId]: {
        ...currentTaskTracking,
        ...updates
      }
    };

    equipmentList[index] = setServiceTrackingMap(eq, nextTrackingMap);
    await persistEquipment();
  }

  async function saveEquipmentRecord() {
    const data = getFormData();

    if (!normalizeText(data.unit)) {
      await showMessageModal("Missing Unit Number", "Please enter a unit number.");
      dom.unit?.focus();
      return;
    }

    if (isDuplicateUnit(data.unit)) {
      await showMessageModal("Duplicate Unit Number", "That unit number already exists.");
      dom.unit?.focus();
      dom.unit?.select?.();
      return;
    }

    const record = {
      id: makeId(),
      ...data,
      serviceTracking: {}
    };

    equipmentList.push(record);
    await persistEquipment();
    renderEquipmentTable();

    if (dom.formPanel) dom.formPanel.style.display = "none";
    clearForm();
  }

  async function updateEquipmentRecord() {
    if (editingId == null) return;

    const data = getFormData();

    if (!normalizeText(data.unit)) {
      await showMessageModal("Missing Unit Number", "Please enter a unit number.");
      dom.unit?.focus();
      return;
    }

    if (isDuplicateUnit(data.unit, editingId)) {
      await showMessageModal("Duplicate Unit Number", "That unit number already exists.");
      dom.unit?.focus();
      dom.unit?.select?.();
      return;
    }

    const index = equipmentList.findIndex(eq => String(eq.id) === String(editingId));
    if (index === -1) return;

    equipmentList[index] = {
      ...equipmentList[index],
      ...data,
      id: equipmentList[index].id,
      serviceTracking: safeObject(equipmentList[index].serviceTracking)
    };

    await persistEquipment();
    renderEquipmentTable();

    if (dom.formPanel) dom.formPanel.style.display = "none";
    showEquipmentProfile(editingId);
  }

  async function deleteEquipmentRecord(id = editingId) {
    if (id == null) return;

    const confirmed = await showConfirmModal(
      "Delete Equipment",
      "Delete this equipment?",
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );

    if (!confirmed) return;

    const record = equipmentList.find(eq => String(eq.id) === String(id));
    if (!record) return;

    deletedEquipment.push(record);
    equipmentList = equipmentList.filter(eq => String(eq.id) !== String(id));

    await persistEquipment();
    await persistDeletedEquipment();

    if (dom.formPanel) dom.formPanel.style.display = "none";

    if (dom.equipmentProfileSection && String(selectedEquipmentId) === String(id)) {
      dom.equipmentProfileSection.style.display = "none";
      if (dom.equipmentListSection) dom.equipmentListSection.style.display = "block";
    }

    selectedEquipmentId = null;
    renderEquipmentTable();
  }

  function getServiceTasksForEquipment(eq) {
    const serviceTasks = Array.isArray(settingsCache.serviceTasks) ? settingsCache.serviceTasks : [];
    const equipmentLocation = normalizeLower(eq?.location || "");

    return serviceTasks
      .map(normalizeServiceTask)
      .filter(task => {
        const status = normalizeLower(task?.status || "active");
        if (status === "inactive") return false;

        if (task.appliesToAllLocations) return true;

        const taskLocations = Array.isArray(task.locations) ? task.locations : [];
        if (!taskLocations.length) return true;

        return taskLocations.some(location => normalizeLower(location) === equipmentLocation);
      })
      .sort((a, b) => {
        const aName = normalizeLower(a?.task || "");
        const bName = normalizeLower(b?.task || "");
        return aName.localeCompare(bName);
      });
  }

  function formatServiceSchedule(task) {
    const parts = [];

    if (task.dateTrackingMode === "every" && task.dateEveryValue) {
      parts.push(`Every ${task.dateEveryValue} ${task.dateEveryUnit || "Days"}`);
    } else if (task.dateTrackingMode === "on" && task.dateOnValue) {
      parts.push(`On ${task.dateOnValue}`);
    } else if (task.dateTrackingMode !== "disabled" && task.dateNoticeValue) {
      parts.push(`Notice ${task.dateNoticeValue} day(s) early`);
    }

    if (task.milesTrackingMode === "every" && task.milesEveryValue) {
      parts.push(`Every ${task.milesEveryValue} miles`);
    } else if (task.milesTrackingMode === "at" && task.milesAtValue) {
      parts.push(`At ${task.milesAtValue} miles`);
    }

    if (
      task.milesTrackingMode !== "disabled" &&
      task.milesNoticeValue &&
      String(task.milesNoticeValue) !== "0"
    ) {
      parts.push(`Notice ${task.milesNoticeValue} mile(s) early`);
    }

    return parts.length ? parts.join(" • ") : "No interval set";
  }

  function findTaskNameById(taskId, allTasks) {
    if (!taskId) return "";
    const match = allTasks.find(task => String(task.id) === String(taskId));
    return match?.task || "";
  }

  function formatTaskLocations(task, equipmentLocation = "") {
    const normalizedTask = normalizeServiceTask(task);

    if (normalizedTask.appliesToAllLocations) {
      return "All Locations";
    }

    if (Array.isArray(normalizedTask.locations) && normalizedTask.locations.length) {
      return normalizedTask.locations.join(", ");
    }

    return equipmentLocation || "All Locations";
  }

  function parseDate(value) {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function dateToYMD(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function addWeeks(date, amount) {
    return addDays(date, amount * 7);
  }

  function addMonths(date, amount) {
    const next = new Date(date.getTime());
    next.setMonth(next.getMonth() + amount);
    return next;
  }

  function addYears(date, amount) {
    const next = new Date(date.getTime());
    next.setFullYear(next.getFullYear() + amount);
    return next;
  }

  function addIntervalToDate(date, value, unit) {
    const amount = Math.max(0, toNumber(value));
    if (!(date instanceof Date) || Number.isNaN(date.getTime()) || amount <= 0) {
      return null;
    }

    switch (normalizeLower(unit)) {
      case "day":
      case "days":
        return addDays(date, amount);
      case "week":
      case "weeks":
        return addWeeks(date, amount);
      case "month":
      case "months":
        return addMonths(date, amount);
      case "year":
      case "years":
        return addYears(date, amount);
      default:
        return addDays(date, amount);
    }
  }

  function getEquipmentCurrentMileage(eq) {
    const candidates = [
      eq?.currentMileage,
      eq?.mileage,
      eq?.odometer,
      eq?.currentMiles,
      eq?.miles
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }

    return null;
  }

  function getTaskStatus(eq, task) {
    const tracking = getTaskTracking(eq, task.id);
    const today = new Date();
    const todayYmd = dateToYMD(today);

    let dateStatus = "ok";
    let milesStatus = "ok";

    if (normalizeLower(task.dateTrackingMode) === "on" && task.dateOnValue) {
      const dueDate = task.dateOnValue;
      const noticeDays = Math.max(0, toNumber(task.dateNoticeValue));

      if (todayYmd > dueDate) {
        dateStatus = "overdue";
      } else if (noticeDays > 0) {
        const dueDateObj = parseDate(dueDate);
        if (dueDateObj) {
          const soonDate = addDays(dueDateObj, -noticeDays);
          if (today >= soonDate) {
            dateStatus = "dueSoon";
          }
        }
      }
    }

    if (
      normalizeLower(task.dateTrackingMode) === "every" &&
      task.dateEveryValue &&
      tracking.lastCompletedDate
    ) {
      const lastDate = parseDate(tracking.lastCompletedDate);
      const dueDate = addIntervalToDate(lastDate, task.dateEveryValue, task.dateEveryUnit);

      if (dueDate) {
        const dueDateYmd = dateToYMD(dueDate);
        const noticeDays = Math.max(0, toNumber(task.dateNoticeValue));

        if (todayYmd > dueDateYmd) {
          dateStatus = "overdue";
        } else if (noticeDays > 0) {
          const soonDate = addDays(dueDate, -noticeDays);
          if (today >= soonDate) {
            dateStatus = "dueSoon";
          }
        }
      }
    }

    if (normalizeLower(task.milesTrackingMode) === "at" && task.milesAtValue) {
      const currentMileage = getEquipmentCurrentMileage(eq);
      const dueMiles = toNumber(task.milesAtValue);
      const noticeMiles = Math.max(0, toNumber(task.milesNoticeValue));

      if (currentMileage != null && dueMiles > 0) {
        if (currentMileage > dueMiles) {
          milesStatus = "overdue";
        } else if (currentMileage >= dueMiles - noticeMiles) {
          milesStatus = "dueSoon";
        }
      }
    }

    if (
      normalizeLower(task.milesTrackingMode) === "every" &&
      task.milesEveryValue &&
      tracking.lastCompletedMiles !== ""
    ) {
      const currentMileage = getEquipmentCurrentMileage(eq);
      const lastMiles = toNumber(tracking.lastCompletedMiles);
      const dueMiles = lastMiles + Math.max(0, toNumber(task.milesEveryValue));
      const noticeMiles = Math.max(0, toNumber(task.milesNoticeValue));

      if (currentMileage != null && dueMiles > 0) {
        if (currentMileage > dueMiles) {
          milesStatus = "overdue";
        } else if (currentMileage >= dueMiles - noticeMiles) {
          milesStatus = "dueSoon";
        }
      }
    }

    if (dateStatus === "overdue" || milesStatus === "overdue") {
      return "Overdue";
    }

    if (dateStatus === "dueSoon" || milesStatus === "dueSoon") {
      return "Due Soon";
    }

    return "OK";
  }

  function getTrackingSummary(eq, task) {
    const tracking = getTaskTracking(eq, task.id);

    return {
      lastCompletedDate: tracking.lastCompletedDate || "-",
      lastCompletedMiles: tracking.lastCompletedMiles || "-",
      notes: tracking.notes || ""
    };
  }

  function renderEquipmentServices(equipmentId) {
    if (!dom.equipmentServicesTableBody) return;

    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));
    if (!eq) return;

    const allTasks = (settingsCache.serviceTasks || []).map(normalizeServiceTask);
    const tasks = getServiceTasksForEquipment(eq);
    dom.equipmentServicesTableBody.innerHTML = "";

    if (!tasks.length) {
      const empty = document.createElement("tr");
      empty.innerHTML = `<td colspan="8" class="emptyCell">No matching service intervals for this equipment location</td>`;
      dom.equipmentServicesTableBody.appendChild(empty);
      return;
    }

    tasks.forEach(task => {
      const row = document.createElement("tr");

      const linkedName = findTaskNameById(task.linkedTaskId, allTasks);
      const parentName = findTaskNameById(task.parentTaskId, allTasks);
      const trackingSummary = getTrackingSummary(eq, task);
      const status = getTaskStatus(eq, task);

      row.innerHTML = `
        <td>${formatTaskLocations(task, eq.location || "")}</td>
        <td>${task.task || "Untitled Task"}</td>
        <td>${formatServiceSchedule(task)}</td>
        <td>${trackingSummary.lastCompletedDate}</td>
        <td>${trackingSummary.lastCompletedMiles}</td>
        <td>${status}</td>
        <td>${
          [
            parentName ? `Parent: ${parentName}` : "",
            linkedName ? `Linked: ${linkedName}` : "",
            trackingSummary.notes ? `Notes: ${trackingSummary.notes}` : ""
          ].filter(Boolean).join(" • ") || "-"
        }</td>
        <td>
          <button
            type="button"
            class="serviceUpdateBtn"
            data-service-equipment-id="${eq.id}"
            data-service-task-id="${task.id}"
          >
            Update
          </button>
        </td>
      `;

      dom.equipmentServicesTableBody.appendChild(row);
    });
  }

  function showEquipmentProfile(equipmentId) {
    const eq = equipmentList.find(item => String(item.id) === String(equipmentId));
    if (!eq) return;

    selectedEquipmentId = eq.id;

    if (dom.equipmentListSection) dom.equipmentListSection.style.display = "none";
    if (dom.equipmentProfileSection) dom.equipmentProfileSection.style.display = "block";

    dom.profileTabs?.forEach(tab => tab.classList.remove("active"));
    dom.profileTabContents?.forEach(content => content.classList.remove("active"));

    const overviewTabButton = document.querySelector('[data-profile-tab="overviewTab"]');
    const overviewTab = byId("overviewTab");

    if (overviewTabButton) overviewTabButton.classList.add("active");
    if (overviewTab) overviewTab.classList.add("active");

    setValue("historyStatusFilter", "All");
    setValue("historyDateFrom", "");
    setValue("historyDateTo", "");

    setText("profileUnit", eq.unit || "");
    setText("profileType", eq.type || "");
    setText("profileYear", eq.year || "");
    setText("profileVin", eq.vin || "");
    setText("profilePlate", eq.plate || "");
    setText("profileState", eq.state || "");
    setText("profileStatus", eq.status || "");
    setText("profileLocation", eq.location || "");
    setText("profilePM", eq.pm || "");
    setText("profileBusiness", eq.business || "");
    setText("profileRim", eq.rim || "");
    setText("profileSize", eq.size || "");
    setText("profilePressure", eq.pressure || "");
    setText("profileManufacturer", eq.manufacturer || "");
    setText("profileBodyClass", eq.bodyClass || "");
    setText("profileDriveType", eq.driveType || "");
    setText("profileFuelType", eq.fuelType || "");
    setText("profileEngine", eq.engine || "");
    setText("profileCylinders", "");

    renderEquipmentHistory(eq.id);
    renderEquipmentServices(eq.id);
  }

  function renderEquipmentHistory(equipmentId) {
    if (!dom.equipmentHistoryTableBody) return;

    const statusFilter = getValue("historyStatusFilter");
    const dateFrom = getValue("historyDateFrom");
    const dateTo = getValue("historyDateTo");

    let equipmentWorkOrders = workOrdersCache.filter(
      wo =>
        String(wo.equipmentId) === String(equipmentId) ||
        String(wo.equipmentNumber || "") ===
          String(
            equipmentList.find(eq => String(eq.id) === String(equipmentId))?.unit || ""
          )
    );

    const totalAllRepairCost = equipmentWorkOrders.reduce(
      (sum, wo) => sum + Number(wo.grandTotal || wo.total || 0),
      0
    );

    if (statusFilter && statusFilter !== "All") {
      equipmentWorkOrders = equipmentWorkOrders.filter(
        wo => normalizeLower(wo.status) === normalizeLower(statusFilter)
      );
    }

    if (dateFrom) {
      equipmentWorkOrders = equipmentWorkOrders.filter(wo => {
        const woDate = String(wo.dateScheduled || wo.date || wo.opened || "");
        return woDate >= dateFrom;
      });
    }

    if (dateTo) {
      equipmentWorkOrders = equipmentWorkOrders.filter(wo => {
        const woDate = String(wo.dateScheduled || wo.date || wo.opened || "");
        return woDate <= dateTo;
      });
    }

    const filteredRepairCost = equipmentWorkOrders.reduce(
      (sum, wo) => sum + Number(wo.grandTotal || wo.total || 0),
      0
    );

    setText(
      "profileRepairCount",
      String(
        workOrdersCache.filter(
          wo =>
            String(wo.equipmentId) === String(equipmentId) ||
            String(wo.equipmentNumber || "") ===
              String(
                equipmentList.find(eq => String(eq.id) === String(equipmentId))?.unit || ""
              )
        ).length
      )
    );
    setText("profileRepairCost", `$${totalAllRepairCost.toFixed(2)}`);
    setText("filteredRepairCount", String(equipmentWorkOrders.length));
    setText("filteredRepairCost", `$${filteredRepairCost.toFixed(2)}`);

    dom.equipmentHistoryTableBody.innerHTML = "";

    if (!equipmentWorkOrders.length) {
      const empty = document.createElement("tr");
      empty.innerHTML = `<td colspan="6" class="emptyCell">No repair history found</td>`;
      dom.equipmentHistoryTableBody.appendChild(empty);
      return;
    }

    equipmentWorkOrders
      .sort((a, b) =>
        String(b.dateScheduled || b.date || b.opened || "").localeCompare(
          String(a.dateScheduled || a.date || a.opened || "")
        )
      )
      .forEach(wo => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${wo.workOrderNumber || wo.woNumber || ""}</td>
          <td>${wo.dateScheduled || wo.date || wo.opened || ""}</td>
          <td>${wo.status || ""}</td>
          <td>${wo.woType || wo.serviceType || ""}</td>
          <td>${wo.assignee || ""}</td>
          <td>$${Number(wo.grandTotal || wo.total || 0).toFixed(2)}</td>
        `;
        dom.equipmentHistoryTableBody.appendChild(row);
      });
  }

  function renderEquipmentTable() {
    if (!dom.equipmentTableBody || !dom.equipmentTableHeaderRow) return;

    const normalizedRows = getFilteredNormalizedEquipment();

    renderGridHeaderGeneric({
      table: dom.equipmentTable,
      headerRow: dom.equipmentTableHeaderRow,
      columnFiltersHost: dom.equipmentColumnFilters,
      columns: equipmentColumns,
      gridState: equipmentGridState,
      filterUiMode: equipmentFilterUiMode,
      selectionMode: equipmentSelectionMode,
      selectAllCheckboxId: "selectAllEquipmentCheckbox",
      visibleRows: normalizedRows,
      selectedSet: selectedEquipmentIds,
      resultCountEl: dom.equipmentResultCount,
      persistGrid,
      renderFn: renderEquipmentTable,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    dom.equipmentTableBody.innerHTML = "";

    normalizedRows.forEach(eq => {
      const row = document.createElement("tr");
      row.dataset.equipmentId = eq.id;

      if (equipmentSelectionMode) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectColumnCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = isRowSelected(selectedEquipmentIds, eq.id);

        checkbox.addEventListener("click", event => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          toggleRowSelection(selectedEquipmentIds, eq.id);
          refreshEquipmentSelectionUi();
        });

        selectTd.appendChild(checkbox);
        row.appendChild(selectTd);
      }

      equipmentColumns
        .filter(col => col.visible)
        .forEach(col => {
          const td = document.createElement("td");
          td.textContent = normalizeCellValue(eq[col.key]);
          row.appendChild(td);
        });

      row.addEventListener("click", () => {
        if (equipmentSelectionMode) {
          toggleRowSelection(selectedEquipmentIds, eq.id);
          renderEquipmentTable();
        } else {
          showEquipmentProfile(eq.id);
        }
      });

      if (isRowSelected(selectedEquipmentIds, eq.id)) {
        row.classList.add("selectedRow");
      }

      dom.equipmentTableBody.appendChild(row);
    });

    setGridResultCount(dom.equipmentResultCount, normalizedRows);
    refreshEquipmentSelectionUi();
  }

  function bindProfileTabs() {
    if (!dom.profileTabs?.length) return;

    dom.profileTabs.forEach(tab => {
      tab.addEventListener("click", async () => {
        const targetId = tab.dataset.profileTab;
        if (!targetId) return;

        dom.profileTabs.forEach(btn => btn.classList.remove("active"));
        dom.profileTabContents.forEach(content => content.classList.remove("active"));

        tab.classList.add("active");
        const target = byId(targetId);
        if (target) target.classList.add("active");

        if (targetId === "servicesTab" && selectedEquipmentId != null) {
          await refreshSettingsCache();
          renderEquipmentServices(selectedEquipmentId);
        }

        if (targetId === "workOrdersTab" && selectedEquipmentId != null) {
          await refreshWorkOrdersCache();
          renderEquipmentHistory(selectedEquipmentId);
        }
      });
    });
  }

  async function importEquipmentRows(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      await showMessageModal("Import Failed", "No rows found to import.");
      return;
    }

    function getImportedField(rawRow, possibleHeaders = []) {
      for (const key of Object.keys(rawRow || {})) {
        const normalizedKey = normalizeLower(key);
        if (possibleHeaders.some(header => normalizeLower(header) === normalizedKey)) {
          return String(rawRow[key] ?? "").trim();
        }
      }
      return "";
    }

    let importedCount = 0;
    let skippedCount = 0;

    rows.forEach(rawRow => {
      const unit = getImportedField(rawRow, ["unit", "unit number", "equipment", "equipment number"]);
      if (!unit) {
        skippedCount += 1;
        return;
      }

      const existing = findEquipmentByUnit(unit);

      const importedEquipment = {
        id: existing?.id || makeId(),
        unit,
        type: getImportedField(rawRow, ["type"]),
        year: getImportedField(rawRow, ["year"]),
        vin: getImportedField(rawRow, ["vin"]),
        plate: getImportedField(rawRow, ["plate", "license plate"]),
        state: getImportedField(rawRow, ["state", "state/prov", "state/province"]),
        status: getImportedField(rawRow, ["status"]) || "Active",
        location: getImportedField(rawRow, ["location"]),
        pm: getImportedField(rawRow, ["pm", "pm template"]),
        business: getImportedField(rawRow, ["business", "assigned business"]),
        rim: getImportedField(rawRow, ["rim"]),
        size: getImportedField(rawRow, ["size", "tire size"]),
        pressure: getImportedField(rawRow, ["pressure", "tire pressure"]),
        manufacturer: getImportedField(rawRow, ["manufacturer"]),
        bodyClass: getImportedField(rawRow, ["body class"]),
        driveType: getImportedField(rawRow, ["drive type"]),
        fuelType: getImportedField(rawRow, ["fuel type"]),
        engine: getImportedField(rawRow, ["engine"]),
        serviceTracking: safeObject(existing?.serviceTracking)
      };

      equipmentColumns
        .filter(col => col.custom)
        .forEach(col => {
          importedEquipment[col.key] = getImportedField(rawRow, [col.label, col.key]);
        });

      if (existing) {
        const index = equipmentList.findIndex(eq => String(eq.id) === String(existing.id));
        if (index >= 0) {
          equipmentList[index] = {
            ...equipmentList[index],
            ...importedEquipment,
            id: existing.id,
            serviceTracking: safeObject(equipmentList[index].serviceTracking)
          };
        }
      } else {
        equipmentList.push(importedEquipment);
      }

      importedCount += 1;
    });

    await persistEquipment();
    renderEquipmentTable();

    await showMessageModal(
      "Import Complete",
      `Imported/updated: ${importedCount}. Skipped: ${skippedCount}.`
    );
  }

  function handleEquipmentImport(file) {
    if (!file || !window.XLSX) return;

    const reader = new FileReader();

    reader.onload = async function (event) {
      try {
        const data = event.target.result;
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        await importEquipmentRows(rows);
      } catch (error) {
        console.error("Equipment import failed:", error);
        await showMessageModal("Import Failed", "Unable to import the selected file.");
      } finally {
        if (dom.equipmentImportInput) dom.equipmentImportInput.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }

  async function decodeVin() {
    const vin = getValue("vin").trim().toUpperCase();

    if (vin.length !== 17) {
      await showMessageModal("Invalid VIN", "Please enter a full 17-character VIN.");
      dom.vin?.focus();
      return;
    }

    if (dom.decodeVinBtn) {
      dom.decodeVinBtn.disabled = true;
      dom.decodeVinBtn.textContent = "Decoding...";
    }

    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
      const response = await fetch(url);
      const data = await response.json();
      const result = data?.Results?.[0];

      if (!result) {
        await showMessageModal("VIN Not Found", "No VIN data found.");
        return;
      }

      if (!getValue("year") && result.ModelYear) setValue("year", result.ModelYear);
      if (!getValue("manufacturer") && result.Make) setValue("manufacturer", result.Make);
      if (!getValue("type") && result.Model) setValue("type", result.Model);
      if (!getValue("bodyClass") && result.BodyClass) setValue("bodyClass", result.BodyClass);
      if (!getValue("driveType") && result.DriveType) setValue("driveType", result.DriveType);
      if (!getValue("fuelType") && result.FuelTypePrimary) setValue("fuelType", result.FuelTypePrimary);
      if (!getValue("engine") && result.EngineModel) setValue("engine", result.EngineModel);
    } catch (error) {
      console.error("VIN decode failed:", error);
      await showMessageModal("VIN Decode Failed", "Unable to decode VIN.");
    } finally {
      if (dom.decodeVinBtn) {
        dom.decodeVinBtn.disabled = false;
        dom.decodeVinBtn.textContent = "Decode VIN";
      }
    }
  }

  function bindEvents() {
    if (dom.openFormBtn) {
      dom.openFormBtn.addEventListener("click", openEquipmentFormForAdd);
    }

    if (dom.closeBtn) {
      dom.closeBtn.addEventListener("click", () => {
        if (dom.formPanel) dom.formPanel.style.display = "none";
      });
    }

    if (dom.saveBtn) {
      dom.saveBtn.addEventListener("click", () => {
        saveEquipmentRecord();
      });
    }

    if (dom.updateBtn) {
      dom.updateBtn.addEventListener("click", () => {
        updateEquipmentRecord();
      });
    }

    if (dom.deleteBtn) {
      dom.deleteBtn.addEventListener("click", () => {
        deleteEquipmentRecord();
      });
    }

    if (dom.editProfileBtn) {
      dom.editProfileBtn.addEventListener("click", () => {
        const eq = equipmentList.find(item => String(item.id) === String(selectedEquipmentId));
        if (eq) openEdit(eq);
      });
    }

    if (dom.backToEquipmentListBtn) {
      dom.backToEquipmentListBtn.addEventListener("click", () => {
        if (dom.equipmentProfileSection) dom.equipmentProfileSection.style.display = "none";
        if (dom.equipmentListSection) dom.equipmentListSection.style.display = "block";
      });
    }

    if (dom.manageColumnsBtn) {
      dom.manageColumnsBtn.addEventListener("click", () => {
        dom.equipmentOptionsDropdown?.classList.remove("show");
        openColumnManager();
      });
    }

    if (dom.closeColumnManagerBtn) {
      dom.closeColumnManagerBtn.addEventListener("click", closeColumnManager);
    }

    if (dom.equipmentGlobalSearch) {
      dom.equipmentGlobalSearch.value = equipmentGridState.globalSearch || "";
      dom.equipmentGlobalSearch.addEventListener("input", event => {
        equipmentGridState.globalSearch = event.target.value || "";
        persistGrid();
        renderEquipmentTable();
      });
    }

    if (dom.clearEquipmentFiltersBtn) {
      dom.clearEquipmentFiltersBtn.addEventListener("click", () => {
        dom.equipmentOptionsDropdown?.classList.remove("show");
        clearEquipmentFilters();
      });
    }

    if (dom.equipmentOptionsBtn && dom.equipmentOptionsDropdown) {
      dom.equipmentOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.equipmentOptionsDropdown.classList.toggle("show");
      });
    }

    if (dom.importEquipmentBtn) {
      dom.importEquipmentBtn.addEventListener("click", () => {
        dom.equipmentOptionsDropdown?.classList.remove("show");
        dom.equipmentImportInput?.click();
      });
    }

    if (dom.equipmentImportInput) {
      dom.equipmentImportInput.addEventListener("change", event => {
        const file = event.target.files?.[0];
        if (file) handleEquipmentImport(file);
      });
    }

    if (dom.decodeVinBtn) {
      dom.decodeVinBtn.addEventListener("click", decodeVin);
    }

    if (dom.deleteSelectedEquipmentBtn) {
      dom.deleteSelectedEquipmentBtn.addEventListener("click", () => {
        deleteSelectedEquipmentFromMainPage();
      });
    }

    if (dom.cancelEquipmentSelectionBtn) {
      dom.cancelEquipmentSelectionBtn.addEventListener("click", () => {
        exitEquipmentSelectionMode(true);
      });
    }

    if (dom.applyHistoryFiltersBtn) {
      dom.applyHistoryFiltersBtn.addEventListener("click", async () => {
        if (selectedEquipmentId != null) {
          await refreshWorkOrdersCache();
          renderEquipmentHistory(selectedEquipmentId);
        }
      });
    }

    if (dom.clearHistoryFiltersBtn) {
      dom.clearHistoryFiltersBtn.addEventListener("click", async () => {
        setValue("historyStatusFilter", "All");
        setValue("historyDateFrom", "");
        setValue("historyDateTo", "");
        if (selectedEquipmentId != null) {
          await refreshWorkOrdersCache();
          renderEquipmentHistory(selectedEquipmentId);
        }
      });
    }

    if (dom.equipmentServicesTableBody) {
      dom.equipmentServicesTableBody.addEventListener("click", event => {
        const button = event.target.closest(".serviceUpdateBtn");
        if (!button) return;

        const equipmentId = button.dataset.serviceEquipmentId;
        const taskId = button.dataset.serviceTaskId;

        if (!equipmentId || !taskId) return;
        openServiceTrackingModal(equipmentId, taskId);
      });
    }

    if (dom.closeServiceTrackingModalBtn) {
      dom.closeServiceTrackingModalBtn.addEventListener("click", closeServiceTrackingModal);
    }

    if (dom.cancelServiceTrackingBtn) {
      dom.cancelServiceTrackingBtn.addEventListener("click", closeServiceTrackingModal);
    }

    if (dom.saveServiceTrackingBtn) {
      dom.saveServiceTrackingBtn.addEventListener("click", saveServiceTrackingModal);
    }

    document.addEventListener("click", event => {
      if (
        dom.equipmentOptionsDropdown &&
        dom.equipmentOptionsBtn &&
        !dom.equipmentOptionsDropdown.contains(event.target) &&
        !dom.equipmentOptionsBtn.contains(event.target)
      ) {
        dom.equipmentOptionsDropdown.classList.remove("show");
      }

      if (dom.serviceTrackingModal && event.target === dom.serviceTrackingModal) {
        closeServiceTrackingModal();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (dom.serviceTrackingModal?.classList.contains("show")) {
          closeServiceTrackingModal();
          return;
        }

        if (dom.appModal?.classList.contains("show") && appModalResolver) {
          const resolver = appModalResolver;
          appModalResolver = null;
          dom.appModal.classList.remove("show");
          resolver(false);
        }
      }
    });

    bindProfileTabs();
  }

  bindEvents();
  await hydrateSharedData();
  renderEquipmentTable();

  return {
    renderEquipmentTable,
    showEquipmentProfile,
    openEquipmentFormForAdd
  };
}