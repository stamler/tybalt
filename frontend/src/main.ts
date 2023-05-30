/*
 * @Author: Dean Stamler
 * @Date: 2018-01-01 12:00:00
 * @Last Modified by: Dean Stamler
 * @Last Modified time: 2023-02-17 12:57:26
 */

// import Vue from "vue";
import { App, createApp } from "vue";
import { VueFire, VueFireFirestoreOptionsAPI } from "vuefire";
import InstantSearch from "vue-instantsearch/vue3/es";
import { MICROSOFT_TENANT_ID } from "./config";
// Vue.config.productionTip = false;
// Vue.use(InstantSearch);

// first import is here to initializeApp()
import firebase from "./firebase";
import AppRootComponent from "./App.vue";
import router from "./router";
// import { PiniaVuePlugin } from "pinia";
// Vue.use(PiniaVuePlugin);
import { pinia } from "./piniainit";
import { useStateStore } from "./stores/state";
import { subDays } from "date-fns";

let app: App;

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

    if (credential) {
      updateProfileFromMSGraph({
        accessToken: credential.accessToken,
      }).catch((error) => alert(`Update from MS Graph failed: ${error}`));
    } else {
      const currentUser = firebase.auth().currentUser;
      if (currentUser !== null) {
        // Validate the age of the profile
        // sign out if the profile is missing msGraphDataUpdated
        // or it was updated more than 7 days ago
        const db = firebase.firestore();
        const snap = await db.collection("Profiles").doc(currentUser.uid).get();
        const profile = snap.data();

        if (
          profile !== undefined &&
          (profile.msGraphDataUpdated === undefined ||
            profile.msGraphDataUpdated.toDate() < subDays(new Date(), 7))
        ) {
          alert("Your profile needs an update. Please sign back in.");
          signOut();
        }
      }
    }
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
    // set state and user in pinia
    const tasks = [];

    // load initial state from the database
    const store = useStateStore(pinia);

    // get the expense rates and store them in the store
    const getExpenseRates = firebase.functions().httpsCallable("expenseRates");
    tasks.push(
      getExpenseRates().then((result) => store.setExpenseRates(result.data))
    );

    // TODO: Vuex won't survive a page reload and this code won't be
    // retriggered if the user is still signed in, meaning the state will
    // disappear breaking the app. Further since components are loaded
    // by the router, any component which depends on state will fail on
    // app load.
    // TODO: avoid casting to firebase.User
    tasks.push(store.setUser(firebase.auth().currentUser as firebase.User));
    tasks.push(
      // Using true here will force a refresh of the token test this to see if a
      // simple refresh will suffice instead of logging out after claims are
      // updated, then figure out how to refresh the token in the background
      // periodically without logging out
      // https://firebase.google.com/docs/auth/admin/custom-claims
      // https://firebase.google.com/docs/reference/js/auth.user.md#usergetidtokenresult
      user.getIdTokenResult(true).then((token) => store.setClaims(token.claims))
    );
    Promise.all(tasks).then(() => {
      if (!app) {
        app = createApp(AppRootComponent);
        app.use(router);
        app.use(pinia);
        app.use(InstantSearch);
        app.use(VueFire, { modules: [VueFireFirestoreOptionsAPI()] }); // Use this module for $firestoreBind
        app.mount("#app");
      }
    });
  } else {
    const provider = new firebase.auth.OAuthProvider("microsoft.com");
    provider.setCustomParameters({ tenant: MICROSOFT_TENANT_ID });
    // https://stackoverflow.com/questions/41055699/why-does-firebase-auth-work-for-chrome-but-not-firefox
    // signInWithRedirect can have issues in Firefox and other browsers
    // signInWithPopup can be used instead. Disabling enhanced tracking
    // protection in Firefox can sometimes resolve the issue.
    firebase.auth().signInWithRedirect(provider);
  }
});

export function signOut(): void {
  unsubscribe();
  firebase.auth().signOut();
  window.location.href = "https://login.windows.net/common/oauth2/logout";
}
