import firebase from "@firebase/app";
import "@firebase/auth";
import "@firebase/functions";
import "@firebase/firestore";

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyCZpTxn-kK2zEpG7rlXn_eGsFHa4xmuVPM",
  authDomain: "charade-ca63f.firebaseapp.com",
  databaseURL: "https://charade-ca63f.firebaseio.com",
  projectId: "charade-ca63f",
  storageBucket: "charade-ca63f.appspot.com",
  messagingSenderId: "1033101603088"
});

export default firebase;
