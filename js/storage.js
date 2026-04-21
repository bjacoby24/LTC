import { initFirebase } from "../firebase-config.js";
import {
  ensureEquipmentServiceHistory,
  normalizeServiceHistoryMap
} from "./service-tracking.js";

const KEYS = {
  fleetUser: "fleetUser",
  fleetLoggedIn: "fleetLoggedIn",
  fleetLoggedInUser: "fleetLoggedInUser",
  fleetUsersCache: "fleetUsersCache",

  fleetSettings: "fleetSettings",

  fleetEquipment: "fleetEquipment",
  fleetDeletedEquipment: "fleetDeletedEquipment",
  fleetWorkOrders: "fleetWorkOrders",
  fleetInventory: "fleetInventory",
  fleetVendors: "fleetVendors",
  fleetPurchaseOrders: "fleetPurchaseOrders",

  fleetEquipmentColumns: "fleetEquipmentColumns",
  fleetEquipmentGridState: "fleetEquipmentGridState",

  fleetInventoryColumns: "fleetInventoryColumns",
  fleetInventoryGridState: "fleetInventoryGridState"
};

const COLLECTIONS = {
  settingsCollection: "appData",
  settingsDoc: "settings",
  equipment: "equipment",
  deletedEquipment: "deletedEquipment",
  workOrders: "workOrders",
  inventory: "inventory",
  vendors: "vendors",
  purchaseOrders: "purchaseOrders",
  users: "users"
};

let firestoreState = {
  initialized: false,
  connected: false,
  db: null,
  fns: null
};

/* -------------------------
   FIREBASE / FIRESTORE
------------------------- */
async function getFirestoreContext() {
  if (firestoreState.initialized) {
    return firestoreState;
  }

  try {
    const firebaseResult = await initFirebase();

    if (!firebaseResult?.connected || !firebaseResult?.db) {
      throw new Error("Firebase is not connected.");
    }

    const firestoreModule = await import(
      "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js"
    );

    firestoreState = {
      initialized: true,
      connected: true,
      db: firebaseResult.db,
      fns: {
        doc: firestoreModule.doc,
        getDoc: firestoreModule.getDoc,
        setDoc: firestoreModule.setDoc,
        getDocs: firestoreModule.getDocs,
        deleteDoc: firestoreModule.deleteDoc,
        collection: firestoreModule.collection,
        writeBatch: firestoreModule.writeBatch,
        serverTimestamp: firestoreModule.serverTimestamp,
        onSnapshot: firestoreModule.onSnapshot
      }
    };

    return firestoreState;
  } catch (error) {
    console.error("Firestore initialization failed:", error);

    firestoreState = {
      initialized: true,
      connected: false,
      db: null,
      fns: null
    };

    return firestoreState;
  }
}

/* -------------------------
   SAFE HELPERS
------------------------- */
function safeParse(value, fallback) {
  try {
    if (value == null || value === "") return fallback;
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (error) {
    console.warn("localStorage parse failed:", error);
    return fallback;
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getArray(key) {
  const value = safeParse(localStorage.getItem(key), []);
  return Array.isArray(value) ? value : [];
}

function setArray(key, value) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function getObject(key, fallback = {}) {
  const value = safeParse(localStorage.getItem(key), fallback);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback == null
      ? fallback
      : { ...fallback };
}

function setObject(key, value, fallback = {}) {
  const safeValue =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : fallback;

  localStorage.setItem(key, JSON.stringify(safeValue));
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function firstNonEmptyArray(keys = []) {
  for (const key of keys) {
    const value = getArray(key);
    if (value.length) return value;
  }
  return [];
}

function migrateArrayKey(primaryKey, legacyKeys = []) {
  const primary = getArray(primaryKey);
  if (primary.length) return primary;

  const legacy = firstNonEmptyArray(legacyKeys);
  if (legacy.length) {
    setArray(primaryKey, legacy);
    return legacy;
  }

  return [];
}

function writeArrayWithLegacy(primaryKey, value, legacyKeys = []) {
  const safeValue = Array.isArray(value) ? value : [];
  setArray(primaryKey, safeValue);

  legacyKeys.forEach(key => {
    try {
      setArray(key, safeValue);
    } catch (error) {
      console.warn(`Unable to sync legacy key "${key}"`, error);
    }
  });
}

function normalizeId(value, fallbackPrefix = "id") {
  const clean = normalizeString(value);
  if (clean) return clean;
  return `${fallbackPrefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeIsoDate(value) {
  return normalizeString(value);
}

function normalizeTimestampish(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch {
        return "";
      }
    }

    if (typeof value.seconds === "number") {
      try {
        return new Date(value.seconds * 1000).toISOString();
      } catch {
        return "";
      }
    }
  }

  return "";
}

/* -------------------------
   SETTINGS NORMALIZATION
------------------------- */
function normalizeServiceTask(task = {}) {
  const legacyLocation = normalizeString(task.location);

  const locations = Array.isArray(task.locations)
    ? task.locations.map(value => normalizeString(value)).filter(Boolean)
    : legacyLocation
      ? [legacyLocation]
      : [];

  const appliesToAllLocations =
    typeof task.appliesToAllLocations === "boolean"
      ? task.appliesToAllLocations
      : locations.length === 0;

  return {
    id: normalizeString(task.id),
    task: normalizeString(task.task),
    parentTaskId: normalizeString(task.parentTaskId),
    linkedTaskId: normalizeString(task.linkedTaskId),
    templateId: normalizeString(task.templateId),
    templateName: normalizeString(task.templateName),
    status: normalizeString(task.status, "Active") || "Active",
    appliesToAllLocations,
    locations: appliesToAllLocations ? [] : [...new Set(locations)],
    dateTrackingMode: normalizeString(task.dateTrackingMode, "every") || "every",
    dateEveryValue: normalizeString(task.dateEveryValue),
    dateEveryUnit: normalizeString(task.dateEveryUnit, "Days") || "Days",
    dateOnValue: normalizeString(task.dateOnValue),
    dateNoticeValue: normalizeString(task.dateNoticeValue, "7") || "7",
    milesTrackingMode: normalizeString(task.milesTrackingMode, "every") || "every",
    milesEveryValue: normalizeString(task.milesEveryValue),
    milesAtValue: normalizeString(task.milesAtValue),
    milesNoticeValue: normalizeString(task.milesNoticeValue, "0") || "0",
    serviceCategory: normalizeString(task.serviceCategory).toLowerCase(),
    equipmentType: normalizeString(task.equipmentType),
    businessCategory: normalizeString(task.businessCategory)
  };
}

function normalizeServiceTemplate(template = {}) {
  return {
    id: normalizeString(template.id),
    name: normalizeString(template.name),
    primaryMeter: normalizeString(template.primaryMeter, "Miles") || "Miles",
    secondaryMeter: normalizeString(template.secondaryMeter, "None") || "None",
    locations: Array.isArray(template.locations)
      ? template.locations.map(value => normalizeString(value)).filter(Boolean)
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
        : cleanTask.locations;

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

function getDefaultSettings() {
  return {
    companyName: "",
    defaultLocation: "",
    theme: "default",
    weatherZip: "62201",
    serviceTasks: [],
    serviceTemplates: []
  };
}

function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();

  const serviceTemplates = Array.isArray(settings?.serviceTemplates)
    ? settings.serviceTemplates.map(normalizeServiceTemplate)
    : [];

  const serviceTasks =
    Array.isArray(settings?.serviceTasks) && settings.serviceTasks.length
      ? settings.serviceTasks.map(normalizeServiceTask)
      : flattenTemplatesToServiceTasks(serviceTemplates);

  return {
    ...defaults,
    ...settings,
    companyName: normalizeString(settings?.companyName),
    defaultLocation: normalizeString(settings?.defaultLocation),
    theme: normalizeString(settings?.theme, "default") || "default",
    weatherZip: normalizeString(settings?.weatherZip || "62201") || "62201",
    serviceTemplates,
    serviceTasks
  };
}

/* -------------------------
   EQUIPMENT / WORK ORDER NORMALIZATION
------------------------- */
function normalizeEquipmentRecord(eq = {}, settings = {}) {
  const normalized = {
    ...eq,
    id: normalizeId(eq?.id, "equipment"),
    unit: normalizeString(eq?.unit),
    type: normalizeString(eq?.type),
    year: normalizeString(eq?.year),
    vin: normalizeString(eq?.vin),
    plate: normalizeString(eq?.plate),
    state: normalizeString(eq?.state),
    status: normalizeString(eq?.status),
    location: normalizeString(eq?.location),
    pm: normalizeString(eq?.pm),
    business: normalizeString(eq?.business),
    rim: normalizeString(eq?.rim),
    size: normalizeString(eq?.size),
    pressure: normalizeString(eq?.pressure),
    manufacturer: normalizeString(eq?.manufacturer),
    bodyClass: normalizeString(eq?.bodyClass),
    driveType: normalizeString(eq?.driveType),
    fuelType: normalizeString(eq?.fuelType),
    engine: normalizeString(eq?.engine),
    serviceTracking:
      eq?.serviceTracking && typeof eq.serviceTracking === "object" && !Array.isArray(eq.serviceTracking)
        ? eq.serviceTracking
        : {}
  };

  return {
    ...normalized,
    serviceHistory: ensureEquipmentServiceHistory(normalized, settings)
  };
}

function normalizeWorkOrderRecord(wo = {}) {
  const normalizedAssignees =
    Array.isArray(wo?.assignees) && wo.assignees.length
      ? wo.assignees
          .map(value => normalizeString(value))
          .filter(Boolean)
      : normalizeString(wo?.assignee)
        ? String(wo.assignee)
            .split(",")
            .map(value => normalizeString(value))
            .filter(Boolean)
        : [];

  return {
    ...wo,
    id: normalizeId(wo?.id, "workOrder"),
    workOrderNumber: normalizeString(wo?.workOrderNumber || wo?.woNumber),
    woNumber: normalizeString(wo?.woNumber || wo?.workOrderNumber),
    equipmentNumber: normalizeString(wo?.equipmentNumber),
    equipmentId: normalizeString(wo?.equipmentId),
    assignee: normalizedAssignees.join(", "),
    assignees: normalizedAssignees,
    started: normalizeString(wo?.started),
    type: normalizeString(wo?.type),
    repairLocation: normalizeString(wo?.repairLocation),
    meter: normalizeString(wo?.meter || wo?.mileage),
    mileage: normalizeString(wo?.mileage || wo?.meter),
    opened: normalizeString(wo?.opened || wo?.date || wo?.woDate),
    date: normalizeString(wo?.date || wo?.opened || wo?.woDate),
    woDate: normalizeString(wo?.woDate || wo?.opened || wo?.date),
    closed: normalizeString(wo?.closed),
    completed: normalizeString(wo?.completed),
    status: normalizeString(wo?.status, "Open") || "Open",
    notes: normalizeString(wo?.notes),
    serviceCode: normalizeString(wo?.serviceCode),
    serviceLabel: normalizeString(wo?.serviceLabel),
    serviceCodes: Array.isArray(wo?.serviceCodes)
      ? wo.serviceCodes.map(value => normalizeString(value)).filter(Boolean)
      : normalizeString(wo?.serviceCode)
        ? [normalizeString(wo.serviceCode)]
        : [],
    serviceLabels: Array.isArray(wo?.serviceLabels)
      ? wo.serviceLabels.map(value => normalizeString(value)).filter(Boolean)
      : normalizeString(wo?.serviceLabel)
        ? [normalizeString(wo.serviceLabel)]
        : [],
    serviceCategory: normalizeString(wo?.serviceCategory).toLowerCase(),
    serviceTemplateId: normalizeString(wo?.serviceTemplateId),
    serviceTemplateName: normalizeString(wo?.serviceTemplateName),
    sourceTaskId: normalizeString(wo?.sourceTaskId),
    sourceTaskName: normalizeString(wo?.sourceTaskName),
    tasks: Array.isArray(wo?.tasks) ? wo.tasks : [],
    attachments: Array.isArray(wo?.attachments) ? wo.attachments : [],
    inventoryIssueAppliedKeys: Array.isArray(wo?.inventoryIssueAppliedKeys)
      ? wo.inventoryIssueAppliedKeys.map(value => normalizeString(value)).filter(Boolean)
      : [],
    totalLabor: Number(wo?.totalLabor || 0) || 0,
    totalParts: Number(wo?.totalParts || 0) || 0,
    total: Number(wo?.total || wo?.totalCost || 0) || 0,
    createdAt: normalizeString(wo?.createdAt),
    updatedAt: normalizeString(wo?.updatedAt)
  };
}

function normalizePlainListRecord(record = {}, fallbackPrefix = "item") {
  return {
    ...record,
    id: normalizeId(record?.id, fallbackPrefix)
  };
}

/* -------------------------
   INVENTORY NORMALIZATION
------------------------- */
function normalizeInventoryHistoryEntry(entry = {}, type = "") {
  return {
    id: normalizeId(entry?.id, `inventoryHistory_${type || "entry"}`),
    type: normalizeString(entry?.type || type),
    date: normalizeTimestampish(entry?.date || entry?.createdAt || entry?.timestamp),
    quantity: normalizeNumber(entry?.quantity, 0),
    previousQuantity: normalizeNumber(entry?.previousQuantity, 0),
    newQuantity: normalizeNumber(entry?.newQuantity, 0),
    unitCost: normalizeNumber(entry?.unitCost, 0),
    referenceNumber: normalizeString(entry?.referenceNumber),
    referenceId: normalizeString(entry?.referenceId),
    referenceType: normalizeString(entry?.referenceType),
    vendor: normalizeString(entry?.vendor),
    user: normalizeString(entry?.user),
    notes: normalizeString(entry?.notes),
    source: normalizeString(entry?.source)
  };
}

function normalizeInventoryRecord(item = {}) {
  const purchaseHistory = Array.isArray(item?.purchaseHistory)
    ? item.purchaseHistory.map(entry => normalizeInventoryHistoryEntry(entry, "purchase"))
    : [];

  const issueHistory = Array.isArray(item?.issueHistory)
    ? item.issueHistory.map(entry => normalizeInventoryHistoryEntry(entry, "issue"))
    : [];

  const qtyAdjustmentHistory = Array.isArray(item?.qtyAdjustmentHistory)
    ? item.qtyAdjustmentHistory.map(entry => normalizeInventoryHistoryEntry(entry, "adjustment"))
    : [];

  const lastPurchasedAt =
    normalizeTimestampish(item?.lastPurchasedAt) ||
    purchaseHistory
      .map(entry => entry.date)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ||
    "";

  const lastIssuedAt =
    normalizeTimestampish(item?.lastIssuedAt) ||
    issueHistory
      .map(entry => entry.date)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ||
    "";

  return {
    ...item,
    id: normalizeId(item?.id, "inventory"),
    name: normalizeString(item?.name || item?.itemName),
    itemName: normalizeString(item?.itemName || item?.name),
    partNumber: normalizeString(item?.partNumber),
    category: normalizeString(item?.category),
    quantity: normalizeNumber(item?.quantity, 0),
    unitCost: normalizeNumber(item?.unitCost, 0),
    location: normalizeString(item?.location),
    vendor: normalizeString(item?.vendor),
    notes: normalizeString(item?.notes),

    reorderPoint: normalizeNumber(item?.reorderPoint, 0),
    reorderQuantity: normalizeNumber(item?.reorderQuantity, 0),
    maximumQuantity: normalizeNumber(item?.maximumQuantity, 0),

    minimumQuantity: normalizeNumber(
      item?.minimumQuantity,
      normalizeNumber(item?.reorderPoint, 0)
    ),

    quickAdjustEnabled: normalizeBoolean(item?.quickAdjustEnabled, true),

    profileNotes: normalizeString(item?.profileNotes || item?.notes),
    binLocation: normalizeString(item?.binLocation),
    manufacturer: normalizeString(item?.manufacturer),
    partType: normalizeString(item?.partType),
    uom: normalizeString(item?.uom || "EA"),

    lastPurchasedAt,
    lastIssuedAt,
    lastPurchasedCost: normalizeNumber(item?.lastPurchasedCost, 0),

    purchaseHistory,
    issueHistory,
    qtyAdjustmentHistory,

    createdAt: normalizeTimestampish(item?.createdAt),
    updatedAt: normalizeTimestampish(item?.updatedAt)
  };
}

/* -------------------------
   USER / PERMISSION NORMALIZATION
------------------------- */
function getDefaultPermissions() {
  return {
    dashboardView: true,
    settingsAccess: false,
    userManagement: false,

    equipmentView: true,
    equipmentEdit: false,
    equipmentDelete: false,
    deletedEquipmentAccess: false,

    workOrdersView: true,
    workOrdersEdit: false,
    workOrdersDelete: false,

    inventoryView: true,
    inventoryEdit: false,
    inventoryDelete: false,
    vendorsAccess: false,
    purchaseOrdersAccess: false
  };
}

function normalizeRole(role) {
  const clean = normalizeString(role, "user").toLowerCase();
  if (clean === "admin") return "admin";
  if (clean === "manager") return "manager";
  return "user";
}

function getPermissionsForRole(role = "user") {
  const cleanRole = normalizeRole(role);

  if (cleanRole === "admin") {
    return {
      dashboardView: true,
      settingsAccess: true,
      userManagement: true,

      equipmentView: true,
      equipmentEdit: true,
      equipmentDelete: true,
      deletedEquipmentAccess: true,

      workOrdersView: true,
      workOrdersEdit: true,
      workOrdersDelete: true,

      inventoryView: true,
      inventoryEdit: true,
      inventoryDelete: true,
      vendorsAccess: true,
      purchaseOrdersAccess: true
    };
  }

  if (cleanRole === "manager") {
    return {
      dashboardView: true,
      settingsAccess: true,
      userManagement: false,

      equipmentView: true,
      equipmentEdit: true,
      equipmentDelete: true,
      deletedEquipmentAccess: true,

      workOrdersView: true,
      workOrdersEdit: true,
      workOrdersDelete: true,

      inventoryView: true,
      inventoryEdit: true,
      inventoryDelete: true,
      vendorsAccess: true,
      purchaseOrdersAccess: true
    };
  }

  return {
    dashboardView: true,
    settingsAccess: false,
    userManagement: false,

    equipmentView: true,
    equipmentEdit: true,
    equipmentDelete: false,
    deletedEquipmentAccess: false,

    workOrdersView: true,
    workOrdersEdit: true,
    workOrdersDelete: false,

    inventoryView: true,
    inventoryEdit: true,
    inventoryDelete: false,
    vendorsAccess: true,
    purchaseOrdersAccess: true
  };
}

function normalizePermissions(permissions = {}, role = "user") {
  const cleanRole = normalizeRole(role);

  if (cleanRole === "admin") {
    return getPermissionsForRole("admin");
  }

  return {
    ...getDefaultPermissions(),
    ...getPermissionsForRole(cleanRole),
    ...(permissions && typeof permissions === "object" && !Array.isArray(permissions)
      ? permissions
      : {})
  };
}

function normalizeUserRecord(user = {}) {
  const username = normalizeString(user?.username).trim();
  const password = normalizeString(user?.password);
  const role = normalizeRole(user?.role);
  const active = user?.active !== false;
  const firstName = normalizeString(user?.firstName);
  const lastName = normalizeString(user?.lastName);
  const permissions = normalizePermissions(user?.permissions, role);

  return {
    id: normalizeString(user?.id, username) || username,
    username,
    password,
    role,
    firstName,
    lastName,
    active,
    permissions
  };
}

function isValidUserRecord(user) {
  return !!user?.username && !!user?.password;
}

function normalizeLoggedInUserValue(value) {
  if (!value) {
    return {
      username: "",
      firstName: "",
      lastName: "",
      role: "",
      permissions: getDefaultPermissions()
    };
  }

  if (typeof value === "string") {
    const raw = value.trim();

    if (!raw) {
      return {
        username: "",
        firstName: "",
        lastName: "",
        role: "",
        permissions: getDefaultPermissions()
      };
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          username: normalizeString(parsed.username),
          firstName: normalizeString(parsed.firstName),
          lastName: normalizeString(parsed.lastName),
          role: normalizeRole(parsed.role),
          permissions: normalizePermissions(parsed.permissions, parsed.role)
        };
      }
    } catch {
      return {
        username: raw,
        firstName: "",
        lastName: "",
        role: "",
        permissions: getDefaultPermissions()
      };
    }
  }

  return {
    username: normalizeString(value?.username),
    firstName: normalizeString(value?.firstName),
    lastName: normalizeString(value?.lastName),
    role: normalizeRole(value?.role),
    permissions: normalizePermissions(value?.permissions, value?.role)
  };
}

/* -------------------------
   FIRESTORE HELPERS
------------------------- */
async function readCollection(collectionName) {
  const ctx = await getFirestoreContext();
  if (!ctx.connected || !ctx.db || !ctx.fns) {
    throw new Error(`Firestore unavailable while reading "${collectionName}".`);
  }

  const { collection, getDocs } = ctx.fns;
  const snapshot = await getDocs(collection(ctx.db, collectionName));

  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

async function syncCollection(collectionName, items = []) {
  const ctx = await getFirestoreContext();
  if (!ctx.connected || !ctx.db || !ctx.fns) {
    throw new Error(`Firestore unavailable while syncing "${collectionName}".`);
  }

  const { collection, getDocs, doc, writeBatch, serverTimestamp } = ctx.fns;

  const safeItems = Array.isArray(items) ? items : [];
  const normalizedItems = safeItems.map((item, index) => {
    const docId = normalizeId(item?.id, `${collectionName}_${index + 1}`);
    return {
      ...item,
      id: docId
    };
  });

  const incomingIds = new Set(normalizedItems.map(item => String(item.id)));
  const existingSnapshot = await getDocs(collection(ctx.db, collectionName));
  const batch = writeBatch(ctx.db);

  existingSnapshot.forEach(existingDoc => {
    if (!incomingIds.has(String(existingDoc.id))) {
      batch.delete(doc(ctx.db, collectionName, existingDoc.id));
    }
  });

  normalizedItems.forEach(item => {
    batch.set(
      doc(ctx.db, collectionName, String(item.id)),
      {
        ...item,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  });

  await batch.commit();
  return normalizedItems;
}

async function readSettingsDoc() {
  const ctx = await getFirestoreContext();
  if (!ctx.connected || !ctx.db || !ctx.fns) {
    throw new Error("Firestore unavailable while reading settings.");
  }

  const { doc, getDoc } = ctx.fns;
  const ref = doc(ctx.db, COLLECTIONS.settingsCollection, COLLECTIONS.settingsDoc);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return getDefaultSettings();
  }

  return normalizeSettings(snap.data() || {});
}

async function writeSettingsDoc(settings) {
  const ctx = await getFirestoreContext();
  if (!ctx.connected || !ctx.db || !ctx.fns) {
    throw new Error("Firestore unavailable while saving settings.");
  }

  const { doc, setDoc, serverTimestamp } = ctx.fns;
  const normalized = normalizeSettings(settings);

  await setDoc(
    doc(ctx.db, COLLECTIONS.settingsCollection, COLLECTIONS.settingsDoc),
    {
      ...normalized,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return normalized;
}

/* -------------------------
   USER LOGIN STORAGE
------------------------- */
export async function loadUsers() {
  try {
    const users = await readCollection(COLLECTIONS.users);
    const normalized = users.map(normalizeUserRecord).filter(isValidUserRecord);
    setArray(KEYS.fleetUsersCache, normalized);
    return normalized;
  } catch (error) {
    console.error("loadUsers failed, falling back to localStorage:", error);
    return getArray(KEYS.fleetUsersCache).map(normalizeUserRecord).filter(isValidUserRecord);
  }
}

export async function saveUsers(users) {
  const normalized = safeArray(users)
    .map(normalizeUserRecord)
    .filter(isValidUserRecord);

  try {
    const synced = await syncCollection(COLLECTIONS.users, normalized);
    setArray(KEYS.fleetUsersCache, synced);
    return synced;
  } catch (error) {
    console.error("saveUsers failed, saving to localStorage fallback:", error);
    setArray(KEYS.fleetUsersCache, normalized);
    return normalized;
  }
}

export async function ensureDefaultUser() {
  const users = await loadUsers();

  if (users.length) {
    const repaired = users.map(user =>
      normalizeRole(user.role) === "admin"
        ? {
            ...user,
            active: true,
            permissions: getPermissionsForRole("admin")
          }
        : user
    );

    return saveUsers(repaired);
  }

  const defaultAdmin = normalizeUserRecord({
    id: "admin",
    username: "admin",
    password: "admin",
    role: "admin",
    firstName: "",
    lastName: "",
    active: true,
    permissions: getPermissionsForRole("admin")
  });

  return saveUsers([defaultAdmin]);
}

export async function createUser(user) {
  const users = await loadUsers();
  const cleanUser = normalizeUserRecord(user);

  const exists = users.some(
    existing => normalizeString(existing.username).toLowerCase() === cleanUser.username.toLowerCase()
  );

  if (exists) {
    throw new Error("A user with that username already exists.");
  }

  return saveUsers([...users, cleanUser]);
}

export async function updateUser(updatedUser) {
  const users = await loadUsers();
  const cleanUser = normalizeUserRecord(updatedUser);

  const nextUsers = users.map(user =>
    normalizeString(user.id) === normalizeString(cleanUser.id)
      ? cleanUser
      : user
  );

  return saveUsers(nextUsers);
}

export async function deleteUser(userId) {
  const users = await loadUsers();
  const nextUsers = users.filter(user => normalizeString(user.id) !== normalizeString(userId));
  return saveUsers(nextUsers);
}

export async function updateStoredUserPassword(username, cleanPassword) {
  const users = await loadUsers();

  const nextUsers = users.map(user =>
    normalizeString(user.username).toLowerCase() === normalizeString(username).toLowerCase()
      ? {
          ...user,
          password: cleanPassword
        }
      : user
  );

  return saveUsers(nextUsers);
}

export async function updateUserPassword(username, newPassword) {
  return updateStoredUserPassword(username, newPassword);
}

export async function repairAdminPermissions() {
  const users = await loadUsers();

  const repairedUsers = users.map(user => {
    if (normalizeRole(user.role) === "admin") {
      return {
        ...user,
        active: true,
        permissions: getPermissionsForRole("admin")
      };
    }
    return user;
  });

  return saveUsers(repairedUsers);
}

export function getLoggedInUser() {
  return normalizeLoggedInUserValue(localStorage.getItem(KEYS.fleetLoggedInUser));
}

export function getLoggedInUsername() {
  const loggedInUser = getLoggedInUser();
  return normalizeString(loggedInUser.username);
}

export function setLoggedIn(userOrUsername = "") {
  localStorage.setItem(KEYS.fleetLoggedIn, "true");

  if (typeof userOrUsername === "string") {
    localStorage.setItem(
      KEYS.fleetLoggedInUser,
      JSON.stringify({
        username: normalizeString(userOrUsername),
        firstName: "",
        lastName: "",
        role: "",
        permissions: getDefaultPermissions()
      })
    );
    return;
  }

  const cleanUser = normalizeUserRecord(userOrUsername);
  localStorage.setItem(
    KEYS.fleetLoggedInUser,
    JSON.stringify({
      username: cleanUser.username,
      firstName: cleanUser.firstName,
      lastName: cleanUser.lastName,
      role: cleanUser.role,
      permissions: cleanUser.permissions
    })
  );
}

export function isLoggedIn() {
  return localStorage.getItem(KEYS.fleetLoggedIn) === "true";
}

export function clearLoggedIn() {
  localStorage.removeItem(KEYS.fleetLoggedIn);
  localStorage.removeItem(KEYS.fleetLoggedInUser);
}

/* Backward-compatible helpers for older code paths */
export function getStoredUser() {
  const cached = getObject(KEYS.fleetUser, { username: "admin", password: "admin" });
  return {
    username: normalizeString(cached?.username, "admin") || "admin",
    password: normalizeString(cached?.password, "admin") || "admin"
  };
}

export function saveStoredUser(user) {
  setObject(
    KEYS.fleetUser,
    {
      username: normalizeString(user?.username, "admin") || "admin",
      password: normalizeString(user?.password, "admin") || "admin"
    },
    { username: "admin", password: "admin" }
  );
}

/* -------------------------
   SETTINGS STORAGE
------------------------- */
export async function loadSettings() {
  try {
    return await readSettingsDoc();
  } catch (error) {
    console.error("loadSettings failed, falling back to localStorage:", error);

    const defaults = getDefaultSettings();
    const stored = getObject(KEYS.fleetSettings, defaults);
    return normalizeSettings(stored);
  }
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);

  try {
    await writeSettingsDoc(normalized);
  } catch (error) {
    console.error("saveSettings failed, saving to localStorage fallback:", error);
  }

  setObject(KEYS.fleetSettings, normalized, getDefaultSettings());
  return normalized;
}

/* -------------------------
   EQUIPMENT STORAGE
------------------------- */
export async function loadEquipment() {
  const settings = await loadSettings();

  try {
    const rows = await readCollection(COLLECTIONS.equipment);
    return rows.map(item => normalizeEquipmentRecord(item, settings));
  } catch (error) {
    console.error("loadEquipment failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetEquipment, [
      "equipment",
      "fleet_equipment",
      "equipmentList"
    ]).map(item => normalizeEquipmentRecord(item, settings));
  }
}

export async function saveEquipment(data) {
  const settings = await loadSettings();
  const safeData = Array.isArray(data) ? data : [];
  const normalized = safeData.map(item => normalizeEquipmentRecord(item, settings));

  try {
    const synced = await syncCollection(COLLECTIONS.equipment, normalized);
    const finalSynced = synced.map(item => normalizeEquipmentRecord(item, settings));
    writeArrayWithLegacy(KEYS.fleetEquipment, finalSynced, ["equipment"]);
    return finalSynced;
  } catch (error) {
    console.error("saveEquipment failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetEquipment, normalized, ["equipment"]);
    return normalized;
  }
}

export async function loadDeletedEquipment() {
  const settings = await loadSettings();

  try {
    const rows = await readCollection(COLLECTIONS.deletedEquipment);
    return rows.map(item => normalizeEquipmentRecord(item, settings));
  } catch (error) {
    console.error("loadDeletedEquipment failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetDeletedEquipment, [
      "deletedEquipment",
      "fleet_deleted_equipment",
      "deletedEquipmentList"
    ]).map(item => normalizeEquipmentRecord(item, settings));
  }
}

export async function saveDeletedEquipment(data) {
  const settings = await loadSettings();
  const safeData = Array.isArray(data) ? data : [];
  const normalized = safeData.map(item => normalizeEquipmentRecord(item, settings));

  try {
    const synced = await syncCollection(COLLECTIONS.deletedEquipment, normalized);
    const finalSynced = synced.map(item => normalizeEquipmentRecord(item, settings));
    writeArrayWithLegacy(KEYS.fleetDeletedEquipment, finalSynced, ["deletedEquipment"]);
    return finalSynced;
  } catch (error) {
    console.error("saveDeletedEquipment failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetDeletedEquipment, normalized, ["deletedEquipment"]);
    return normalized;
  }
}

/* -------------------------
   WORK ORDERS STORAGE
------------------------- */
export async function loadWorkOrders() {
  try {
    const rows = await readCollection(COLLECTIONS.workOrders);
    return rows.map(normalizeWorkOrderRecord);
  } catch (error) {
    console.error("loadWorkOrders failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetWorkOrders, [
      "workOrders",
      "fleet_workOrders",
      "fleetWorkorders"
    ]).map(normalizeWorkOrderRecord);
  }
}

export async function saveWorkOrders(data) {
  const safeData = Array.isArray(data) ? data : [];
  const normalized = safeData.map(normalizeWorkOrderRecord);

  try {
    const synced = await syncCollection(COLLECTIONS.workOrders, normalized);
    const finalSynced = synced.map(normalizeWorkOrderRecord);
    writeArrayWithLegacy(KEYS.fleetWorkOrders, finalSynced, ["workOrders"]);
    return finalSynced;
  } catch (error) {
    console.error("saveWorkOrders failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetWorkOrders, normalized, ["workOrders"]);
    return normalized;
  }
}

/* -------------------------
   INVENTORY STORAGE
------------------------- */
export async function loadInventory() {
  try {
    const rows = await readCollection(COLLECTIONS.inventory);
    return rows.map(normalizeInventoryRecord);
  } catch (error) {
    console.error("loadInventory failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetInventory, [
      "inventory",
      "fleet_inventory",
      "inventoryList"
    ]).map(normalizeInventoryRecord);
  }
}

export async function saveInventory(data) {
  const safeData = Array.isArray(data) ? data : [];
  const normalized = safeData.map(normalizeInventoryRecord);

  try {
    const synced = await syncCollection(COLLECTIONS.inventory, normalized);
    const finalSynced = synced.map(normalizeInventoryRecord);
    writeArrayWithLegacy(KEYS.fleetInventory, finalSynced, ["inventory"]);
    return finalSynced;
  } catch (error) {
    console.error("saveInventory failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetInventory, normalized, ["inventory"]);
    return normalized;
  }
}

/* -------------------------
   VENDORS STORAGE
------------------------- */
export async function loadVendors() {
  try {
    const rows = await readCollection(COLLECTIONS.vendors);
    return rows.map(item => normalizePlainListRecord(item, "vendor"));
  } catch (error) {
    console.error("loadVendors failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetVendors, [
      "vendors",
      "fleet_vendors",
      "vendorList"
    ]).map(item => normalizePlainListRecord(item, "vendor"));
  }
}

export async function saveVendors(data) {
  const safeData = Array.isArray(data) ? data : [];
  const normalized = safeData.map(item => normalizePlainListRecord(item, "vendor"));

  try {
    const synced = await syncCollection(COLLECTIONS.vendors, normalized);
    const finalSynced = synced.map(item => normalizePlainListRecord(item, "vendor"));
    writeArrayWithLegacy(KEYS.fleetVendors, finalSynced, ["vendors"]);
    return finalSynced;
  } catch (error) {
    console.error("saveVendors failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetVendors, normalized, ["vendors"]);
    return normalized;
  }
}

/* -------------------------
   PURCHASE ORDERS STORAGE
------------------------- */
export async function loadPurchaseOrders() {
  try {
    const rows = await readCollection(COLLECTIONS.purchaseOrders);
    return rows.map(item => normalizePlainListRecord(item, "purchaseOrder"));
  } catch (error) {
    console.error("loadPurchaseOrders failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetPurchaseOrders, [
      "purchaseOrders",
      "fleet_purchaseOrders",
      "poList"
    ]).map(item => normalizePlainListRecord(item, "purchaseOrder"));
  }
}

export async function savePurchaseOrders(data) {
  const safeData = Array.isArray(data) ? data : [];
  const normalized = safeData.map(item => normalizePlainListRecord(item, "purchaseOrder"));

  try {
    const synced = await syncCollection(COLLECTIONS.purchaseOrders, normalized);
    const finalSynced = synced.map(item => normalizePlainListRecord(item, "purchaseOrder"));
    writeArrayWithLegacy(KEYS.fleetPurchaseOrders, finalSynced, ["purchaseOrders"]);
    return finalSynced;
  } catch (error) {
    console.error("savePurchaseOrders failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetPurchaseOrders, normalized, ["purchaseOrders"]);
    return normalized;
  }
}

/* -------------------------
   GRID SETTINGS
------------------------- */
export function loadEquipmentColumns(defaults = []) {
  const columns = getArray(KEYS.fleetEquipmentColumns);
  return columns.length ? columns : (Array.isArray(defaults) ? defaults : []);
}

export function saveEquipmentColumns(columns) {
  setArray(KEYS.fleetEquipmentColumns, Array.isArray(columns) ? columns : []);
}

export function loadEquipmentGridState(defaultState = {}) {
  return getObject(KEYS.fleetEquipmentGridState, defaultState);
}

export function saveEquipmentGridSettings(columnsOrState, maybeState) {
  if (Array.isArray(columnsOrState) && maybeState && typeof maybeState === "object") {
    setArray(KEYS.fleetEquipmentColumns, columnsOrState);
    setObject(KEYS.fleetEquipmentGridState, maybeState, {});
    return;
  }

  setObject(KEYS.fleetEquipmentGridState, columnsOrState, {});
}

export function loadInventoryColumns(defaults = []) {
  const columns = getArray(KEYS.fleetInventoryColumns);
  return columns.length ? columns : (Array.isArray(defaults) ? defaults : []);
}

export function saveInventoryColumns(columns) {
  setArray(KEYS.fleetInventoryColumns, Array.isArray(columns) ? columns : []);
}

export function loadInventoryGridState(defaultState = {}) {
  return getObject(KEYS.fleetInventoryGridState, defaultState);
}

export function saveInventoryGridSettings(columnsOrState, maybeState) {
  if (Array.isArray(columnsOrState) && maybeState && typeof maybeState === "object") {
    setArray(KEYS.fleetInventoryColumns, columnsOrState);
    setObject(KEYS.fleetInventoryGridState, maybeState, {});
    return;
  }

  setObject(KEYS.fleetInventoryGridState, columnsOrState, {});
}

/* -------------------------
   OPTIONAL HELPERS FOR NEW SERVICE LAYER
------------------------- */
export async function migrateEquipmentServiceHistory() {
  const settings = await loadSettings();
  const equipment = await loadEquipment();

  const nextEquipment = equipment.map(item => ({
    ...item,
    serviceHistory: normalizeServiceHistoryMap(
      ensureEquipmentServiceHistory(item, settings)
    )
  }));

  return saveEquipment(nextEquipment);
}