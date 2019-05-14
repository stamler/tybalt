import Vue from "vue";
import { firestorePlugin } from "vuefire";
import App from "./App.vue";
import router from "./router";
import store from "./store";

// first import is here to initializeApp()
// eslint-disable-next-line no-unused-vars
import firebase from "./firebase";

// load auth before Vue
// eslint-disable-next-line no-unused-vars
import * as auth from "./auth";

Vue.config.productionTip = false;
Vue.use(firestorePlugin);

new Vue({
  router,
  store,
  render: h => h(App) // h is an alias for createElement
}).$mount("#app");
