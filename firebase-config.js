let firebaseApp = null;
let firestoreDb = null;
let firebaseStorage = null;
let firebaseModulesLoaded = false;
let firebaseInitPromise = null;

const firebaseConfig = {
  apiKey: "AIzaSyACM4i55IMGBYvtMouDSNNDM7wUvCKS6ks",
  authDomain: "ltc-program.firebaseapp.com",
  projectId: "ltc-program",
  storageBucket: "ltc-program.firebasestorage.app",
  messagingSenderId: "822971953923",
  appId: "1:822971953923:web:575bc7e6c1dfcd6deb6f36"
};

async function loadFirebaseModules() {
  if (firebaseModulesLoaded && firebaseApp && firestoreDb) {
    return {
      app: firebaseApp,
      db: firestoreDb,
      storage: firebaseStorage
    };
  }

  if (firebaseInitPromise) {
    return firebaseInitPromise;
  }

  firebaseInitPromise = (async () => {
    try {
      const [
        firebaseAppModule,
        firestoreModule,
        storageModule
      ] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js")
      ]);

      const { initializeApp, getApps, getApp } = firebaseAppModule;
      const { getFirestore } = firestoreModule;
      const { getStorage } = storageModule;

      firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
      firestoreDb = getFirestore(firebaseApp);
      firebaseStorage = getStorage(firebaseApp);
      firebaseModulesLoaded = true;

      return {
        app: firebaseApp,
        db: firestoreDb,
        storage: firebaseStorage
      };
    } catch (error) {
      firebaseModulesLoaded = false;
      firebaseApp = null;
      firestoreDb = null;
      firebaseStorage = null;
      throw error;
    } finally {
      firebaseInitPromise = null;
    }
  })();

  return firebaseInitPromise;
}

export async function initFirebase() {
  try {
    const services = await loadFirebaseModules();

    return {
      app: services.app,
      db: services.db,
      storage: services.storage,
      connected: !!services.app && !!services.db
    };
  } catch (error) {
    console.error("Firebase failed to initialize:", error);

    return {
      app: null,
      db: null,
      storage: null,
      connected: false,
      error
    };
  }
}

export async function getFirebaseServices() {
  try {
    const services = await loadFirebaseModules();

    return {
      app: services.app,
      db: services.db,
      storage: services.storage,
      connected: !!services.app && !!services.db
    };
  } catch (error) {
    console.error("Failed to get Firebase services:", error);

    return {
      app: null,
      db: null,
      storage: null,
      connected: false,
      error
    };
  }
}