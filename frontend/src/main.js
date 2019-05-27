import Vue from "vue";
import { firestorePlugin } from "vuefire";
Vue.config.productionTip = false;
Vue.use(firestorePlugin);

// first import is here to initializeApp()
import firebase from "@/firebase";
import App from "./App.vue";
import router from "./router";
import store from "./store";

// load auth before Vue
import * as auth from "./auth";

let app = null;

const unsubscribe = firebase.auth().onAuthStateChanged(async function(user) {
  if (user) {
    console.log(`${user.displayName} is logged in`);
    // set state and user in Vuex
    const tasks = [];
    tasks.push(store.commit("setUser", firebase.auth().currentUser));
    tasks.push(store.commit("setAppStatus", "ready"));
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
    auth.signIn();
  }
});

export function signOut() {
  unsubscribe();
  firebase.auth().signOut();
  window.location.href = "https://login.windows.net/common/oauth2/logout";
}
