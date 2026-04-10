import { getDom } from "./dom.js";
import {
  setText,
  normalizeCellValue
} from "./utils.js";
import {
  loadEquipment,
  loadDeletedEquipment,
  saveEquipment,
  saveDeletedEquipment
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

  const DEFAULT_DELETED_EQUIPMENT_COLUMNS = [
    { key: "unit", label: "Unit", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "type", label: "Type", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "status", label: "Status", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "location", label: "Location", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "year", label: "Year", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "vin", label: "VIN", visible: false, sortable: true, filterType: "text", custom: false }
  ];

  let deletedEquipmentColumns = loadDeletedEquipmentColumnsLocal(DEFAULT_DELETED_EQUIPMENT_COLUMNS);
  let deletedEquipmentGridState = loadDeletedEquipmentGridStateLocal({
    sortKey: "unit",
    sortDirection: "asc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

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

  function showDeletedEquipment(equipmentId) {
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
    const eq = deletedEquipment.find(e => String(e.id) === String(id));
    if (!eq) return;

    equipmentList.push(eq);
    deletedEquipment = deletedEquipment.filter(e => String(e.id) !== String(id));

    await persistEquipment();
    await persistDeletedEquipment();

    if (dom.deletedEquipmentPanel) {
      dom.deletedEquipmentPanel.style.display = "none";
    }

    selectedDeletedEquipmentId = null;
    renderDeletedEquipment();
  }

  async function permanentlyDeleteEquipment(id) {
    const confirmed = confirm("Permanently delete this equipment?");
    if (!confirmed) return;

    deletedEquipment = deletedEquipment.filter(e => String(e.id) !== String(id));
    await persistDeletedEquipment();

    if (dom.deletedEquipmentPanel) {
      dom.deletedEquipmentPanel.style.display = "none";
    }

    selectedDeletedEquipmentId = null;
    renderDeletedEquipment();
  }

  async function restoreSelectedDeletedEquipment() {
    if (!deletedEquipmentSelectionMode) {
      enterDeletedEquipmentSelectionMode();
      return;
    }

    if (selectedDeletedEquipmentIds.size === 0) {
      alert("Select equipment to restore.");
      return;
    }

    const recordsToRestore = deletedEquipment.filter(eq =>
      selectedDeletedEquipmentIds.has(String(eq.id))
    );

    equipmentList.push(...recordsToRestore);
    deletedEquipment = deletedEquipment.filter(eq =>
      !selectedDeletedEquipmentIds.has(String(eq.id))
    );

    await persistEquipment();
    await persistDeletedEquipment();
    exitDeletedEquipmentSelectionMode(true);
  }

  async function permanentlyDeleteSelectedDeletedEquipment() {
    if (!deletedEquipmentSelectionMode) {
      enterDeletedEquipmentSelectionMode();
      return;
    }

    if (selectedDeletedEquipmentIds.size === 0) {
      alert("Select equipment to permanently delete.");
      return;
    }

    const confirmed = confirm(
      `Permanently delete ${selectedDeletedEquipmentIds.size} selected equipment item(s)?`
    );
    if (!confirmed) return;

    deletedEquipment = deletedEquipment.filter(eq =>
      !selectedDeletedEquipmentIds.has(String(eq.id))
    );

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

    const rows = getFilteredDeletedEquipmentData();

    renderGridHeaderGeneric({
      table: dom.deletedEquipmentTable,
      headerRow: dom.deletedEquipmentTableHeaderRow,
      columnFiltersHost: dom.deletedEquipmentColumnFilters,
      columns: deletedEquipmentColumns,
      gridState: deletedEquipmentGridState,
      filterUiMode: deletedEquipmentFilterUiMode,
      selectionMode: deletedEquipmentSelectionMode,
      selectAllCheckboxId: "selectAllDeletedEquipmentCheckbox",
      visibleRows: rows,
      selectedSet: selectedDeletedEquipmentIds,
      resultCountEl: dom.deletedEquipmentResultCount,
      persistGrid,
      renderFn: renderDeletedEquipment,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    dom.deletedEquipmentTableBody.innerHTML = "";

    rows.forEach(eq => {
      const row = document.createElement("tr");
      row.dataset.deletedEquipmentId = eq.id;

      if (deletedEquipmentSelectionMode) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectColumnCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = isRowSelected(selectedDeletedEquipmentIds, eq.id);

        checkbox.addEventListener("click", event => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          toggleRowSelection(selectedDeletedEquipmentIds, eq.id);
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

      row.addEventListener("click", () => {
        if (deletedEquipmentSelectionMode) {
          toggleRowSelection(selectedDeletedEquipmentIds, eq.id);
          renderDeletedEquipment();
        } else {
          showDeletedEquipment(eq.id);
        }
      });

      if (isRowSelected(selectedDeletedEquipmentIds, eq.id)) {
        row.classList.add("selectedRow");
      }

      dom.deletedEquipmentTableBody.appendChild(row);
    });

    setGridResultCount(dom.deletedEquipmentResultCount, rows);
    refreshDeletedEquipmentSelectionUi();
  }

  function bindEvents() {
    if (dom.deletedEquipmentGlobalSearch) {
      dom.deletedEquipmentGlobalSearch.value = deletedEquipmentGridState.globalSearch || "";
      dom.deletedEquipmentGlobalSearch.addEventListener("input", () => {
        deletedEquipmentGridState.globalSearch = dom.deletedEquipmentGlobalSearch.value || "";
        persistGrid();
        renderDeletedEquipment();
      });
    }

    if (dom.clearDeletedEquipmentFiltersBtn) {
      dom.clearDeletedEquipmentFiltersBtn.addEventListener("click", clearDeletedEquipmentFilters);
    }

    if (dom.restoreSelectedEquipmentBtn) {
      dom.restoreSelectedEquipmentBtn.addEventListener("click", () => {
        restoreSelectedDeletedEquipment();
      });
    }

    if (dom.permanentlyDeleteSelectedEquipmentBtn) {
      dom.permanentlyDeleteSelectedEquipmentBtn.addEventListener(
        "click",
        () => {
          permanentlyDeleteSelectedDeletedEquipment();
        }
      );
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
  }

  bindEvents();
  await hydrateDeletedEquipmentData();
  renderDeletedEquipment();

  return {
    renderDeletedEquipment,
    showDeletedEquipment
  };
}