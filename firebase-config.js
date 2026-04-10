let firebaseApp = null;
let firestoreDb = null;
let firebaseStorage = null;
let firebaseModulesLoaded = false;

const firebaseConfig = {
  apiKey: "AIzaSyACM4i55IMGBYvtMouDSNNDM7wUvCKS6ks",
  authDomain: "ltc-program.firebaseapp.com",
  projectId: "ltc-program",
  storageBucket: "ltc-program.firebasestorage.app",
  messagingSenderId: "822971953923",
  appId: "1:822971953923:web:575bc7e6c1dfcd6deb6f36"
};

async function loadFirebaseModules() {
  if (firebaseModulesLoaded) {
    return;
  }

  const [{ initializeApp }, { getFirestore }, { getStorage }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js")
  ]);

  firebaseApp = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(firebaseApp);
  firebaseStorage = getStorage(firebaseApp);
  firebaseModulesLoaded = true;
}

export async function initFirebase() {
  try {
    await loadFirebaseModules();

    return {
      app: firebaseApp,
      db: firestoreDb,
      storage: firebaseStorage,
      connected: true
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
  if (!firebaseModulesLoaded) {
    await loadFirebaseModules();
  }

  return {
    app: firebaseApp,
    db: firestoreDb,
    storage: firebaseStorage
  };
}