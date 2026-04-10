import { getDom } from "./dom.js";
import {
  normalizeText,
  normalizeCellValue,
  makeId
} from "./utils.js";
import {
  loadVendors,
  saveVendors
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
      dom.saveVendorBtn.style.display = mode === "save" ? "inline-block" : "none";
    }
    if (dom.updateVendorBtn) {
      dom.updateVendorBtn.style.display = mode === "edit" ? "inline-block" : "none";
    }
    if (dom.deleteVendorBtn) {
      dom.deleteVendorBtn.style.display = mode === "edit" ? "inline-block" : "none";
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

  function openVendorForm(vendorId = null) {
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
    const record = buildVendorRecord();

    if (!normalizeText(record.name)) {
      alert("Please enter a vendor name.");
      return;
    }

    vendors.push(record);
    await persistVendors();
    renderVendorsGrid();
    closeVendorPanel();
  }

  async function updateVendorRecord() {
    if (editingVendorId == null) return;

    const index = vendors.findIndex(entry => String(entry.id) === String(editingVendorId));
    if (index === -1) return;

    const record = buildVendorRecord(vendors[index].id);

    if (!normalizeText(record.name)) {
      alert("Please enter a vendor name.");
      return;
    }

    vendors[index] = record;
    await persistVendors();
    renderVendorsGrid();
    closeVendorPanel();
  }

  async function deleteVendorRecord() {
    if (editingVendorId == null) return;

    const confirmed = confirm("Delete this vendor?");
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
    if (!vendorSelectionMode) {
      enterVendorSelectionMode();
      return;
    }

    if (selectedVendorIds.size === 0) {
      alert("Select vendors to delete.");
      return;
    }

    const confirmed = confirm(`Delete ${selectedVendorIds.size} selected vendor(s)?`);
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

    const normalizedRows = getFilteredNormalizedVendors();

    renderGridHeaderGeneric({
      table: dom.vendorsTable,
      headerRow: dom.vendorsTableHeaderRow,
      columnFiltersHost: dom.vendorsColumnFilters,
      columns: vendorColumns,
      gridState: vendorGridState,
      filterUiMode: vendorFilterUiMode,
      selectionMode: vendorSelectionMode,
      selectAllCheckboxId: "selectAllVendorsCheckbox",
      visibleRows: normalizedRows,
      selectedSet: selectedVendorIds,
      resultCountEl: dom.vendorsResultCount,
      persistGrid,
      renderFn: renderVendorsGrid,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    dom.vendorsTableBody.innerHTML = "";

    normalizedRows.forEach(vendor => {
      const row = document.createElement("tr");
      row.dataset.vendorId = vendor.id;

      if (vendorSelectionMode) {
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

      row.addEventListener("click", () => {
        if (vendorSelectionMode) {
          toggleRowSelection(selectedVendorIds, vendor.id);
          renderVendorsGrid();
        } else {
          openVendorForm(vendor.id);
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
  }

  bindEvents();
  await hydrateVendors();
  renderVendorsGrid();

  return {
    renderVendorsGrid,
    openVendorForm
  };
}