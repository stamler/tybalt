import firebase from "firebase/app";
import "firebase/functions";
import "firebase/firestore";
import "firebase/auth";
import "firebase/storage";

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyCZpTxn-kK2zEpG7rlXn_eGsFHa4xmuVPM",
  authDomain: "charade-ca63f.firebaseapp.com",
  databaseURL: "https://charade-ca63f.firebaseio.com",
  projectId: "charade-ca63f",
  storageBucket: "charade-ca63f.appspot.com",
  messagingSenderId: "1033101603088"
});

const USE_EMULATORS = true;
const db = firebase.firestore();
if (location.hostname === "localhost" && USE_EMULATORS) {
  db.settings({
    host: "localhost:8080",
    ssl: false
  });
  firebase.functions().useFunctionsEmulator("http://localhost:5001");
}

export default firebase;