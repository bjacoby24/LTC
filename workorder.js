import { normalizeText, formatMoney, makeId } from "./js/utils.js";
import {
  loadWorkOrders,
  saveWorkOrders,
  loadEquipment,
  saveEquipment,
  loadSettings,
  loadUsers,
  loadInventory,
  saveInventory,
  getLoggedInUser
} from "./js/storage.js";
import {
  findEquipmentByUnitInput,
  getWorkOrderServiceSelectorOptions,
  buildServiceCompletionEntry,
  applyServiceCompletionToEquipment,
  getTemplateTaskForServiceCode,
  parseDate,
  dateToYMD
} from "./js/service-tracking.js";

/* -------------------------
   DOM HELPERS
------------------------- */
function byId(id) {
  return document.getElementById(id);
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
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

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDateString(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toISOString();
}

function dedupeStrings(values = []) {
  return [...new Set(safeArray(values).map(v => String(v || "").trim()).filter(Boolean))];
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
   IN-WINDOW MODAL
------------------------- */
let woModalResolver = null;
let woModalLastFocus = null;

function resolveWorkOrderModal(result) {
  const modal = byId("woAppModal");
  const actions = byId("woAppModalActions");

  if (modal) modal.classList.remove("show");
  if (actions) actions.innerHTML = "";

  if (woModalLastFocus && typeof woModalLastFocus.focus === "function") {
    try {
      woModalLastFocus.focus();
    } catch (error) {
      console.warn("Could not restore focus:", error);
    }
  }

  const resolver = woModalResolver;
  woModalResolver = null;
  woModalLastFocus = null;

  if (typeof resolver === "function") {
    resolver(result);
  }
}

function showWorkOrderModal({
  title = "Message",
  message = "",
  confirmText = "OK",
  cancelText = "",
  danger = false
} = {}) {
  return new Promise(resolve => {
    const modal = byId("woAppModal");
    const titleEl = byId("woAppModalTitle");
    const messageEl = byId("woAppModalMessage");
    const actionsEl = byId("woAppModalActions");
    const closeBtn = byId("woAppModalCloseBtn");

    if (!modal || !titleEl || !messageEl || !actionsEl) {
      resolve(false);
      return;
    }

    woModalResolver = resolve;
    woModalLastFocus = document.activeElement;

    titleEl.textContent = title;
    messageEl.textContent = message;

    actionsEl.innerHTML = `
      ${cancelText ? `<button type="button" id="woAppModalCancelBtn">${cancelText}</button>` : ""}
      <button type="button" id="woAppModalConfirmBtn" class="${danger ? "danger" : "primaryBtn"}">${confirmText}</button>
    `;

    byId("woAppModalCancelBtn")?.addEventListener(
      "click",
      () => resolveWorkOrderModal(false),
      { once: true }
    );

    byId("woAppModalConfirmBtn")?.addEventListener(
      "click",
      () => resolveWorkOrderModal(true),
      { once: true }
    );

    closeBtn?.addEventListener("click", () => resolveWorkOrderModal(false), {
      once: true
    });

    modal.onclick = event => {
      if (event.target === modal) {
        resolveWorkOrderModal(false);
      }
    };

    modal.classList.add("show");
    byId("woAppModalConfirmBtn")?.focus();
  });
}

function showWorkOrderAlert(message, title = "Message") {
  return showWorkOrderModal({
    title,
    message,
    confirmText: "OK"
  });
}

function showWorkOrderConfirm(message, title = "Confirm", confirmText = "Delete") {
  return showWorkOrderModal({
    title,
    message,
    confirmText,
    cancelText: "Cancel",
    danger: true
  });
}

/* -------------------------
   STATE
------------------------- */
const params = new URLSearchParams(window.location.search);
const editingId = params.get("id");

let workOrders = [];
let equipmentList = [];
let usersList = [];
let inventoryList = [];
let settingsCache = {
  companyName: "",
  defaultLocation: "",
  theme: "default",
  serviceTasks: [],
  serviceTemplates: []
};
let currentWorkOrder = null;
let autoSaveTimer = null;
let isSavingWorkOrder = false;
let topLevelEventsBound = false;
let attachmentPreviewEventsBound = false;

/* -------------------------
   SAVE STATUS
------------------------- */
function setSaveStatus(text, className = "saved") {
  const el = byId("saveStatus");
  if (!el) return;
  el.textContent = text;
  el.className = `saveStatus ${className}`;
}

/* -------------------------
   PERMISSIONS
------------------------- */
function isAdminUser() {
  const loggedInUser = getLoggedInUser();
  return normalizeLower(loggedInUser?.role) === "admin";
}

function applyAttachmentPermissionUi() {
  const addAttachmentBtn = byId("addAttachmentBtn");
  const attachmentHelpText = byId("attachmentHelpText");
  const attachmentInput = byId("attachmentInput");

  const admin = isAdminUser();

  if (addAttachmentBtn) {
    addAttachmentBtn.style.display = admin ? "" : "none";
  }

  if (attachmentInput) {
    attachmentInput.disabled = !admin;
  }

  if (attachmentHelpText) {
    attachmentHelpText.textContent = admin
      ? "Upload photos, PDFs, or documents. Files are saved to the Maintenance drive on this computer."
      : "Attachments can only be added by an admin on the designated computer.";
  }
}

/* -------------------------
   HELPERS
------------------------- */
function generateWONumber(existingNumber = "") {
  if (normalizeText(existingNumber)) return existingNumber;

  let maxSequence = 0;

  safeArray(workOrders).forEach(wo => {
    const raw = String(wo.workOrderNumber || wo.woNumber || "");
    const match = raw.match(/^WO-(\d+)$/i);
    if (match) {
      const num = Number(match[1]);
      if (num > maxSequence) maxSequence = num;
    }
  });

  return `WO-${String(maxSequence + 1).padStart(4, "0")}`;
}

function getCurrentStatus() {
  return getValue("woStatus") || "Open";
}

function setCurrentStatus(status) {
  const safeStatus = status || "Open";
  setValue("woStatus", safeStatus);

  qsa(".statusPill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.statusValue === safeStatus);
  });
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentById(attachmentId) {
  if (!attachmentId || !Array.isArray(currentWorkOrder?.attachments)) return null;
  return currentWorkOrder.attachments.find(item => String(item.id) === String(attachmentId)) || null;
}

function getCurrentWorkOrderId() {
  return currentWorkOrder?.id ?? (editingId ? String(editingId) : null);
}

function getCurrentWorkOrderNumber() {
  return currentWorkOrder?.workOrderNumber || currentWorkOrder?.woNumber || generateWONumber();
}

function findEquipmentByUnit(unitValue) {
  return findEquipmentByUnitInput(equipmentList, unitValue);
}

function getSelectedEquipment() {
  return findEquipmentByUnit(getValue("woEquipmentNumber"));
}

function getUserDisplayName(user = {}) {
  const firstName = normalizeText(user?.firstName);
  const lastName = normalizeText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) return fullName;
  return normalizeText(user?.username);
}

function getAssignableUsers(users = []) {
  return safeArray(users).filter(user => {
    const username = normalizeLower(user?.username || "");
    if (!username) return false;
    if (username === "admin") return false;
    if (user?.active === false) return false;
    return true;
  });
}

function getSelectedAssignees() {
  const select = byId("woAssignee");
  if (!select) return [];

  return Array.from(select.selectedOptions)
    .map(option => String(option.value || "").trim())
    .filter(Boolean);
}

function renderAssigneeOptions(selectedAssignees = []) {
  const select = byId("woAssignee");
  const help = byId("woAssigneeHelp");
  if (!select) return;

  const assignableUsers = getAssignableUsers(usersList);

  select.innerHTML = assignableUsers
    .map(user => {
      const displayName = getUserDisplayName(user);
      const selected = selectedAssignees.includes(displayName) ? "selected" : "";
      return `<option value="${escapeHtml(displayName)}" ${selected}>${escapeHtml(displayName)}</option>`;
    })
    .join("");

  if (help) {
    help.textContent = assignableUsers.length
      ? "Hold Ctrl (Windows) to choose multiple assignees."
      : "No assignable users found.";
  }
}

function getSelectedServiceCodes() {
  const select = byId("woServiceTaskSelect");
  if (!select) return [];

  return Array.from(select.selectedOptions)
    .map(option => String(option.value || "").trim())
    .filter(Boolean);
}

function getSelectedServiceOptions(eq = getSelectedEquipment()) {
  if (!eq) return [];

  const selectedCodes = getSelectedServiceCodes();
  if (!selectedCodes.length) return [];

  const options = getWorkOrderServiceSelectorOptions(eq, settingsCache);
  return options.filter(option => selectedCodes.includes(String(option.code)));
}

function queueAutoSave() {
  clearTimeout(autoSaveTimer);
  setSaveStatus("Unsaved changes", "saving");
  autoSaveTimer = setTimeout(() => {
    saveWorkOrder(false);
  }, 450);
}

/* -------------------------
   INVENTORY HELPERS
------------------------- */
function normalizeInventoryHistoryEntry(entry = {}, fallbackType = "") {
  return {
    id: String(entry.id || makeId()),
    type: String(entry.type || fallbackType || "").trim(),
    date: normalizeDateString(entry.date || entry.createdAt || entry.timestamp || ""),
    quantity: toNumber(entry.quantity, 0),
    previousQuantity: toNumber(entry.previousQuantity, 0),
    newQuantity: toNumber(entry.newQuantity, 0),
    unitCost: toNumber(entry.unitCost, 0),
    referenceNumber: String(entry.referenceNumber || "").trim(),
    referenceId: String(entry.referenceId || "").trim(),
    referenceType: String(entry.referenceType || "").trim(),
    vendor: String(entry.vendor || "").trim(),
    user: String(entry.user || "").trim(),
    notes: String(entry.notes || "").trim(),
    source: String(entry.source || "").trim()
  };
}

function sortHistoryByDateDesc(entries = []) {
  return [...safeArray(entries)].sort((a, b) => {
    const aTime = new Date(a.date || 0).getTime() || 0;
    const bTime = new Date(b.date || 0).getTime() || 0;
    return bTime - aTime;
  });
}

function getLatestDateFromHistory(entries = []) {
  const sorted = sortHistoryByDateDesc(entries);
  return sorted[0]?.date || "";
}

function normalizeInventoryRecord(item = {}) {
  const purchaseHistory = safeArray(item.purchaseHistory).map(entry =>
    normalizeInventoryHistoryEntry(entry, "purchase")
  );
  const issueHistory = safeArray(item.issueHistory).map(entry =>
    normalizeInventoryHistoryEntry(entry, "issue")
  );
  const qtyAdjustmentHistory = safeArray(item.qtyAdjustmentHistory).map(entry =>
    normalizeInventoryHistoryEntry(entry, "adjustment")
  );

  return {
    ...item,
    id: String(item.id || makeId()),
    name: String(item.name || item.itemName || "").trim(),
    itemName: String(item.itemName || item.name || "").trim(),
    partNumber: String(item.partNumber || "").trim(),
    category: String(item.category || "").trim(),
    quantity: toNumber(item.quantity, 0),
    unitCost: toNumber(item.unitCost, 0),
    location: String(item.location || "").trim(),
    vendor: String(item.vendor || "").trim(),
    notes: String(item.notes || "").trim(),
    reorderPoint: toNumber(item.reorderPoint, 0),
    reorderQuantity: toNumber(item.reorderQuantity, 0),
    maximumQuantity: toNumber(item.maximumQuantity, 0),
    minimumQuantity: toNumber(item.minimumQuantity, toNumber(item.reorderPoint, 0)),
    quickAdjustEnabled: item.quickAdjustEnabled !== false,
    profileNotes: String(item.profileNotes || item.notes || "").trim(),
    binLocation: String(item.binLocation || "").trim(),
    manufacturer: String(item.manufacturer || "").trim(),
    partType: String(item.partType || "").trim(),
    uom: String(item.uom || "EA").trim() || "EA",
    lastPurchasedAt: normalizeDateString(item.lastPurchasedAt || getLatestDateFromHistory(purchaseHistory)),
    lastIssuedAt: normalizeDateString(item.lastIssuedAt || getLatestDateFromHistory(issueHistory)),
    lastPurchasedCost: toNumber(item.lastPurchasedCost, 0),
    purchaseHistory: sortHistoryByDateDesc(purchaseHistory),
    issueHistory: sortHistoryByDateDesc(issueHistory),
    qtyAdjustmentHistory: sortHistoryByDateDesc(qtyAdjustmentHistory),
    createdAt: normalizeDateString(item.createdAt || ""),
    updatedAt: normalizeDateString(item.updatedAt || "")
  };
}

function hydrateInventoryList(items = []) {
  inventoryList = safeArray(items).map(normalizeInventoryRecord);
}

function getInventoryIndexById(id) {
  return inventoryList.findIndex(item => String(item.id) === String(id));
}

function getInventoryItemById(id) {
  return inventoryList.find(item => String(item.id) === String(id)) || null;
}

function buildInventorySearchText(item = {}) {
  return [
    item.partNumber,
    item.name,
    item.itemName,
    item.category,
    item.location,
    item.vendor,
    item.manufacturer,
    item.binLocation
  ]
    .map(value => normalizeLower(value))
    .filter(Boolean)
    .join(" ");
}

function getInventorySuggestions(query, excludeId = "") {
  const clean = normalizeLower(query);
  if (!clean) return [];

  return inventoryList
    .filter(item => String(item.id) !== String(excludeId))
    .filter(item => {
      const partNumber = normalizeLower(item.partNumber);
      const name = normalizeLower(item.name || item.itemName);
      const searchText = buildInventorySearchText(item);

      return (
        partNumber.startsWith(clean) ||
        name.startsWith(clean) ||
        partNumber.includes(clean) ||
        name.includes(clean) ||
        searchText.includes(clean)
      );
    })
    .sort((a, b) => {
      const aExact = normalizeLower(a.partNumber) === clean || normalizeLower(a.name) === clean;
      const bExact = normalizeLower(b.partNumber) === clean || normalizeLower(b.name) === clean;
      if (aExact !== bExact) return aExact ? -1 : 1;

      const aStarts =
        normalizeLower(a.partNumber).startsWith(clean) ||
        normalizeLower(a.name).startsWith(clean);
      const bStarts =
        normalizeLower(b.partNumber).startsWith(clean) ||
        normalizeLower(b.name).startsWith(clean);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;

      return normalizeLower(a.name).localeCompare(normalizeLower(b.name));
    })
    .slice(0, 8);
}

function getIssuedPartsFromTasks(tasks = []) {
  const grouped = new Map();

  safeArray(tasks).forEach(task => {
    safeArray(task.parts).forEach(part => {
      const inventoryId = String(part.inventoryId || "").trim();
      const qty = toNumber(part.qty, 0);

      if (!inventoryId || qty <= 0) return;

      const existing = grouped.get(inventoryId) || {
        inventoryId,
        qty: 0,
        parts: []
      };

      existing.qty += qty;
      existing.parts.push(part);
      grouped.set(inventoryId, existing);
    });
  });

  return Array.from(grouped.values());
}

function getWorkOrderIssueAppliedKey(workOrder = currentWorkOrder) {
  return dedupeStrings(workOrder?.inventoryIssueAppliedKeys || []);
}

function buildIssueAppliedKey(workOrderData, inventoryId) {
  return `${String(workOrderData?.id || "")}:${String(inventoryId || "")}:${String(workOrderData?.updatedAt || "")}`;
}

async function applyInventoryIssuesFromWorkOrder(previousWorkOrder, nextWorkOrder) {
  const completedStatuses = new Set(["completed", "closed"]);
  const normalizedStatus = normalizeLower(nextWorkOrder?.status || "");

  if (
    !completedStatuses.has(normalizedStatus) &&
    !normalizeText(nextWorkOrder?.completed) &&
    !normalizeText(nextWorkOrder?.closed)
  ) {
    return;
  }

  const issuedParts = getIssuedPartsFromTasks(nextWorkOrder?.tasks);
  if (!issuedParts.length) return;

  const previouslyAppliedKeys = new Set(getWorkOrderIssueAppliedKey(previousWorkOrder));
  const nextAppliedKeys = new Set(getWorkOrderIssueAppliedKey(nextWorkOrder));

  const workOrderDate =
    normalizeDateString(nextWorkOrder?.completed) ||
    normalizeDateString(nextWorkOrder?.closed) ||
    normalizeDateString(nextWorkOrder?.updatedAt) ||
    new Date().toISOString();

  const loggedInUser = getLoggedInUser();
  let didChangeInventory = false;

  for (const issued of issuedParts) {
    const issueKey = buildIssueAppliedKey(nextWorkOrder, issued.inventoryId);
    if (previouslyAppliedKeys.has(issueKey) || nextAppliedKeys.has(issueKey)) {
      continue;
    }

    const index = getInventoryIndexById(issued.inventoryId);
    if (index === -1) continue;

    const item = normalizeInventoryRecord(inventoryList[index]);
    const previousQuantity = toNumber(item.quantity, 0);
    const issueQuantity = toNumber(issued.qty, 0);

    if (issueQuantity <= 0) continue;

    const newQuantity = Math.max(0, previousQuantity - issueQuantity);

    const notes = dedupeStrings(
      issued.parts.flatMap(part => [
        part.taskName ? `Task: ${part.taskName}` : "",
        part.notes || ""
      ])
    ).join(" • ");

    const updatedItem = normalizeInventoryRecord({
      ...item,
      quantity: newQuantity,
      lastIssuedAt: workOrderDate,
      issueHistory: [
        {
          id: makeId(),
          type: "issue",
          date: workOrderDate,
          quantity: issueQuantity,
          previousQuantity,
          newQuantity,
          unitCost: toNumber(issued.parts[0]?.unitCost, item.unitCost || 0),
          referenceNumber: String(nextWorkOrder?.workOrderNumber || nextWorkOrder?.woNumber || "").trim(),
          referenceId: String(nextWorkOrder?.id || "").trim(),
          referenceType: "work_order",
          user: loggedInUser?.username || "",
          notes,
          source: "work_order"
        },
        ...safeArray(item.issueHistory)
      ],
      updatedAt: new Date().toISOString()
    });

    inventoryList[index] = updatedItem;
    nextAppliedKeys.add(issueKey);
    didChangeInventory = true;
  }

  nextWorkOrder.inventoryIssueAppliedKeys = Array.from(nextAppliedKeys);

  if (didChangeInventory) {
    await saveInventory(inventoryList);
  }
}

/* -------------------------
   SERVICE SELECTOR
------------------------- */
function renderServiceTaskOptions() {
  const select = byId("woServiceTaskSelect");
  const help = byId("woServiceTaskHelp");
  if (!select && !help) return;

  const eq = getSelectedEquipment();

  if (!eq) {
    if (select) {
      select.innerHTML = "";
      select.disabled = false;
    }
    if (help) {
      help.textContent = "Select matching equipment first.";
    }
    return;
  }

  const options = getWorkOrderServiceSelectorOptions(eq, settingsCache);
  const selectedCodes = getSelectedServiceCodes();

  if (select) {
    select.disabled = false;
    select.innerHTML = options
      .map(option => {
        const selected = selectedCodes.includes(String(option.code)) ? "selected" : "";
        return `
          <option value="${escapeHtml(option.code)}" ${selected}>
            ${escapeHtml(option.label)}
          </option>
        `;
      })
      .join("");
  }

  if (help) {
    help.textContent = options.length
      ? `Hold Ctrl (Windows) or Command (Mac) to choose multiple services for ${eq.unit || eq.equipmentNumber || "equipment"}.`
      : `No service options matched for ${eq.type || "equipment"}.`;
  }
}

async function updateEquipmentMatchInfo() {
  const info = byId("equipmentMatchInfo");
  const equipmentNumber = getValue("woEquipmentNumber");

  if (!normalizeText(equipmentNumber)) {
    if (info) info.textContent = "Enter an equipment number.";
    renderServiceTaskOptions();
    return;
  }

  if (!Array.isArray(equipmentList) || !equipmentList.length) {
    equipmentList = safeArray(await loadEquipment());
  }

  const match = findEquipmentByUnit(equipmentNumber);

  if (!match) {
    if (info) info.textContent = "No matching equipment found.";
    renderServiceTaskOptions();
    return;
  }

  const details = [
    match.type || "",
    match.year || "",
    match.location || "",
    match.business || ""
  ].filter(Boolean).join(" • ");

  if (info) {
    info.textContent = details
      ? `Matched: ${match.unit || match.equipmentNumber || equipmentNumber} • ${details}`
      : "Matched equipment.";
  }

  renderServiceTaskOptions();
}

/* -------------------------
   LOCAL ATTACHMENTS
------------------------- */
async function saveAttachmentsToLocalDrive(files) {
  if (!window.electronAPI?.saveWorkOrderAttachments) {
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

  const result = await window.electronAPI.saveWorkOrderAttachments(payloadFiles, {
    recordNumber: getCurrentWorkOrderNumber()
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
   PART ROWS / TASKS
------------------------- */
function createPartAutocompleteMarkup() {
  return `
    <div class="partAutocomplete" hidden>
      <div class="partAutocompleteList" role="listbox"></div>
    </div>
  `;
}

function createTaskPartRow(part = {}) {
  const quantity = toNumber(part.qty, 0);
  const unitCost = toNumber(part.unitCost, 0);
  const inventoryId = String(part.inventoryId || "").trim();

  return `
    <tr class="taskPartRow" data-part-id="${escapeHtml(part.id || makeId())}" data-inventory-id="${escapeHtml(inventoryId)}">
      <td>
        <div class="partFieldWrap">
          <input class="partName" placeholder="Part name" autocomplete="off" value="${escapeHtml(part.name || "")}" />
          ${createPartAutocompleteMarkup()}
        </div>
      </td>
      <td>
        <div class="partFieldWrap">
          <input class="partNumber" placeholder="Part #" autocomplete="off" value="${escapeHtml(part.partNumber || "")}" />
          ${createPartAutocompleteMarkup()}
        </div>
      </td>
      <td>
        <input class="partQty" type="number" min="0" step="1" value="${quantity}" />
      </td>
      <td>
        <input class="partCost" type="number" min="0" step="0.01" value="${unitCost}" />
      </td>
      <td class="partLineTotal">${formatMoney(quantity * unitCost)}</td>
      <td>
        <button type="button" class="removePartBtn">Remove</button>
      </td>
    </tr>
  `;
}

function buildTaskCard(task = {}, index = 0) {
  const taskId = task.id || makeId();

  const partsHtml =
    Array.isArray(task.parts) && task.parts.length
      ? task.parts.map(createTaskPartRow).join("")
      : createTaskPartRow();

  const laborHours = toNumber(task.laborHours, 0);
  const laborRate = toNumber(task.laborRate, 0);
  const partsTotal = safeArray(task.parts).reduce((sum, part) => {
    return sum + toNumber(part.qty, 0) * toNumber(part.unitCost, 0);
  }, 0);

  const laborTotal = laborHours * laborRate;
  const taskTotal = laborTotal + partsTotal;

  return `
    <div class="taskCard" data-task-id="${escapeHtml(taskId)}">
      <div class="taskCardHeader">
        <div class="taskTitleBlock">
          <span class="taskIndex">Task ${index + 1}</span>
          <span class="taskTitle">${escapeHtml(task.taskName || `Service Task ${index + 1}`)}</span>
        </div>

        <div class="taskActions">
          <button type="button" class="removeTaskBtn">Remove Task</button>
        </div>
      </div>

      <div class="taskGrid">
        <div class="fieldGroup">
          <label>Task</label>
          <input class="taskName" placeholder="Task name" value="${escapeHtml(task.taskName || "")}" />
        </div>

        <div class="fieldGroup">
          <label>Labor Hours</label>
          <input class="taskLaborHours" type="number" min="0" step="0.01" value="${laborHours}" />
        </div>

        <div class="fieldGroup">
          <label>Labor Rate</label>
          <input class="taskLaborRate" type="number" min="0" step="0.01" value="${laborRate}" />
        </div>

        <div class="fieldGroup">
          <label>Task Total</label>
          <input class="taskTotalDisplay" value="${formatMoney(taskTotal)}" disabled />
        </div>

        <div class="fieldGroup taskDescriptionWrap">
          <label>Description</label>
          <textarea class="taskDescription" placeholder="Describe work performed">${escapeHtml(task.taskDesc || task.description || "")}</textarea>
        </div>
      </div>

      <div class="inlineSectionHeader">
        <h3>Parts</h3>
        <button type="button" class="primaryBtn addTaskPartBtn">+ Add Part</button>
      </div>

      <div class="tableWrap">
        <table class="taskPartsTable">
          <thead>
            <tr>
              <th>Part Name</th>
              <th>Part #</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${partsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renumberTaskCards() {
  qsa(".taskCard", byId("tasksContainer")).forEach((card, index) => {
    const indexEl = qs(".taskIndex", card);
    if (indexEl) indexEl.textContent = `Task ${index + 1}`;

    const titleEl = qs(".taskTitle", card);
    const taskName = qs(".taskName", card)?.value || "";
    if (titleEl) {
      titleEl.textContent = taskName.trim() || `Service Task ${index + 1}`;
    }
  });
}

function closeAutocompleteForRow(row) {
  qsa(".partAutocomplete", row).forEach(panel => {
    panel.hidden = true;
    const list = qs(".partAutocompleteList", panel);
    if (list) list.innerHTML = "";
  });
}

function renderAutocompleteSuggestions(row, targetInput, query) {
  const targetWrap = targetInput.closest(".partFieldWrap");
  const panel = qs(".partAutocomplete", targetWrap);
  const list = qs(".partAutocompleteList", panel);
  if (!panel || !list) return;

  const selectedInventoryId = String(row.dataset.inventoryId || "").trim();
  const suggestions = getInventorySuggestions(query, "");

  if (!suggestions.length) {
    panel.hidden = true;
    list.innerHTML = "";
    return;
  }

  list.innerHTML = suggestions
    .map(item => {
      const isCurrent = selectedInventoryId && String(item.id) === selectedInventoryId;
      return `
        <button
          type="button"
          class="partSuggestionBtn${isCurrent ? " isCurrent" : ""}"
          data-inventory-id="${escapeHtml(item.id)}"
        >
          <div class="partSuggestionMain">
            <strong>${escapeHtml(item.partNumber || "—")}</strong>
            <span>${escapeHtml(item.name || item.itemName || "Unnamed Part")}</span>
          </div>
          <div class="partSuggestionMeta">
            <span>Qty: ${escapeHtml(String(toNumber(item.quantity, 0)))}</span>
            <span>${escapeHtml(formatMoney(toNumber(item.unitCost, 0)))}</span>
          </div>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll(".partSuggestionBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = getInventoryItemById(btn.dataset.inventoryId);
      if (!item) return;

      row.dataset.inventoryId = String(item.id);
      const partNameInput = qs(".partName", row);
      const partNumberInput = qs(".partNumber", row);
      const partCostInput = qs(".partCost", row);

      if (partNameInput) partNameInput.value = item.name || item.itemName || "";
      if (partNumberInput) partNumberInput.value = item.partNumber || "";
      if (partCostInput) partCostInput.value = String(toNumber(item.unitCost, 0));

      closeAutocompleteForRow(row);
      calcWorkOrderTotals();
      queueAutoSave();
    });
  });

  panel.hidden = false;
}

function clearInventorySelectionForRow(row, { keepTypedValues = true } = {}) {
  row.dataset.inventoryId = "";
  if (!keepTypedValues) {
    const costInput = qs(".partCost", row);
    if (costInput) costInput.value = "0";
  }
}

function bindPartAutocomplete(row) {
  const partNameInput = qs(".partName", row);
  const partNumberInput = qs(".partNumber", row);

  const handleAutocompleteInput = input => {
    const value = input?.value || "";
    const currentInventoryId = String(row.dataset.inventoryId || "");
    const currentItem = currentInventoryId ? getInventoryItemById(currentInventoryId) : null;

    if (currentItem) {
      const currentMatchesTyped =
        normalizeLower(value) === normalizeLower(currentItem.name) ||
        normalizeLower(value) === normalizeLower(currentItem.itemName) ||
        normalizeLower(value) === normalizeLower(currentItem.partNumber);

      if (!currentMatchesTyped) {
        clearInventorySelectionForRow(row, { keepTypedValues: true });
      }
    }

    if (!normalizeText(value)) {
      closeAutocompleteForRow(row);
      return;
    }

    renderAutocompleteSuggestions(row, input, value);
  };

  [partNameInput, partNumberInput].forEach(input => {
    if (!input) return;

    input.addEventListener("input", () => {
      handleAutocompleteInput(input);
      queueAutoSave();
    });

    input.addEventListener("focus", () => {
      if (normalizeText(input.value)) {
        renderAutocompleteSuggestions(row, input, input.value);
      }
    });

    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeAutocompleteForRow(row);
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!row.contains(document.activeElement)) {
          closeAutocompleteForRow(row);
        }
      }, 120);
    });
  });
}

function bindTaskCardEvents(card) {
  const taskNameInput = qs(".taskName", card);
  const laborHoursInput = qs(".taskLaborHours", card);
  const laborRateInput = qs(".taskLaborRate", card);
  const addPartBtn = qs(".addTaskPartBtn", card);
  const removeTaskBtn = qs(".removeTaskBtn", card);

  const recalc = () => {
    calcWorkOrderTotals();
    queueAutoSave();
  };

  taskNameInput?.addEventListener("input", () => {
    const title = qs(".taskTitle", card);
    if (title) {
      title.textContent = taskNameInput.value.trim() || "Service Task";
    }
    queueAutoSave();
  });

  laborHoursInput?.addEventListener("input", recalc);
  laborRateInput?.addEventListener("input", recalc);
  qs(".taskDescription", card)?.addEventListener("input", queueAutoSave);

  addPartBtn?.addEventListener("click", () => {
    const tbody = qs("tbody", card);
    if (!tbody) return;

    tbody.insertAdjacentHTML("beforeend", createTaskPartRow());
    bindPartRowEvents(tbody.lastElementChild);
    calcWorkOrderTotals();
    queueAutoSave();
  });

  removeTaskBtn?.addEventListener("click", async () => {
    const confirmed = await showWorkOrderConfirm(
      "Remove this task from the work order?",
      "Remove Task",
      "Remove"
    );

    if (!confirmed) return;

    card.remove();
    renumberTaskCards();
    calcWorkOrderTotals();
    queueAutoSave();

    if (!qsa(".taskCard", byId("tasksContainer")).length) {
      addTaskCard();
    }
  });

  qsa(".taskPartRow", card).forEach(bindPartRowEvents);
}

function bindPartRowEvents(row) {
  const qtyInput = qs(".partQty", row);
  const costInput = qs(".partCost", row);

  const recalcRow = () => {
    const qty = toNumber(qtyInput?.value, 0);
    const cost = toNumber(costInput?.value, 0);
    const totalEl = qs(".partLineTotal", row);
    if (totalEl) totalEl.textContent = formatMoney(qty * cost);
    calcWorkOrderTotals();
    queueAutoSave();
  };

  bindPartAutocomplete(row);

  qtyInput?.addEventListener("input", recalcRow);
  costInput?.addEventListener("input", recalcRow);

  qs(".removePartBtn", row)?.addEventListener("click", () => {
    const tbody = row.closest("tbody");
    row.remove();

    if (tbody && !qsa(".taskPartRow", tbody).length) {
      tbody.insertAdjacentHTML("beforeend", createTaskPartRow());
      bindPartRowEvents(tbody.lastElementChild);
    }

    calcWorkOrderTotals();
    queueAutoSave();
  });
}

function addTaskCard(task = {}) {
  const container = byId("tasksContainer");
  if (!container) return;

  const cardHtml = buildTaskCard(task, qsa(".taskCard", container).length);
  container.insertAdjacentHTML("beforeend", cardHtml);

  const card = container.lastElementChild;
  if (!card) return;

  bindTaskCardEvents(card);
  renumberTaskCards();
  calcWorkOrderTotals();
}

function getTaskPartData(row) {
  return {
    id: String(row?.dataset?.partId || makeId()),
    inventoryId: String(row?.dataset?.inventoryId || "").trim(),
    name: qs(".partName", row)?.value || "",
    partNumber: qs(".partNumber", row)?.value || "",
    qty: toNumber(qs(".partQty", row)?.value, 0),
    unitCost: toNumber(qs(".partCost", row)?.value, 0)
  };
}

function getTaskCardData(card) {
  const taskName = qs(".taskName", card)?.value || "";

  return {
    id: String(card?.dataset?.taskId || makeId()),
    taskName,
    taskDesc: qs(".taskDescription", card)?.value || "",
    description: qs(".taskDescription", card)?.value || "",
    laborHours: toNumber(qs(".taskLaborHours", card)?.value, 0),
    laborRate: toNumber(qs(".taskLaborRate", card)?.value, 0),
    parts: qsa(".taskPartRow", card).map(row => ({
      ...getTaskPartData(row),
      taskName
    }))
  };
}

function calcWorkOrderTotals() {
  const taskCards = qsa(".taskCard", byId("tasksContainer"));
  const tasks = taskCards.map(getTaskCardData);

  tasks.forEach((task, index) => {
    const card = taskCards[index];
    if (!card) return;

    const partsTotal = safeArray(task.parts).reduce((sum, part) => {
      return sum + toNumber(part.qty, 0) * toNumber(part.unitCost, 0);
    }, 0);

    const laborTotal = toNumber(task.laborHours, 0) * toNumber(task.laborRate, 0);
    const total = partsTotal + laborTotal;

    const totalDisplay = qs(".taskTotalDisplay", card);
    if (totalDisplay) totalDisplay.value = formatMoney(total);
  });

  const totalLabor = tasks.reduce((sum, task) => {
    return sum + toNumber(task.laborHours, 0) * toNumber(task.laborRate, 0);
  }, 0);

  const totalParts = tasks.reduce((sum, task) => {
    return (
      sum +
      safeArray(task.parts).reduce((partSum, part) => {
        return partSum + toNumber(part.qty, 0) * toNumber(part.unitCost, 0);
      }, 0)
    );
  }, 0);

  setText("summaryLabor", formatMoney(totalLabor));
  setText("summaryParts", formatMoney(totalParts));
  setText("grandTotal", formatMoney(totalLabor + totalParts));
}

/* -------------------------
   ATTACHMENTS
------------------------- */
function renderAttachments() {
  const list = byId("attachmentList");
  if (!list) return;

  const attachments = safeArray(currentWorkOrder?.attachments);

  if (!attachments.length) {
    list.innerHTML = `
      <div class="emptyStateCard">
        <h3>No attachments yet</h3>
        <p>No files have been added to this work order.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = attachments
    .map(attachment => {
      const name = attachment.name || "Attachment";
      const uploaded = attachment.uploadedAt
        ? new Date(attachment.uploadedAt).toLocaleString()
        : "";
      return `
        <div class="attachmentCard" data-attachment-id="${escapeHtml(attachment.id)}">
          <div class="attachmentCardMain">
            <strong>${escapeHtml(name)}</strong>
            <div class="fieldHelpText">
              ${escapeHtml(attachment.type || "file")} • ${escapeHtml(formatFileSize(attachment.size || 0))}
              ${uploaded ? ` • ${escapeHtml(uploaded)}` : ""}
            </div>
            <div class="fieldHelpText">
              ${escapeHtml(attachment.filePath || attachment.url || "")}
            </div>
          </div>
          <div class="attachmentCardActions">
            <button type="button" class="previewAttachmentBtn">Open</button>
            <button type="button" class="downloadAttachmentBtn">Open Folder File</button>
            ${isAdminUser() ? '<button type="button" class="removeAttachmentBtn danger">Remove</button>' : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function closeAttachmentPreview() {
  byId("attachmentPreviewModal")?.classList.remove("show");
  setText("attachmentPreviewTitle", "Preview");
  const body = byId("attachmentPreviewBody");
  if (body) body.innerHTML = "";
}

async function openAttachment(attachmentId) {
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return;

  try {
    await openLocalAttachment(attachment);
  } catch (error) {
    console.error("openAttachment failed:", error);
    await showWorkOrderAlert(
      error?.message || "Unable to open the attachment.",
      "Open Attachment"
    );
  }
}

async function downloadAttachment(attachmentId) {
  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return;

  try {
    await openLocalAttachment(attachment);
  } catch (error) {
    console.error("downloadAttachment failed:", error);
    await showWorkOrderAlert(
      error?.message || "Unable to open the attachment.",
      "Open Attachment"
    );
  }
}

async function removeAttachment(attachmentId) {
  if (!isAdminUser()) {
    await showWorkOrderAlert(
      "Only an admin can remove attachments.",
      "Permission Required"
    );
    return;
  }

  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return;

  const confirmed = await showWorkOrderConfirm(
    "Remove this attachment from the work order?",
    "Remove Attachment",
    "Remove"
  );

  if (!confirmed) return;

  try {
    await deleteLocalAttachmentFile(attachment);
  } catch (error) {
    console.error("Attachment file delete failed:", error);
    await showWorkOrderAlert(
      error?.message || "The file could not be removed from the drive.",
      "Remove Attachment"
    );
    return;
  }

  currentWorkOrder = {
    ...safeObject(currentWorkOrder),
    attachments: safeArray(currentWorkOrder?.attachments).filter(
      item => String(item.id) !== String(attachmentId)
    )
  };

  renderAttachments();
  queueAutoSave();
}

async function handleAttachmentInput(event) {
  if (!isAdminUser()) {
    await showWorkOrderAlert(
      "Only an admin can add attachments to work orders.",
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
      currentWorkOrder = {
        ...safeObject(currentWorkOrder),
        attachments: [
          ...safeArray(currentWorkOrder?.attachments),
          ...uploadedAttachments
        ]
      };

      renderAttachments();
      queueAutoSave();
    }
  } catch (error) {
    console.error("Attachment upload failed:", error);
    await showWorkOrderAlert(
      error?.message || "Could not save the selected files.",
      "Attachment Upload Error"
    );
  } finally {
    if (event?.target) {
      event.target.value = "";
    }
  }
}

/* -------------------------
   SERVICE COMPLETION
------------------------- */
async function updateCompletedServicesFromWorkOrder(workOrderData) {
  const completedStatuses = new Set(["completed", "closed"]);
  const normalizedStatus = normalizeLower(workOrderData?.status || "");

  if (
    !completedStatuses.has(normalizedStatus) &&
    !normalizeText(workOrderData?.completed) &&
    !normalizeText(workOrderData?.closed)
  ) {
    return;
  }

  const selectedEquipment = findEquipmentByUnit(workOrderData?.equipmentNumber || "");
  if (!selectedEquipment) return;

  const serviceCodes =
    Array.isArray(workOrderData?.serviceCodes) && workOrderData.serviceCodes.length
      ? workOrderData.serviceCodes
      : (normalizeText(workOrderData?.serviceCode) ? [normalizeText(workOrderData.serviceCode)] : []);

  if (!serviceCodes.length) return;

  const completedDate =
    parseDate(workOrderData?.completed) ||
    parseDate(workOrderData?.closed) ||
    parseDate(workOrderData?.opened) ||
    new Date();

  const equipmentIndex = equipmentList.findIndex(
    item => String(item.id) === String(selectedEquipment.id)
  );
  if (equipmentIndex < 0) return;

  let updatedEquipment = safeObject(equipmentList[equipmentIndex]);

  serviceCodes.forEach(serviceCode => {
    const matchedTemplateTask =
      getTemplateTaskForServiceCode(updatedEquipment, settingsCache, serviceCode);

    const completionEntry = buildServiceCompletionEntry({
      code: serviceCode,
      completedAt: dateToYMD(completedDate),
      meter: String(workOrderData?.meter || workOrderData?.mileage || "").trim(),
      workOrderId: String(workOrderData?.id || ""),
      workOrderNumber: String(workOrderData?.workOrderNumber || workOrderData?.woNumber || ""),
      notes: String(workOrderData?.notes || "").trim(),
      templateId: normalizeText(workOrderData?.serviceTemplateId || matchedTemplateTask?.templateId),
      templateName: normalizeText(workOrderData?.serviceTemplateName || matchedTemplateTask?.templateName),
      sourceTaskId: normalizeText(workOrderData?.sourceTaskId || matchedTemplateTask?.id),
      sourceTaskName: normalizeText(workOrderData?.sourceTaskName || matchedTemplateTask?.task)
    });

    if (!completionEntry) return;
    updatedEquipment = applyServiceCompletionToEquipment(updatedEquipment, completionEntry);
  });

  equipmentList[equipmentIndex] = updatedEquipment;
  await saveEquipment(equipmentList);

  try {
    if (window.opener) {
      window.opener.dispatchEvent(new CustomEvent("fleet:equipment-changed"));
      window.opener.dispatchEvent(new CustomEvent("fleet:work-orders-changed"));
    }
  } catch (error) {
    console.warn("Unable to notify opener window:", error);
  }
}

/* -------------------------
   SAVE / DELETE
------------------------- */
function updateHeaderNumber() {
  setText("woNumberText", getCurrentWorkOrderNumber());
}

function getWorkOrderData() {
  const selectedEquipment = getSelectedEquipment();
  const selectedAssignees = getSelectedAssignees();
  const selectedServiceCodes = getSelectedServiceCodes();
  const selectedServiceOptions = getSelectedServiceOptions(selectedEquipment);
  const selectedServiceLabels = selectedServiceOptions.map(option => option.label);

  const tasks = qsa(".taskCard", byId("tasksContainer")).map(getTaskCardData);

  const totalLabor = tasks.reduce((sum, task) => {
    return sum + toNumber(task.laborHours, 0) * toNumber(task.laborRate, 0);
  }, 0);

  const totalParts = tasks.reduce((sum, task) => {
    return (
      sum +
      safeArray(task.parts).reduce((partSum, part) => {
        return partSum + toNumber(part.qty, 0) * toNumber(part.unitCost, 0);
      }, 0)
    );
  }, 0);

  const completed = getValue("woCompleted");
  const started = getValue("woStarted");

  return {
    id: String(currentWorkOrder?.id || makeId()),
    workOrderNumber: getCurrentWorkOrderNumber(),
    woNumber: getCurrentWorkOrderNumber(),
    equipmentNumber: getValue("woEquipmentNumber"),
    equipmentId: selectedEquipment?.id ? String(selectedEquipment.id) : "",
    assignee: selectedAssignees.join(", "),
    assignees: selectedAssignees,
    started,
    type: "",
    repairLocation: getValue("repairLocation"),
    meter: currentWorkOrder?.meter || "",
    mileage: currentWorkOrder?.mileage || currentWorkOrder?.meter || "",
    opened: currentWorkOrder?.opened || currentWorkOrder?.date || currentWorkOrder?.woDate || "",
    date: currentWorkOrder?.opened || currentWorkOrder?.date || currentWorkOrder?.woDate || "",
    woDate: currentWorkOrder?.opened || currentWorkOrder?.date || currentWorkOrder?.woDate || "",
    closed: currentWorkOrder?.closed || "",
    completed,
    status: getCurrentStatus(),
    notes: getValue("woNotes"),
    tasks,
    attachments: safeArray(currentWorkOrder?.attachments),
    inventoryIssueAppliedKeys: safeArray(currentWorkOrder?.inventoryIssueAppliedKeys),

    serviceCode: selectedServiceCodes[0] || "",
    serviceLabel: selectedServiceLabels[0] || "",
    serviceCodes: selectedServiceCodes,
    serviceLabels: selectedServiceLabels,
    serviceCategory: selectedServiceCodes[0] ? String(selectedServiceCodes[0]).toLowerCase() : "",
    serviceTemplateId: selectedServiceOptions[0]?.templateId || "",
    serviceTemplateName: selectedServiceOptions[0]?.templateName || "",
    sourceTaskId: selectedServiceOptions[0]?.sourceTaskId || "",
    sourceTaskName: selectedServiceOptions[0]?.sourceTaskName || "",

    totalLabor,
    totalParts,
    total: totalLabor + totalParts,
    updatedAt: new Date().toISOString(),
    createdAt: currentWorkOrder?.createdAt || new Date().toISOString()
  };
}

async function saveWorkOrder(showMessage = false) {
  if (isSavingWorkOrder) return;

  try {
    isSavingWorkOrder = true;
    setSaveStatus("Saving...", "saving");

    const previousWorkOrder = currentWorkOrder ? { ...currentWorkOrder } : null;
    const workOrderData = getWorkOrderData();

    currentWorkOrder = {
      ...safeObject(currentWorkOrder),
      ...workOrderData
    };

    await applyInventoryIssuesFromWorkOrder(previousWorkOrder, currentWorkOrder);

    const index = workOrders.findIndex(
      item => String(item.id) === String(currentWorkOrder.id)
    );

    if (index >= 0) {
      workOrders[index] = {
        ...safeObject(workOrders[index]),
        ...currentWorkOrder
      };
    } else {
      workOrders.push(currentWorkOrder);
    }

    await saveWorkOrders(workOrders);
    await updateCompletedServicesFromWorkOrder(currentWorkOrder);

    updateHeaderNumber();
    renderAttachments();
    calcWorkOrderTotals();
    setSaveStatus("Saved", "saved");

    try {
      if (window.opener) {
        window.opener.dispatchEvent(new CustomEvent("fleet:work-orders-changed"));
        window.opener.dispatchEvent(new CustomEvent("fleet:inventory-changed"));
      }
    } catch (error) {
      console.warn("Unable to notify opener window:", error);
    }

    if (showMessage) {
      await showWorkOrderAlert("Work order saved successfully.", "Saved");
    }
  } catch (error) {
    console.error("saveWorkOrder failed:", error);
    setSaveStatus("Save failed", "error");
    if (showMessage) {
      await showWorkOrderAlert(
        error?.message || "There was a problem saving the work order.",
        "Save Error"
      );
    }
  } finally {
    isSavingWorkOrder = false;
  }
}

async function deleteCurrentWorkOrder() {
  if (!currentWorkOrder?.id) return;

  const confirmed = await showWorkOrderConfirm(
    "Delete this work order?",
    "Delete Work Order",
    "Delete"
  );

  if (!confirmed) return;

  workOrders = workOrders.filter(item => String(item.id) !== String(currentWorkOrder.id));
  await saveWorkOrders(workOrders);

  try {
    if (window.opener) {
      window.opener.dispatchEvent(new CustomEvent("fleet:work-orders-changed"));
    }
  } catch (error) {
    console.warn("Unable to notify opener window:", error);
  }

  window.close();
}

function printWorkOrder() {
  window.print();
}

async function fillWorkOrderForm(wo) {
  setValue("woEquipmentNumber", wo.equipmentNumber || "");
  setValue("woStarted", wo.started || "");
  setValue("repairLocation", wo.repairLocation || "");
  setValue("woCompleted", wo.completed || "");
  setValue("woNotes", wo.notes || "");
  setCurrentStatus(wo.status || "Open");

  const tasksContainer = byId("tasksContainer");
  if (tasksContainer) tasksContainer.innerHTML = "";

  safeArray(wo.tasks).forEach(task => addTaskCard(task));

  renderAttachments();

  const selectedAssignees =
    Array.isArray(wo.assignees) && wo.assignees.length
      ? wo.assignees
      : (wo.assignee
          ? String(wo.assignee)
              .split(",")
              .map(value => value.trim())
              .filter(Boolean)
          : []);

  renderAssigneeOptions(selectedAssignees);

  await updateEquipmentMatchInfo();

  if (byId("woServiceTaskSelect")) {
    const selectedCodes =
      Array.isArray(wo.serviceCodes) && wo.serviceCodes.length
        ? wo.serviceCodes
        : (wo.serviceCode ? [wo.serviceCode] : []);

    const select = byId("woServiceTaskSelect");
    Array.from(select.options).forEach(option => {
      option.selected = selectedCodes.includes(option.value);
    });
  }

  calcWorkOrderTotals();
}

/* -------------------------
   EVENTS
------------------------- */
function bindTopLevelEvents() {
  if (topLevelEventsBound) return;
  topLevelEventsBound = true;

  byId("backBtn")?.addEventListener("click", () => {
    window.close();
  });

  byId("printBtn")?.addEventListener("click", () => {
    printWorkOrder();
  });

  byId("deleteBtn")?.addEventListener("click", () => {
    deleteCurrentWorkOrder();
  });

  qsa(".statusPill").forEach(btn => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.statusValue || "Open";
      setCurrentStatus(status);

      if (status === "Completed" && !getValue("woCompleted")) {
        setValue("woCompleted", dateToYMD(new Date()));
      }

      queueAutoSave();
    });
  });

  byId("addTaskBtn")?.addEventListener("click", () => {
    addTaskCard();
    queueAutoSave();
  });

  byId("woEquipmentNumber")?.addEventListener("input", async () => {
    await updateEquipmentMatchInfo();
    queueAutoSave();
  });

  byId("woServiceTaskSelect")?.addEventListener("change", () => {
    queueAutoSave();
  });

  byId("woAssignee")?.addEventListener("change", () => {
    queueAutoSave();
  });

  ["woStarted", "repairLocation", "woCompleted", "woNotes"].forEach(id => {
    byId(id)?.addEventListener("input", queueAutoSave);
    byId(id)?.addEventListener("change", queueAutoSave);
  });

  byId("addAttachmentBtn")?.addEventListener("click", async () => {
    if (!isAdminUser()) {
      await showWorkOrderAlert(
        "Only an admin can add attachments to work orders.",
        "Permission Required"
      );
      return;
    }

    byId("attachmentInput")?.click();
  });

  byId("attachmentInput")?.addEventListener("change", event => {
    handleAttachmentInput(event);
  });

  byId("closeAttachmentPreviewBtn")?.addEventListener("click", () => {
    closeAttachmentPreview();
  });

  byId("attachmentPreviewModal")?.addEventListener("click", event => {
    if (event.target === byId("attachmentPreviewModal")) {
      closeAttachmentPreview();
    }
  });

  byId("tasksContainer")?.addEventListener("input", () => {
    calcWorkOrderTotals();
  });

  document.addEventListener("click", event => {
    const insidePartField = event.target.closest(".partFieldWrap");
    if (!insidePartField) {
      qsa(".taskPartRow", byId("tasksContainer")).forEach(closeAutocompleteForRow);
    }
  });
}

function bindAttachmentPreviewEvents() {
  if (attachmentPreviewEventsBound) return;
  attachmentPreviewEventsBound = true;

  byId("attachmentList")?.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    const card = button.closest("[data-attachment-id]");
    const attachmentId = card?.dataset.attachmentId;
    if (!attachmentId) return;

    if (button.classList.contains("previewAttachmentBtn")) {
      await openAttachment(attachmentId);
      return;
    }

    if (button.classList.contains("downloadAttachmentBtn")) {
      await downloadAttachment(attachmentId);
      return;
    }

    if (button.classList.contains("removeAttachmentBtn")) {
      await removeAttachment(attachmentId);
    }
  });
}

/* -------------------------
   INIT
------------------------- */
async function initState() {
  const [
    loadedWorkOrders,
    loadedEquipment,
    loadedSettings,
    loadedUsers,
    loadedInventory
  ] = await Promise.all([
    loadWorkOrders(),
    loadEquipment(),
    loadSettings(),
    loadUsers(),
    loadInventory()
  ]);

  workOrders = safeArray(loadedWorkOrders);
  equipmentList = safeArray(loadedEquipment);
  usersList = safeArray(loadedUsers);
  hydrateInventoryList(loadedInventory);

  settingsCache = {
    ...safeObject(loadedSettings),
    companyName: loadedSettings?.companyName || "",
    defaultLocation: loadedSettings?.defaultLocation || "",
    theme: loadedSettings?.theme || "default",
    serviceTasks: safeArray(loadedSettings?.serviceTasks),
    serviceTemplates: safeArray(loadedSettings?.serviceTemplates)
  };

  if (editingId) {
    currentWorkOrder =
      workOrders.find(item => String(item.id) === String(editingId)) || null;
  }

  if (!currentWorkOrder) {
    currentWorkOrder = {
      id: makeId(),
      workOrderNumber: generateWONumber(),
      woNumber: "",
      status: "Open",
      tasks: [],
      attachments: [],
      inventoryIssueAppliedKeys: [],
      serviceCode: "",
      serviceCodes: [],
      serviceLabels: [],
      assignee: "",
      assignees: [],
      type: "",
      opened: "",
      date: "",
      woDate: "",
      closed: "",
      meter: "",
      mileage: ""
    };
  } else {
    currentWorkOrder = {
      ...currentWorkOrder,
      tasks: safeArray(currentWorkOrder.tasks),
      attachments: safeArray(currentWorkOrder.attachments),
      inventoryIssueAppliedKeys: safeArray(currentWorkOrder.inventoryIssueAppliedKeys),
      serviceCode: String(currentWorkOrder.serviceCode || ""),
      serviceCodes: safeArray(currentWorkOrder.serviceCodes),
      serviceLabels: safeArray(currentWorkOrder.serviceLabels),
      assignee: currentWorkOrder.assignee || "",
      assignees: safeArray(currentWorkOrder.assignees).length
        ? safeArray(currentWorkOrder.assignees)
        : (currentWorkOrder.assignee
            ? String(currentWorkOrder.assignee)
                .split(",")
                .map(value => value.trim())
                .filter(Boolean)
            : []),
      type: currentWorkOrder.type || "",
      opened: currentWorkOrder.opened || currentWorkOrder.date || currentWorkOrder.woDate || "",
      date: currentWorkOrder.date || currentWorkOrder.opened || currentWorkOrder.woDate || "",
      woDate: currentWorkOrder.woDate || currentWorkOrder.opened || currentWorkOrder.date || "",
      closed: currentWorkOrder.closed || "",
      meter: currentWorkOrder.meter || "",
      mileage: currentWorkOrder.mileage || currentWorkOrder.meter || ""
    };
  }
}

async function init() {
  await initState();
  bindTopLevelEvents();
  bindAttachmentPreviewEvents();

  renderAssigneeOptions(currentWorkOrder?.assignees || []);

  if (currentWorkOrder) {
    await fillWorkOrderForm(currentWorkOrder);
  }

  if (!qsa(".taskCard", byId("tasksContainer")).length) {
    addTaskCard();
  }

  updateHeaderNumber();
  renderAttachments();
  applyAttachmentPermissionUi();
  await updateEquipmentMatchInfo();
  calcWorkOrderTotals();
  setSaveStatus("Saved", "saved");
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && byId("woAppModal")?.classList.contains("show")) {
    resolveWorkOrderModal(false);
  }

  if (event.key === "Escape" && byId("attachmentPreviewModal")?.classList.contains("show")) {
    closeAttachmentPreview();
  }
});