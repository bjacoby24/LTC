import { getLoggedInUser, loadPurchaseOrders } from "./storage.js";

function byId(id) {
  return document.getElementById(id);
}

function getPurchaseOrderPermissions() {
  const user = getLoggedInUser();
  const permissions =
    user &&
    typeof user === "object" &&
    user.permissions &&
    typeof user.permissions === "object"
      ? user.permissions
      : {};

  return {
    purchaseOrdersAccess: !!permissions.purchaseOrdersAccess
  };
}

function openPurchaseOrderWindow(id = "") {
  const fileName = "purchaseorder.html";
  const url = id
    ? `${fileName}?id=${encodeURIComponent(id)}`
    : fileName;

  const features = [
    "width=1400",
    "height=900",
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");

  const popup = window.open(url, "_blank", features);

  if (!popup) {
    console.error("Unable to open purchase order window.");
  }
}

async function renderPurchaseOrdersNavTable() {
  const table = byId("poTable");
  const tableBody = table?.querySelector("tbody");
  const headerRow = byId("poTableHeaderRow");
  const resultCount = byId("poResultCount");
  const searchInput = byId("poGlobalSearch");

  if (!tableBody || !headerRow) return;

  const searchText = String(searchInput?.value || "").trim().toLowerCase();

  headerRow.innerHTML = `
    <th>PO #</th>
    <th>Vendor</th>
    <th>Status</th>
    <th>Date</th>
    <th>Requested By</th>
    <th>Total</th>
  `;

  try {
    const purchaseOrders = await loadPurchaseOrders();
    const rows = Array.isArray(purchaseOrders) ? purchaseOrders : [];

    const filtered = rows.filter(item => {
      if (!searchText) return true;

      return [
        item.poNumber,
        item.vendor,
        item.status,
        item.date,
        item.requestedBy,
        item.shipTo,
        item.notes
      ]
        .map(value => String(value ?? "").toLowerCase())
        .some(value => value.includes(searchText));
    });

    if (!filtered.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="emptyCell">No purchase orders found</td>
        </tr>
      `;
      if (resultCount) resultCount.textContent = "0 records";
      return;
    }

    tableBody.innerHTML = filtered
      .map(item => {
        const id = String(item.id ?? "");
        const poNumber = item.poNumber || "";
        const vendor = item.vendor || "";
        const status = item.status || "";
        const date = item.date || "";
        const requestedBy = item.requestedBy || "";
        const total = Number(item.total || 0).toFixed(2);

        return `
          <tr data-purchase-order-id="${id}" class="purchaseOrderNavRow">
            <td>${poNumber}</td>
            <td>${vendor}</td>
            <td>${status}</td>
            <td>${date}</td>
            <td>${requestedBy}</td>
            <td>$${total}</td>
          </tr>
        `;
      })
      .join("");

    if (resultCount) {
      resultCount.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    }

    tableBody.querySelectorAll("tr[data-purchase-order-id]").forEach(row => {
      row.addEventListener("dblclick", () => {
        const id = row.dataset.purchaseOrderId || "";
        if (id) {
          openPurchaseOrderWindow(id);
        }
      });
    });
  } catch (error) {
    console.error("Failed to render purchase orders table:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="emptyCell">Unable to load purchase orders</td>
      </tr>
    `;
    if (resultCount) resultCount.textContent = "0 records";
  }
}

function applyPurchaseOrderPermissionUi() {
  const permissions = getPurchaseOrderPermissions();

  const openBtn = byId("openPOFormBtn");
  const deleteBtn = byId("deleteSelectedPOBtn");

  if (openBtn) {
    openBtn.style.display = permissions.purchaseOrdersAccess ? "" : "none";
    openBtn.disabled = !permissions.purchaseOrdersAccess;
  }

  if (deleteBtn) {
    deleteBtn.style.display = permissions.purchaseOrdersAccess ? "" : "none";
    deleteBtn.disabled = !permissions.purchaseOrdersAccess;
  }
}

export function initPurchaseOrdersNav() {
  const openBtn = byId("openPOFormBtn");
  const searchInput = byId("poGlobalSearch");

  openBtn?.addEventListener("click", () => {
    openPurchaseOrderWindow();
  });

  searchInput?.addEventListener("input", () => {
    renderPurchaseOrdersNavTable();
  });

  window.addEventListener("fleet:purchase-orders-changed", () => {
    renderPurchaseOrdersNavTable();
  });

  applyPurchaseOrderPermissionUi();
  renderPurchaseOrdersNavTable();

  return {
    openPurchaseOrderWindow,
    applyPurchaseOrderPermissionUi,
    renderPurchaseOrdersNavTable
  };
}