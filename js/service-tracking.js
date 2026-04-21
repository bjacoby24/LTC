import { normalizeText } from "./utils.js";
import {
  SERVICE_CODES,
  SERVICE_LABELS,
  getServiceCodeFromCategory,
  getServiceCategoryFromCode,
  getServiceLabel
} from "./service-rules.js";

/* -------------------------
   BASIC HELPERS
------------------------- */
function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeEquipmentType(type) {
  const value = normalizeLower(type);

  if (value === "truck") return "Truck";
  if (value === "trailer") return "Trailer";
  if (value === "chassis") return "Chassis";
  if (value === "o/o" || value === "oo" || value === "owner operator") return "O/O";

  return normalizeText(type);
}

/* -------------------------
   LOCATION-ONLY SERVICE GROUPS
------------------------- */
export function normalizeServiceLocation(value) {
  return normalizeLower(value)
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getLocationServiceGroup(eq = {}) {
  const location = normalizeServiceLocation(eq?.location);

  if (!location) return "";

  if (
    location.includes("dedicated chassis") ||
    location === "chassis"
  ) {
    return "DEDICATED_CHASSIS";
  }

  if (
    location.includes("dedicated trailers") ||
    location.includes("dedicated trailer") ||
    location === "trailers" ||
    location === "trailer"
  ) {
    return "DEDICATED_TRAILERS";
  }

  if (
    location.includes("dedicated o/o") ||
    location.includes("dedicated oo") ||
    location.includes("dedicated oos") ||
    location.includes("dedicated owner operator") ||
    location.includes("dedicated owner operators") ||
    location === "o/o" ||
    location === "oo"
  ) {
    return "DEDICATED_OO";
  }

  if (
    location.includes("dedicated trucks") ||
    location.includes("dedicated truck") ||
    location === "trucks" ||
    location === "truck"
  ) {
    return "DEDICATED_TRUCKS";
  }

  return "";
}

export function isTrackedEquipment(eq = {}) {
  return !!getLocationServiceGroup(eq);
}

export function getDashboardEquipmentCategory(eq) {
  const group = getLocationServiceGroup(eq);

  if (group === "DEDICATED_TRUCKS") return "Trucks";
  if (group === "DEDICATED_TRAILERS" || group === "DEDICATED_CHASSIS") return "Trailers";
  if (group === "DEDICATED_OO") return "O/O's";

  return null;
}

/* -------------------------
   DATE HELPERS
------------------------- */
export function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateToYMD(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

export function addYears(date, amount) {
  const next = new Date(date.getTime());
  next.setFullYear(next.getFullYear() + amount);
  return next;
}

export function getTodayDate() {
  const now = new Date();
  return parseDate(dateToYMD(now));
}

export function formatDateDisplay(value) {
  const parsed = parseDate(value);
  if (!parsed) return "—";

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function getDueBucket(dueDate, today = getTodayDate()) {
  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
    return "due";
  }

  if (!(today instanceof Date) || Number.isNaN(today.getTime())) {
    return "due";
  }

  const due = parseDate(dateToYMD(dueDate));
  const current = parseDate(dateToYMD(today));

  if (!due || !current) return "due";

  if (current > due) return "overdue";
  if (dateToYMD(current) === dateToYMD(due)) return "due";

  const threshold = addDays(due, -30);
  if (current >= threshold) return "dueIn30Days";

  return "ok";
}

export function getDaysUntilDue(dueDate, today = getTodayDate()) {
  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return null;
  if (!(today instanceof Date) || Number.isNaN(today.getTime())) return null;

  const due = parseDate(dateToYMD(dueDate));
  const current = parseDate(dateToYMD(today));

  if (!due || !current) return null;

  return Math.round((due.getTime() - current.getTime()) / 86400000);
}

/* -------------------------
   UNIT MATCHING
------------------------- */
export function getUnitTokens(value = "") {
  return normalizeText(value)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

export function getPrimaryUnitToken(value = "") {
  return getUnitTokens(value)[0] || "";
}

export function getEquipmentSearchCandidates(eq = {}) {
  const values = [eq?.unit, eq?.equipmentNumber, eq?.unitNumber];
  const candidates = new Set();

  values.forEach(value => {
    const clean = normalizeText(value);
    if (!clean) return;

    candidates.add(clean.toUpperCase());

    const primary = getPrimaryUnitToken(clean);
    if (primary) candidates.add(primary);
  });

  return Array.from(candidates);
}

export function findEquipmentByUnitInput(equipmentList = [], rawInput = "") {
  const cleanInput = normalizeText(rawInput);
  if (!cleanInput) return null;

  const normalizedInput = cleanInput.toUpperCase();
  const inputPrimary = getPrimaryUnitToken(cleanInput);

  let exactMatch = null;
  let primaryMatch = null;

  for (const eq of safeArray(equipmentList)) {
    const candidates = getEquipmentSearchCandidates(eq);

    if (candidates.includes(normalizedInput)) {
      exactMatch = eq;
      break;
    }

    if (inputPrimary && candidates.includes(inputPrimary) && !primaryMatch) {
      primaryMatch = eq;
    }
  }

  return exactMatch || primaryMatch || null;
}

/* -------------------------
   SERVICE HISTORY
------------------------- */
function buildEmptyHistoryEntry() {
  return {
    lastCompletedAt: "",
    lastWorkOrderId: "",
    lastWorkOrderNumber: "",
    lastMeter: "",
    notes: "",
    templateId: "",
    templateName: "",
    sourceTaskId: "",
    sourceTaskName: ""
  };
}

export function normalizeServiceHistoryEntry(entry = {}) {
  return {
    ...buildEmptyHistoryEntry(),
    ...safeObject(entry),
    lastCompletedAt: normalizeText(
      entry?.lastCompletedAt ||
        entry?.lastCompletedDate ||
        entry?.completedDate ||
        entry?.lastDate
    ),
    lastWorkOrderId: normalizeText(entry?.lastWorkOrderId),
    lastWorkOrderNumber: normalizeText(entry?.lastWorkOrderNumber),
    lastMeter: normalizeText(
      entry?.lastMeter ||
        entry?.lastCompletedMiles ||
        entry?.completedMiles ||
        entry?.lastMiles ||
        entry?.miles
    ),
    notes: normalizeText(entry?.notes),
    templateId: normalizeText(entry?.templateId),
    templateName: normalizeText(entry?.templateName),
    sourceTaskId: normalizeText(entry?.sourceTaskId || entry?.taskId),
    sourceTaskName: normalizeText(entry?.sourceTaskName || entry?.taskName)
  };
}

export function normalizeServiceHistoryMap(history = {}) {
  const map = safeObject(history);

  const normalized = {
    [SERVICE_CODES.PM90]: normalizeServiceHistoryEntry(map[SERVICE_CODES.PM90]),
    [SERVICE_CODES.ANNUAL]: normalizeServiceHistoryEntry(map[SERVICE_CODES.ANNUAL]),
    [SERVICE_CODES.TRUCK_A]: normalizeServiceHistoryEntry(map[SERVICE_CODES.TRUCK_A]),
    [SERVICE_CODES.TRUCK_B]: normalizeServiceHistoryEntry(map[SERVICE_CODES.TRUCK_B])
  };

  Object.keys(map).forEach(code => {
    const cleanCode = normalizeText(code);
    if (!cleanCode || normalized[cleanCode]) return;
    normalized[cleanCode] = normalizeServiceHistoryEntry(map[cleanCode]);
  });

  return normalized;
}

export function getEquipmentServiceHistory(eq = {}) {
  return normalizeServiceHistoryMap(eq?.serviceHistory);
}

/* -------------------------
   LEGACY MIGRATION
------------------------- */
export function getLegacyTrackingDateValue(tracking) {
  if (!tracking) return "";

  return normalizeText(
    tracking.lastCompletedDate ||
      tracking.lastServiceDate ||
      tracking.completedDate ||
      tracking.lastDoneDate ||
      tracking.lastDate
  );
}

export function getLegacyTrackingMilesValue(tracking) {
  if (!tracking) return "";

  return normalizeText(
    tracking.lastCompletedMiles ||
      tracking.completedMiles ||
      tracking.lastMiles ||
      tracking.miles
  );
}

export function buildServiceHistoryFromLegacy(eq = {}, settings = {}) {
  const result = normalizeServiceHistoryMap(eq?.serviceHistory);
  const serviceTracking = safeObject(eq?.serviceTracking);
  const serviceTasks = safeArray(settings?.serviceTasks);

  serviceTasks.forEach(task => {
    const taskId = normalizeText(task?.id);
    if (!taskId) return;

    const tracking = serviceTracking[taskId];
    if (!tracking || typeof tracking !== "object") return;

    const serviceCode = getServiceCodeFromCategory(task?.serviceCategory);
    if (!serviceCode) return;

    const completedAt = getLegacyTrackingDateValue(tracking);
    const completedDate = parseDate(completedAt);
    if (!completedDate) return;

    const existing = normalizeServiceHistoryEntry(result[serviceCode]);
    const existingDate = parseDate(existing.lastCompletedAt);

    if (!existingDate || completedDate > existingDate) {
      result[serviceCode] = normalizeServiceHistoryEntry({
        lastCompletedAt: dateToYMD(completedDate),
        lastMeter: getLegacyTrackingMilesValue(tracking),
        notes: normalizeText(tracking?.notes),
        templateId: normalizeText(task?.templateId),
        templateName: normalizeText(task?.templateName),
        sourceTaskId: taskId,
        sourceTaskName: normalizeText(task?.task)
      });
    }
  });

  return result;
}

export function ensureEquipmentServiceHistory(eq = {}, settings = {}) {
  const existing = normalizeServiceHistoryMap(eq?.serviceHistory);
  const hasExisting = Object.values(existing).some(entry => normalizeText(entry.lastCompletedAt));

  if (hasExisting) return existing;

  return buildServiceHistoryFromLegacy(eq, settings);
}

/* -------------------------
   SERVICE RULES
------------------------- */
export function getRequiredServiceCodes(eq = {}) {
  const group = getLocationServiceGroup(eq);

  if (!group) return [];

  if (group === "DEDICATED_TRUCKS") {
    return [SERVICE_CODES.TRUCK_A, SERVICE_CODES.TRUCK_B, SERVICE_CODES.ANNUAL];
  }

  if (
    group === "DEDICATED_TRAILERS" ||
    group === "DEDICATED_CHASSIS" ||
    group === "DEDICATED_OO"
  ) {
    return [SERVICE_CODES.PM90, SERVICE_CODES.ANNUAL];
  }

  return [];
}

function getAnnualIntervalDays(eq = {}) {
  const group = getLocationServiceGroup(eq);

  if (group === "DEDICATED_TRAILERS" || group === "DEDICATED_CHASSIS") {
    return 90;
  }

  if (group === "DEDICATED_OO" || group === "DEDICATED_TRUCKS") {
    return 365;
  }

  return 365;
}

/* -------------------------
   TEMPLATE LOOKUP
------------------------- */
export function normalizeServiceTask(task = {}) {
  const legacyLocation = normalizeText(task?.location);

  const locations = Array.isArray(task?.locations)
    ? task.locations.map(value => normalizeText(value)).filter(Boolean)
    : legacyLocation
      ? [legacyLocation]
      : [];

  const appliesToAllLocations =
    typeof task?.appliesToAllLocations === "boolean"
      ? task?.appliesToAllLocations
      : locations.length === 0;

  return {
    ...task,
    id: normalizeText(task?.id),
    task: normalizeText(task?.task),
    status: normalizeText(task?.status || "Active") || "Active",
    appliesToAllLocations,
    locations: appliesToAllLocations ? [] : [...new Set(locations)],
    templateId: normalizeText(task?.templateId),
    templateName: normalizeText(task?.templateName),
    serviceCategory: normalizeLower(task?.serviceCategory),
    equipmentType: normalizeEquipmentType(task?.equipmentType),
    businessCategory: normalizeText(task?.businessCategory)
  };
}

export function getAllServiceTasks(settings = {}) {
  return safeArray(settings?.serviceTasks).map(normalizeServiceTask);
}

export function taskMatchesEquipment(task, eq) {
  const cleanTask = normalizeServiceTask(task);
  const equipmentLocation = normalizeLower(eq?.location);

  if (normalizeLower(cleanTask.status) === "inactive") return false;

  if (!cleanTask.appliesToAllLocations && cleanTask.locations.length) {
    const matched = cleanTask.locations.some(location => {
      const taskLocation = normalizeLower(location);
      return (
        taskLocation === equipmentLocation ||
        equipmentLocation.includes(taskLocation) ||
        taskLocation.includes(equipmentLocation)
      );
    });

    if (!matched) return false;
  }

  return true;
}

export function getTemplateTaskForServiceCode(eq, settings, serviceCode) {
  const targetCategory = getServiceCategoryFromCode(serviceCode);
  if (!targetCategory) return null;

  return (
    getAllServiceTasks(settings).find(task => {
      return task.serviceCategory === targetCategory && taskMatchesEquipment(task, eq);
    }) || null
  );
}

/* -------------------------
   SNAPSHOTS
------------------------- */
function buildBaseServiceItem(code, historyEntry) {
  const completedDate = parseDate(historyEntry?.lastCompletedAt);

  return {
    code,
    category: getServiceCategoryFromCode(code),
    label: SERVICE_LABELS[code] || code,
    lastCompletedAt: historyEntry?.lastCompletedAt || "",
    lastCompletedDate: completedDate,
    lastCompletedDisplay: completedDate ? formatDateDisplay(completedDate) : "—",
    lastMeter: historyEntry?.lastMeter || "",
    lastWorkOrderId: historyEntry?.lastWorkOrderId || "",
    lastWorkOrderNumber: historyEntry?.lastWorkOrderNumber || "",
    templateId: historyEntry?.templateId || "",
    templateName: historyEntry?.templateName || "",
    sourceTaskId: historyEntry?.sourceTaskId || "",
    sourceTaskName: historyEntry?.sourceTaskName || "",
    notes: historyEntry?.notes || "",
    dueDate: null,
    dueDisplay: "No completion history",
    bucket: "due",
    daysUntilDue: null,
    intervalDays: null
  };
}

function finalizeServiceItem(item, dueDate, today = getTodayDate()) {
  const due = parseDate(dueDate);

  if (!due) {
    return {
      ...item,
      dueDate: null,
      dueDisplay: "No completion history",
      bucket: "due",
      daysUntilDue: null
    };
  }

  return {
    ...item,
    dueDate: due,
    dueDisplay: formatDateDisplay(due),
    bucket: getDueBucket(due, today),
    daysUntilDue: getDaysUntilDue(due, today)
  };
}

function buildPm90Item(history, today) {
  const item = buildBaseServiceItem(SERVICE_CODES.PM90, history[SERVICE_CODES.PM90]);
  const lastDate = parseDate(item.lastCompletedAt);

  return finalizeServiceItem(
    {
      ...item,
      intervalDays: 90
    },
    lastDate ? addDays(lastDate, 90) : null,
    today
  );
}

function buildAnnualItem(eq, history, today) {
  const annualEntry = history[SERVICE_CODES.ANNUAL];
  const annualDate = parseDate(annualEntry.lastCompletedAt);
  const intervalDays = getAnnualIntervalDays(eq);

  const item = buildBaseServiceItem(SERVICE_CODES.ANNUAL, annualEntry);

  return finalizeServiceItem(
    {
      ...item,
      intervalDays
    },
    annualDate ? addDays(annualDate, intervalDays) : null,
    today
  );
}

function buildTruckAlternatingItem(history, today) {
  const aEntry = history[SERVICE_CODES.TRUCK_A];
  const bEntry = history[SERVICE_CODES.TRUCK_B];
  const aDate = parseDate(aEntry.lastCompletedAt);
  const bDate = parseDate(bEntry.lastCompletedAt);

  if (!aDate && !bDate) {
    const item = buildBaseServiceItem(SERVICE_CODES.TRUCK_A, aEntry);
    return finalizeServiceItem(
      {
        ...item,
        intervalDays: 90
      },
      null,
      today
    );
  }

  if (aDate && !bDate) {
    const item = buildBaseServiceItem(SERVICE_CODES.TRUCK_B, bEntry);
    return finalizeServiceItem(
      {
        ...item,
        lastCompletedAt: dateToYMD(aDate),
        lastCompletedDate: aDate,
        lastCompletedDisplay: formatDateDisplay(aDate),
        lastMeter: aEntry.lastMeter || "",
        lastWorkOrderId: aEntry.lastWorkOrderId || "",
        lastWorkOrderNumber: aEntry.lastWorkOrderNumber || "",
        intervalDays: 90
      },
      addDays(aDate, 90),
      today
    );
  }

  if (!aDate && bDate) {
    const item = buildBaseServiceItem(SERVICE_CODES.TRUCK_A, aEntry);
    return finalizeServiceItem(
      {
        ...item,
        lastCompletedAt: dateToYMD(bDate),
        lastCompletedDate: bDate,
        lastCompletedDisplay: formatDateDisplay(bDate),
        lastMeter: bEntry.lastMeter || "",
        lastWorkOrderId: bEntry.lastWorkOrderId || "",
        lastWorkOrderNumber: bEntry.lastWorkOrderNumber || "",
        intervalDays: 90
      },
      addDays(bDate, 90),
      today
    );
  }

  if (aDate > bDate) {
    const item = buildBaseServiceItem(SERVICE_CODES.TRUCK_B, bEntry);
    return finalizeServiceItem(
      {
        ...item,
        lastCompletedAt: dateToYMD(aDate),
        lastCompletedDate: aDate,
        lastCompletedDisplay: formatDateDisplay(aDate),
        lastMeter: aEntry.lastMeter || "",
        lastWorkOrderId: aEntry.lastWorkOrderId || "",
        lastWorkOrderNumber: aEntry.lastWorkOrderNumber || "",
        intervalDays: 90
      },
      addDays(aDate, 90),
      today
    );
  }

  const item = buildBaseServiceItem(SERVICE_CODES.TRUCK_A, aEntry);
  return finalizeServiceItem(
    {
      ...item,
      lastCompletedAt: dateToYMD(bDate),
      lastCompletedDate: bDate,
      lastCompletedDisplay: formatDateDisplay(bDate),
      lastMeter: bEntry.lastMeter || "",
      lastWorkOrderId: bEntry.lastWorkOrderId || "",
      lastWorkOrderNumber: bEntry.lastWorkOrderNumber || "",
      intervalDays: 90
    },
    addDays(bDate, 90),
    today
  );
}

export function getEquipmentServiceSnapshot(eq = {}, settings = {}, options = {}) {
  const today = options?.today ? parseDate(options.today) || getTodayDate() : getTodayDate();
  const group = getLocationServiceGroup(eq);
  const tracked = !!group;
  const serviceHistory = ensureEquipmentServiceHistory(eq, settings);

  const result = {
    equipmentId: normalizeText(eq?.id),
    unit: normalizeText(eq?.unit || eq?.equipmentNumber || eq?.unitNumber) || "Unit",
    type: normalizeEquipmentType(eq?.type),
    business: normalizeText(eq?.business),
    location: normalizeText(eq?.location),
    locationGroup: group,
    tracked,
    services: [],
    activeSelectorServices: [],
    requiredServiceCodes: getRequiredServiceCodes(eq)
  };

  if (!tracked) {
    return result;
  }

  if (group === "DEDICATED_TRUCKS") {
    const nextTruck = buildTruckAlternatingItem(serviceHistory, today);
    const annual = buildAnnualItem(eq, serviceHistory, today);

    result.services = [nextTruck, annual];
    result.activeSelectorServices = [nextTruck.code, SERVICE_CODES.ANNUAL];
    return result;
  }

  if (
    group === "DEDICATED_TRAILERS" ||
    group === "DEDICATED_CHASSIS" ||
    group === "DEDICATED_OO"
  ) {
    const pm90 = buildPm90Item(serviceHistory, today);
    const annual = buildAnnualItem(eq, serviceHistory, today);

    result.services = [pm90, annual];
    result.activeSelectorServices = [SERVICE_CODES.PM90, SERVICE_CODES.ANNUAL];
    return result;
  }

  return result;
}

export function getServiceSelectorOptions(eq = {}, settings = {}) {
  const snapshot = getEquipmentServiceSnapshot(eq, settings);

  return snapshot.activeSelectorServices.map(code => {
    const item = snapshot.services.find(service => service.code === code) || {
      code,
      label: SERVICE_LABELS[code] || code,
      bucket: "due"
    };

    const matchedTask = getTemplateTaskForServiceCode(eq, settings, code);

    return {
      code,
      label: item.label,
      bucket: item.bucket,
      dueDisplay: item.dueDisplay || "No completion history",
      templateId: matchedTask?.templateId || "",
      templateName: matchedTask?.templateName || "",
      sourceTaskId: matchedTask?.id || "",
      sourceTaskName: matchedTask?.task || ""
    };
  });
}

export function getWorkOrderEquipmentGroup(eq = {}) {
  const normalizedType = normalizeEquipmentType(eq?.type);

  if (normalizedType === "Trailer") return "TRAILER";
  if (normalizedType === "Chassis") return "CHASSIS";
  if (normalizedType === "O/O") return "OO";
  if (normalizedType === "Truck") return "TRUCK";

  const locationGroup = getLocationServiceGroup(eq);

  if (locationGroup === "DEDICATED_TRAILERS") return "TRAILER";
  if (locationGroup === "DEDICATED_CHASSIS") return "CHASSIS";
  if (locationGroup === "DEDICATED_OO") return "OO";
  if (locationGroup === "DEDICATED_TRUCKS") return "TRUCK";

  return "";
}

export function getWorkOrderServiceCodes(eq = {}) {
  const group = getWorkOrderEquipmentGroup(eq);

  if (group === "TRAILER") {
    return [
      SERVICE_CODES.PM90,
      SERVICE_CODES.ANNUAL,
      SERVICE_CODES.VIK,
      SERVICE_CODES.VIKTUC,
      SERVICE_CODES.VIKTUCP,
      SERVICE_CODES.REPAIR
    ];
  }

  if (group === "CHASSIS") {
    return [
      SERVICE_CODES.PM90,
      SERVICE_CODES.ANNUAL,
      SERVICE_CODES.REPAIR
    ];
  }

  if (group === "OO") {
    return [
      SERVICE_CODES.PM90,
      SERVICE_CODES.ANNUAL,
      SERVICE_CODES.REPAIR
    ];
  }

  if (group === "TRUCK") {
    return [
      SERVICE_CODES.TRUCK_A,
      SERVICE_CODES.TRUCK_B,
      SERVICE_CODES.ANNUAL,
      SERVICE_CODES.REPAIR
    ];
  }

  return [];
}

export function getWorkOrderServiceSelectorOptions(eq = {}, settings = {}) {
  const codes = getWorkOrderServiceCodes(eq);

  return codes.map(code => {
    const matchedTask = getTemplateTaskForServiceCode(eq, settings, code);

    return {
      code,
      label: getServiceLabel(code),
      bucket: "manual",
      dueDisplay: "",
      templateId: matchedTask?.templateId || "",
      templateName: matchedTask?.templateName || "",
      sourceTaskId: matchedTask?.id || "",
      sourceTaskName: matchedTask?.task || ""
    };
  });
}

export function buildDashboardDueServicesData(equipmentList = [], settings = {}) {
  const groups = {
    due: { Trucks: [], Trailers: [], "O/O's": [] },
    dueIn30Days: { Trucks: [], Trailers: [], "O/O's": [] },
    overdue: { Trucks: [], Trailers: [], "O/O's": [] }
  };

  safeArray(equipmentList).forEach(eq => {
    const category = getDashboardEquipmentCategory(eq);
    if (!category) return;

    const snapshot = getEquipmentServiceSnapshot(eq, settings);

    snapshot.services.forEach(service => {
      if (!["due", "dueIn30Days", "overdue"].includes(service.bucket)) return;

      groups[service.bucket][category].push({
        equipmentId: snapshot.equipmentId,
        unit: snapshot.unit,
        type: snapshot.type,
        business: snapshot.business,
        location: snapshot.location,
        serviceCode: service.code,
        serviceCategory: service.category,
        serviceLabel: service.label,
        dueDate: service.dueDate,
        dueDisplay: service.dueDisplay,
        dueReason: service.dueDate ? `Due ${service.dueDisplay}` : "No completion history",
        lastCompletedAt: service.lastCompletedAt,
        lastCompletedDisplay: service.lastCompletedDisplay,
        templateName: service.templateName || ""
      });
    });
  });

  Object.values(groups).forEach(categoryMap => {
    Object.keys(categoryMap).forEach(category => {
      categoryMap[category].sort((a, b) => {
        const aDate = a.dueDate ? a.dueDate.getTime() : Number.MIN_SAFE_INTEGER;
        const bDate = b.dueDate ? b.dueDate.getTime() : Number.MIN_SAFE_INTEGER;

        if (aDate !== bDate) return aDate - bDate;
        return normalizeLower(a.unit).localeCompare(normalizeLower(b.unit));
      });
    });
  });

  return groups;
}

/* -------------------------
   COMPLETION WRITES
------------------------- */
export function buildServiceCompletionEntry({
  code = "",
  completedAt = "",
  meter = "",
  workOrderId = "",
  workOrderNumber = "",
  notes = "",
  templateId = "",
  templateName = "",
  sourceTaskId = "",
  sourceTaskName = ""
} = {}) {
  const serviceCode = normalizeText(code);
  if (!serviceCode) return null;

  const completedDate = parseDate(completedAt);
  const normalizedCompletedAt = completedDate ? dateToYMD(completedDate) : "";

  return {
    code: serviceCode,
    category: getServiceCategoryFromCode(serviceCode),
    label: SERVICE_LABELS[serviceCode] || serviceCode,
    completedAt: normalizedCompletedAt,
    meter: normalizeText(meter),
    workOrderId: normalizeText(workOrderId),
    workOrderNumber: normalizeText(workOrderNumber),
    notes: normalizeText(notes),
    templateId: normalizeText(templateId),
    templateName: normalizeText(templateName),
    sourceTaskId: normalizeText(sourceTaskId),
    sourceTaskName: normalizeText(sourceTaskName)
  };
}

export function applyServiceCompletionToEquipment(eq = {}, completionEntry) {
  if (!completionEntry?.code) return { ...eq };

  const currentHistory = normalizeServiceHistoryMap(eq?.serviceHistory);
  const code = completionEntry.code;

  currentHistory[code] = normalizeServiceHistoryEntry({
    ...currentHistory[code],
    lastCompletedAt: completionEntry.completedAt,
    lastWorkOrderId: completionEntry.workOrderId,
    lastWorkOrderNumber: completionEntry.workOrderNumber,
    lastMeter: completionEntry.meter,
    notes: completionEntry.notes,
    templateId: completionEntry.templateId,
    templateName: completionEntry.templateName,
    sourceTaskId: completionEntry.sourceTaskId,
    sourceTaskName: completionEntry.sourceTaskName
  });

  return {
    ...eq,
    serviceHistory: currentHistory
  };
}