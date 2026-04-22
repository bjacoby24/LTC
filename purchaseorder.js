console.log("electronAPI available:", !!window.electronAPI, window.electronAPI);
import { normalizeText, formatMoney, makeId } from "./js/utils.js";
import {
  loadPurchaseOrders,
  savePurchaseOrders,
  getLoggedInUser
} from "./js/storage.js";

/* -------------------------
   DOM HELPERS
------------------------- */
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

function safeQuery(selector, root = document) {
  return root.querySelector(selector);
}

function safeQueryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

/* -------------------------
   STATE
------------------------- */
const params = new URLSearchParams(window.location.search);
const editingId = params.get("id");

let purchaseOrders = [];
let currentPurchaseOrder = null;
let autoSaveTimer = null;
let isSavingPO = false;
let poModalResolver = null;
let poModalLastFocus = null;
let poEventsBound = false;

/* -------------------------
   PERMISSIONS
------------------------- */
function isAdminUser() {
  const loggedInUser = getLoggedInUser();
  return normalizeLower(loggedInUser?.role) === "admin";
}

function applyAttachmentPermissionUi() {
  const addBtn = byId("addPOAttachmentBtn");
  const input = byId("poAttachmentInput");
  const emptyState = byId("poAttachmentsEmpty");

  const admin = isAdminUser();

  if (addBtn) {
    addBtn.style.display = admin ? "" : "none";
  }

  if (input) {
    input.disabled = !admin;
  }

  if (!admin && emptyState && !safeArray(currentPurchaseOrder?.attachments).length) {
    emptyState.textContent = "Attachments can only be added by an admin on the designated computer.";
  }
}

/* -------------------------
   SAVE STATUS
------------------------- */
function setSaveStatus(text, className = "saved") {
  const el = byId("poSaveStatus");
  if (!el) return;
  el.textContent = text;
  el.className = `saveStatus ${className}`;
}

/* -------------------------
   IN-APP MODAL
------------------------- */
function ensurePOModal() {
  if (byId("poAppModal")) return;

  const modal = document.createElement("div");
  modal.id = "poAppModal";
  modal.className = "woAppModal";
  modal.innerHTML = `
    <div class="woAppModalCard" role="dialog" aria-modal="true" aria-labelledby="poAppModalTitle">
      <div class="woAppModalHeader">
        <h3 id="poAppModalTitle">Message</h3>
        <button type="button" id="poAppModalCloseBtn" class="iconBtn" aria-label="Close message">×</button>
      </div>
      <div class="woAppModalBody">
        <p id="poAppModalMessage"></p>
      </div>
      <div id="poAppModalActions" class="woAppModalActions"></div>
    </div>
  `;

  document.body.appendChild(modal);
}

function resolvePOModal(result) {
  const modal = byId("poAppModal");
  const actions = byId("poAppModalActions");

  if (modal) modal.classList.remove("show");
  if (actions) actions.innerHTML = "";

  if (poModalLastFocus && typeof poModalLastFocus.focus === "function") {
    try {
      poModalLastFocus.focus();
    } catch (error) {
      console.warn("Could not restore focus:", error);
    }
  }

  const resolver = poModalResolver;
  poModalResolver = null;
  poModalLastFocus = null;

  if (typeof resolver === "function") {
    resolver(result);
  }
}

function showPOModal({
  title = "Message",
  message = "",
  confirmText = "OK",
  cancelText = "",
  danger = false
} = {}) {
  ensurePOModal();

  return new Promise(resolve => {
    const modal = byId("poAppModal");
    const titleEl = byId("poAppModalTitle");
    const messageEl = byId("poAppModalMessage");
    const actionsEl = byId("poAppModalActions");
    const closeBtn = byId("poAppModalCloseBtn");

    if (!modal || !titleEl || !messageEl || !actionsEl) {
      resolve(false);
      return;
    }

    poModalResolver = resolve;
    poModalLastFocus = document.activeElement;

    titleEl.textContent = title;
    messageEl.textContent = message;

    actionsEl.innerHTML = `
      ${cancelText ? `<button type="button" id="poAppModalCancelBtn">${cancelText}</button>` : ""}
      <button type="button" id="poAppModalConfirmBtn" class="${danger ? "danger" : "primaryBtn"}">${confirmText}</button>
    `;

    byId("poAppModalCancelBtn")?.addEventListener(
      "click",
      () => resolvePOModal(false),
      { once: true }
    );

    byId("poAppModalConfirmBtn")?.addEventListener(
      "click",
      () => resolvePOModal(true),
      { once: true }
    );

    closeBtn?.addEventListener("click", () => resolvePOModal(false), {
      once: true
    });

    modal.onclick = event => {
      if (event.target === modal) {
        resolvePOModal(false);
      }
    };

    modal.classList.add("show");
    byId("poAppModalConfirmBtn")?.focus();
  });
}

function showPOAlert(message, title = "Message") {
  return showPOModal({
    title,
    message,
    confirmText: "OK"
  });
}

function showPOConfirm(message, title = "Confirm", confirmText = "Delete") {
  return showPOModal({
    title,
    message,
    confirmText,
    cancelText: "Cancel",
    danger: true
  });
}

/* -------------------------
   ATTACHMENT HELPERS
------------------------- */
function getAttachmentById(attachmentId) {
  if (!attachmentId || !Array.isArray(currentPurchaseOrder?.attachments)) return null;
  return currentPurchaseOrder.attachments.find(item => String(item.id) === String(attachmentId)) || null;
}

async function saveAttachmentsToLocalDrive(files) {
  if (!window.electronAPI?.savePurchaseOrderAttachments) {
    throw new Error("Electron attachment API is unavailable.");
  }

  const payloadFiles = [];
  for (const file of files) {
    const data = await fileToDataUrl(file);
    payloadFiles.push({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size || 0,
      data
    });
  }

  const result = await window.electronAPI.savePurchaseOrderAttachments(payloadFiles, {
    recordNumber: getCurrentPONumber()
  });

  if (!result?.ok) {
    throw new Error(result?.error || "Unable to save attachments.");
  }

  return safeArray(result.files);
}

async function openLocalAttachment(attachment) {
  if (!attachment?.filePath) {
    throw new Error("Attachment file path is missing.");
  }

  if (!window.electronAPI?.openAttachment) {
    throw new Error("Electron openAttachment API is unavailable.");
  }

  const result = await window.electronAPI.openAttachment(attachment.filePath);
  if (!result?.ok) {
    throw new Error(result?.error || "Unable to open the attachment.");
  }
}

async function deleteLocalAttachmentFile(attachment) {
  if (!attachment?.filePath || !window.electronAPI?.deleteAttachment) return;

  const result = await window.electronAPI.deleteAttachment(attachment.filePath);
  if (!result?.ok) {
    throw new Error(result?.error || "Unable to delete the attachment file.");
  }
}

/* -------------------------
   PO HELPERS
------------------------- */
function generatePONumber(existingNumber = "") {
  if (normalizeText(existingNumber)) return existingNumber;

  let maxSequence = 0;

  safeArray(purchaseOrders).forEach(po => {
    const raw = String(po.poNumber || "");
    const match = raw.match(/^PO-(\d+)$/i);
    if (match) {
      const num = Number(match[1]);
      if (num > maxSequence) maxSequence = num;
    }
  });

  return `PO-${String(maxSequence + 1).padStart(4, "0")}`;
}

function getCurrentPOId() {
  return currentPurchaseOrder?.id ?? (editingId ? String(editingId) : null);
}

function getCurrentPONumber() {
  return currentPurchaseOrder?.poNumber || generatePONumber();
}

function updatePOTitle() {
  const display = normalizeText(getCurrentPONumber())
    ? getCurrentPONumber()
    : "New Purchase Order";

  setText("poTitle", display);
}

function queueAutoSave() {
  clearTimeout(autoSaveTimer);
  setSaveStatus("Unsaved changes", "saving");

  autoSaveTimer = setTimeout(() => {
    savePO(false);
  }, 500);
}

/* -------------------------
   LINE ITEMS
------------------------- */
function addPOLineRow(item = {}) {
  const tbody = safeQuery("#poItemsTable tbody");
  if (!tbody) return;

  const row = document.createElement("tr");

  row.innerHTML = `
    <td><input type="number" class="qty" min="0" step="1" value="${Number(item.qty || 1)}"></td>
    <td><input class="itemName" value="${escapeHtml(item.itemName || "")}"></td>
    <td><input class="desc" value="${escapeHtml(item.desc || "")}"></td>
    <td><input type="number" step="0.01" min="0" class="unitCost" value="${Number(item.unitCost || 0)}"></td>
    <td class="lineTotal">$0.00</td>
    <td><input type="checkbox" class="receivedFlag" ${item.received ? "checked" : ""}></td>
    <td><button type="button" class="danger removeLineBtn">Remove</button></td>
  `;

  tbody.appendChild(row);

  row.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => {
      calcPOTotals();
      queueAutoSave();
    });

    input.addEventListener("change", () => {
      calcPOTotals();
      queueAutoSave();
    });
  });

  row.querySelector(".removeLineBtn")?.addEventListener("click", () => {
    row.remove();

    if (!safeQueryAll("#poItemsTable tbody tr").length) {
      addPOLineRow();
    }

    calcPOTotals();
    queueAutoSave();
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
   ATTACHMENTS UI
------------------------- */
function renderPOAttachments() {
  const list = byId("poAttachmentList");
  const empty = byId("poAttachmentsEmpty");
  if (!list || !empty) return;

  const attachments = safeArray(currentPurchaseOrder?.attachments);

  if (!attachments.length) {
    list.innerHTML = "";
    empty.style.display = "";
    empty.textContent = isAdminUser()
      ? "No attachments added yet."
      : "Attachments can only be added by an admin on the designated computer.";
    return;
  }

  empty.style.display = "none";

  list.innerHTML = attachments
    .map(attachment => {
      const uploaded = attachment.uploadedAt
        ? new Date(attachment.uploadedAt).toLocaleString()
        : "";

      return `
        <div class="attachmentCard" data-attachment-id="${escapeHtml(attachment.id)}">
          <div class="attachmentCardMain">
            <strong>${escapeHtml(attachment.name || "Attachment")}</strong>
            <div class="fieldHelpText">
              ${escapeHtml(attachment.type || "file")} • ${escapeHtml(formatFileSize(attachment.size || 0))}
              ${uploaded ? ` • ${escapeHtml(uploaded)}` : ""}
            </div>
            <div class="fieldHelpText">
              ${escapeHtml(attachment.filePath || attachment.url || "")}
            </div>
          </div>
          <div class="attachmentCardActions">
            <button type="button" class="openPOAttachmentBtn">Open</button>
            ${isAdminUser() ? '<button type="button" class="removePOAttachmentBtn danger">Remove</button>' : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

async function handlePOAttachmentInput(event) {
  if (!isAdminUser()) {
    await showPOAlert(
      "Only an admin can add attachments to purchase orders.",
      "Permission Required"
    );
    if (event?.target) event.target.value = "";
    return;
  }

  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;

  try {
    setSaveStatus("Uploading files...", "saving");

    const uploadedAttachments = await saveAttachmentsToLocalDrive(files);

    if (uploadedAttachments.length) {
      currentPurchaseOrder = {
        ...safeObject(currentPurchaseOrder),
        attachments: [
          ...safeArray(currentPurchaseOrder?.attachments),
          ...uploadedAttachments
        ]
      };

      renderPOAttachments();
      queueAutoSave();
    }
  } catch (error) {
    console.error("PO attachment upload failed:", error);
    await showPOAlert(
      error?.message || "Could not save the selected files.",
      "Attachment Upload Error"
    );
  } finally {
    if (event?.target) {
      event.target.value = "";
    }
  }
}

async function openPOAttachment(attachmentId) {
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return;

  try {
    await openLocalAttachment(attachment);
  } catch (error) {
    console.error("openPOAttachment failed:", error);
    await showPOAlert(
      error?.message || "Unable to open the attachment.",
      "Open Attachment"
    );
  }
}

async function removePOAttachment(attachmentId) {
  if (!isAdminUser()) {
    await showPOAlert(
      "Only an admin can remove attachments.",
      "Permission Required"
    );
    return;
  }

  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return;

  const confirmed = await showPOConfirm(
    "Remove this attachment from the purchase order?",
    "Remove Attachment",
    "Remove"
  );

  if (!confirmed) return;

  try {
    await deleteLocalAttachmentFile(attachment);
  } catch (error) {
    console.error("PO attachment delete failed:", error);
    await showPOAlert(
      error?.message || "The file could not be removed from the drive.",
      "Remove Attachment"
    );
    return;
  }

  currentPurchaseOrder = {
    ...safeObject(currentPurchaseOrder),
    attachments: safeArray(currentPurchaseOrder?.attachments).filter(
      item => String(item.id) !== String(attachmentId)
    )
  };

  renderPOAttachments();
  queueAutoSave();
}

/* -------------------------
   DATA
------------------------- */
function getPOLines() {
  return safeQueryAll("#poItemsTable tbody tr").map(row => ({
    qty: parseFloat(row.querySelector(".qty")?.value || 0) || 0,
    itemName: row.querySelector(".itemName")?.value || "",
    desc: row.querySelector(".desc")?.value || "",
    unitCost: parseFloat(row.querySelector(".unitCost")?.value || 0) || 0,
    received: !!row.querySelector(".receivedFlag")?.checked
  }));
}

function getPOData() {
  return {
    id: String(currentPurchaseOrder?.id || makeId()),
    poNumber: getValue("poNumber") || getCurrentPONumber(),
    vendor: getValue("vendor"),
    date: getValue("date"),
    status: getValue("status"),
    shipTo: getValue("shipTo"),
    requestedBy: getValue("requestedBy"),
    notes: getValue("notes"),
    taxAmount: num("taxAmount"),
    shippingAmount: num("shippingAmount"),
    subtotal: parseFloat((byId("poSubtotal")?.textContent || "$0").replace(/[$,]/g, "")) || 0,
    total: parseFloat((byId("poGrandTotal")?.textContent || "$0").replace(/[$,]/g, "")) || 0,
    lines: getPOLines(),
    attachments: safeArray(currentPurchaseOrder?.attachments),
    updatedAt: new Date().toISOString(),
    createdAt: currentPurchaseOrder?.createdAt || new Date().toISOString()
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

  safeArray(po.lines).forEach(addPOLineRow);

  if (!safeQueryAll("#poItemsTable tbody tr").length) {
    addPOLineRow();
  }

  calcPOTotals();
  renderPOAttachments();
}

/* -------------------------
   SAVE
------------------------- */
async function savePO(showMessage = true) {
  if (isSavingPO) return;

  try {
    isSavingPO = true;
    setSaveStatus("Saving...", "saving");

    const po = getPOData();

    if (!normalizeText(po.vendor)) {
      await showPOAlert("Please enter a vendor.", "Missing Vendor");
      setSaveStatus("Save failed", "error");
      return;
    }

    currentPurchaseOrder = {
      ...safeObject(currentPurchaseOrder),
      ...po
    };

    const index = purchaseOrders.findIndex(p => String(p.id) === String(currentPurchaseOrder.id));

    if (index >= 0) {
      purchaseOrders[index] = currentPurchaseOrder;
    } else {
      purchaseOrders.push(currentPurchaseOrder);
    }

    purchaseOrders = await savePurchaseOrders(purchaseOrders);

    updatePOTitle();
    renderPOAttachments();
    setSaveStatus("Saved", "saved");

    try {
      if (window.opener) {
        window.opener.dispatchEvent(new CustomEvent("fleet:purchase-orders-changed"));
      }
    } catch (error) {
      console.warn("Unable to notify opener window:", error);
    }

    if (showMessage) {
      await showPOAlert("Purchase order saved successfully.", "Saved");
    }
  } catch (error) {
    console.error("savePO failed:", error);
    setSaveStatus("Save failed", "error");

    if (showMessage) {
      await showPOAlert(
        error?.message || "There was a problem saving the purchase order.",
        "Save Error"
      );
    }
  } finally {
    isSavingPO = false;
  }
}

/* -------------------------
   DELETE
------------------------- */
async function deletePO() {
  if (!currentPurchaseOrder?.id) {
    await showPOAlert("This purchase order has not been saved yet.", "Delete Purchase Order");
    return;
  }

  const confirmed = await showPOConfirm(
    "Delete this purchase order?",
    "Delete Purchase Order",
    "Delete"
  );

  if (!confirmed) return;

  purchaseOrders = purchaseOrders.filter(p => String(p.id) !== String(currentPurchaseOrder.id));
  purchaseOrders = await savePurchaseOrders(purchaseOrders);

  try {
    if (window.opener) {
      window.opener.dispatchEvent(new CustomEvent("fleet:purchase-orders-changed"));
    }
  } catch (error) {
    console.warn("Unable to notify opener window:", error);
  }

  window.close();
}

/* -------------------------
   EVENTS
------------------------- */
function bindEvents() {
  if (poEventsBound) return;
  poEventsBound = true;

  byId("addPOLineBtn")?.addEventListener("click", () => {
    addPOLineRow();
    queueAutoSave();
  });

  byId("savePOBtn")?.addEventListener("click", () => savePO(true));
  byId("deletePOBtn")?.addEventListener("click", () => deletePO());
  byId("printPOBtn")?.addEventListener("click", () => window.print());

  byId("addPOAttachmentBtn")?.addEventListener("click", async () => {
    if (!isAdminUser()) {
      await showPOAlert(
        "Only an admin can add attachments to purchase orders.",
        "Permission Required"
      );
      return;
    }

    byId("poAttachmentInput")?.click();
  });

  byId("poAttachmentInput")?.addEventListener("change", event => {
    handlePOAttachmentInput(event);
  });

  byId("poAttachmentList")?.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    const card = button.closest("[data-attachment-id]");
    const attachmentId = card?.dataset.attachmentId;
    if (!attachmentId) return;

    if (button.classList.contains("openPOAttachmentBtn")) {
      await openPOAttachment(attachmentId);
      return;
    }

    if (button.classList.contains("removePOAttachmentBtn")) {
      await removePOAttachment(attachmentId);
    }
  });

  ["taxAmount", "shippingAmount"].forEach(id => {
    byId(id)?.addEventListener("input", () => {
      calcPOTotals();
      queueAutoSave();
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
      if (id === "poNumber") {
        updatePOTitle();
      }
      queueAutoSave();
    });

    byId(id)?.addEventListener("change", () => {
      if (id === "poNumber") {
        updatePOTitle();
      }
      queueAutoSave();
    });
  });
}

/* -------------------------
   INIT
------------------------- */
async function initState() {
  const loaded = await loadPurchaseOrders();
  purchaseOrders = safeArray(loaded);

  if (editingId) {
    currentPurchaseOrder =
      purchaseOrders.find(p => String(p.id) === String(editingId)) || null;
  }

  if (!currentPurchaseOrder) {
    currentPurchaseOrder = {
      id: makeId(),
      poNumber: generatePONumber(),
      vendor: "",
      date: "",
      status: "Open",
      shipTo: "",
      requestedBy: "",
      notes: "",
      taxAmount: 0,
      shippingAmount: 0,
      subtotal: 0,
      total: 0,
      lines: [],
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } else {
    currentPurchaseOrder = {
      ...currentPurchaseOrder,
      poNumber: currentPurchaseOrder.poNumber || generatePONumber(),
      lines: safeArray(currentPurchaseOrder.lines),
      attachments: safeArray(currentPurchaseOrder.attachments)
    };
  }
}

async function init() {
  ensurePOModal();
  await initState();
  bindEvents();

  fillPOForm(currentPurchaseOrder);
  setValue("poNumber", getCurrentPONumber());

  if (!safeQueryAll("#poItemsTable tbody tr").length) {
    addPOLineRow();
  }

  calcPOTotals();
  renderPOAttachments();
  applyAttachmentPermissionUi();
  updatePOTitle();
  setSaveStatus("Saved", "saved");
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && byId("poAppModal")?.classList.contains("show")) {
    resolvePOModal(false);
  }
});