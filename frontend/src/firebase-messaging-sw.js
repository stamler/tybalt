importScripts("https://www.gstatic.com/firebasejs/8.2.4/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.2.4/firebase-messaging.js");

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

const messaging = firebase.messaging();