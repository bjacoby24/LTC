import { initFirebase } from "../firebase-config.js";

const SETTINGS_COLLECTION = "appData";
const SETTINGS_DOC = "settings";

const LIVE_COLLECTIONS = [
  "equipment",
  "deletedEquipment",
  "workOrders",
  "inventory",
  "vendors",
  "purchaseOrders",
  "users"
];

let liveSyncState = {
  initialized: false,
  connected: false,
  db: null,
  fns: null
};

async function getLiveSyncContext() {
  if (liveSyncState.initialized) {
    return liveSyncState;
  }

  try {
    const firebaseResult = await initFirebase();

    if (!firebaseResult?.connected || !firebaseResult?.db) {
      throw new Error("Firebase is not connected.");
    }

    const firestoreModule = await import(
      "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js"
    );

    liveSyncState = {
      initialized: true,
      connected: true,
      db: firebaseResult.db,
      fns: {
        doc: firestoreModule.doc,
        collection: firestoreModule.collection,
        onSnapshot: firestoreModule.onSnapshot
      }
    };

    return liveSyncState;
  } catch (error) {
    console.error("[live-sync] Firestore initialization failed:", error);

    liveSyncState = {
      initialized: true,
      connected: false,
      db: null,
      fns: null
    };

    return liveSyncState;
  }
}

export async function startLiveSync(options = {}) {
  const onRemoteChange =
    typeof options.onRemoteChange === "function"
      ? options.onRemoteChange
      : () => {};

  const onReady =
    typeof options.onReady === "function"
      ? options.onReady
      : () => {};

  const onError =
    typeof options.onError === "function"
      ? options.onError
      : error => console.error("[live-sync] listener error:", error);

  const ctx = await getLiveSyncContext();

  if (!ctx.connected || !ctx.db || !ctx.fns) {
    console.warn("[live-sync] Firestore unavailable. Live sync not started.");
    return () => {};
  }

  const { db, fns } = ctx;
  const { doc, collection, onSnapshot } = fns;

  const unsubscribers = [];
  const initializedKeys = new Set();

  function shouldIgnoreInitialSnapshot(key) {
    if (!initializedKeys.has(key)) {
      initializedKeys.add(key);
      return true;
    }
    return false;
  }

  function emitRemoteChange(payload) {
    try {
      onRemoteChange(payload);
    } catch (error) {
      console.error("[live-sync] onRemoteChange callback failed:", error);
    }
  }

  function registerDocumentListener(key, ref, label) {
    const unsubscribe = onSnapshot(
      ref,
      snapshot => {
        if (!snapshot) return;
        if (snapshot.metadata?.hasPendingWrites) return;
        if (shouldIgnoreInitialSnapshot(key)) return;

        emitRemoteChange({
          key,
          type: "document",
          label,
          fromCache: !!snapshot.metadata?.fromCache,
          exists: typeof snapshot.exists === "function" ? snapshot.exists() : true
        });
      },
      error => {
        console.error(`[live-sync] ${label} listener error:`, error);
        onError(error);
      }
    );

    unsubscribers.push(unsubscribe);
  }

  function registerCollectionListener(key, ref, label) {
    const unsubscribe = onSnapshot(
      ref,
      snapshot => {
        if (!snapshot) return;
        if (snapshot.metadata?.hasPendingWrites) return;
        if (shouldIgnoreInitialSnapshot(key)) return;

        emitRemoteChange({
          key,
          type: "collection",
          label,
          fromCache: !!snapshot.metadata?.fromCache,
          size: typeof snapshot.size === "number" ? snapshot.size : 0
        });
      },
      error => {
        console.error(`[live-sync] ${label} listener error:`, error);
        onError(error);
      }
    );

    unsubscribers.push(unsubscribe);
  }

  const settingsRef = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC);
  registerDocumentListener("settings", settingsRef, "settings");

  for (const collectionName of LIVE_COLLECTIONS) {
    const collectionRef = collection(db, collectionName);
    registerCollectionListener(collectionName, collectionRef, collectionName);
  }

  try {
    onReady({
      watched: ["settings", ...LIVE_COLLECTIONS]
    });
  } catch (error) {
    console.error("[live-sync] onReady callback failed:", error);
  }

  console.log("[live-sync] started");

  return () => {
    for (const unsubscribe of unsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        console.error("[live-sync] unsubscribe failed:", error);
      }
    }
  };
}