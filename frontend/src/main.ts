import Vue from "vue";
import { firestorePlugin } from "vuefire";
Vue.config.productionTip = false;
Vue.use(firestorePlugin);

// first import is here to initializeApp()
import firebase from "./firebase";
import App from "./App.vue";
import router from "./router";
import store from "./store";

let app: Vue | null = null;

// https://github.com/firebase/quickstart-js/blob/master/auth/microsoft-redirect.html
/* Handle the redirect extracting a token if it exists */
firebase
  .auth()
  .getRedirectResult()
  .then(function(result: firebase.auth.UserCredential) {
    const credential = result.credential as firebase.auth.OAuthCredential;
    if (result.credential) {
      const token = credential.accessToken;
      const idToken = credential.idToken;
    }
    const user = result.user;
    //console.log(user);
  })
  .catch(function(error) {
    const errorCode = error.code;
    const errorMessage = error.message;
    const email = error.email;
    const credential = error.credential;
    if (errorCode === "auth/account-exists-with-different-credential") {
      alert(
        "You have already signed up with a different auth provider for that email."
      );
      // If you are using multiple auth providers on your app you should handle linking
      // the user's accounts here.
    } else {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  });

const unsubscribe = firebase.auth().onAuthStateChanged(async function(user) {
  if (user) {
    // console.log(`${user.displayName} is logged in`);
    // set state and user in Vuex
    const tasks = [];
    // TODO: Vuex won't survive a page reload and this code won't be
    // retriggered if the user is still signed in, meaning the state will
    // disappear breaking the app. Further since components are loaded
    // by the router, any component which depends on state will fail on
    // app load.
    tasks.push(store.commit("setUser", firebase.auth().currentUser));
    tasks.push(
      user
        .getIdTokenResult()
        .then(token => store.commit("setClaims", token.claims))
    );
    Promise.all(tasks).then(() => {
      if (!app) {
        app = new Vue({
          router,
          store,
          render: h => h(App) // h is an alias for createElement
        }).$mount("#app");
      }
    });
  } else {
    const provider = new firebase.auth.OAuthProvider("microsoft.com");
    provider.setCustomParameters({ tenant: "tbte.onmicrosoft.com" });
    firebase.auth().signInWithRedirect(provider);
  }
});

export function signOut() {
  unsubscribe();
  firebase.auth().signOut();
  window.location.href = "https://login.windows.net/common/oauth2/logout";
}
