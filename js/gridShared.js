import { byId, normalizeCellValue, normalizeText, compareValues } from "./utils.js";

/* -------------------------
   COLUMN HELPERS
------------------------- */
export function getVisibleColumns(columns = []) {
  return columns.filter(col => col.visible);
}

export function getColumnFilterOptions(data = [], key) {
  const values = [...new Set(
    data.map(item => normalizeCellValue(item?.[key])).filter(Boolean)
  )];

  return values.sort((a, b) => a.localeCompare(b));
}

export function getGridFilterDisplayValue(gridState, key) {
  return normalizeCellValue(gridState?.filters?.[key]);
}

/* -------------------------
   FILTER MENU HELPERS
------------------------- */
export function closeGridHeaderMenus(menuClass, buttonClass, gridState, saveFn = null) {
  if (gridState) {
    gridState.headerMenuOpenFor = null;
  }

  document.querySelectorAll(`.${menuClass}`).forEach(menu => menu.remove());
  document.querySelectorAll(`.${buttonClass}`).forEach(btn => btn.classList.remove("active"));

  if (saveFn) saveFn();
}

export function setGridColumnFilterValue(gridState, saveFn, renderFn, key, value) {
  if (!gridState.filters) gridState.filters = {};

  if (!normalizeText(value)) {
    delete gridState.filters[key];
  } else {
    gridState.filters[key] = value;
  }

  saveFn?.();
  renderFn?.();
}

export function clearGridColumnFilterValue(gridState, saveFn, renderFn, key) {
  if (!gridState.filters) return;

  delete gridState.filters[key];
  saveFn?.();
  renderFn?.();
}

export function toggleGridSort(gridState, saveFn, renderFn, key) {
  if (gridState.sortKey === key) {
    gridState.sortDirection = gridState.sortDirection === "asc" ? "desc" : "asc";
  } else {
    gridState.sortKey = key;
    gridState.sortDirection = "asc";
  }

  saveFn?.();
  renderFn?.();
}

/* -------------------------
   DATA FILTER / SORT
------------------------- */
export function getFilteredGridData(data = [], columns = [], gridState = {}) {
  let filtered = [...data];
  const globalSearch = normalizeCellValue(gridState.globalSearch).toLowerCase();

  if (globalSearch) {
    filtered = filtered.filter(item =>
      columns.some(col =>
        normalizeCellValue(item?.[col.key]).toLowerCase().includes(globalSearch)
      )
    );
  }

  Object.entries(gridState.filters || {}).forEach(([key, value]) => {
    const cleanFilter = normalizeCellValue(value).toLowerCase();
    if (!cleanFilter) return;

    filtered = filtered.filter(item =>
      normalizeCellValue(item?.[key]).toLowerCase().includes(cleanFilter)
    );
  });

  const { sortKey, sortDirection } = gridState;

  if (sortKey) {
    filtered.sort((a, b) => {
      const result = compareValues(a?.[sortKey], b?.[sortKey]);
      return sortDirection === "desc" ? result * -1 : result;
    });
  }

  return filtered;
}

/* -------------------------
   HEADER FILTER MENU
------------------------- */
export function toggleHeaderFilterMenuGeneric({
  columnKey,
  anchorButton,
  columns,
  data,
  gridState,
  saveFn,
  renderFn,
  menuClass = "headerFilterMenu",
  buttonClass = "headerFilterBtn"
}) {
  const alreadyOpen = gridState.headerMenuOpenFor === columnKey;

  closeGridHeaderMenus(menuClass, buttonClass, gridState, saveFn);

  if (alreadyOpen) return;

  gridState.headerMenuOpenFor = columnKey;
  saveFn?.();

  const col = columns.find(c => c.key === columnKey);
  if (!col || col.filterType === "none") return;

  const menu = document.createElement("div");
  menu.className = menuClass;
  menu.dataset.key = columnKey;

  const currentValue = getGridFilterDisplayValue(gridState, columnKey);

  const title = document.createElement("div");
  title.className = "headerFilterMenuTitle";
  title.textContent = `${col.label} Filter`;
  menu.appendChild(title);

  if (col.filterType === "select") {
    const select = document.createElement("select");

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All";
    select.appendChild(allOption);

    getColumnFilterOptions(data, columnKey).forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    select.value = currentValue;
    menu.appendChild(select);

    const actions = document.createElement("div");
    actions.className = "headerFilterActions";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", () => {
      setGridColumnFilterValue(gridState, saveFn, renderFn, columnKey, select.value);
      closeGridHeaderMenus(menuClass, buttonClass, gridState, saveFn);
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      clearGridColumnFilterValue(gridState, saveFn, renderFn, columnKey);
      closeGridHeaderMenus(menuClass, buttonClass, gridState, saveFn);
    });

    actions.appendChild(applyBtn);
    actions.appendChild(clearBtn);
    menu.appendChild(actions);
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Filter ${col.label}`;
    input.value = currentValue;
    menu.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "headerFilterActions";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", () => {
      setGridColumnFilterValue(gridState, saveFn, renderFn, columnKey, input.value);
      closeGridHeaderMenus(menuClass, buttonClass, gridState, saveFn);
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      clearGridColumnFilterValue(gridState, saveFn, renderFn, columnKey);
      closeGridHeaderMenus(menuClass, buttonClass, gridState, saveFn);
    });

    actions.appendChild(applyBtn);
    actions.appendChild(clearBtn);
    menu.appendChild(actions);
  }

  document.body.appendChild(menu);

  const rect = anchorButton.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = rect.left + window.scrollX - 140;

  menu.style.position = "absolute";
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(12, left)}px`;
  menu.style.zIndex = "5000";

  anchorButton.classList.add("active");
}

/* -------------------------
   TOP FILTER ROW
------------------------- */
export function buildColumnFiltersGeneric({
  container,
  columns,
  data,
  gridState,
  filterUiMode,
  saveFn,
  renderFn
}) {
  if (!container) return;

  if (filterUiMode !== "row") {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "";
  container.innerHTML = "";

  getVisibleColumns(columns).forEach(col => {
    if (col.filterType === "none") return;

    const filterItem = document.createElement("div");
    filterItem.className = "columnFilterItem";

    const label = document.createElement("label");
    label.textContent = col.label;
    filterItem.appendChild(label);

    if (col.filterType === "select") {
      const select = document.createElement("select");
      select.dataset.key = col.key;

      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = "All";
      select.appendChild(allOption);

      getColumnFilterOptions(data, col.key).forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });

      select.value = getGridFilterDisplayValue(gridState, col.key);
      select.addEventListener("change", () => {
        setGridColumnFilterValue(gridState, saveFn, renderFn, col.key, select.value);
      });

      filterItem.appendChild(select);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Filter ${col.label}`;
      input.value = getGridFilterDisplayValue(gridState, col.key);

      input.addEventListener("input", () => {
        setGridColumnFilterValue(gridState, saveFn, renderFn, col.key, input.value);
      });

      filterItem.appendChild(input);
    }

    container.appendChild(filterItem);
  });
}

/* -------------------------
   SELECTION HELPERS
------------------------- */
export function isRowSelected(selectedSet, recordId) {
  return selectedSet.has(Number(recordId));
}

export function toggleRowSelection(selectedSet, recordId) {
  const id = Number(recordId);

  if (selectedSet.has(id)) {
    selectedSet.delete(id);
  } else {
    selectedSet.add(id);
  }
}

export function setAllVisibleSelections(selectedSet, visibleRows, checked) {
  visibleRows.forEach(row => {
    const id = Number(row.id);
    if (checked) {
      selectedSet.add(id);
    } else {
      selectedSet.delete(id);
    }
  });
}

export function clearSelections(selectedSet) {
  selectedSet.clear();
}

export function updateSelectionButtonText({
  selectionMode,
  selectedSet,
  actionButton,
  defaultText = "Delete Selected",
  confirmText = "Confirm Delete",
  cancelButton = null,
  table = null
}) {
  if (table) {
    table.classList.toggle("selectionMode", selectionMode);
  }

  if (cancelButton) {
    cancelButton.style.display = selectionMode ? "inline-flex" : "none";
  }

  if (actionButton) {
    if (selectionMode) {
      actionButton.textContent = selectedSet.size > 0
        ? `${defaultText} (${selectedSet.size})`
        : confirmText;
    } else {
      actionButton.textContent = defaultText;
    }
  }
}

export function refreshSelectionUi({
  tableSelector,
  rowIdAttribute,
  selectedSet,
  selectAllCheckboxId,
  visibleRows
}) {
  document.querySelectorAll(`${tableSelector} tbody tr`).forEach(row => {
    const id = Number(row.dataset[rowIdAttribute]);
    const checked = selectedSet.has(id);

    row.classList.toggle("selectedRow", checked);

    const checkbox = row.querySelector(".gridRowCheckbox");
    if (checkbox) checkbox.checked = checked;
  });

  const selectAllCheckbox = byId(selectAllCheckboxId);
  if (selectAllCheckbox) {
    const visibleIds = visibleRows.map(item => Number(item.id));
    const selectedVisibleCount = visibleIds.filter(id => selectedSet.has(id)).length;

    selectAllCheckbox.checked =
      visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

    selectAllCheckbox.indeterminate =
      selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  }
}

/* -------------------------
   RESULT COUNT
------------------------- */
export function setGridResultCount(resultEl, rows) {
  if (!resultEl) return;
  resultEl.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
}

/* -------------------------
   GENERIC HEADER RENDER
------------------------- */
export function renderGridHeaderGeneric({
  headerRow,
  table,
  columns,
  data,
  gridState,
  filterUiMode,
  saveFn,
  renderFn,
  selectedSet,
  visibleRows,
  selectAllCheckboxId,
  rowIdAttribute,
  sortable = true
}) {
  if (!headerRow || !table) return;

  headerRow.innerHTML = "";

  const selectTh = document.createElement("th");
  selectTh.className = "selectColumnHeader";

  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  selectAll.id = selectAllCheckboxId;
  selectAll.title = "Select all visible";

  selectAll.addEventListener("change", () => {
    setAllVisibleSelections(selectedSet, visibleRows, selectAll.checked);
    renderFn?.();
  });

  selectTh.appendChild(selectAll);
  headerRow.appendChild(selectTh);

  getVisibleColumns(columns).forEach(col => {
    const th = document.createElement("th");
    th.className = "sortableHeader";
    th.dataset.key = col.key;

    const headerWrap = document.createElement("div");
    headerWrap.className = "gridHeaderWrap";

    const sortArea = document.createElement("button");
    sortArea.type = "button";
    sortArea.className = "gridHeaderSortBtn";

    const label = document.createElement("span");
    label.textContent = col.label;

    const sortIcon = document.createElement("span");
    sortIcon.className = "sortIcon";

    if (gridState.sortKey === col.key) {
      sortIcon.textContent = gridState.sortDirection === "asc" ? "▲" : "▼";
    } else {
      sortIcon.textContent = "↕";
    }

    sortArea.appendChild(label);
    sortArea.appendChild(sortIcon);

    if (sortable && col.sortable) {
      sortArea.addEventListener("click", () => toggleGridSort(gridState, saveFn, renderFn, col.key));
    }

    headerWrap.appendChild(sortArea);

    if (filterUiMode === "header" && col.filterType !== "none") {
      const filterBtn = document.createElement("button");
      filterBtn.type = "button";
      filterBtn.className = "headerFilterBtn";
      filterBtn.textContent = getGridFilterDisplayValue(gridState, col.key) ? "●" : "⏷";
      filterBtn.title = `Filter ${col.label}`;

      filterBtn.addEventListener("click", e => {
        e.stopPropagation();
        toggleHeaderFilterMenuGeneric({
          columnKey: col.key,
          anchorButton: filterBtn,
          columns,
          data,
          gridState,
          saveFn,
          renderFn
        });
      });

      headerWrap.appendChild(filterBtn);
    }

    th.appendChild(headerWrap);
    headerRow.appendChild(th);
  });

  refreshSelectionUi({
    tableSelector: `#${table.id}`,
    rowIdAttribute,
    selectedSet,
    selectAllCheckboxId,
    visibleRows
  });
}