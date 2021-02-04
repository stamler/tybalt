import Vue from "vue";
import { firestorePlugin } from "vuefire";
Vue.config.productionTip = false;
Vue.use(firestorePlugin);

// first import is here to initializeApp()
import firebase from "./firebase";
import App from "./App.vue";
import router from "./router";
import store from "./store";
const db = firebase.firestore();

interface MicrosoftProfile {
  givenName: string;
  surname: string;
  id: string;
  jobTitle: string;
  mobilePhone: string;
  [key: string]: string;
}

let app: Vue | null = null;

// https://github.com/firebase/quickstart-js/blob/master/auth/microsoft-redirect.html
/* Handle the redirect extracting a token if it exists */
firebase
  .auth()
  .getRedirectResult()
  .then(async (result) => {
    // get token and call graph to load first name, last name
    // and other important data, then save it to the profile
    // https://firebase.google.com/docs/auth/web/microsoft-oauth
    const updateProfileFromMSGraph = firebase
      .functions()
      .httpsCallable("updateProfileFromMSGraph");

    const credential = result.credential as firebase.auth.OAuthCredential;

    updateProfileFromMSGraph({
      accessToken: credential.accessToken,
    }).catch((error) => alert(`Update from MS Graph failed: ${error}`));
  })
  .catch(function (error) {
    if (error.code === "auth/account-exists-with-different-credential") {
      alert(
        `You have already signed up with a different auth provider for email ${error.email}.`
      );
      // If you are using multiple auth providers on your app you should handle linking
      // the user's accounts here.
    } else if (error.code === "auth/timeout") {
      history.go();
    } else {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  });

const unsubscribe = firebase.auth().onAuthStateChanged(async function (user) {
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
        .then((token) => store.commit("setClaims", token.claims))
    );
    Promise.all(tasks).then(() => {
      if (!app) {
        app = new Vue({
          router,
          store,
          render: (h) => h(App), // h is an alias for createElement
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
