import Vue from "vue";
import { firestorePlugin } from "vuefire";

Vue.config.productionTip = false;
Vue.use(firestorePlugin);

// first import is here to initializeApp()
// eslint-disable-next-line no-unused-vars
//import firebase from "./firebase";

// load auth before Vue
// eslint-disable-next-line no-unused-vars
import * as auth from "./auth";
