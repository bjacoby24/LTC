import { initFirebase } from "../firebase-config.js";

const KEYS = {
  fleetUser: "fleetUser",
  fleetLoggedIn: "fleetLoggedIn",
  fleetLoggedInUser: "fleetLoggedInUser",

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
  purchaseOrders: "purchaseOrders"
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
    milesNoticeValue: normalizeString(task.milesNoticeValue, "0") || "0"
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
    serviceTemplates,
    serviceTasks
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

  const {
    collection,
    getDocs,
    doc,
    writeBatch,
    serverTimestamp
  } = ctx.fns;

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
export function ensureDefaultUser() {
  const existing = getStoredUser();

  if (!existing || !existing.username || !existing.password) {
    localStorage.setItem(
      KEYS.fleetUser,
      JSON.stringify({
        username: "admin",
        password: "admin"
      })
    );
  }
}

export function getStoredUser() {
  const user = getObject(KEYS.fleetUser, { username: "admin", password: "admin" });

  return {
    username: normalizeString(user.username, "admin") || "admin",
    password: normalizeString(user.password, "admin") || "admin"
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

export function setLoggedIn(username = "") {
  localStorage.setItem(KEYS.fleetLoggedIn, "true");
  localStorage.setItem(KEYS.fleetLoggedInUser, normalizeString(username));
}

export function isLoggedIn() {
  return localStorage.getItem(KEYS.fleetLoggedIn) === "true";
}

export function clearLoggedIn() {
  localStorage.removeItem(KEYS.fleetLoggedIn);
  localStorage.removeItem(KEYS.fleetLoggedInUser);
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
  try {
    return await readCollection(COLLECTIONS.equipment);
  } catch (error) {
    console.error("loadEquipment failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetEquipment, [
      "equipment",
      "fleet_equipment",
      "equipmentList"
    ]);
  }
}

export async function saveEquipment(data) {
  const safeData = Array.isArray(data) ? data : [];

  try {
    const synced = await syncCollection(COLLECTIONS.equipment, safeData);
    writeArrayWithLegacy(KEYS.fleetEquipment, synced, ["equipment"]);
    return synced;
  } catch (error) {
    console.error("saveEquipment failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetEquipment, safeData, ["equipment"]);
    return safeData;
  }
}

export async function loadDeletedEquipment() {
  try {
    return await readCollection(COLLECTIONS.deletedEquipment);
  } catch (error) {
    console.error("loadDeletedEquipment failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetDeletedEquipment, [
      "deletedEquipment",
      "fleet_deleted_equipment",
      "deletedEquipmentList"
    ]);
  }
}

export async function saveDeletedEquipment(data) {
  const safeData = Array.isArray(data) ? data : [];

  try {
    const synced = await syncCollection(COLLECTIONS.deletedEquipment, safeData);
    writeArrayWithLegacy(KEYS.fleetDeletedEquipment, synced, ["deletedEquipment"]);
    return synced;
  } catch (error) {
    console.error("saveDeletedEquipment failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetDeletedEquipment, safeData, ["deletedEquipment"]);
    return safeData;
  }
}

/* -------------------------
   WORK ORDERS STORAGE
------------------------- */
export async function loadWorkOrders() {
  try {
    return await readCollection(COLLECTIONS.workOrders);
  } catch (error) {
    console.error("loadWorkOrders failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetWorkOrders, [
      "workOrders",
      "fleet_workOrders",
      "fleetWorkorders"
    ]);
  }
}

export async function saveWorkOrders(data) {
  const safeData = Array.isArray(data) ? data : [];

  try {
    const synced = await syncCollection(COLLECTIONS.workOrders, safeData);
    writeArrayWithLegacy(KEYS.fleetWorkOrders, synced, ["workOrders"]);
    return synced;
  } catch (error) {
    console.error("saveWorkOrders failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetWorkOrders, safeData, ["workOrders"]);
    return safeData;
  }
}

/* -------------------------
   INVENTORY STORAGE
------------------------- */
export async function loadInventory() {
  try {
    return await readCollection(COLLECTIONS.inventory);
  } catch (error) {
    console.error("loadInventory failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetInventory, [
      "inventory",
      "fleet_inventory",
      "inventoryList"
    ]);
  }
}

export async function saveInventory(data) {
  const safeData = Array.isArray(data) ? data : [];

  try {
    const synced = await syncCollection(COLLECTIONS.inventory, safeData);
    writeArrayWithLegacy(KEYS.fleetInventory, synced, ["inventory"]);
    return synced;
  } catch (error) {
    console.error("saveInventory failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetInventory, safeData, ["inventory"]);
    return safeData;
  }
}

/* -------------------------
   VENDORS STORAGE
------------------------- */
export async function loadVendors() {
  try {
    return await readCollection(COLLECTIONS.vendors);
  } catch (error) {
    console.error("loadVendors failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetVendors, [
      "vendors",
      "fleet_vendors",
      "vendorList"
    ]);
  }
}

export async function saveVendors(data) {
  const safeData = Array.isArray(data) ? data : [];

  try {
    const synced = await syncCollection(COLLECTIONS.vendors, safeData);
    writeArrayWithLegacy(KEYS.fleetVendors, synced, ["vendors"]);
    return synced;
  } catch (error) {
    console.error("saveVendors failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetVendors, safeData, ["vendors"]);
    return safeData;
  }
}

/* -------------------------
   PURCHASE ORDERS STORAGE
------------------------- */
export async function loadPurchaseOrders() {
  try {
    return await readCollection(COLLECTIONS.purchaseOrders);
  } catch (error) {
    console.error("loadPurchaseOrders failed, falling back to localStorage:", error);

    return migrateArrayKey(KEYS.fleetPurchaseOrders, [
      "purchaseOrders",
      "fleet_purchaseOrders",
      "poList"
    ]);
  }
}

export async function savePurchaseOrders(data) {
  const safeData = Array.isArray(data) ? data : [];

  try {
    const synced = await syncCollection(COLLECTIONS.purchaseOrders, safeData);
    writeArrayWithLegacy(KEYS.fleetPurchaseOrders, synced, ["purchaseOrders"]);
    return synced;
  } catch (error) {
    console.error("savePurchaseOrders failed, saving to localStorage fallback:", error);
    writeArrayWithLegacy(KEYS.fleetPurchaseOrders, safeData, ["purchaseOrders"]);
    return safeData;
  }
}

/* -------------------------
   ONE-TIME LOCAL -> FIRESTORE MIGRATION
------------------------- */
export async function migrateLocalDataToFirestore() {
  const localSettings = getObject(KEYS.fleetSettings, getDefaultSettings());

  const localEquipment = migrateArrayKey(KEYS.fleetEquipment, [
    "equipment",
    "fleet_equipment",
    "equipmentList"
  ]);

  const localDeletedEquipment = migrateArrayKey(KEYS.fleetDeletedEquipment, [
    "deletedEquipment",
    "fleet_deleted_equipment",
    "deletedEquipmentList"
  ]);

  const localWorkOrders = migrateArrayKey(KEYS.fleetWorkOrders, [
    "workOrders",
    "fleet_workOrders",
    "fleetWorkorders"
  ]);

  const localInventory = migrateArrayKey(KEYS.fleetInventory, [
    "inventory",
    "fleet_inventory",
    "inventoryList"
  ]);

  const localVendors = migrateArrayKey(KEYS.fleetVendors, [
    "vendors",
    "fleet_vendors",
    "vendorList"
  ]);

  const localPurchaseOrders = migrateArrayKey(KEYS.fleetPurchaseOrders, [
    "purchaseOrders",
    "fleet_purchaseOrders",
    "poList"
  ]);

  await saveSettings(localSettings);
  await saveEquipment(localEquipment);
  await saveDeletedEquipment(localDeletedEquipment);
  await saveWorkOrders(localWorkOrders);
  await saveInventory(localInventory);
  await saveVendors(localVendors);
  await savePurchaseOrders(localPurchaseOrders);

  return {
    success: true,
    migrated: {
      settings: true,
      equipment: localEquipment.length,
      deletedEquipment: localDeletedEquipment.length,
      workOrders: localWorkOrders.length,
      inventory: localInventory.length,
      vendors: localVendors.length,
      purchaseOrders: localPurchaseOrders.length
    }
  };
}

/* -------------------------
   OPTIONAL REAL-TIME LISTENERS
------------------------- */
export async function subscribeToCollection(collectionName, callback) {
  const ctx = await getFirestoreContext();

  if (!ctx.connected || !ctx.db || !ctx.fns || typeof callback !== "function") {
    return () => {};
  }

  const { collection, onSnapshot } = ctx.fns;

  return onSnapshot(collection(ctx.db, collectionName), snapshot => {
    const rows = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    callback(rows);
  });
}

export async function subscribeToEquipment(callback) {
  return subscribeToCollection(COLLECTIONS.equipment, callback);
}

export async function subscribeToDeletedEquipment(callback) {
  return subscribeToCollection(COLLECTIONS.deletedEquipment, callback);
}

export async function subscribeToInventory(callback) {
  return subscribeToCollection(COLLECTIONS.inventory, callback);
}

export async function subscribeToVendors(callback) {
  return subscribeToCollection(COLLECTIONS.vendors, callback);
}

export async function subscribeToWorkOrders(callback) {
  return subscribeToCollection(COLLECTIONS.workOrders, callback);
}

export async function subscribeToPurchaseOrders(callback) {
  return subscribeToCollection(COLLECTIONS.purchaseOrders, callback);
}

/* -------------------------
   EQUIPMENT GRID / COLUMN SETTINGS
------------------------- */
export function loadEquipmentColumns(defaultColumns = []) {
  const saved =
    safeParse(localStorage.getItem(KEYS.fleetEquipmentColumns), null) ??
    safeParse(localStorage.getItem("equipmentColumns"), defaultColumns);

  return Array.isArray(saved) ? saved : defaultColumns;
}

export function loadEquipmentGridState(defaultState = {}) {
  const saved =
    safeParse(localStorage.getItem(KEYS.fleetEquipmentGridState), null) ??
    safeParse(localStorage.getItem("equipmentGridState"), defaultState);

  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved
    : defaultState;
}

export function saveEquipmentGridSettings(columns, state) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeState =
    state && typeof state === "object" && !Array.isArray(state) ? state : {};

  localStorage.setItem(KEYS.fleetEquipmentColumns, JSON.stringify(safeColumns));
  localStorage.setItem(KEYS.fleetEquipmentGridState, JSON.stringify(safeState));

  localStorage.setItem("equipmentColumns", JSON.stringify(safeColumns));
  localStorage.setItem("equipmentGridState", JSON.stringify(safeState));
}

/* -------------------------
   INVENTORY GRID / COLUMN SETTINGS
------------------------- */
export function loadInventoryColumns(defaultColumns = []) {
  const saved =
    safeParse(localStorage.getItem(KEYS.fleetInventoryColumns), null) ??
    safeParse(localStorage.getItem("inventoryColumns"), defaultColumns);

  return Array.isArray(saved) ? saved : defaultColumns;
}

export function loadInventoryGridState(defaultState = {}) {
  const saved =
    safeParse(localStorage.getItem(KEYS.fleetInventoryGridState), null) ??
    safeParse(localStorage.getItem("inventoryGridState"), defaultState);

  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved
    : defaultState;
}

export function saveInventoryGridSettings(columns, state) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeState =
    state && typeof state === "object" && !Array.isArray(state) ? state : {};

  localStorage.setItem(KEYS.fleetInventoryColumns, JSON.stringify(safeColumns));
  localStorage.setItem(KEYS.fleetInventoryGridState, JSON.stringify(safeState));

  localStorage.setItem("inventoryColumns", JSON.stringify(safeColumns));
  localStorage.setItem("inventoryGridState", JSON.stringify(safeState));
}