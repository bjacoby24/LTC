import { getDom } from "./dom.js";
import {
  normalizeCellValue
} from "./utils.js";
import {
  loadPurchaseOrders,
  savePurchaseOrders
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

const PO_STORAGE_KEYS = {
  columns: "fleetPOColumns",
  gridState: "fleetPOGridState"
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

function loadPOColumnsLocal(defaultColumns = []) {
  const saved = safeParse(localStorage.getItem(PO_STORAGE_KEYS.columns), defaultColumns);
  return Array.isArray(saved) ? saved : defaultColumns;
}

function loadPOGridStateLocal(defaultState = {}) {
  const saved = safeParse(localStorage.getItem(PO_STORAGE_KEYS.gridState), defaultState);
  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved
    : defaultState;
}

function savePOGridSettingsLocal(columns, state) {
  localStorage.setItem(
    PO_STORAGE_KEYS.columns,
    JSON.stringify(Array.isArray(columns) ? columns : [])
  );

  localStorage.setItem(
    PO_STORAGE_KEYS.gridState,
    JSON.stringify(
      state && typeof state === "object" && !Array.isArray(state) ? state : {}
    )
  );
}

export async function initPurchaseOrdersNav() {
  const dom = getDom() || {};

  let purchaseOrders = [];
  let selectedPurchaseOrderIds = new Set();
  let purchaseOrdersSelectionMode = false;
  let poFilterUiMode = "header";

  const DEFAULT_PO_COLUMNS = [
    { key: "poNumber", label: "PO #", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "vendor", label: "Vendor", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "status", label: "Status", visible: true, sortable: true, filterType: "select", custom: false },
    { key: "date", label: "Date", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "shipTo", label: "Ship To", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "requestedBy", label: "Requested By", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "subtotal", label: "Subtotal", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "taxAmount", label: "Tax", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "shippingAmount", label: "Shipping", visible: false, sortable: true, filterType: "text", custom: false },
    { key: "total", label: "Total", visible: true, sortable: true, filterType: "text", custom: false }
  ];

  let poColumns = loadPOColumnsLocal(DEFAULT_PO_COLUMNS);
  if (!Array.isArray(poColumns) || !poColumns.length || !poColumns.some(col => col.visible)) {
    poColumns = DEFAULT_PO_COLUMNS.map(col => ({ ...col }));
  }

  let poGridState = loadPOGridStateLocal({
    sortKey: "date",
    sortDirection: "desc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

  async function hydratePurchaseOrders() {
    try {
      const loaded = await loadPurchaseOrders();
      purchaseOrders = Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      console.error("Failed to load purchase orders:", error);
      purchaseOrders = [];
    }
  }

  async function persistPurchaseOrders() {
    await savePurchaseOrders(purchaseOrders);
  }

  function persistGrid() {
    savePOGridSettingsLocal(poColumns, poGridState);
  }

  function normalizePurchaseOrderRecord(po = {}) {
    return {
      ...po,
      id: po.id ?? "",
      poNumber: po.poNumber || "",
      vendor: po.vendor || "",
      status: po.status || "",
      date: po.date || "",
      shipTo: po.shipTo || "",
      requestedBy: po.requestedBy || "",
      subtotal: Number(po.subtotal || 0),
      taxAmount: Number(po.taxAmount || 0),
      shippingAmount: Number(po.shippingAmount || 0),
      total: Number(po.total || 0)
    };
  }

  function getNormalizedPurchaseOrders() {
    return purchaseOrders.map(normalizePurchaseOrderRecord);
  }

  function getFilteredNormalizedPurchaseOrders() {
    return getFilteredGridData(getNormalizedPurchaseOrders(), poColumns, poGridState);
  }

  function refreshPurchaseOrdersSelectionUi() {
    updateSelectionButtonText({
      selectionMode: purchaseOrdersSelectionMode,
      selectedSet: selectedPurchaseOrderIds,
      actionButton: dom.deleteSelectedPOBtn,
      defaultText: "Delete Selected",
      confirmText: "Confirm Delete",
      cancelButton: dom.cancelPOSelectionBtn,
      table: dom.poTable
    });
  }

  function enterPurchaseOrdersSelectionMode() {
    purchaseOrdersSelectionMode = true;
    refreshPurchaseOrdersSelectionUi();
    renderPurchaseOrdersNavTable();
  }

  function exitPurchaseOrdersSelectionMode(clear = true) {
    purchaseOrdersSelectionMode = false;
    if (clear) {
      clearSelections(selectedPurchaseOrderIds);
    }
    refreshPurchaseOrdersSelectionUi();
    renderPurchaseOrdersNavTable();
  }

  function openPurchaseOrderFormWindow(purchaseOrderId = null) {
    const url = purchaseOrderId != null
      ? `purchaseorder.html?id=${purchaseOrderId}`
      : "purchaseorder.html";

    window.open(
      url,
      "PurchaseOrderWindow",
      "width=1200,height=900"
    );
  }

  async function deleteSelectedPurchaseOrders() {
    if (!purchaseOrdersSelectionMode) {
      enterPurchaseOrdersSelectionMode();
      return;
    }

    if (selectedPurchaseOrderIds.size === 0) {
      alert("Select purchase orders to delete.");
      return;
    }

    const confirmed = confirm(
      `Delete ${selectedPurchaseOrderIds.size} selected purchase order(s)?`
    );
    if (!confirmed) return;

    purchaseOrders = purchaseOrders.filter(
      po => !selectedPurchaseOrderIds.has(String(po.id))
    );

    await persistPurchaseOrders();
    exitPurchaseOrdersSelectionMode(true);
  }

  function clearPOFilters() {
    poGridState.globalSearch = "";
    poGridState.filters = {};
    poGridState.headerMenuOpenFor = null;

    if (dom.poGlobalSearch) {
      dom.poGlobalSearch.value = "";
    }

    clearSelections(selectedPurchaseOrderIds);
    persistGrid();
    renderPurchaseOrdersNavTable();
  }

  function ensureValidColumns() {
    if (!Array.isArray(poColumns) || !poColumns.length || !poColumns.some(col => col.visible)) {
      poColumns = DEFAULT_PO_COLUMNS.map(col => ({ ...col }));
      persistGrid();
    }
  }

  function renderEmptyRow(message) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "emptyCell";
    td.colSpan = poColumns.filter(col => col.visible).length + 1;
    td.textContent = message;
    row.appendChild(td);
    dom.poTableBody.appendChild(row);
  }

  function renderPurchaseOrdersNavTable() {
    if (!dom.poTable || !dom.poTableHeaderRow || !dom.poTableBody) {
      console.warn("Purchase Orders grid DOM missing", {
        table: !!dom.poTable,
        headerRow: !!dom.poTableHeaderRow,
        body: !!dom.poTableBody
      });
      return;
    }

    ensureValidColumns();

    const normalizedData = getNormalizedPurchaseOrders();
    const normalizedRows = getFilteredGridData(normalizedData, poColumns, poGridState);

    renderGridHeaderGeneric({
      table: dom.poTable,
      headerRow: dom.poTableHeaderRow,
      columnFiltersHost: dom.poColumnFilters,
      columns: poColumns,
      gridState: poGridState,
      filterUiMode: poFilterUiMode,
      selectionMode: purchaseOrdersSelectionMode,
      selectAllCheckboxId: "selectAllPurchaseOrdersCheckbox",
      visibleRows: normalizedRows,
      selectedSet: selectedPurchaseOrderIds,
      resultCountEl: dom.poResultCount,
      persistGrid,
      renderFn: renderPurchaseOrdersNavTable,
      buildColumnFiltersFn: buildColumnFiltersGeneric
    });

    dom.poTableBody.innerHTML = "";

    if (!normalizedRows.length) {
      renderEmptyRow("No purchase orders found");
      setGridResultCount(dom.poResultCount, normalizedRows);
      refreshPurchaseOrdersSelectionUi();
      return;
    }

    normalizedRows.forEach(po => {
      const row = document.createElement("tr");
      row.dataset.purchaseOrderId = po.id;

      if (purchaseOrdersSelectionMode) {
        const selectTd = document.createElement("td");
        selectTd.className = "selectColumnCell";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "gridRowCheckbox";
        checkbox.checked = isRowSelected(selectedPurchaseOrderIds, po.id);

        checkbox.addEventListener("click", event => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          toggleRowSelection(selectedPurchaseOrderIds, po.id);
          refreshPurchaseOrdersSelectionUi();
        });

        selectTd.appendChild(checkbox);
        row.appendChild(selectTd);
      }

      poColumns
        .filter(col => col.visible)
        .forEach(col => {
          const td = document.createElement("td");

          if (["subtotal", "taxAmount", "shippingAmount", "total"].includes(col.key)) {
            td.textContent = `$${Number(po[col.key] || 0).toFixed(2)}`;
          } else {
            td.textContent = normalizeCellValue(po[col.key]);
          }

          row.appendChild(td);
        });

      row.addEventListener("click", () => {
        if (purchaseOrdersSelectionMode) {
          toggleRowSelection(selectedPurchaseOrderIds, po.id);
          renderPurchaseOrdersNavTable();
        } else {
          openPurchaseOrderFormWindow(po.id);
        }
      });

      if (isRowSelected(selectedPurchaseOrderIds, po.id)) {
        row.classList.add("selectedRow");
      }

      dom.poTableBody.appendChild(row);
    });

    setGridResultCount(dom.poResultCount, normalizedRows);
    refreshPurchaseOrdersSelectionUi();
  }

  function bindEvents() {
    if (dom.openPOFormBtn) {
      dom.openPOFormBtn.addEventListener("click", () => {
        openPurchaseOrderFormWindow();
      });
    }

    if (dom.deleteSelectedPOBtn) {
      dom.deleteSelectedPOBtn.addEventListener("click", deleteSelectedPurchaseOrders);
    }

    if (dom.cancelPOSelectionBtn) {
      dom.cancelPOSelectionBtn.addEventListener("click", () => {
        exitPurchaseOrdersSelectionMode(true);
      });
    }

    if (dom.poGlobalSearch) {
      dom.poGlobalSearch.value = poGridState.globalSearch || "";
      dom.poGlobalSearch.addEventListener("input", () => {
        poGridState.globalSearch = dom.poGlobalSearch.value || "";
        persistGrid();
        renderPurchaseOrdersNavTable();
      });
    }

    if (dom.clearPOFiltersBtn) {
      dom.clearPOFiltersBtn.addEventListener("click", clearPOFilters);
    }

    if (dom.poOptionsBtn && dom.poOptionsDropdown) {
      dom.poOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.poOptionsDropdown.classList.toggle("show");
      });

      document.addEventListener("click", event => {
        if (
          dom.poOptionsDropdown &&
          dom.poOptionsBtn &&
          !dom.poOptionsDropdown.contains(event.target) &&
          !dom.poOptionsBtn.contains(event.target)
        ) {
          dom.poOptionsDropdown.classList.remove("show");
        }
      });
    }
  }

  bindEvents();
  await hydratePurchaseOrders();
  renderPurchaseOrdersNavTable();

  return {
    renderPurchaseOrdersNavTable,
    openPurchaseOrderFormWindow
  };
}