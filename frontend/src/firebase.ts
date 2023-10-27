import { initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { initializeFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { FIREBASE_CONFIG } from "./config";
// Initialize Firebase

// Dynamic State Partitioning breaks the login flow and causes an endless loop
// if "isolate other cross-site cookies" is enabled in Firefox settings. The
// authDomain is set to match the actual custom URL of the site, replacing
// firebaseApp-ca99XX.firebaseapp.com with APP_HOSTNAME and the Azure App
// registration configuration matches.
export const firebaseApp = initializeApp(FIREBASE_CONFIG);

export const analytics = getAnalytics(firebaseApp);

const USE_EMULATORS = false;
if (location.hostname === "localhost" && USE_EMULATORS) {
  initializeFirestore(firebaseApp, {
    host: "localhost:8080",
    ssl: false,
  });
  connectFunctionsEmulator(getFunctions(firebaseApp), "localhost", 5001);
}
