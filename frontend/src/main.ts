/*
 * @Author: Dean Stamler
 * @Date: 2018-01-01 12:00:00
 * @Last Modified by: Dean Stamler
 * @Last Modified time: 2023-10-26 13:22:18
 */

// import Vue from "vue";
import { App, createApp } from "vue";
import { VueFire, VueFireFirestoreOptionsAPI } from "vuefire";
import InstantSearch from "vue-instantsearch/vue3/es";
import { MICROSOFT_TENANT_ID } from "./config";
// Vue.config.productionTip = false;
// Vue.use(InstantSearch);

// first import is here to initializeApp()
import { firebaseApp } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  User,
  OAuthProvider,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { getFirestore, getDoc, doc } from "firebase/firestore";
import AppRootComponent from "./App.vue";
import router from "./router";
// import { PiniaVuePlugin } from "pinia";
// Vue.use(PiniaVuePlugin);
import { pinia } from "./piniainit";
import { useStateStore } from "./stores/state";
import { subDays } from "date-fns";

const functions = getFunctions(firebaseApp);
const auth = getAuth(firebaseApp);

const provider = new OAuthProvider("microsoft.com");
provider.setCustomParameters({ tenant: MICROSOFT_TENANT_ID });

let app: App;

// https://github.com/firebase/quickstart-js/blob/master/auth/microsoft-redirect.html
/* Handle the redirect extracting a token if it exists */
getRedirectResult(auth)
  .then(async (result) => {
    // get token and call graph to load first name, last name
    // and other important data, then save it to the profile
    // https://firebase.google.com/docs/auth/web/microsoft-oauth
    const updateProfileFromMSGraph = httpsCallable(
      functions,
      "updateProfileFromMSGraph"
    );

    if (result === null || OAuthProvider.credentialFromResult === null) {
      return null;
    }

    const credential = OAuthProvider.credentialFromResult(result);

    if (credential) {
      updateProfileFromMSGraph({
        accessToken: credential.accessToken,
      }).catch((error) => alert(`Update from MS Graph failed: ${error}`));
    } else {
      const currentUser = auth.currentUser;
      if (currentUser !== null) {
        // Validate the age of the profile
        // sign out if the profile is missing msGraphDataUpdated
        // or it was updated more than 7 days ago
        const db = getFirestore(firebaseApp);
        const snap = await getDoc(doc(db, "Profiles", currentUser.uid));
        const profile = snap.data();

        if (
          profile !== undefined &&
          (profile.msGraphDataUpdated === undefined ||
            profile.msGraphDataUpdated.toDate() < subDays(new Date(), 7))
        ) {
          alert("Your profile needs an update. Please sign back in.");
          signOutTybalt();
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

const unsubscribe = onAuthStateChanged(auth, async function (user) {
  if (user) {
    // console.log(`${user.displayName} is logged in`);
    // set state and user in pinia
    const tasks = [];

    // load initial state from the database
    const store = useStateStore(pinia);

    // get the expense rates and store them in the store
    const getExpenseRates = httpsCallable(functions, "expenseRates");
    tasks.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getExpenseRates().then((result: Record<string, any>) =>
        store.setExpenseRates(result.data)
      )
    );

    // TODO: Vuex won't survive a page reload and this code won't be
    // retriggered if the user is still signed in, meaning the state will
    // disappear breaking the app. Further since components are loaded
    // by the router, any component which depends on state will fail on
    // app load.
    // TODO: avoid casting to firebase.User
    tasks.push(store.setUser(auth.currentUser as User));
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
        app.use(VueFire, {
          firebaseApp,
          modules: [VueFireFirestoreOptionsAPI()],
        }); // Use this module for $firestoreBind
        app.mount("#app");
      }
    });
  } else {
    // https://stackoverflow.com/questions/41055699/why-does-firebase-auth-work-for-chrome-but-not-firefox
    // signInWithRedirect can have issues in Firefox and other browsers
    // signInWithPopup can be used instead. Disabling enhanced tracking
    // protection in Firefox can sometimes resolve the issue.
    signInWithRedirect(auth, provider);
  }
});

export function signOutTybalt(): void {
  unsubscribe();
  signOut(auth);
  window.location.href = "https://login.windows.net/common/oauth2/logout";
}
