import { loadSettings, saveSettings, loadEquipment } from "./js/storage.js";
import { normalizeText } from "./js/utils.js";

let currentTemplate = null;
let settingsCache = {};
let equipmentCache = [];
let templateModalResolver = null;
let templateModalLastFocus = null;

const dom = {};

function cacheDom() {
  dom.templateListView = document.getElementById("templateListView");
  dom.templateEditorView = document.getElementById("templateEditorView");
  dom.closeTemplateListBtn = document.getElementById("closeTemplateListBtn");
  dom.createTemplateBtn = document.getElementById("createTemplateBtn");
  dom.templateListTableBody = document.getElementById("templateListTableBody");

  dom.templateTitle = document.getElementById("templateTitle");
  dom.templateName = document.getElementById("templateName");
  dom.templatePrimaryMeter = document.getElementById("templatePrimaryMeter");
  dom.templateSecondaryMeter = document.getElementById("templateSecondaryMeter");
  dom.saveTemplateBtn = document.getElementById("saveTemplateBtn");
  dom.addTemplateTaskBtn = document.getElementById("addTemplateTaskBtn");
  dom.templateTasksTableBody = document.getElementById("templateTasksTableBody");
  dom.templateAssignedEquipment = document.getElementById("templateAssignedEquipment");
  dom.backTemplateBtn = document.getElementById("backTemplateBtn");
  dom.templateTabs = Array.from(document.querySelectorAll(".templateTab"));
  dom.templateTabContents = Array.from(
    document.querySelectorAll("#templateEditorView .templateTabContent")
  );
  dom.templateTaskCards = document.getElementById("templateTaskCards");
}

function makeServiceTaskId() {
  return `svc_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function makeServiceTemplateId() {
  return `tmpl_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function getDefaultSettings() {
  return {
    companyName: "",
    defaultLocation: "",
    theme: "default",
    serviceTasks: [],
    serviceTemplates: []
  };
}

async function hydrateTemplateData() {
  try {
    const [settings, equipment] = await Promise.all([
      loadSettings(),
      loadEquipment()
    ]);

    settingsCache = {
      ...getDefaultSettings(),
      ...safeObject(settings),
      serviceTasks: safeArray(settings?.serviceTasks),
      serviceTemplates: safeArray(settings?.serviceTemplates)
    };

    equipmentCache = safeArray(equipment);
  } catch (error) {
    console.error("Failed to load service template data:", error);
    settingsCache = getDefaultSettings();
    equipmentCache = [];
  }
}

async function refreshSettingsCache() {
  try {
    const settings = await loadSettings();
    settingsCache = {
      ...getDefaultSettings(),
      ...safeObject(settings),
      serviceTasks: safeArray(settings?.serviceTasks),
      serviceTemplates: safeArray(settings?.serviceTemplates)
    };
  } catch (error) {
    console.error("Failed to refresh settings cache:", error);
  }
}

async function refreshEquipmentCache() {
  try {
    const equipment = await loadEquipment();
    equipmentCache = safeArray(equipment);
  } catch (error) {
    console.error("Failed to refresh equipment cache:", error);
  }
}

function getSafeSettings() {
  return {
    ...getDefaultSettings(),
    ...safeObject(settingsCache),
    serviceTasks: safeArray(settingsCache?.serviceTasks),
    serviceTemplates: safeArray(settingsCache?.serviceTemplates)
  };
}

function getSafeEquipment() {
  return safeArray(equipmentCache);
}

function normalizeServiceTask(task = {}) {
  const legacyLocation = String(task.location || "").trim();

  const locations = Array.isArray(task.locations)
    ? task.locations.map(value => String(value || "").trim()).filter(Boolean)
    : legacyLocation
      ? [legacyLocation]
      : [];

  const appliesToAllLocations =
    typeof task.appliesToAllLocations === "boolean"
      ? task.appliesToAllLocations
      : locations.length === 0;

  return {
    id: task.id || makeServiceTaskId(),
    task: String(task.task || "").trim(),
    parentTaskId: String(task.parentTaskId || "").trim(),
    status: String(task.status || "Active").trim() || "Active",
    appliesToAllLocations,
    locations: appliesToAllLocations ? [] : [...new Set(locations)],
    dateTrackingMode: String(task.dateTrackingMode || "every").trim(),
    dateEveryValue: String(task.dateEveryValue || "").trim(),
    dateEveryUnit: String(task.dateEveryUnit || "Days").trim() || "Days",
    dateOnValue: String(task.dateOnValue || "").trim(),
    dateNoticeValue: String(task.dateNoticeValue || "").trim() || "7",
    milesTrackingMode: String(task.milesTrackingMode || "every").trim(),
    milesEveryValue: String(task.milesEveryValue || "").trim(),
    milesAtValue: String(task.milesAtValue || "").trim(),
    milesNoticeValue: String(task.milesNoticeValue || "").trim() || "0",
    linkedTaskId: String(task.linkedTaskId || "").trim(),
    serviceCategory: String(task.serviceCategory || "").trim(),
    equipmentType: String(task.equipmentType || "").trim(),
    businessCategory: String(task.businessCategory || "").trim()
  };
}

function normalizeServiceTemplate(template = {}) {
  return {
    id: template.id || makeServiceTemplateId(),
    name: String(template.name || "").trim(),
    primaryMeter: String(template.primaryMeter || "Miles").trim() || "Miles",
    secondaryMeter: String(template.secondaryMeter || "None").trim() || "None",
    locations: Array.isArray(template.locations)
      ? template.locations.map(value => String(value || "").trim()).filter(Boolean)
      : [],
    tasks: Array.isArray(template.tasks)
      ? template.tasks.map(normalizeServiceTask)
      : []
  };
}

function flattenTemplatesToServiceTasks(templates = []) {
  return templates.flatMap(template => {
    const cleanTemplate = normalizeServiceTemplate(template);

    return cleanTemplate.tasks.map(task => {
      const cleanTask = normalizeServiceTask(task);
      const taskLocations = cleanTask.appliesToAllLocations
        ? []
        : safeArray(cleanTask.locations);

      return {
        ...cleanTask,
        templateId: cleanTemplate.id,
        templateName: cleanTemplate.name,
        appliesToAllLocations: cleanTask.appliesToAllLocations,
        locations: cleanTask.appliesToAllLocations
          ? []
          : taskLocations.length
            ? [...taskLocations]
            : [...cleanTemplate.locations]
      };
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTemplateIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function getAllTemplates() {
  const settings = getSafeSettings();
  return Array.isArray(settings.serviceTemplates)
    ? settings.serviceTemplates.map(normalizeServiceTemplate)
    : [];
}

/* -------------------------
   IN-APP MODAL
------------------------- */
function ensureTemplateModal() {
  let modal = document.getElementById("templateAppModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "templateAppModal";
  modal.style.cssText = `
    display:none;
    position:fixed;
    inset:0;
    z-index:7000;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:rgba(20,27,38,0.45);
  `;

  modal.innerHTML = `
    <div
      style="
        width:min(460px,100%);
        max-height:calc(100vh - 40px);
        overflow:auto;
        background:#fff;
        border:1px solid #d9e2ec;
        border-radius:14px;
        box-shadow:0 20px 50px rgba(16,24,40,0.22);
      "
      role="dialog"
      aria-modal="true"
      aria-labelledby="templateAppModalTitle"
    >
      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          padding:14px 16px;
          border-bottom:1px solid #d9e2ec;
          background:#f8fafc;
        "
      >
        <h3 id="templateAppModalTitle" style="margin:0;">Message</h3>
        <button id="templateAppModalCloseBtn" type="button">✕</button>
      </div>
      <div style="padding:16px;">
        <p id="templateAppModalMessage" style="margin:0 0 12px;"></p>
        <div id="templateAppModalActions" style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function resolveTemplateModal(result) {
  const modal = document.getElementById("templateAppModal");
  const actions = document.getElementById("templateAppModalActions");

  if (modal) modal.style.display = "none";
  if (actions) actions.innerHTML = "";

  if (templateModalLastFocus && typeof templateModalLastFocus.focus === "function") {
    try {
      templateModalLastFocus.focus();
    } catch (error) {
      console.warn("Could not restore focus:", error);
    }
  }

  const resolver = templateModalResolver;
  templateModalResolver = null;
  templateModalLastFocus = null;

  if (typeof resolver === "function") {
    resolver(result);
  }
}

function showTemplateModal({
  title = "Message",
  message = "",
  confirmText = "OK",
  cancelText = "",
  danger = false
} = {}) {
  const modal = ensureTemplateModal();
  const titleEl = document.getElementById("templateAppModalTitle");
  const messageEl = document.getElementById("templateAppModalMessage");
  const actionsEl = document.getElementById("templateAppModalActions");
  const closeBtn = document.getElementById("templateAppModalCloseBtn");

  return new Promise(resolve => {
    templateModalResolver = resolve;
    templateModalLastFocus = document.activeElement;

    titleEl.textContent = title;
    messageEl.textContent = message;

    actionsEl.innerHTML = `
      ${cancelText ? `<button type="button" id="templateAppModalCancelBtn">${cancelText}</button>` : ""}
      <button type="button" id="templateAppModalConfirmBtn" ${danger ? 'class="danger"' : ""}>${confirmText}</button>
    `;

    document
      .getElementById("templateAppModalCancelBtn")
      ?.addEventListener("click", () => resolveTemplateModal(false), { once: true });

    document
      .getElementById("templateAppModalConfirmBtn")
      ?.addEventListener("click", () => resolveTemplateModal(true), { once: true });

    closeBtn?.addEventListener("click", () => resolveTemplateModal(false), {
      once: true
    });

    modal.onclick = event => {
      if (event.target === modal) {
        resolveTemplateModal(false);
      }
    };

    modal.style.display = "flex";
    document.getElementById("templateAppModalConfirmBtn")?.focus();
  });
}

function showTemplateAlert(message, title = "Message") {
  return showTemplateModal({
    title,
    message,
    confirmText: "OK"
  });
}

function showTemplateConfirm(message, title = "Confirm", confirmText = "Delete") {
  return showTemplateModal({
    title,
    message,
    confirmText,
    cancelText: "Cancel",
    danger: true
  });
}

/* -------------------------
   VIEW STATE
------------------------- */
function showListView() {
  dom.templateListView?.classList.add("active");
  dom.templateEditorView?.classList.remove("active");
  renderTemplateList();
}

function showEditorView() {
  dom.templateListView?.classList.remove("active");
  dom.templateEditorView?.classList.add("active");
}

function getLocationOptions() {
  const settings = getSafeSettings();
  const values = new Set();

  if (settings?.defaultLocation) {
    values.add(String(settings.defaultLocation).trim());
  }

  getSafeEquipment().forEach(item => {
    const location = String(item?.location || "").trim();
    if (location) values.add(location);
  });

  if (currentTemplate?.locations?.length) {
    currentTemplate.locations.forEach(location => {
      const clean = String(location || "").trim();
      if (clean) values.add(clean);
    });
  }

  currentTemplate?.tasks?.forEach(task => {
    safeArray(task.locations).forEach(location => {
      const clean = String(location || "").trim();
      if (clean) values.add(clean);
    });
  });

  return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function getTaskName(task) {
  return String(task?.task || "").trim() || "Untitled Task";
}

function syncTemplateLocationsFromTasks() {
  if (!currentTemplate) return;

  const union = new Set();

  currentTemplate.tasks.forEach(task => {
    const cleanTask = normalizeServiceTask(task);

    if (!cleanTask.appliesToAllLocations) {
      safeArray(cleanTask.locations).forEach(location => {
        const clean = String(location || "").trim();
        if (clean) union.add(clean);
      });
    }
  });

  currentTemplate.locations = Array.from(union);
}

function formatFrequency(task) {
  const parts = [];

  if (task.dateTrackingMode === "every" && task.dateEveryValue) {
    parts.push(`Every ${task.dateEveryValue} ${task.dateEveryUnit || "Days"}`);
  } else if (task.dateTrackingMode === "on" && task.dateOnValue) {
    parts.push(`On ${task.dateOnValue}`);
  }

  if (task.milesTrackingMode === "every" && task.milesEveryValue) {
    parts.push(`Every ${task.milesEveryValue} mi`);
  } else if (task.milesTrackingMode === "at" && task.milesAtValue) {
    parts.push(`At ${task.milesAtValue} mi`);
  }

  return parts.length ? parts.join(" / ") : "No frequency";
}

function formatNotice(task) {
  const parts = [];

  if (task.dateTrackingMode !== "disabled" && task.dateNoticeValue) {
    parts.push(`${task.dateNoticeValue} days`);
  }

  if (
    task.milesTrackingMode !== "disabled" &&
    task.milesNoticeValue &&
    String(task.milesNoticeValue) !== "0"
  ) {
    parts.push(`${task.milesNoticeValue} mi`);
  }

  return parts.length ? parts.join(" / ") : "-";
}

function formatTaskLocations(task) {
  const cleanTask = normalizeServiceTask(task);

  if (cleanTask.appliesToAllLocations) return "All Locations";
  if (cleanTask.locations.length) return cleanTask.locations.join(", ");

  return "-";
}

/* -------------------------
   RENDER LIST / TABLES
------------------------- */
function renderTemplateList() {
  if (!dom.templateListTableBody) return;

  const templates = getAllTemplates();
  dom.templateListTableBody.innerHTML = "";

  if (!templates.length) {
    dom.templateListTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="emptyCell">No service templates created yet.</td>
      </tr>
    `;
    return;
  }

  templates.forEach(template => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(template.name || "Untitled Template")}</strong></td>
      <td>${escapeHtml(template.primaryMeter || "Miles")}</td>
      <td>${escapeHtml(template.secondaryMeter || "None")}</td>
      <td>${template.tasks.length}</td>
      <td>${template.locations.length ? escapeHtml(template.locations.join(", ")) : "-"}</td>
      <td>
        <div class="templateTaskActions">
          <button type="button" class="smallBtn" data-action="open-template" data-template-id="${escapeHtml(template.id)}">Open</button>
          <button type="button" class="deleteTaskBtn" data-action="delete-template" data-template-id="${escapeHtml(template.id)}">Delete</button>
        </div>
      </td>
    `;
    dom.templateListTableBody.appendChild(row);
  });
}

function createNewTemplate() {
  currentTemplate = normalizeServiceTemplate({
    id: makeServiceTemplateId(),
    name: "",
    primaryMeter: "Miles",
    secondaryMeter: "None",
    tasks: []
  });

  renderTemplate();
  showEditorView();
}

function loadTemplateById(templateId) {
  const templates = getAllTemplates();
  const found = templates.find(item => String(item.id) === String(templateId));

  if (!found) {
    createNewTemplate();
    return;
  }

  currentTemplate = normalizeServiceTemplate(found);
  renderTemplate();
  showEditorView();
}

async function deleteTemplate(templateId) {
  const templates = getAllTemplates();
  const remaining = templates.filter(item => String(item.id) !== String(templateId));
  const settings = getSafeSettings();

  await saveSettings({
    ...settings,
    serviceTemplates: remaining,
    serviceTasks: flattenTemplatesToServiceTasks(remaining)
  });

  await refreshSettingsCache();
  renderTemplateList();
}

function renderTasksTable() {
  if (!dom.templateTasksTableBody || !currentTemplate) return;

  dom.templateTasksTableBody.innerHTML = "";

  if (!currentTemplate.tasks.length) {
    dom.templateTasksTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="emptyCell">No tasks added yet.</td>
      </tr>
    `;
    return;
  }

  currentTemplate.tasks.forEach(task => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div><strong>${escapeHtml(task.task || "Untitled Task")}</strong></div>
        <div class="muted">${escapeHtml(formatTaskLocations(task))}</div>
      </td>
      <td>${escapeHtml(formatFrequency(task))}</td>
      <td>${escapeHtml(formatNotice(task))}</td>
      <td>
        <div class="templateTaskActions">
          <button type="button" class="smallBtn" data-action="scroll-task" data-task-id="${escapeHtml(task.id)}">Edit</button>
          <button type="button" class="deleteTaskBtn" data-action="delete-task" data-task-id="${escapeHtml(task.id)}">Delete</button>
        </div>
      </td>
    `;
    dom.templateTasksTableBody.appendChild(row);
  });
}

function normalizeEquipmentType(type) {
  const value = normalizeLower(type);

  if (value === "truck") return "Truck";
  if (value === "trailer") return "Trailer";
  if (value === "chassis") return "Chassis";
  if (value === "o/o" || value === "oo" || value === "owner operator") return "O/O";

  return normalizeText(type);
}

function taskMatchesEquipment(task, item) {
  const cleanTask = normalizeServiceTask(task);
  const equipmentLocation = normalizeLower(item.location || "");
  const equipmentType = normalizeEquipmentType(item.type || "");
  const equipmentBusiness = normalizeLower(item.business || "");

  const locationMatch =
    cleanTask.appliesToAllLocations ||
    !cleanTask.locations.length ||
    cleanTask.locations.some(location => normalizeLower(location) === equipmentLocation);

  const typeMatch =
    !cleanTask.equipmentType ||
    normalizeEquipmentType(cleanTask.equipmentType) === equipmentType;

  const businessMatch =
    !cleanTask.businessCategory ||
    normalizeLower(cleanTask.businessCategory) === equipmentBusiness;

  return locationMatch && typeMatch && businessMatch;
}

function renderAssignedEquipment() {
  if (!dom.templateAssignedEquipment || !currentTemplate) return;

  const equipment = getSafeEquipment();

  const matchedEquipment = equipment.filter(item =>
    currentTemplate.tasks.some(task => taskMatchesEquipment(task, item))
  );

  if (!matchedEquipment.length) {
    dom.templateAssignedEquipment.innerHTML =
      `<div class="muted">No equipment currently matches this template.</div>`;
    return;
  }

  dom.templateAssignedEquipment.innerHTML = `
    <div class="templateEquipmentList">
      ${matchedEquipment.map(item => `
        <div class="templateEquipmentItem">
          <strong>${escapeHtml(item.unit || "Unit")}</strong> — ${escapeHtml(item.type || "Equipment")}${item.location ? ` • ${escapeHtml(item.location)}` : ""}${item.business ? ` • ${escapeHtml(item.business)}` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

/* -------------------------
   TASK CARD HELPERS
------------------------- */
function buildTaskOptions(currentTaskId, selectedId = "") {
  if (!currentTemplate) return `<option value="">None</option>`;

  const options = currentTemplate.tasks
    .filter(task => task.id !== currentTaskId)
    .map(task => {
      const selected = String(task.id) === String(selectedId) ? "selected" : "";
      return `<option value="${escapeHtml(task.id)}" ${selected}>${escapeHtml(getTaskName(task))}</option>`;
    })
    .join("");

  return `<option value="">None</option>${options}`;
}

function buildLocationChecklist(task) {
  const options = getLocationOptions();
  const selectedLocations = safeArray(task.locations);

  if (!options.length) {
    return `<div class="muted">No locations available yet.</div>`;
  }

  return options
    .map(location => {
      const safeId = `taskLoc_${task.id}_${location.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      const checked = selectedLocations.includes(location) ? "checked" : "";

      return `
        <label class="taskLocationOption" for="${escapeHtml(safeId)}">
          <input
            id="${escapeHtml(safeId)}"
            type="checkbox"
            class="inlineTaskLocationCheckbox"
            data-location-value="${escapeHtml(location)}"
            ${checked}
          />
          <span>${escapeHtml(location)}</span>
        </label>
      `;
    })
    .join("");
}

function buildTaskCard(task) {
  const card = document.createElement("div");
  card.className = "serviceTaskCard";
  card.dataset.taskId = task.id;

  card.innerHTML = `
    <div class="serviceTaskHeader">
      <h3>${escapeHtml(getTaskName(task))}</h3>
      <div class="serviceTaskHeaderActions">
        <button type="button" class="smallBtn" data-action="collapse-task" data-task-id="${escapeHtml(task.id)}">
          Collapse
        </button>
        <button type="button" class="deleteTaskBtn" data-action="delete-task" data-task-id="${escapeHtml(task.id)}">
          Delete
        </button>
      </div>
    </div>

    <div class="serviceTaskBody">
      <label>Task</label>
      <input type="text" class="inlineTaskField" data-field="task" value="${escapeHtml(task.task)}" />

      <label>Status</label>
      <select class="inlineTaskField" data-field="status">
        <option value="Active" ${task.status === "Active" ? "selected" : ""}>Active</option>
        <option value="Inactive" ${task.status === "Inactive" ? "selected" : ""}>Inactive</option>
      </select>

      <label>Service Category</label>
      <select class="inlineTaskField" data-field="serviceCategory">
        <option value="">Select category</option>
        <option value="pm90" ${task.serviceCategory === "pm90" ? "selected" : ""}>90 Day PM</option>
        <option value="annual" ${task.serviceCategory === "annual" ? "selected" : ""}>Annual Inspection</option>
        <option value="truck_a" ${task.serviceCategory === "truck_a" ? "selected" : ""}>Truck A Service</option>
        <option value="truck_b" ${task.serviceCategory === "truck_b" ? "selected" : ""}>Truck B Service</option>
      </select>

      <label>Equipment Type</label>
      <select class="inlineTaskField" data-field="equipmentType">
        <option value="">All Types</option>
        <option value="Truck" ${task.equipmentType === "Truck" ? "selected" : ""}>Truck</option>
        <option value="Trailer" ${task.equipmentType === "Trailer" ? "selected" : ""}>Trailer</option>
        <option value="Chassis" ${task.equipmentType === "Chassis" ? "selected" : ""}>Chassis</option>
        <option value="O/O" ${task.equipmentType === "O/O" ? "selected" : ""}>O/O</option>
      </select>

      <label>Business</label>
      <select class="inlineTaskField" data-field="businessCategory">
        <option value="">All Business</option>
        <option value="Dedicated" ${task.businessCategory === "Dedicated" ? "selected" : ""}>Dedicated</option>
      </select>

      <label>Parent Task</label>
      <select class="inlineTaskField" data-field="parentTaskId">
        ${buildTaskOptions(task.id, task.parentTaskId)}
      </select>

      <label>Linked Task</label>
      <select class="inlineTaskField" data-field="linkedTaskId">
        ${buildTaskOptions(task.id, task.linkedTaskId)}
      </select>

      <div class="serviceTrackingGroup">
        <div class="serviceTrackingTitle">Assigned Locations</div>

        <label class="serviceLocationToggle">
          <input type="checkbox" class="inlineTaskAllLocations" ${task.appliesToAllLocations ? "checked" : ""} />
          <span>All Locations</span>
        </label>

        <div class="serviceLocationSummary"></div>

        <div class="serviceLocationChecklist ${task.appliesToAllLocations ? "disabled" : ""}">
          ${buildLocationChecklist(task)}
        </div>
      </div>

      <div class="serviceTrackingGroup">
        <div class="serviceTrackingTitle">Date Tracking</div>

        <div class="serviceModeRow">
          <button type="button" class="serviceModeBtn ${task.dateTrackingMode === "every" ? "active" : ""}" data-mode-group="dateTrackingMode" data-mode-value="every">Every</button>
          <button type="button" class="serviceModeBtn ${task.dateTrackingMode === "on" ? "active" : ""}" data-mode-group="dateTrackingMode" data-mode-value="on">On</button>
          <button type="button" class="serviceModeBtn ${task.dateTrackingMode === "disabled" ? "active" : ""}" data-mode-group="dateTrackingMode" data-mode-value="disabled">Disabled</button>
        </div>

        <div class="serviceInlineRow">
          <input type="number" class="inlineTaskField" data-field="dateEveryValue" placeholder="Every" value="${escapeHtml(task.dateEveryValue)}" />
          <select class="inlineTaskField" data-field="dateEveryUnit">
            <option value="Days" ${task.dateEveryUnit === "Days" ? "selected" : ""}>Days</option>
            <option value="Weeks" ${task.dateEveryUnit === "Weeks" ? "selected" : ""}>Weeks</option>
            <option value="Months" ${task.dateEveryUnit === "Months" ? "selected" : ""}>Months</option>
            <option value="Years" ${task.dateEveryUnit === "Years" ? "selected" : ""}>Years</option>
          </select>
        </div>

        <label>On Date</label>
        <input type="date" class="inlineTaskField" data-field="dateOnValue" value="${escapeHtml(task.dateOnValue)}" />

        <label>Advanced Notice (Days)</label>
        <input type="number" class="inlineTaskField" data-field="dateNoticeValue" value="${escapeHtml(task.dateNoticeValue)}" />
      </div>

      <div class="serviceTrackingGroup">
        <div class="serviceTrackingTitle">Miles Tracking</div>

        <div class="serviceModeRow">
          <button type="button" class="serviceModeBtn ${task.milesTrackingMode === "every" ? "active" : ""}" data-mode-group="milesTrackingMode" data-mode-value="every">Every</button>
          <button type="button" class="serviceModeBtn ${task.milesTrackingMode === "at" ? "active" : ""}" data-mode-group="milesTrackingMode" data-mode-value="at">At</button>
          <button type="button" class="serviceModeBtn ${task.milesTrackingMode === "disabled" ? "active" : ""}" data-mode-group="milesTrackingMode" data-mode-value="disabled">Disabled</button>
        </div>

        <label>Every</label>
        <input type="number" class="inlineTaskField" data-field="milesEveryValue" placeholder="Miles" value="${escapeHtml(task.milesEveryValue)}" />

        <label>At</label>
        <input type="number" class="inlineTaskField" data-field="milesAtValue" placeholder="Miles" value="${escapeHtml(task.milesAtValue)}" />

        <label>Advanced Notice (Miles)</label>
        <input type="number" class="inlineTaskField" data-field="milesNoticeValue" value="${escapeHtml(task.milesNoticeValue)}" />
      </div>
    </div>
  `;

  bindTaskCardEvents(card, task.id);
  updateTaskCardLocationUi(card, task);
  return card;
}

function updateTaskCardLocationUi(card, task) {
  const summary = card.querySelector(".serviceLocationSummary");
  const checklist = card.querySelector(".serviceLocationChecklist");
  const checkboxes = card.querySelectorAll(".inlineTaskLocationCheckbox");

  if (summary) {
    if (task.appliesToAllLocations) {
      summary.textContent = "All locations";
    } else if (task.locations.length) {
      summary.textContent = task.locations.join(", ");
    } else {
      summary.textContent = "No locations selected";
    }
  }

  if (checklist) {
    checklist.classList.toggle("disabled", !!task.appliesToAllLocations);
  }

  checkboxes.forEach(checkbox => {
    checkbox.disabled = !!task.appliesToAllLocations;
  });
}

function renderTaskCards() {
  if (!dom.templateTaskCards || !currentTemplate) return;

  dom.templateTaskCards.innerHTML = "";

  if (!currentTemplate.tasks.length) {
    dom.templateTaskCards.innerHTML =
      `<div class="muted">Add a task to configure service category, assigned locations, date tracking, and miles tracking.</div>`;
    return;
  }

  currentTemplate.tasks.forEach(task => {
    dom.templateTaskCards.appendChild(buildTaskCard(task));
  });
}

/* -------------------------
   TASK UPDATE
------------------------- */
function updateTaskField(taskId, field, value) {
  if (!currentTemplate) return;

  currentTemplate.tasks = currentTemplate.tasks.map(task =>
    task.id === taskId
      ? normalizeServiceTask({
          ...task,
          [field]: value
        })
      : task
  );

  syncTemplateLocationsFromTasks();
  renderTasksTable();
  renderAssignedEquipment();
}

function updateTaskLocations(taskId, card) {
  if (!currentTemplate) return;

  const allLocationsCheckbox = card.querySelector(".inlineTaskAllLocations");
  const locationCheckboxes = Array.from(card.querySelectorAll(".inlineTaskLocationCheckbox"));

  const appliesToAllLocations = !!allLocationsCheckbox?.checked;
  const selectedLocations = appliesToAllLocations
    ? []
    : locationCheckboxes
        .filter(checkbox => checkbox.checked)
        .map(checkbox => String(checkbox.dataset.locationValue || "").trim())
        .filter(Boolean);

  currentTemplate.tasks = currentTemplate.tasks.map(task =>
    task.id === taskId
      ? normalizeServiceTask({
          ...task,
          appliesToAllLocations,
          locations: selectedLocations
        })
      : task
  );

  const updatedTask = currentTemplate.tasks.find(task => task.id === taskId);
  if (updatedTask) {
    updateTaskCardLocationUi(card, updatedTask);
  }

  syncTemplateLocationsFromTasks();
  renderTasksTable();
  renderAssignedEquipment();
}

function bindTaskCardEvents(card, taskId) {
  const fields = card.querySelectorAll(".inlineTaskField");

  fields.forEach(field => {
    field.addEventListener("input", () => {
      if (field.dataset.field === "task") {
        const title = card.querySelector(".serviceTaskHeader h3");
        if (title) {
          title.textContent = String(field.value || "").trim() || "Untitled Task";
        }
      }
    });

    field.addEventListener("change", () => {
      updateTaskField(taskId, field.dataset.field, field.value);

      if (
        field.tagName.toLowerCase() === "select" ||
        field.dataset.field === "parentTaskId" ||
        field.dataset.field === "linkedTaskId"
      ) {
        renderTaskCards();
      }
    });
  });

  const modeButtons = card.querySelectorAll(".serviceModeBtn");
  modeButtons.forEach(button => {
    button.addEventListener("click", () => {
      updateTaskField(taskId, button.dataset.modeGroup, button.dataset.modeValue);
      renderTaskCards();
    });
  });

  const allLocationsCheckbox = card.querySelector(".inlineTaskAllLocations");
  if (allLocationsCheckbox) {
    allLocationsCheckbox.addEventListener("change", () => {
      updateTaskLocations(taskId, card);
    });
  }

  const locationCheckboxes = card.querySelectorAll(".inlineTaskLocationCheckbox");
  locationCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      updateTaskLocations(taskId, card);
    });
  });
}

function addTask() {
  if (!currentTemplate) return;

  currentTemplate.tasks.push(
    normalizeServiceTask({
      task: `New Task ${currentTemplate.tasks.length + 1}`
    })
  );

  renderTasksTable();
  renderTaskCards();
  renderAssignedEquipment();

  requestAnimationFrame(() => {
    const lastInput = dom.templateTaskCards?.querySelector(
      ".serviceTaskCard:last-child .inlineTaskField[data-field='task']"
    );
    lastInput?.focus();
  });
}

function deleteTask(taskId) {
  if (!currentTemplate) return;

  currentTemplate.tasks = currentTemplate.tasks
    .filter(item => item.id !== taskId)
    .map(item => ({
      ...item,
      parentTaskId: item.parentTaskId === taskId ? "" : item.parentTaskId,
      linkedTaskId: item.linkedTaskId === taskId ? "" : item.linkedTaskId
    }))
    .map(normalizeServiceTask);

  syncTemplateLocationsFromTasks();
  renderTasksTable();
  renderTaskCards();
  renderAssignedEquipment();
}

/* -------------------------
   SAVE / RENDER
------------------------- */
async function saveTemplate() {
  if (!currentTemplate) return;

  currentTemplate.name = normalizeText(dom.templateName?.value) || "Untitled Template";
  currentTemplate.primaryMeter = dom.templatePrimaryMeter?.value || "Miles";
  currentTemplate.secondaryMeter = dom.templateSecondaryMeter?.value || "None";
  currentTemplate.tasks = currentTemplate.tasks.map(normalizeServiceTask);

  syncTemplateLocationsFromTasks();

  const settings = getSafeSettings();
  const templates = getAllTemplates();
  const index = templates.findIndex(item => String(item.id) === String(currentTemplate.id));

  if (index === -1) {
    templates.push(normalizeServiceTemplate(currentTemplate));
  } else {
    templates[index] = normalizeServiceTemplate(currentTemplate);
  }

  await saveSettings({
    ...settings,
    serviceTemplates: templates,
    serviceTasks: flattenTemplatesToServiceTasks(templates)
  });

  await refreshSettingsCache();

  try {
    window.opener?.dispatchEvent(new CustomEvent("fleet:settings-changed"));
  } catch (error) {
    console.warn("Unable to notify opener after saving template:", error);
  }

  renderTemplateList();
  showListView();
  await showTemplateAlert("Service template saved.", "Saved");
}

function renderTemplate() {
  if (!currentTemplate) return;

  syncTemplateLocationsFromTasks();

  if (dom.templateTitle) {
    dom.templateTitle.textContent = currentTemplate.name || "Service Template";
  }

  if (dom.templateName) {
    dom.templateName.value = currentTemplate.name || "";
  }

  if (dom.templatePrimaryMeter) {
    dom.templatePrimaryMeter.value = currentTemplate.primaryMeter || "Miles";
  }

  if (dom.templateSecondaryMeter) {
    dom.templateSecondaryMeter.value = currentTemplate.secondaryMeter || "None";
  }

  renderTasksTable();
  renderTaskCards();
  renderAssignedEquipment();

  dom.templateTabs.forEach(tab => tab.classList.remove("active"));
  dom.templateTabContents.forEach(content => content.classList.remove("active"));
  document.querySelector('.templateTab[data-tab="detailsTab"]')?.classList.add("active");
  document.getElementById("detailsTab")?.classList.add("active");
}

/* -------------------------
   EVENTS
------------------------- */
function bindEvents() {
  dom.createTemplateBtn?.addEventListener("click", () => {
    createNewTemplate();
  });

  dom.closeTemplateListBtn?.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  });

  dom.templateListTableBody?.addEventListener("click", async event => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const templateId = btn.dataset.templateId;

    if (action === "open-template") {
      loadTemplateById(templateId);
      return;
    }

    if (action === "delete-template") {
      const confirmed = await showTemplateConfirm(
        "Delete this template?",
        "Delete Template",
        "Delete"
      );

      if (confirmed) {
        await deleteTemplate(templateId);
      }
    }
  });

  dom.saveTemplateBtn?.addEventListener("click", () => {
    saveTemplate();
  });

  dom.addTemplateTaskBtn?.addEventListener("click", () => {
    addTask();
  });

  dom.backTemplateBtn?.addEventListener("click", () => {
    showListView();
  });

  dom.templateTasksTableBody?.addEventListener("click", async event => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const taskId = btn.dataset.taskId;
    if (!taskId) return;

    if (action === "scroll-task") {
      const card = dom.templateTaskCards?.querySelector(`.serviceTaskCard[data-task-id="${taskId}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete-task") {
      const confirmed = await showTemplateConfirm(
        "Delete this task?",
        "Delete Task",
        "Delete"
      );

      if (confirmed) {
        deleteTask(taskId);
      }
    }
  });

  dom.templateTaskCards?.addEventListener("click", async event => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const taskId = btn.dataset.taskId;
    if (!taskId) return;

    if (action === "collapse-task") {
      const rowBtn = dom.templateTasksTableBody?.querySelector(
        `[data-action="scroll-task"][data-task-id="${taskId}"]`
      );
      rowBtn?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (action === "delete-task") {
      const confirmed = await showTemplateConfirm(
        "Delete this task?",
        "Delete Task",
        "Delete"
      );

      if (confirmed) {
        deleteTask(taskId);
      }
    }
  });

  dom.templateTabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      const targetId = tab.dataset.tab;
      if (!targetId) return;

      if (targetId === "assignedTab") {
        await refreshEquipmentCache();
        renderAssignedEquipment();
      }

      dom.templateTabs.forEach(item => item.classList.remove("active"));
      dom.templateTabContents.forEach(item => item.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(targetId)?.classList.add("active");
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.getElementById("templateAppModal")?.style.display === "flex") {
      resolveTemplateModal(false);
    }
  });
}

/* -------------------------
   INIT
------------------------- */
async function init() {
  cacheDom();
  bindEvents();
  await hydrateTemplateData();

  const templateId = getTemplateIdFromUrl();
  if (templateId) {
    loadTemplateById(templateId);
  } else {
    showListView();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});