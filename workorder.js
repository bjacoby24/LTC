import { normalizeText, formatMoney, makeId } from "./js/utils.js";
import {
  loadWorkOrders,
  saveWorkOrders,
  loadEquipment
} from "./js/storage.js";
import { initFirebase } from "./firebase-config.js";

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

/* -------------------------
   STATE
------------------------- */
const params = new URLSearchParams(window.location.search);
const editingId = params.get("id");

let workOrders = [];
let equipmentList = [];
let currentWorkOrder = null;
let autoSaveTimer = null;
let isSavingWorkOrder = false;

let firebaseState = {
  app: null,
  db: null,
  storage: null,
  connected: false,
  initialized: false,
  firestoreFns: null,
  storageFns: null
};

/* -------------------------
   FIREBASE
------------------------- */
async function connectFirebaseSafely() {
  if (firebaseState.initialized) return firebaseState;

  try {
    const result = await initFirebase();

    firebaseState.app = result?.app ?? null;
    firebaseState.db = result?.db ?? null;
    firebaseState.storage = result?.storage ?? null;
    firebaseState.connected = !!result?.connected;
    firebaseState.initialized = true;

    if (firebaseState.connected) {
      const firestoreModule = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
      const storageModule = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js");

      firebaseState.firestoreFns = {
        doc: firestoreModule.doc,
        updateDoc: firestoreModule.updateDoc
      };

      firebaseState.storageFns = {
        ref: storageModule.ref,
        uploadBytes: storageModule.uploadBytes,
        getDownloadURL: storageModule.getDownloadURL,
        deleteObject: storageModule.deleteObject
      };
    }

    return firebaseState;
  } catch (error) {
    console.error("Firebase init failed:", error);

    firebaseState = {
      app: null,
      db: null,
      storage: null,
      connected: false,
      initialized: true,
      firestoreFns: null,
      storageFns: null
    };

    return firebaseState;
  }
}

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
   HELPERS
------------------------- */
function generateWONumber(existingNumber = "") {
  if (normalizeText(existingNumber)) return existingNumber;

  const list = Array.isArray(workOrders) ? workOrders : [];
  let maxSequence = 0;

  list.forEach(wo => {
    const raw = String(wo.workOrderNumber || wo.woNumber || "");
    const match = raw.match(/^WO-(\d+)$/i);
    if (match) {
      const num = Number(match[1]);
      if (num > maxSequence) maxSequence = num;
    }
  });

  return `WO-${String(maxSequence + 1).padStart(4, "0")}`;
}

function findEquipmentByUnit(unitValue) {
  const clean = normalizeText(unitValue).toLowerCase();
  if (!clean || !Array.isArray(equipmentList)) return null;

  return (
    equipmentList.find(eq => normalizeText(eq.unit).toLowerCase() === clean) ||
    equipmentList.find(eq => normalizeText(eq.equipmentNumber).toLowerCase() === clean) ||
    equipmentList.find(eq => normalizeText(eq.unitNumber).toLowerCase() === clean) ||
    null
  );
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

function updateEquipmentMatchInfo() {
  const info = byId("equipmentMatchInfo");
  if (!info) return;

  const equipmentNumber = getValue("woEquipmentNumber");
  if (!normalizeText(equipmentNumber)) {
    info.textContent = "Enter an equipment number.";
    return;
  }

  const match = findEquipmentByUnit(equipmentNumber);
  if (!match) {
    info.textContent = "No matching equipment found.";
    return;
  }

  const details = [match.year, match.make, match.model].filter(Boolean).join(" ");
  const serial = match.serial ? ` • Serial: ${match.serial}` : "";
  info.textContent = `Matched: ${details || "Equipment found"}${serial}`;
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

/* -------------------------
   FIREBASE ATTACHMENTS
------------------------- */
async function uploadAttachmentToFirebase(file) {
  const state = await connectFirebaseSafely();

  if (!state.connected || !state.storage || !state.storageFns) {
    throw new Error("Firebase Storage is not connected.");
  }

  const { ref, uploadBytes, getDownloadURL } = state.storageFns;

  const safeWorkOrderNumber = String(getCurrentWorkOrderNumber()).replace(/[^\w-]/g, "_");
  const safeName = `${Date.now()}_${String(file.name || "file").replace(/[^\w.\-]/g, "_")}`;
  const storagePath = `work-orders/${safeWorkOrderNumber}/${safeName}`;

  const fileRef = ref(state.storage, storagePath);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);

  return {
    id: makeId(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size || 0,
    url,
    path: storagePath,
    uploadedAt: new Date().toISOString()
  };
}

async function deleteAttachmentFromFirebase(attachment) {
  if (!attachment?.path) return;

  const state = await connectFirebaseSafely();
  if (!state.connected || !state.storage || !state.storageFns) return;

  try {
    const { ref, deleteObject } = state.storageFns;
    const fileRef = ref(state.storage, attachment.path);
    await deleteObject(fileRef);
  } catch (error) {
    console.error("Unable to delete Firebase attachment:", error);
  }
}

async function syncAttachmentsToFirebaseWorkOrder() {
  const state = await connectFirebaseSafely();
  const workOrderId = getCurrentWorkOrderId();

  if (!state.connected || !state.db || !state.firestoreFns || workOrderId == null) return;

  try {
    const { doc, updateDoc } = state.firestoreFns;

    await updateDoc(doc(state.db, "workOrders", String(workOrderId)), {
      attachments: Array.isArray(currentWorkOrder?.attachments)
        ? currentWorkOrder.attachments
        : []
    });
  } catch (error) {
    console.error("Unable to sync attachments to Firebase:", error);
  }
}

/* -------------------------
   TASKS
------------------------- */
function createTaskPartRow(part = {}) {
  return `
    <tr class="taskPartRow" data-part-id="${part.id || makeId()}">
      <td><input class="partName" placeholder="Part name" value="${escapeHtml(part.name || "")}" /></td>
      <td><input class="partNumber" placeholder="Part #" value="${escapeHtml(part.partNumber || "")}" /></td>
      <td><input class="partQty" type="number" min="0" step="1" value="${Number(part.qty || 0)}" /></td>
      <td><input class="partCost" type="number" min="0" step="0.01" value="${Number(part.unitCost || 0)}" /></td>
      <td class="partLineTotal">${formatMoney((Number(part.qty || 0) || 0) * (Number(part.unitCost || 0) || 0))}</td>
      <td><button type="button" class="removePartBtn">Remove</button></td>
    </tr>
  `;
}

function buildTaskCard(task = {}, index = 0) {
  const taskId = task.id || makeId();

  const partsHtml =
    Array.isArray(task.parts) && task.parts.length
      ? task.parts.map(createTaskPartRow).join("")
      : createTaskPartRow();

  const laborHours = Number(task.laborHours || 0);
  const laborRate = Number(task.laborRate || 0);
  const partsTotal = Array.isArray(task.parts)
    ? task.parts.reduce((sum, part) => {
        return sum + ((Number(part.qty || 0) || 0) * (Number(part.unitCost || 0) || 0));
      }, 0)
    : 0;

  const laborTotal = laborHours * laborRate;
  const taskTotal = laborTotal + partsTotal;

  return `
    <div class="taskCard" data-task-id="${taskId}">
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
          <tbody>
            ${partsHtml}
          </tbody>
        </table>
      </div>

      <div class="taskTotalsBar">
        <div class="taskMetric">
          <div class="taskMetricLabel">Labor</div>
          <div class="taskMetricValue taskLaborTotal">${formatMoney(laborTotal)}</div>
        </div>

        <div class="taskMetric">
          <div class="taskMetricLabel">Parts</div>
          <div class="taskMetricValue taskPartsTotal">${formatMoney(partsTotal)}</div>
        </div>

        <div class="taskMetric">
          <div class="taskMetricLabel">Task Total</div>
          <div class="taskMetricValue taskGrandTotal">${formatMoney(taskTotal)}</div>
        </div>
      </div>
    </div>
  `;
}

function addTaskCard(task = {}) {
  const container = byId("tasksContainer");
  if (!container) return;

  const index = qsa(".taskCard", container).length;
  container.insertAdjacentHTML("beforeend", buildTaskCard(task, index));

  const card = container.lastElementChild;
  bindTaskCardEvents(card);
  refreshTaskIndexes();
  calcWorkOrderTotals();
}

function refreshTaskIndexes() {
  qsa(".taskCard").forEach((card, index) => {
    const indexEl = qs(".taskIndex", card);
    const titleEl = qs(".taskTitle", card);
    const taskNameInput = qs(".taskName", card);

    if (indexEl) indexEl.textContent = `Task ${index + 1}`;
    if (titleEl) {
      const name = normalizeText(taskNameInput?.value || "");
      titleEl.textContent = name || `Service Task ${index + 1}`;
    }
  });
}

function bindTaskCardEvents(card) {
  if (!card) return;

  qsa("input, textarea", card).forEach(input => {
    input.addEventListener("input", () => {
      refreshTaskIndexes();
      calcWorkOrderTotals();
      autoSaveWorkOrder();
    });
  });

  qs(".removeTaskBtn", card)?.addEventListener("click", () => {
    card.remove();

    if (!qsa(".taskCard").length) {
      addTaskCard();
    }

    refreshTaskIndexes();
    calcWorkOrderTotals();
    autoSaveWorkOrder();
  });

  qs(".addTaskPartBtn", card)?.addEventListener("click", () => {
    const tbody = qs("tbody", card);
    if (!tbody) return;

    tbody.insertAdjacentHTML("beforeend", createTaskPartRow());
    bindTaskPartRowEvents(tbody.lastElementChild);
    calcWorkOrderTotals();
    autoSaveWorkOrder();
  });

  qsa(".taskPartRow", card).forEach(bindTaskPartRowEvents);
}

function bindTaskPartRowEvents(row) {
  if (!row) return;

  qsa("input", row).forEach(input => {
    input.addEventListener("input", () => {
      calcWorkOrderTotals();
      autoSaveWorkOrder();
    });
  });

  qs(".removePartBtn", row)?.addEventListener("click", () => {
    const tbody = row.closest("tbody");
    row.remove();

    if (tbody && !tbody.children.length) {
      tbody.insertAdjacentHTML("beforeend", createTaskPartRow());
      bindTaskPartRowEvents(tbody.lastElementChild);
    }

    calcWorkOrderTotals();
    autoSaveWorkOrder();
  });
}

function getTaskDataFromCard(card) {
  const laborHours = Number(qs(".taskLaborHours", card)?.value || 0) || 0;
  const laborRate = Number(qs(".taskLaborRate", card)?.value || 0) || 0;

  const parts = qsa(".taskPartRow", card)
    .map(row => ({
      id: row.dataset.partId || makeId(),
      name: qs(".partName", row)?.value || "",
      partNumber: qs(".partNumber", row)?.value || "",
      qty: Number(qs(".partQty", row)?.value || 0) || 0,
      unitCost: Number(qs(".partCost", row)?.value || 0) || 0
    }))
    .filter(part => {
      return (
        normalizeText(part.name) ||
        normalizeText(part.partNumber) ||
        part.qty > 0 ||
        part.unitCost > 0
      );
    });

  return {
    id: card.dataset.taskId || makeId(),
    taskName: qs(".taskName", card)?.value || "",
    taskDesc: qs(".taskDescription", card)?.value || "",
    description: qs(".taskDescription", card)?.value || "",
    laborHours,
    laborRate,
    parts
  };
}

function getTaskRows() {
  return qsa(".taskCard").map(getTaskDataFromCard);
}

/* -------------------------
   TOTALS
------------------------- */
function calcTaskCardTotals(card) {
  if (!card) {
    return { laborTotal: 0, partsTotal: 0, taskTotal: 0 };
  }

  const laborHours = Number(qs(".taskLaborHours", card)?.value || 0) || 0;
  const laborRate = Number(qs(".taskLaborRate", card)?.value || 0) || 0;
  const laborTotal = laborHours * laborRate;

  let partsTotal = 0;

  qsa(".taskPartRow", card).forEach(row => {
    const qty = Number(qs(".partQty", row)?.value || 0) || 0;
    const unitCost = Number(qs(".partCost", row)?.value || 0) || 0;
    const lineTotal = qty * unitCost;

    partsTotal += lineTotal;

    const lineCell = qs(".partLineTotal", row);
    if (lineCell) lineCell.textContent = formatMoney(lineTotal);
  });

  const taskTotal = laborTotal + partsTotal;

  const laborEl = qs(".taskLaborTotal", card);
  const partsEl = qs(".taskPartsTotal", card);
  const grandEl = qs(".taskGrandTotal", card);
  const displayInput = qs(".taskTotalDisplay", card);

  if (laborEl) laborEl.textContent = formatMoney(laborTotal);
  if (partsEl) partsEl.textContent = formatMoney(partsTotal);
  if (grandEl) grandEl.textContent = formatMoney(taskTotal);
  if (displayInput) displayInput.value = formatMoney(taskTotal);

  return { laborTotal, partsTotal, taskTotal };
}

function calcWorkOrderTotals() {
  let totalLabor = 0;
  let totalParts = 0;

  qsa(".taskCard").forEach(card => {
    const totals = calcTaskCardTotals(card);
    totalLabor += totals.laborTotal;
    totalParts += totals.partsTotal;
  });

  const grandTotal = totalLabor + totalParts;

  setText("summaryLabor", formatMoney(totalLabor));
  setText("summaryParts", formatMoney(totalParts));
  setText("grandTotal", formatMoney(grandTotal));
}

/* -------------------------
   ATTACHMENTS
------------------------- */
function renderAttachments() {
  const list = byId("attachmentList");
  if (!list) return;

  const attachments = Array.isArray(currentWorkOrder?.attachments)
    ? currentWorkOrder.attachments
    : [];

  if (!attachments.length) {
    list.innerHTML = `
      <div class="taskCard">
        <div class="fieldHelpText">No attachments added.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = attachments
    .map(file => {
      const isPreviewable =
        String(file.type || "").startsWith("image/") ||
        file.type === "application/pdf";

      return `
        <div class="taskCard" data-attachment-id="${file.id}">
          <div class="taskCardHeader">
            <div class="taskTitleBlock">
              <span class="taskIndex">Attachment</span>
              <span class="taskTitle">${escapeHtml(file.name || "File")}</span>
            </div>

            <div class="taskActions">
              ${isPreviewable ? `<button type="button" class="previewAttachmentBtn">Open</button>` : ""}
              <button type="button" class="downloadAttachmentBtn">Download</button>
              <button type="button" class="removeTaskBtn removeAttachmentBtn">Remove</button>
            </div>
          </div>

          <div class="fieldHelpText">
            ${escapeHtml(file.type || "Unknown type")} • ${formatFileSize(Number(file.size || 0))}
          </div>
        </div>
      `;
    })
    .join("");
}

function openAttachment(attachmentId) {
  const file = getAttachmentById(attachmentId);
  if (!file) return;

  const modal = byId("attachmentPreviewModal");
  const body = byId("attachmentPreviewBody");
  const title = byId("attachmentPreviewTitle");

  if (!modal || !body || !title) return;

  title.textContent = file.name || "Preview";
  body.innerHTML = "";

  const fileType = String(file.type || "").toLowerCase();
  const sourceUrl = file.url || "";

  if (!sourceUrl) {
    const message = document.createElement("div");
    message.className = "fieldHelpText";
    message.textContent = "This attachment does not have a valid file URL.";
    body.appendChild(message);
    modal.classList.add("show");
    return;
  }

  if (fileType.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = sourceUrl;
    img.alt = file.name || "Attachment preview";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "75vh";
    img.style.display = "block";
    img.style.margin = "0 auto";
    body.appendChild(img);
  } else if (fileType === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = sourceUrl;
    iframe.style.width = "100%";
    iframe.style.height = "75vh";
    iframe.style.border = "none";
    body.appendChild(iframe);
  } else {
    const message = document.createElement("div");
    message.className = "fieldHelpText";
    message.textContent = "Preview is not available for this file type. Use Download instead.";
    body.appendChild(message);
  }

  modal.classList.add("show");
}

function closeAttachmentPreview() {
  const modal = byId("attachmentPreviewModal");
  const body = byId("attachmentPreviewBody");

  if (body) body.innerHTML = "";
  if (modal) modal.classList.remove("show");
}

function downloadAttachment(attachmentId) {
  const file = getAttachmentById(attachmentId);
  if (!file?.url) return;

  const link = document.createElement("a");
  link.href = file.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = file.name || "attachment";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function removeAttachment(attachmentId) {
  if (!attachmentId || !currentWorkOrder) return;

  const attachment = getAttachmentById(attachmentId);
  if (!attachment) return;

  setSaveStatus("Saving...", "saving");

  await deleteAttachmentFromFirebase(attachment);

  currentWorkOrder.attachments = (currentWorkOrder.attachments || []).filter(
    item => String(item.id) !== String(attachmentId)
  );

  renderAttachments();
  await saveWorkOrder(false);
  await syncAttachmentsToFirebaseWorkOrder();
}

async function handleAttachmentSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length || !currentWorkOrder) return;

  setSaveStatus("Saving...", "saving");

  try {
    const uploadedAttachments = [];

    for (const file of files) {
      const uploaded = await uploadAttachmentToFirebase(file);
      uploadedAttachments.push(uploaded);
    }

    currentWorkOrder.attachments = [
      ...(currentWorkOrder.attachments || []),
      ...uploadedAttachments
    ];

    renderAttachments();
    await saveWorkOrder(false);
    await syncAttachmentsToFirebaseWorkOrder();
  } catch (error) {
    console.error("Attachment upload error:", error);
    alert(`Attachment upload failed: ${error?.message || error}`);
    setSaveStatus("Save Error", "error");
  } finally {
    event.target.value = "";
  }
}

/* -------------------------
   DATA
------------------------- */
function getWorkOrderData() {
  const existing =
    workOrders.find(item => String(item.id) === String(editingId || currentWorkOrder?.id)) ||
    currentWorkOrder ||
    {};

  const equipmentNumber = getValue("woEquipmentNumber");
  const matchedEquipment = findEquipmentByUnit(equipmentNumber);

  const totalLaborText = (byId("summaryLabor")?.textContent || "$0").replace(/[^0-9.-]/g, "");
  const totalPartsText = (byId("summaryParts")?.textContent || "$0").replace(/[^0-9.-]/g, "");
  const grandTotalText = (byId("grandTotal")?.textContent || "$0").replace(/[^0-9.-]/g, "");

  const generatedNumber = generateWONumber(existing.workOrderNumber || existing.woNumber || "");

  return {
    id: existing.id || makeId(),
    equipmentId: matchedEquipment?.id || existing.equipmentId || "",
    equipmentNumber,
    workOrderNumber: generatedNumber,
    woNumber: generatedNumber,
    status: getCurrentStatus(),
    started: getValue("woStarted"),
    opened: getValue("woDate"),
    date: getValue("woDate"),
    closed: getValue("woClosed"),
    completed: getValue("woCompleted"),
    woType: getValue("woType"),
    repairLocation: getValue("repairLocation"),
    location: getValue("repairLocation"),
    assignee: getValue("woAssignee"),
    meter: getValue("meter"),
    mileage: getValue("meter"),
    notes: getValue("woNotes"),
    totalLabor: Number(totalLaborText) || 0,
    totalParts: Number(totalPartsText) || 0,
    grandTotal: Number(grandTotalText) || 0,
    tasks: getTaskRows(),
    attachments: Array.isArray(currentWorkOrder?.attachments)
      ? currentWorkOrder.attachments
      : Array.isArray(existing.attachments)
      ? existing.attachments
      : []
  };
}

function fillWorkOrderForm(wo) {
  setValue("woEquipmentNumber", wo.equipmentNumber || "");
  setCurrentStatus(wo.status || "Open");
  setValue("woStarted", wo.started || "");
  setValue("woDate", wo.opened || wo.date || "");
  setValue("woClosed", wo.closed || "");
  setValue("woCompleted", wo.completed || "");
  setValue("woType", wo.woType || "");
  setValue("repairLocation", wo.repairLocation || wo.location || "");
  setValue("woAssignee", wo.assignee || "");
  setValue("meter", wo.meter || wo.mileage || "");
  setValue("woNotes", wo.notes || "");

  const tasksContainer = byId("tasksContainer");
  if (tasksContainer) tasksContainer.innerHTML = "";

  if (Array.isArray(wo.tasks) && wo.tasks.length) {
    wo.tasks.forEach(task => addTaskCard(task));
  } else {
    addTaskCard();
  }

  updateEquipmentMatchInfo();
  calcWorkOrderTotals();
}

/* -------------------------
   SAVE / DELETE
------------------------- */
function updateHeaderNumber() {
  setText("woNumberText", getCurrentWorkOrderNumber());
}

async function saveWorkOrder(showMessage = false) {
  if (isSavingWorkOrder) return;

  try {
    isSavingWorkOrder = true;
    setSaveStatus("Saving...", "saving");

    const workOrderData = getWorkOrderData();
    currentWorkOrder = {
      ...currentWorkOrder,
      ...workOrderData
    };

    const index = workOrders.findIndex(item => String(item.id) === String(currentWorkOrder.id));

    if (index >= 0) {
      workOrders[index] = {
        ...workOrders[index],
        ...currentWorkOrder
      };
    } else {
      workOrders.push(currentWorkOrder);
    }

    await saveWorkOrders(workOrders);
    updateHeaderNumber();
    setSaveStatus("Saved", "saved");

    if (showMessage) {
      alert("Work order saved.");
    }
  } catch (error) {
    console.error("Save work order error:", error);
    setSaveStatus("Save Error", "error");
  } finally {
    isSavingWorkOrder = false;
  }
}

function autoSaveWorkOrder() {
  clearTimeout(autoSaveTimer);
  setSaveStatus("Saving...", "saving");

  autoSaveTimer = setTimeout(async () => {
    await saveWorkOrder(false);
  }, 400);
}

async function deleteWorkOrder() {
  if (!currentWorkOrder?.id) {
    alert("No saved work order was found.");
    return;
  }

  const confirmed = window.confirm("Delete this work order?");
  if (!confirmed) return;

  workOrders = workOrders.filter(item => String(item.id) !== String(currentWorkOrder.id));
  await saveWorkOrders(workOrders);
  window.close();
}

/* -------------------------
   EVENTS
------------------------- */
function bindAttachmentPreviewEvents() {
  byId("closeAttachmentPreviewBtn")?.addEventListener("click", closeAttachmentPreview);

  byId("attachmentPreviewModal")?.addEventListener("click", event => {
    if (event.target.id === "attachmentPreviewModal") {
      closeAttachmentPreview();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeAttachmentPreview();
    }
  });
}

function bindTopLevelEvents() {
  byId("backBtn")?.addEventListener("click", () => {
    window.close();
  });

  byId("printBtn")?.addEventListener("click", () => {
    window.print();
  });

  byId("deleteBtn")?.addEventListener("click", () => {
    deleteWorkOrder();
  });

  byId("addTaskBtn")?.addEventListener("click", () => {
    addTaskCard();
    autoSaveWorkOrder();
  });

  byId("woEquipmentNumber")?.addEventListener("input", () => {
    updateEquipmentMatchInfo();
    autoSaveWorkOrder();
  });

  [
    "woAssignee",
    "woStarted",
    "woType",
    "repairLocation",
    "meter",
    "woDate",
    "woClosed",
    "woCompleted",
    "woNotes"
  ].forEach(id => {
    byId(id)?.addEventListener("input", autoSaveWorkOrder);
    byId(id)?.addEventListener("change", autoSaveWorkOrder);
  });

  qsa(".statusPill").forEach(btn => {
    btn.addEventListener("click", () => {
      setCurrentStatus(btn.dataset.statusValue || "Open");
      autoSaveWorkOrder();
    });
  });

  byId("addAttachmentBtn")?.addEventListener("click", () => {
    byId("attachmentInput")?.click();
  });

  byId("attachmentInput")?.addEventListener("change", handleAttachmentSelection);

  byId("attachmentList")?.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    const card = button.closest("[data-attachment-id]");
    const attachmentId = card?.dataset.attachmentId;
    if (!attachmentId) return;

    if (button.classList.contains("previewAttachmentBtn")) {
      openAttachment(attachmentId);
      return;
    }

    if (button.classList.contains("downloadAttachmentBtn")) {
      downloadAttachment(attachmentId);
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
  workOrders = (await loadWorkOrders()) || [];
  equipmentList = (await loadEquipment()) || [];

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
      attachments: []
    };
  } else {
    currentWorkOrder.attachments = Array.isArray(currentWorkOrder.attachments)
      ? currentWorkOrder.attachments
      : [];
  }
}

async function init() {
  await initState();
  bindTopLevelEvents();
  bindAttachmentPreviewEvents();

  if (currentWorkOrder) {
    fillWorkOrderForm(currentWorkOrder);
  }

  if (!qsa(".taskCard").length) {
    addTaskCard();
  }

  updateHeaderNumber();
  renderAttachments();
  updateEquipmentMatchInfo();
  calcWorkOrderTotals();
  setSaveStatus("Saved", "saved");
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});