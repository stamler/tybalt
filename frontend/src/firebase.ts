import firebase from "firebase/app";
import "firebase/functions";
import "firebase/firestore";
import "firebase/auth";
import "firebase/storage";
import "firebase/messaging";

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyCZpTxn-kK2zEpG7rlXn_eGsFHa4xmuVPM",
  authDomain: "charade-ca63f.firebaseapp.com",
  databaseURL: "https://charade-ca63f.firebaseio.com",
  projectId: "charade-ca63f",
  storageBucket: "charade-ca63f.appspot.com",
  messagingSenderId: "1033101603088",
  appId: "1:1033101603088:web:805b8fd493e12cd44db595"
});


// TODO:
// https://blog.mozilla.org/firefox/block-notification-requests/
// https://stackoverflow.com/questions/61475486/notification-requestpermission-throwing-error-on-mozilla
// https://developer.mozilla.org/en-US/docs/Web/API/Notification
// https://github.com/firebase/firebase-js-sdk/issues/1260
// Firefox kills notification requests and puts them in the corner
// without user interaction.
// This would require double-opt-in
// Instead, perhaps install the service-worker in settings

// Check existing permission with Notification.permission


// setup messaging
if (firebase.messaging.isSupported()) {
  const messaging = firebase.messaging();
  messaging
    .getToken()
    .then((token) => {
      // TODO: send this token to the database (likely the Profile doc)
      // so that our notifications will reach this user
      alert(token);
    })
    .catch((err) => {
      alert(err);
    });
}

const USE_EMULATORS = false;
const db = firebase.firestore();
if (location.hostname === "localhost" && USE_EMULATORS) {
  db.settings({
    host: "localhost:8080",
    ssl: false
  });
  firebase.functions().useFunctionsEmulator("http://localhost:5001");
}

export default firebase;
