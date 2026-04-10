import { normalizeText, formatMoney, makeId } from "./.js/utils.js";
import {
  loadPurchaseOrders,
  savePurchaseOrders
} from "./.js/storage.js";

function byId(id) {
  return document.getElementById(id);
}

function getValue(id) {
  const el = byId(id);
  return el ? el.value : "";
}

function setValue(id, value) {
  const el = byId(id);
  if (el) el.value = value ?? "";
}

function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = value ?? "";
}

function num(id) {
  return parseFloat(getValue(id)) || 0;
}

function safeQuery(selector) {
  return document.querySelector(selector);
}

function safeQueryAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}

let purchaseOrders = loadPurchaseOrders();

const params = new URLSearchParams(window.location.search);
const editingId = params.get("id");

let autoSaveTimer = null;

/* -------------------------
   LINE ITEMS
------------------------- */
function addPOLineRow(item = {}) {
  const tbody = safeQuery("#poItemsTable tbody");
  if (!tbody) return;

  const row = document.createElement("tr");

  row.innerHTML = `
    <td><input type="number" class="qty" value="${item.qty || 1}"></td>
    <td><input class="itemName" value="${item.itemName || ""}"></td>
    <td><input class="desc" value="${item.desc || ""}"></td>
    <td><input type="number" step="0.01" class="unitCost" value="${item.unitCost || 0}"></td>
    <td class="lineTotal">$0.00</td>
    <td><button type="button" class="danger removeLineBtn">Remove</button></td>
  `;

  tbody.appendChild(row);

  row.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => {
      calcPOTotals();
      autoSavePO();
    });
  });

  row.querySelector(".removeLineBtn")?.addEventListener("click", () => {
    row.remove();
    calcPOTotals();
    autoSavePO();
  });

  calcPOTotals();
}

/* -------------------------
   TOTALS
------------------------- */
function calcPOTotals() {
  let subtotal = 0;

  safeQueryAll("#poItemsTable tbody tr").forEach(row => {
    const qty = parseFloat(row.querySelector(".qty")?.value || 0) || 0;
    const unitCost = parseFloat(row.querySelector(".unitCost")?.value || 0) || 0;
    const lineTotal = qty * unitCost;

    const lineTotalCell = row.querySelector(".lineTotal");
    if (lineTotalCell) {
      lineTotalCell.textContent = formatMoney(lineTotal);
    }

    subtotal += lineTotal;
  });

  const tax = num("taxAmount");
  const shipping = num("shippingAmount");
  const grand = subtotal + tax + shipping;

  setText("poSubtotal", formatMoney(subtotal));
  setText("poTaxTotal", formatMoney(tax));
  setText("poShippingTotal", formatMoney(shipping));
  setText("poGrandTotal", formatMoney(grand));
}

/* -------------------------
   DATA
------------------------- */
function getPOLines() {
  return safeQueryAll("#poItemsTable tbody tr").map(row => ({
    qty: parseFloat(row.querySelector(".qty")?.value || 0) || 0,
    itemName: row.querySelector(".itemName")?.value || "",
    desc: row.querySelector(".desc")?.value || "",
    unitCost: parseFloat(row.querySelector(".unitCost")?.value || 0) || 0
  }));
}

function getPOData() {
  return {
    id: editingId ? Number(editingId) : makeId(),
    poNumber: getValue("poNumber"),
    vendor: getValue("vendor"),
    date: getValue("date"),
    status: getValue("status"),
    shipTo: getValue("shipTo"),
    requestedBy: getValue("requestedBy"),
    notes: getValue("notes"),
    taxAmount: num("taxAmount"),
    shippingAmount: num("shippingAmount"),
    subtotal: parseFloat((byId("poSubtotal")?.textContent || "$0").replace("$", "")) || 0,
    total: parseFloat((byId("poGrandTotal")?.textContent || "$0").replace("$", "")) || 0,
    lines: getPOLines()
  };
}

/* -------------------------
   FILL FORM
------------------------- */
function fillPOForm(po) {
  setValue("poNumber", po.poNumber || "");
  setValue("vendor", po.vendor || "");
  setValue("date", po.date || "");
  setValue("status", po.status || "Open");
  setValue("shipTo", po.shipTo || "");
  setValue("requestedBy", po.requestedBy || "");
  setValue("notes", po.notes || "");
  setValue("taxAmount", po.taxAmount || 0);
  setValue("shippingAmount", po.shippingAmount || 0);

  const tbody = safeQuery("#poItemsTable tbody");
  if (tbody) tbody.innerHTML = "";

  (po.lines || []).forEach(addPOLineRow);

  calcPOTotals();
}

/* -------------------------
   SAVE
------------------------- */
function savePO(showMessage = true) {
  const po = getPOData();

  if (!normalizeText(po.vendor)) {
    alert("Please enter a vendor.");
    return;
  }

  const index = purchaseOrders.findIndex(p => Number(p.id) === Number(po.id));

  if (index >= 0) {
    purchaseOrders[index] = po;
  } else {
    purchaseOrders.push(po);
  }

  savePurchaseOrders(purchaseOrders);

  if (showMessage) {
    alert("Purchase Order Saved");
  }

  updatePOTitle();
}

/* -------------------------
   AUTO SAVE
------------------------- */
function autoSavePO() {
  clearTimeout(autoSaveTimer);

  autoSaveTimer = setTimeout(() => {
    savePO(false);
  }, 500);
}

/* -------------------------
   DELETE
------------------------- */
function deletePO() {
  if (!editingId) {
    alert("This purchase order has not been saved yet.");
    return;
  }

  const confirmed = confirm("Delete this purchase order?");
  if (!confirmed) return;

  purchaseOrders = purchaseOrders.filter(p => Number(p.id) !== Number(editingId));
  savePurchaseOrders(purchaseOrders);

  window.close();
}

/* -------------------------
   TITLE
------------------------- */
function updatePOTitle() {
  const po = getPOData();
  const display = normalizeText(po.poNumber)
    ? `PO-${po.poNumber}`.replace(/-$/, "")
    : "New Purchase Order";

  setText("poTitle", display);
}

/* -------------------------
   EVENTS
------------------------- */
function bindEvents() {
  byId("addPOLineBtn")?.addEventListener("click", () => addPOLineRow());
  byId("savePOBtn")?.addEventListener("click", () => savePO(true));
  byId("deletePOBtn")?.addEventListener("click", deletePO);
  byId("printPOBtn")?.addEventListener("click", () => window.print());

  ["taxAmount", "shippingAmount"].forEach(id => {
    byId(id)?.addEventListener("input", () => {
      calcPOTotals();
      updatePOTitle();
      autoSavePO();
    });
  });

  [
    "poNumber",
    "vendor",
    "date",
    "status",
    "shipTo",
    "requestedBy",
    "notes"
  ].forEach(id => {
    byId(id)?.addEventListener("input", () => {
      updatePOTitle();
      autoSavePO();
    });
  });
}

/* -------------------------
   INIT
------------------------- */
function init() {
  bindEvents();

  if (editingId) {
    const po = purchaseOrders.find(p => Number(p.id) === Number(editingId));

    if (po) {
      fillPOForm(po);
      setText("poTitle", `PO-${po.poNumber || ""}`.replace(/-$/, ""));
      return;
    }
  }

  setText("poTitle", "New Purchase Order");
  addPOLineRow();
  calcPOTotals();
}

document.addEventListener("DOMContentLoaded", init);