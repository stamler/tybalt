import firebase from "firebase/compat/app";
import "firebase/compat/functions";
import "firebase/compat/firestore";
import "firebase/compat/auth";
import "firebase/compat/storage";
import "firebase/compat/analytics";

// Initialize Firebase

// Dynamic State Partitioning breaks the login flow and causes an endless loop
// if "isolate other cross-site cookies" is enabled in Firefox settings. The
// authDomain is set to match the actual custom URL of the site, replacing
// charade-ca63f.firebaseapp.com with tybalt.tbte.ca and the Azure App
// registration configuration matches.
firebase.initializeApp({
  apiKey: "AIzaSyCZpTxn-kK2zEpG7rlXn_eGsFHa4xmuVPM",
  authDomain: "tybalt.tbte.ca", // include https://tybalt.tbte.ca/__/auth/handler in Azure App registration "Redirect URIs"
  databaseURL: "https://charade-ca63f.firebaseio.com",
  projectId: "charade-ca63f",
  storageBucket: "charade-ca63f.appspot.com",
  messagingSenderId: "1033101603088",
  appId: "1:1033101603088:web:805b8fd493e12cd44db595",
  measurementId: "G-Y8GRRSDLZD",
});

export const analytics = firebase.analytics();

const USE_EMULATORS = false;
const db = firebase.firestore();
if (location.hostname === "localhost" && USE_EMULATORS) {
  db.settings({
    host: "localhost:8080",
    ssl: false,
  });
  firebase.functions().useFunctionsEmulator("http://localhost:5001");
}

export default firebase;
