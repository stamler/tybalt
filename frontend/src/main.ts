import Vue from "vue";
import { firestorePlugin } from "vuefire";
import InstantSearch from "vue-instantsearch";

Vue.config.productionTip = false;
Vue.use(firestorePlugin);
Vue.use(InstantSearch);

// first import is here to initializeApp()
import firebase from "./firebase";
import App from "./App.vue";
import router from "./router";
import { PiniaVuePlugin } from "pinia";
Vue.use(PiniaVuePlugin);
import { pinia } from "./piniainit";
import { useStateStore } from "./stores/state";
import { subDays } from "date-fns";

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
      user.getIdTokenResult().then((token) => store.setClaims(token.claims))
    );
    Promise.all(tasks).then(() => {
      if (!app) {
        app = new Vue({
          router,
          pinia,
          render: (h) => h(App), // h is an alias for createElement
        }).$mount("#app");
      }
    });
  } else {
    const provider = new firebase.auth.OAuthProvider("microsoft.com");
    provider.setCustomParameters({ tenant: "tbte.onmicrosoft.com" });
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
