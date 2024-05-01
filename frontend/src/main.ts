/*
 * @Author: Dean Stamler
 * @Date: 2018-01-01 12:00:00
 * @Last Modified by: Dean Stamler
 * @Last Modified time: 2024-05-01 15:05:46
 */

import { createApp } from "vue";
import { VueFire, VueFireFirestoreOptionsAPI } from "vuefire";
import InstantSearch from "vue-instantsearch/vue3/es";

// first import is here to initializeApp()
import { firebaseApp } from "./firebase";
import AppRootComponent from "./App.vue";
import router from "./router";
import { pinia } from "./piniainit";

const app = createApp(AppRootComponent);
app.use(router);
app.use(pinia);
app.use(InstantSearch);
app.use(VueFire, {
  firebaseApp,
  modules: [VueFireFirestoreOptionsAPI()],
}); // Use this module for $firestoreBind
app.mount("#app");
