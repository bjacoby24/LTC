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

let liveSyncInitPromise = null;

async function getLiveSyncContext() {
  if (liveSyncState.initialized) {
    return liveSyncState;
  }

  if (liveSyncInitPromise) {
    return liveSyncInitPromise;
  }

  liveSyncInitPromise = (async () => {
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
    } finally {
      liveSyncInitPromise = null;
    }
  })();

  return liveSyncInitPromise;
}

function safeCallback(fn, fallback = () => {}) {
  return typeof fn === "function" ? fn : fallback;
}

export async function startLiveSync(options = {}) {
  const onRemoteChange = safeCallback(options.onRemoteChange);
  const onReady = safeCallback(options.onReady);
  const onError = safeCallback(
    options.onError,
    error => console.error("[live-sync] listener error:", error)
  );

  const ctx = await getLiveSyncContext();

  if (!ctx.connected || !ctx.db || !ctx.fns) {
    console.warn("[live-sync] Firestore unavailable. Live sync not started.");
    return () => {};
  }

  const { db, fns } = ctx;
  const { doc, collection, onSnapshot } = fns;

  const unsubscribers = [];
  const initializedKeys = new Set();
  let isStopped = false;

  function markInitialSnapshotHandled(key) {
    if (!initializedKeys.has(key)) {
      initializedKeys.add(key);
      return false;
    }
    return true;
  }

  function emitRemoteChange(payload) {
    if (isStopped) return;

    try {
      onRemoteChange(payload);
    } catch (error) {
      console.error("[live-sync] onRemoteChange callback failed:", error);
    }
  }

  function handleListenerError(label, error) {
    console.error(`[live-sync] ${label} listener error:`, error);

    try {
      onError(error);
    } catch (callbackError) {
      console.error("[live-sync] onError callback failed:", callbackError);
    }
  }

  function registerDocumentListener(key, ref, label) {
    const unsubscribe = onSnapshot(
      ref,
      snapshot => {
        if (!snapshot || isStopped) return;
        if (snapshot.metadata?.hasPendingWrites) return;

        const isReadyForRemoteEvents = markInitialSnapshotHandled(key);
        if (!isReadyForRemoteEvents) return;

        emitRemoteChange({
          key,
          type: "document",
          label,
          fromCache: !!snapshot.metadata?.fromCache,
          exists: typeof snapshot.exists === "function" ? snapshot.exists() : true
        });
      },
      error => handleListenerError(label, error)
    );

    unsubscribers.push(unsubscribe);
  }

  function registerCollectionListener(key, ref, label) {
    const unsubscribe = onSnapshot(
      ref,
      snapshot => {
        if (!snapshot || isStopped) return;
        if (snapshot.metadata?.hasPendingWrites) return;

        const isReadyForRemoteEvents = markInitialSnapshotHandled(key);
        if (!isReadyForRemoteEvents) return;

        const changes =
          typeof snapshot.docChanges === "function"
            ? snapshot.docChanges()
            : [];

        if (!changes.length) return;

        emitRemoteChange({
          key,
          type: "collection",
          label,
          fromCache: !!snapshot.metadata?.fromCache,
          size: typeof snapshot.size === "number" ? snapshot.size : 0,
          changes: changes.map(change => ({
            type: change.type,
            id: change.doc?.id || "",
            hasPendingWrites: !!change.doc?.metadata?.hasPendingWrites,
            fromCache: !!change.doc?.metadata?.fromCache
          }))
        });
      },
      error => handleListenerError(label, error)
    );

    unsubscribers.push(unsubscribe);
  }

  registerDocumentListener(
    "settings",
    doc(db, SETTINGS_COLLECTION, SETTINGS_DOC),
    "settings"
  );

  for (const collectionName of LIVE_COLLECTIONS) {
    registerCollectionListener(
      collectionName,
      collection(db, collectionName),
      collectionName
    );
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
    if (isStopped) return;
    isStopped = true;

    for (const unsubscribe of unsubscribers) {
      try {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      } catch (error) {
        console.error("[live-sync] unsubscribe failed:", error);
      }
    }
  };
}