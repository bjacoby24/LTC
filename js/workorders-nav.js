import { getDom } from "./dom.js";
import { normalizeCellValue } from "./utils.js";
import {
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

const WO_STORAGE_KEYS = {
  columns: "fleetWOColumns",
  gridState: "fleetWOGridState"
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

function loadWOColumnsLocal(defaultColumns = []) {
  const saved = safeParse(localStorage.getItem(WO_STORAGE_KEYS.columns), defaultColumns);
  return Array.isArray(saved) ? saved : defaultColumns;
}

function loadWOGridStateLocal(defaultState = {}) {
  const saved = safeParse(localStorage.getItem(WO_STORAGE_KEYS.gridState), defaultState);
  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved
    : defaultState;
}

function saveWOGridSettingsLocal(columns, state) {
  localStorage.setItem(
    WO_STORAGE_KEYS.columns,
    JSON.stringify(Array.isArray(columns) ? columns : [])
  );

  localStorage.setItem(
    WO_STORAGE_KEYS.gridState,
    JSON.stringify(
      state && typeof state === "object" && !Array.isArray(state) ? state : {}
    )
  );
}

export async function initWorkOrdersNav() {
  const dom = getDom();

  const DEFAULT_WO_COLUMNS = [
    { key: "workOrderNumber", label: "WO #", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "equipmentNumber", label: "Equipment", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "status", label: "Status", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "woType", label: "Type", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "date", label: "Opened", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "assignee", label: "Assignee", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "meter", label: "Meter", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "grandTotal", label: "Total", visible: true, sortable: true, filterType: "text", custom: false }
  ];

  let workOrders = [];
  let selectedWorkOrderIds = new Set();
  let workOrdersSelectionMode = false;
  let woFilterUiMode = "header";

  let woColumns = loadWOColumnsLocal(DEFAULT_WO_COLUMNS);

  let woGridState = loadWOGridStateLocal({
    sortKey: "date",
    sortDirection: "desc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

  async function hydrateWorkOrders() {
    try {
      const loaded = await loadWorkOrders();
      workOrders = Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      console.error("Failed to load work orders:", error);
      workOrders = [];
    }
  }

  async function persistWorkOrders() {
    await saveWorkOrders(workOrders);
  }

  function persistGrid() {
    saveWOGridSettingsLocal(woColumns, woGridState);
  }

  function normalizeWorkOrderRecord(wo) {
    return {
      ...wo,
      id: wo?.id ?? "",
      workOrderNumber: wo?.workOrderNumber || wo?.woNumber || "",
      equipmentNumber: wo?.equipmentNumber || "",
      status: wo?.status || "",
      woType: wo?.woType || wo?.repair || "",
      date: wo?.date || wo?.opened || "",
      assignee: wo?.assignee || "",
      meter: wo?.meter || wo?.mileage || "",
      grandTotal: Number(wo?.grandTotal ?? wo?.total ?? 0)
    };
  }

  function getNormalizedWorkOrders() {
    return workOrders.map(normalizeWorkOrderRecord);
  }

  function getFilteredNormalizedWorkOrders() {
    return getFilteredGridData(getNormalizedWorkOrders(), woColumns, woGridState);
  }

  function refreshWorkOrdersSelectionUi() {
    updateSelectionButtonText({
      selectionMode: workOrdersSelectionMode,
      selectedSet: selectedWorkOrderIds,
      actionButton: dom.deleteSelectedWOBtn,
      defaultText: "Delete Selected",
      confirmText: "Confirm Delete",
      cancelButton: dom.cancelWOSelectionBtn,
      table: dom.workOrdersTable
    });
  }

  function enterWorkOrdersSelectionMode() {
    workOrdersSelectionMode = true;
    refreshWorkOrdersSelectionUi();
    renderWorkOrdersNavTable();
  }

  function exitWorkOrdersSelectionMode(clear = true) {
    workOrdersSelectionMode = false;
    if (clear) clearSelections(selectedWorkOrderIds);
    refreshWorkOrdersSelectionUi();
    renderWorkOrdersNavTable();
  }

  function openWorkOrderFormWindow(workOrderId = null) {
    const url = workOrderId != null
      ? `workorder.html?id=${workOrderId}`
      : "workorder.html";

    window.open(url, "WorkOrderWindow", "width=1200,height=900");
  }

  async function deleteSelectedWorkOrders() {
    if (!workOrdersSelectionMode) {
      enterWorkOrdersSelectionMode();
      return;
    }

    if (selectedWorkOrderIds.size === 0) {
      alert("Select work orders to delete.");
      return;
    }

    const confirmed = confirm(
      `Delete ${selectedWorkOrderIds.size} selected work order(s)?`
    );
    if (!confirmed) return;

    workOrders = workOrders.filter(
      wo => !selectedWorkOrderIds.has(String(wo.id))
    );

    await persistWorkOrders();
    exitWorkOrdersSelectionMode(true);
  }

  function clearWOFilters() {
    woGridState.globalSearch = "";
    woGridState.filters = {};
    woGridState.headerMenuOpenFor = null;

    if (dom.woGlobalSearch) {
      dom.woGlobalSearch.value = "";
    }

    clearSelections(selectedWorkOrderIds);
    persistGrid();
    renderWorkOrdersNavTable();
  }

  function ensureValidColumns() {
    if (!Array.isArray(woColumns) || !woColumns.length || !woColumns.some(col => col.visible)) {
      woColumns = DEFAULT_WO_COLUMNS.map(col => ({ ...col }));
      persistGrid();
    }
  }

  function renderEmptyRow(message) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "emptyCell";
    td.colSpan = woColumns.filter(col => col.visible).length + 1;
    td.textContent = message;
    row.appendChild(td);
    dom.workOrdersTableBody.appendChild(row);
  }

  function renderWorkOrdersNavTable() {
    if (!dom.workOrdersTable || !dom.workOrdersTableHeaderRow || !dom.workOrdersTableBody) {
      console.warn("Work Orders grid DOM missing", {
        table: !!dom.workOrdersTable,
        headerRow: !!dom.workOrdersTableHeaderRow,
        body: !!dom.workOrdersTableBody
      });
      return;
    }

    ensureValidColumns();

    const normalizedData = getNormalizedWorkOrders();
    const normalizedRows = getFilteredGridData(normalizedData, woColumns, woGridState);

    buildColumnFiltersGeneric({
      container: dom.woColumnFilters,
      columns: woColumns,
      data: normalizedData,
      gridState: woGridState,
      filterUiMode: woFilterUiMode,
      saveFn: persistGrid,
      renderFn: renderWorkOrdersNavTable
    });

    renderGridHeaderGeneric({
      headerRow: dom.workOrdersTableHeaderRow,
      table: dom.workOrdersTable,
      columns: woColumns,
      data: normalizedData,
      gridState: woGridState,
      filterUiMode: woFilterUiMode,
      saveFn: persistGrid,
      renderFn: renderWorkOrdersNavTable,
      selectedSet: selectedWorkOrderIds,
      visibleRows: normalizedRows,
      selectAllCheckboxId: "selectAllWorkOrdersCheckbox",
      rowIdAttribute: "workOrderId"
    });

    dom.workOrdersTableBody.innerHTML = "";

    if (!normalizedRows.length) {
      renderEmptyRow("No work orders found");
      setGridResultCount(dom.woResultCount, normalizedRows);
      refreshWorkOrdersSelectionUi();
      return;
    }

    normalizedRows.forEach(wo => {
      const row = document.createElement("tr");
      row.dataset.workOrderId = wo.id;

      const selectTd = document.createElement("td");
      selectTd.className = "selectColumnCell";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "gridRowCheckbox";
      checkbox.checked = isRowSelected(selectedWorkOrderIds, wo.id);

      checkbox.addEventListener("click", event => event.stopPropagation());
      checkbox.addEventListener("change", () => {
        toggleRowSelection(selectedWorkOrderIds, wo.id);
        refreshWorkOrdersSelectionUi();
      });

      selectTd.appendChild(checkbox);
      row.appendChild(selectTd);

      woColumns
        .filter(col => col.visible)
        .forEach(col => {
          const td = document.createElement("td");
          td.textContent = col.key === "grandTotal"
            ? `$${Number(wo[col.key] || 0).toFixed(2)}`
            : normalizeCellValue(wo[col.key]);

          row.appendChild(td);
        });

      row.addEventListener("click", () => {
        if (workOrdersSelectionMode) {
          toggleRowSelection(selectedWorkOrderIds, wo.id);
          renderWorkOrdersNavTable();
        } else {
          openWorkOrderFormWindow(wo.id);
        }
      });

      if (isRowSelected(selectedWorkOrderIds, wo.id)) {
        row.classList.add("selectedRow");
      }

      dom.workOrdersTableBody.appendChild(row);
    });

    setGridResultCount(dom.woResultCount, normalizedRows);
    refreshWorkOrdersSelectionUi();
  }

  function bindEvents() {
    if (dom.openQuickWOFormBtn) {
      dom.openQuickWOFormBtn.addEventListener("click", () => {
        openWorkOrderFormWindow();
      });
    }

    if (dom.deleteSelectedWOBtn) {
      dom.deleteSelectedWOBtn.addEventListener("click", deleteSelectedWorkOrders);
    }

    if (dom.cancelWOSelectionBtn) {
      dom.cancelWOSelectionBtn.addEventListener("click", () => {
        exitWorkOrdersSelectionMode(true);
      });
    }

    if (dom.woGlobalSearch) {
      dom.woGlobalSearch.value = woGridState.globalSearch || "";
      dom.woGlobalSearch.addEventListener("input", () => {
        woGridState.globalSearch = dom.woGlobalSearch.value || "";
        persistGrid();
        renderWorkOrdersNavTable();
      });
    }

    if (dom.clearWOFiltersBtn) {
      dom.clearWOFiltersBtn.addEventListener("click", clearWOFilters);
    }

    if (dom.workOrdersOptionsBtn && dom.workOrdersOptionsDropdown) {
      dom.workOrdersOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.workOrdersOptionsDropdown.classList.toggle("show");
      });

      document.addEventListener("click", event => {
        if (
          dom.workOrdersOptionsDropdown &&
          dom.workOrdersOptionsBtn &&
          !dom.workOrdersOptionsDropdown.contains(event.target) &&
          !dom.workOrdersOptionsBtn.contains(event.target)
        ) {
          dom.workOrdersOptionsDropdown.classList.remove("show");
        }
      });
    }
  }

  console.log("initWorkOrdersNav running", {
    table: !!dom.workOrdersTable,
    headerRow: !!dom.workOrdersTableHeaderRow,
    body: !!dom.workOrdersTableBody,
    columnsLoaded: woColumns
  });

  bindEvents();
  await hydrateWorkOrders();
  renderWorkOrdersNavTable();

  return {
    renderWorkOrdersNavTable,
    openWorkOrderFormWindow
  };
}