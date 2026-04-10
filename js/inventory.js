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
  saveInventoryGridSettings
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
  let selectedInventoryIds = new Set();
  let inventorySelectionMode = false;
  let inventoryFilterUiMode = "header";

  const DEFAULT_INVENTORY_COLUMNS = [
    { key: "partNumber", label: "Part #", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "name", label: "Part Name", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "category", label: "Category", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "quantity", label: "Qty", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "unitCost", label: "Unit Cost", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "location", label: "Location", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "vendor", label: "Vendor", visible: true, sortable: true, filterType: "text", custom: false },
    { key: "notes", label: "Notes", visible: false, sortable: true, filterType: "text", custom: false }
  ];

  let inventoryColumns = loadInventoryColumns(DEFAULT_INVENTORY_COLUMNS);
  let inventoryGridState = loadInventoryGridState({
    sortKey: "name",
    sortDirection: "asc",
    globalSearch: "",
    filters: {},
    headerMenuOpenFor: null
  });

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
    await saveInventory(inventory);
  }

  function persistGrid() {
    saveInventoryGridSettings(inventoryColumns, inventoryGridState);
  }

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function normalizeInventoryRecord(item = {}) {
    return {
      ...item,
      id: item.id ?? makeId(),
      name: item.name || item.itemName || "",
      partNumber: item.partNumber || "",
      category: item.category || "",
      quantity: toNumber(item.quantity, 0),
      unitCost: toNumber(item.unitCost, 0),
      location: item.location || "",
      vendor: item.vendor || "",
      notes: item.notes || ""
    };
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

  function closeInventoryOptionsDropdown() {
    if (dom.inventoryOptionsDropdown) {
      dom.inventoryOptionsDropdown.classList.remove("show");
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

  function closeInventoryPanel() {
    if (dom.inventoryFormPanel) {
      dom.inventoryFormPanel.style.display = "none";
    }
    editingInventoryId = null;
  }

  function clearInventoryForm() {
    if (dom.invName) dom.invName.value = "";
    if (dom.invPartNumber) dom.invPartNumber.value = "";
    if (dom.invCategory) dom.invCategory.value = "";
    if (dom.invQuantity) dom.invQuantity.value = "";
    if (dom.invUnitCost) dom.invUnitCost.value = "";
    if (dom.invLocation) dom.invLocation.value = "";
    if (dom.invVendor) dom.invVendor.value = "";
    if (dom.invNotes) dom.invNotes.value = "";
  }

  function toggleInventoryButtons(mode) {
    if (dom.saveInventoryBtn) {
      dom.saveInventoryBtn.style.display = mode === "save" ? "inline-block" : "none";
    }
    if (dom.updateInventoryBtn) {
      dom.updateInventoryBtn.style.display = mode === "edit" ? "inline-block" : "none";
    }
    if (dom.deleteInventoryBtn) {
      dom.deleteInventoryBtn.style.display = mode === "edit" ? "inline-block" : "none";
    }
  }

  function buildInventoryRecord(existingId = null) {
    return normalizeInventoryRecord({
      id: existingId ?? makeId(),
      name: dom.invName?.value || "",
      partNumber: dom.invPartNumber?.value || "",
      category: dom.invCategory?.value || "",
      quantity: dom.invQuantity?.value || 0,
      unitCost: dom.invUnitCost?.value || 0,
      location: dom.invLocation?.value || "",
      vendor: dom.invVendor?.value || "",
      notes: dom.invNotes?.value || ""
    });
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

      return buildInventoryDuplicateKey(item) === recordKey;
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

  function openInventoryForm(itemId = null) {
    if (!dom.inventoryFormPanel) return;

    closeAllRightPanels();
    dom.inventoryFormPanel.style.display = "block";

    if (itemId != null) {
      const item = inventory.find(entry => String(entry.id) === String(itemId));
      if (!item) return;

      editingInventoryId = item.id;

      if (dom.invName) dom.invName.value = item.name || "";
      if (dom.invPartNumber) dom.invPartNumber.value = item.partNumber || "";
      if (dom.invCategory) dom.invCategory.value = item.category || "";
      if (dom.invQuantity) dom.invQuantity.value = item.quantity ?? "";
      if (dom.invUnitCost) dom.invUnitCost.value = item.unitCost ?? "";
      if (dom.invLocation) dom.invLocation.value = item.location || "";
      if (dom.invVendor) dom.invVendor.value = item.vendor || "";
      if (dom.invNotes) dom.invNotes.value = item.notes || "";

      toggleInventoryButtons("edit");
    } else {
      editingInventoryId = null;
      clearInventoryForm();
      toggleInventoryButtons("save");
    }
  }

  async function saveInventoryRecord() {
    const record = buildInventoryRecord();

    if (!normalizeText(record.name)) {
      alert("Please enter an item name.");
      return;
    }

    if (isDuplicateInventoryRecord(record)) {
      alert("That inventory item already exists for this location.");
      return;
    }

    inventory.push(record);
    await persistInventory();
    renderInventoryGrid();
    closeInventoryPanel();
  }

  async function updateInventoryRecord() {
    if (editingInventoryId == null) return;

    const index = inventory.findIndex(
      entry => String(entry.id) === String(editingInventoryId)
    );
    if (index === -1) return;

    const record = buildInventoryRecord(inventory[index].id);

    if (!normalizeText(record.name)) {
      alert("Please enter an item name.");
      return;
    }

    if (isDuplicateInventoryRecord(record, inventory[index].id)) {
      alert("That inventory item already exists for this location.");
      return;
    }

    inventory[index] = record;
    await persistInventory();
    renderInventoryGrid();
    closeInventoryPanel();
  }

  async function deleteInventoryRecord() {
    if (editingInventoryId == null) return;

    const confirmed = confirm("Delete this inventory item?");
    if (!confirmed) return;

    inventory = inventory.filter(
      entry => String(entry.id) !== String(editingInventoryId)
    );
    await persistInventory();
    renderInventoryGrid();
    closeInventoryPanel();
  }

  function refreshInventorySelectionUi() {
    updateSelectionButtonText({
      selectionMode: inventorySelectionMode,
      selectedSet: selectedInventoryIds,
      actionButton: dom.deleteSelectedInventoryBtn,
      defaultText: "Delete Selected",
      confirmText: "Confirm Delete",
      cancelButton: dom.cancelInventorySelectionBtn,
      table: dom.inventoryTable
    });
  }

  function enterInventorySelectionMode() {
    inventorySelectionMode = true;
    refreshInventorySelectionUi();
    renderInventoryGrid();
  }

  function exitInventorySelectionMode(clear = true) {
    inventorySelectionMode = false;

    if (clear) {
      clearSelections(selectedInventoryIds);
    }

    refreshInventorySelectionUi();
    renderInventoryGrid();
  }

  async function deleteSelectedInventory() {
    if (!inventorySelectionMode) {
      enterInventorySelectionMode();
      return;
    }

    if (selectedInventoryIds.size === 0) {
      alert("Select inventory items to delete.");
      return;
    }

    const confirmed = confirm(
      `Delete ${selectedInventoryIds.size} selected inventory item(s)?`
    );
    if (!confirmed) return;

    inventory = inventory.filter(
      item => !selectedInventoryIds.has(String(item.id))
    );

    await persistInventory();
    exitInventorySelectionMode(true);
  }

  function clearInventoryFilters() {
    inventoryGridState.globalSearch = "";
    inventoryGridState.filters = {};
    inventoryGridState.headerMenuOpenFor = null;

    if (dom.inventoryGlobalSearch) {
      dom.inventoryGlobalSearch.value = "";
    }

    clearSelections(selectedInventoryIds);
    persistGrid();
    renderInventoryGrid();
  }

  function normalizeImportHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getImportValue(row, keys) {
    const rowEntries = Object.entries(row || {});
    const normalizedKeyMap = new Map(
      rowEntries.map(([key, value]) => [normalizeImportHeader(key), value])
    );

    for (const key of keys) {
      const found = normalizedKeyMap.get(normalizeImportHeader(key));
      if (found != null && String(found).trim() !== "") {
        return found;
      }
    }

    return "";
  }

  function isBlankImportedRow(row) {
    return (
      !normalizeText(row.name) &&
      !normalizeText(row.partNumber) &&
      !normalizeText(row.category) &&
      !normalizeText(row.location) &&
      !normalizeText(row.vendor) &&
      !normalizeText(row.notes) &&
      toNumber(row.quantity, 0) === 0 &&
      toNumber(row.unitCost, 0) === 0
    );
  }

  function mapImportedInventoryRow(row) {
    return normalizeInventoryRecord({
      id: makeId(),
      name: getImportValue(row, [
        "Part Name",
        "Name",
        "Item Name",
        "PartName",
        "ItemName"
      ]),
      partNumber: getImportValue(row, [
        "Part #",
        "Part Number",
        "PartNumber",
        "Part No",
        "PartNo",
        "SKU",
        "Item #",
        "Item Number"
      ]),
      category: getImportValue(row, ["Category"]),
      quantity: getImportValue(row, ["Qty", "Quantity", "On Hand", "OnHand"]),
      unitCost: getImportValue(row, [
        "Unit Cost",
        "UnitCost",
        "Cost",
        "Price"
      ]),
      location: getImportValue(row, ["Location", "Bin", "Shelf"]),
      vendor: getImportValue(row, ["Vendor", "Supplier"]),
      notes: getImportValue(row, ["Notes", "Comments"])
    });
  }

  function handleInventoryImport(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (typeof XLSX === "undefined") {
      alert("Excel import library is not loaded.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async loadEvent => {
      try {
        const data = new Uint8Array(loadEvent.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        if (!workbook.SheetNames.length) {
          alert("No worksheet found in the selected file.");
          return;
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          raw: false
        });

        if (!rows.length) {
          alert("No data found in file.");
          return;
        }

        const existingKeys = new Set(
          getNormalizedInventory().map(buildInventoryDuplicateKey)
        );

        const importedItems = [];
        const importKeys = new Set();
        let skippedBlank = 0;
        let skippedDuplicate = 0;

        rows.forEach(row => {
          const mapped = mapImportedInventoryRow(row);

          if (isBlankImportedRow(mapped)) {
            skippedBlank += 1;
            return;
          }

          if (!normalizeText(mapped.name)) {
            skippedBlank += 1;
            return;
          }

          const duplicateKey = buildInventoryDuplicateKey(mapped);

          if (existingKeys.has(duplicateKey) || importKeys.has(duplicateKey)) {
            skippedDuplicate += 1;
            return;
          }

          importedItems.push(mapped);
          importKeys.add(duplicateKey);
        });

        if (!importedItems.length) {
          alert(
            "No inventory items were imported. The file may be blank, missing item names, or only contain duplicates."
          );
          return;
        }

        inventory = [...inventory, ...importedItems];
        await persistInventory();
        renderInventoryGrid();

        alert(
          `Inventory import complete.\n\nImported: ${importedItems.length}\nSkipped blank/invalid: ${skippedBlank}\nSkipped duplicates: ${skippedDuplicate}`
        );
      } catch (error) {
        console.error("Inventory import failed:", error);
        alert("Inventory import failed. Please check the file format and try again.");
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      alert("Unable to read the selected file.");
      event.target.value = "";
    };

    reader.readAsArrayBuffer(file);
  }

  function renderInventoryGrid() {
    if (!dom.inventoryTableBody) return;

    const allRows = getNormalizedInventory();
    const normalizedRows = getFilteredNormalizedInventory();

    buildColumnFiltersGeneric({
      container: dom.inventoryColumnFilters,
      columns: inventoryColumns,
      data: allRows,
      gridState: inventoryGridState,
      filterUiMode: inventoryFilterUiMode,
      saveFn: persistGrid,
      renderFn: renderInventoryGrid
    });

    renderGridHeaderGeneric({
      headerRow: dom.inventoryTableHeaderRow,
      table: dom.inventoryTable,
      columns: inventoryColumns,
      data: allRows,
      gridState: inventoryGridState,
      filterUiMode: inventoryFilterUiMode,
      saveFn: persistGrid,
      renderFn: renderInventoryGrid,
      selectedSet: selectedInventoryIds,
      visibleRows: normalizedRows,
      selectAllCheckboxId: "selectAllInventoryCheckbox",
      rowIdAttribute: "inventoryId"
    });

    dom.inventoryTableBody.innerHTML = "";

    normalizedRows.forEach(item => {
      const row = document.createElement("tr");
      row.dataset.inventoryId = item.id;

      const selectTd = document.createElement("td");
      selectTd.className = "selectColumnCell";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "gridRowCheckbox";
      checkbox.checked = isRowSelected(selectedInventoryIds, item.id);

      checkbox.addEventListener("click", clickEvent => {
        clickEvent.stopPropagation();
      });

      checkbox.addEventListener("change", () => {
        toggleRowSelection(selectedInventoryIds, item.id);
        refreshInventorySelectionUi();
      });

      selectTd.appendChild(checkbox);
      row.appendChild(selectTd);

      inventoryColumns
        .filter(col => col.visible)
        .forEach(col => {
          const td = document.createElement("td");

          if (col.key === "unitCost") {
            td.textContent = `$${toNumber(item[col.key], 0).toFixed(2)}`;
          } else {
            td.textContent = normalizeCellValue(item[col.key]);
          }

          row.appendChild(td);
        });

      row.addEventListener("click", () => {
        if (inventorySelectionMode) {
          toggleRowSelection(selectedInventoryIds, item.id);
          renderInventoryGrid();
        } else {
          openInventoryForm(item.id);
        }
      });

      if (isRowSelected(selectedInventoryIds, item.id)) {
        row.classList.add("selectedRow");
      }

      dom.inventoryTableBody.appendChild(row);
    });

    setGridResultCount(dom.inventoryResultCount, normalizedRows);
    refreshInventorySelectionUi();
  }

  function bindEvents() {
    if (dom.openInventoryFormBtn) {
      dom.openInventoryFormBtn.addEventListener("click", () => openInventoryForm());
    }

    if (dom.saveInventoryBtn) {
      dom.saveInventoryBtn.addEventListener("click", saveInventoryRecord);
    }

    if (dom.updateInventoryBtn) {
      dom.updateInventoryBtn.addEventListener("click", updateInventoryRecord);
    }

    if (dom.deleteInventoryBtn) {
      dom.deleteInventoryBtn.addEventListener("click", deleteInventoryRecord);
    }

    if (dom.closeInventoryBtn) {
      dom.closeInventoryBtn.addEventListener("click", closeInventoryPanel);
    }

    if (dom.deleteSelectedInventoryBtn) {
      dom.deleteSelectedInventoryBtn.addEventListener("click", deleteSelectedInventory);
    }

    if (dom.cancelInventorySelectionBtn) {
      dom.cancelInventorySelectionBtn.addEventListener("click", () => {
        exitInventorySelectionMode(true);
      });
    }

    if (dom.inventoryGlobalSearch) {
      dom.inventoryGlobalSearch.value = inventoryGridState.globalSearch || "";
      dom.inventoryGlobalSearch.addEventListener("input", () => {
        inventoryGridState.globalSearch = dom.inventoryGlobalSearch.value || "";
        persistGrid();
        renderInventoryGrid();
      });
    }

    if (dom.manageInventoryColumnsBtn) {
      dom.manageInventoryColumnsBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();
        openColumnManager();
      });
    }

    if (dom.closeColumnManagerBtn) {
      dom.closeColumnManagerBtn.addEventListener("click", closeColumnManager);
    }

    if (dom.clearInventoryFiltersBtn) {
      dom.clearInventoryFiltersBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();
        clearInventoryFilters();
      });
    }

    if (dom.importInventoryBtn && dom.inventoryImportInput) {
      dom.importInventoryBtn.addEventListener("click", () => {
        closeInventoryOptionsDropdown();
        dom.inventoryImportInput.click();
      });

      dom.inventoryImportInput.addEventListener("change", handleInventoryImport);
    }

    if (dom.inventoryOptionsBtn && dom.inventoryOptionsDropdown) {
      dom.inventoryOptionsBtn.addEventListener("click", event => {
        event.stopPropagation();
        dom.inventoryOptionsDropdown.classList.toggle("show");
      });

      document.addEventListener("click", event => {
        if (
          dom.inventoryOptionsDropdown &&
          dom.inventoryOptionsBtn &&
          !dom.inventoryOptionsDropdown.contains(event.target) &&
          !dom.inventoryOptionsBtn.contains(event.target)
        ) {
          dom.inventoryOptionsDropdown.classList.remove("show");
        }
      });
    }
  }

  bindEvents();
  await hydrateInventory();
  renderInventoryGrid();

  return {
    renderInventoryGrid,
    openInventoryForm
  };
}