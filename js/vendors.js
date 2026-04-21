import { getDom } from "./dom.js";
import {
  normalizeText,
  normalizeCellValue,
  makeId
} from "./utils.js";
import {
  loadVendors,
  saveVendors,
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

const VENDOR_STORAGE_KEYS = {
  columns: "fleetVendorColumns",
  gridState: "fleetVendorGridState"
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

function loadVendorColumnsLocal(defaultColumns = []) {
  const saved = safeParse(localStorage.getItem(VENDOR_STORAGE_KEYS.columns), defaultColumns);
  return Array.isArray(saved) ? saved : defaultColumns;
}

function loadVendorGridStateLocal(defaultState = {}) {
  const saved = safeParse(localStorage.getItem(VENDOR_STORAGE_KEYS.gridState), defaultState);
  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved
    : defaultState;
}

function saveVendorGridSettingsLocal(columns, state) {
  localStorage.setItem(
    VENDOR_STORAGE_KEYS.columns,
    JSON.stringify(Array.isArray(columns) ? columns : [])
  );

  localStorage.setItem(
    VENDOR_STORAGE_KEYS.gridState,
    JSON.stringify(
      state && typeof state === "object" && !Array.isArray(state) ? state : {}
    )
  );
}

export async function initVendors() {
  const dom = getDom() || {};

  let vendors = [];
  let editingVendorId = null;
  let selectedVendorIds = new Set();
  let vendorSelectionMode = false;
  let vendorFilterUiMode = "header";

  let appModalResolver = null;
  let appModalLastFocus = null;

  const DEFAULT_VENDOR_COLUMNS = [
    { key: "name", label: "Vendor", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "contact", label: "Contact", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "phone", label: "Phone", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "email", label: "Email", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "address", label: "Address", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "city", label: "City", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "state", label: "State", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "zip", label: "Zip", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "notes", label: "Notes", visible: false, sortable: true, filterType: "text", custom: false }
  ];

  let vendorColumns = loadVendorColumnsLocal(DEFAULT_VENDOR_COLUMNS);
  let vendorGridState = loadVendorGridStateLocal({
    sortKey: "name",
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
      vendorsAccess: true,
      inventoryEdit: true,
      inventoryDelete: true
    };
  }

  return {
    vendorsAccess: true,
    inventoryEdit: true,
    inventoryDelete: false,
    ...permissions
  };
}

  function canViewVendors() {
    return !!getCurrentPermissions().vendorsAccess;
  }

  function canEditVendors() {
    return !!getCurrentPermissions().inventoryEdit;
  }

  function canDeleteVendors() {
    return !!getCurrentPermissions().inventoryDelete;
  }

  async function requirePermission(checkFn, title, message) {
    if (checkFn()) return true;
    await showMessageModal(title, message);
    return false;
  }

  function applyVendorPermissionUi() {
    if (dom.openVendorFormBtn) {
      dom.openVendorFormBtn.style.display = canEditVendors() ? "" : "none";
    }

    if (dom.deleteSelectedVendorBtn) {
      dom.deleteSelectedVendorBtn.style.display = canDeleteVendors() ? "" : "none";
    }

    if (dom.saveVendorBtn) {
      dom.saveVendorBtn.style.display = canEditVendors() ? "" : "none";
    }

    if (dom.updateVendorBtn) {
      dom.updateVendorBtn.style.display = canEditVendors() ? "" : "none";
    }

    if (dom.deleteVendorBtn) {
      dom.deleteVendorBtn.style.display = canDeleteVendors() ? "" : "none";
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
        if (event.target === modal) finish(false);
      };
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

  async function hydrateVendors() {
    try {
      const loaded = await loadVendors();
      vendors = Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      console.error("Failed to load vendors:", error);
      vendors = [];
    }
  }

  async function persistVendors() {
    await saveVendors(vendors);
  }

  function persistGrid() {
    saveVendorGridSettingsLocal(vendorColumns, vendorGridState);
  }

  function normalizeVendorRecord(vendor = {}) {
    return {
      ...vendor,
      id: vendor.id ?? makeId(),
      name: vendor.name || "",
      contact: vendor.contact || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      address: vendor.address || "",
      city: vendor.city || "",
      state: vendor.state || "",
      zip: vendor.zip || "",
      notes: vendor.notes || ""
    };
  }

  function getNormalizedVendors() {
    return vendors.map(normalizeVendorRecord);
  }

  function getFilteredNormalizedVendors() {
    return getFilteredGridData(getNormalizedVendors(), vendorColumns, vendorGridState);
  }

  function closeVendorPanel() {
    if (dom.vendorFormPanel) {
      dom.vendorFormPanel.style.display = "none";
    }
    editingVendorId = null;
  }

  function clearVendorForm() {
    if (dom.vendorName) dom.vendorName.value = "";
    if (dom.vendorContact) dom.vendorContact.value = "";
    if (dom.vendorPhone) dom.vendorPhone.value = "";
    if (dom.vendorEmail) dom.vendorEmail.value = "";
    if (dom.vendorAddress) dom.vendorAddress.value = "";
  }

  function toggleVendorButtons(mode) {
    if (dom.saveVendorBtn) {
      dom.saveVendorBtn.style.display = mode === "save" && canEditVendors() ? "inline-block" : "none";
    }
    if (dom.updateVendorBtn) {
      dom.updateVendorBtn.style.display = mode === "edit" && canEditVendors() ? "inline-block" : "none";
    }
    if (dom.deleteVendorBtn) {
      dom.deleteVendorBtn.style.display = mode === "edit" && canDeleteVendors() ? "inline-block" : "none";
    }
  }

  function parseAddress(addressText = "") {
    const raw = String(addressText || "").trim();
    if (!raw) {
      return { address: "", city: "", state: "", zip: "" };
    }

    const lines = raw.split("\n").map(line => line.trim()).filter(Boolean);
    const firstLine = lines[0] || raw;
    const secondLine = lines[1] || "";

    if (!secondLine) {
      return { address: firstLine, city: "", state: "", zip: "" };
    }

    const cityStateZipMatch = secondLine.match(/^(.*?),\s*([A-Za-z]{2})\s+(.+)$/);

    if (cityStateZipMatch) {
      return {
        address: firstLine,
        city: cityStateZipMatch[1] || "",
        state: cityStateZipMatch[2] || "",
        zip: cityStateZipMatch[3] || ""
      };
    }

    return {
      address: raw,
      city: "",
      state: "",
      zip: ""
    };
  }

  function buildVendorRecord(existingId = null) {
    const addressText = dom.vendorAddress?.value || "";
    const parsed = parseAddress(addressText);

    return {
      id: existingId ?? makeId(),
      name: dom.vendorName?.value || "",
      contact: dom.vendorContact?.value || "",
      phone: dom.vendorPhone?.value || "",
      email: dom.vendorEmail?.value || "",
      address: parsed.address || addressText,
      city: parsed.city || "",
      state: parsed.state || "",
      zip: parsed.zip || "",
      notes: ""
    };
  }

  async function openVendorForm(vendorId = null) {
    if (!(await requirePermission(
      canEditVendors,
      "Permission Required",
      "You do not have permission to edit vendors."
    ))) {
      return;
    }

    if (!dom.vendorFormPanel) return;

    dom.vendorFormPanel.style.display = "block";

    if (vendorId != null) {
      const vendor = vendors.find(entry => String(entry.id) === String(vendorId));
      if (!vendor) return;

      editingVendorId = vendor.id;

      if (dom.vendorName) dom.vendorName.value = vendor.name || "";
      if (dom.vendorContact) dom.vendorContact.value = vendor.contact || "";
      if (dom.vendorPhone) dom.vendorPhone.value = vendor.phone || "";
      if (dom.vendorEmail) dom.vendorEmail.value = vendor.email || "";

      if (dom.vendorAddress) {
        const addressParts = [
          vendor.address || "",
          [vendor.city || "", vendor.state || "", vendor.zip || ""]
            .filter(Boolean)
            .join(" ")
        ].filter(Boolean);

        dom.vendorAddress.value = addressParts.join("\n");
      }

      toggleVendorButtons("edit");
    } else {
      editingVendorId = null;
      clearVendorForm();
      toggleVendorButtons("save");
    }
  }

  async function saveVendorRecord() {
    if (!(await requirePermission(
      canEditVendors,
      "Permission Required",
      "You do not have permission to add vendors."
    ))) {
      return;
    }

    const record = buildVendorRecord();

    if (!normalizeText(record.name)) {
      await showMessageModal("Missing Vendor Name", "Please enter a vendor name.");
      return;
    }

    vendors.push(record);
    await persistVendors();
    renderVendorsGrid();
    closeVendorPanel();
  }

  async function updateVendorRecord() {
    if (!(await requirePermission(
      canEditVendors,
      "Permission Required",
      "You do not have permission to edit vendors."
    ))) {
      return;
    }

    if (editingVendorId == null) return;

    const index = vendors.findIndex(entry => String(entry.id) === String(editingVendorId));
    if (index === -1) return;

    const record = buildVendorRecord(vendors[index].id);

    if (!normalizeText(record.name)) {
      await showMessageModal("Missing Vendor Name", "Please enter a vendor name.");
      return;
    }

    vendors[index] = record;
    await persistVendors();
    renderVendorsGrid();
    closeVendorPanel();
  }

  async function deleteVendorRecord() {
    if (!(await requirePermission(
      canDeleteVendors,
      "Permission Required",
      "You do not have permission to delete vendors."
    ))) {
      return;
    }

    if (editingVendorId == null) return;

    const confirmed = await showConfirmModal(
      "Delete Vendor",
      "Delete this vendor?",
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );
    if (!confirmed) return;

    vendors = vendors.filter(entry => String(entry.id) !== String(editingVendorId));
    await persistVendors();
    renderVendorsGrid();
    closeVendorPanel();
  }

  function refreshVendorSelectionUi() {
    updateSelectionButtonText({
      selectionMode: vendorSelectionMode,
      selectedSet: selectedVendorIds,
      actionButton: dom.deleteSelectedVendorBtn,
      defaultText: "Delete Selected",
      confirmText: "Confirm Delete",
      cancelButton: dom.cancelVendorSelectionBtn,
      table: dom.vendorsTable
    });
  }

  function enterVendorSelectionMode() {
    if (!canDeleteVendors()) return;
    vendorSelectionMode = true;
    refreshVendorSelectionUi();
    renderVendorsGrid();
  }

  function exitVendorSelectionMode(clear = true) {
    vendorSelectionMode = false;
    if (clear) {
      clearSelections(selectedVendorIds);
    }
    refreshVendorSelectionUi();
    renderVendorsGrid();
  }

  async function deleteSelectedVendors() {
    if (!(await requirePermission(
      canDeleteVendors,
      "Permission Required",
      "You do not have permission to delete vendors."
    ))) {
      return;
    }

    if (!vendorSelectionMode) {
      enterVendorSelectionMode();
      return;
    }

    if (selectedVendorIds.size === 0) {
      await showMessageModal("No Vendors Selected", "Select vendors to delete.");
      return;
    }

    const confirmed = await showConfirmModal(
      "Delete Vendors",
      `Delete ${selectedVendorIds.size} selected vendor(s)?`,
      {
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      }
    );
    if (!confirmed) return;

    vendors = vendors.filter(vendor => !selectedVendorIds.has(String(vendor.id)));
    await persistVendors();
    exitVendorSelectionMode(true);
  }

  function clearVendorFilters() {
    vendorGridState.globalSearch = "";
    vendorGridState.filters = {};
    vendorGridState.headerMenuOpenFor = null;

    if (dom.vendorsGlobalSearch) {
      dom.vendorsGlobalSearch.value = "";
    }

    clearSelections(selectedVendorIds);
    persistGrid();
    renderVendorsGrid();
  }

  function renderVendorsGrid() {
    if (!dom.vendorsTableBody) return;

    const normalizedRows = canViewVendors() ? getFilteredNormalizedVendors() : [];

    renderGridHeaderGeneric({
      table: dom.vendorsTable,
      headerRow: dom.vendorsTableHeaderRow,
      columnFiltersHost: dom.vendorsColumnFilters,
      columns: vendorColumns,
      gridState: vendorGridState,
      filterUiMode: vendorFilterUiMode,
      selectionMode: vendorSelectionMode && canDeleteVendors(),
      selectAllCheckboxId: "selectAllVendorsCheckbox",
      visibleRows: normalizedRows,
      selectedSet: selectedVendorIds,
      resultCountEl: dom.vendorsResultCount,
      persistGrid,
      renderFn: renderVendorsGrid,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    dom.vendorsTableBody.innerHTML = "";

    if (!canViewVendors()) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="${Math.max(1, vendorColumns.filter(col => col.visible).length + 1)}" class="emptyCell">You do not have permission to view vendors.</td>`;
      dom.vendorsTableBody.appendChild(row);
      setGridResultCount(dom.vendorsResultCount, []);
      refreshVendorSelectionUi();
      return;
    }

    normalizedRows.forEach(vendor => {
      const row = document.createElement("tr");
      row.dataset.vendorId = vendor.id;

      if (vendorSelectionMode && canDeleteVendors()) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectColumnCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = isRowSelected(selectedVendorIds, vendor.id);

        checkbox.addEventListener("click", event => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          toggleRowSelection(selectedVendorIds, vendor.id);
          refreshVendorSelectionUi();
        });

        selectTd.appendChild(checkbox);
        row.appendChild(selectTd);
      }

      vendorColumns
        .filter(col => col.visible)
        .forEach(col => {
          const td = document.createElement("td");
          td.textContent = normalizeCellValue(vendor[col.key]);
          row.appendChild(td);
        });

      row.addEventListener("click", async () => {
        if (vendorSelectionMode && canDeleteVendors()) {
          toggleRowSelection(selectedVendorIds, vendor.id);
          renderVendorsGrid();
        } else {
          await openVendorForm(vendor.id);
        }
      });

      if (isRowSelected(selectedVendorIds, vendor.id)) {
        row.classList.add("selectedRow");
      }

      dom.vendorsTableBody.appendChild(row);
    });

    setGridResultCount(dom.vendorsResultCount, normalizedRows);
    refreshVendorSelectionUi();
  }

  function bindEvents() {
    if (dom.openVendorFormBtn) {
      dom.openVendorFormBtn.addEventListener("click", () => openVendorForm());
    }

    if (dom.saveVendorBtn) {
      dom.saveVendorBtn.addEventListener("click", saveVendorRecord);
    }

    if (dom.updateVendorBtn) {
      dom.updateVendorBtn.addEventListener("click", updateVendorRecord);
    }

    if (dom.deleteVendorBtn) {
      dom.deleteVendorBtn.addEventListener("click", deleteVendorRecord);
    }

    if (dom.closeVendorBtn) {
      dom.closeVendorBtn.addEventListener("click", closeVendorPanel);
    }

    if (dom.deleteSelectedVendorBtn) {
      dom.deleteSelectedVendorBtn.addEventListener("click", deleteSelectedVendors);
    }

    if (dom.cancelVendorSelectionBtn) {
      dom.cancelVendorSelectionBtn.addEventListener("click", () => {
        exitVendorSelectionMode(true);
      });
    }

    if (dom.vendorsGlobalSearch) {
      dom.vendorsGlobalSearch.value = vendorGridState.globalSearch || "";
      dom.vendorsGlobalSearch.addEventListener("input", () => {
        vendorGridState.globalSearch = dom.vendorsGlobalSearch.value || "";
        persistGrid();
        renderVendorsGrid();
      });
    }

    if (dom.clearVendorFiltersBtn) {
      dom.clearVendorFiltersBtn.addEventListener("click", clearVendorFilters);
    }

    if (dom.vendorsOptionsBtn && dom.vendorsOptionsDropdown) {
      dom.vendorsOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.vendorsOptionsDropdown.classList.toggle("show");
      });

      document.addEventListener("click", event => {
        if (
          dom.vendorsOptionsDropdown &&
          dom.vendorsOptionsBtn &&
          !dom.vendorsOptionsDropdown.contains(event.target) &&
          !dom.vendorsOptionsBtn.contains(event.target)
        ) {
          dom.vendorsOptionsDropdown.classList.remove("show");
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
  await hydrateVendors();
  applyVendorPermissionUi();
  renderVendorsGrid();

  return {
    renderVendorsGrid,
    openVendorForm,
    applyVendorPermissionUi
  };
}