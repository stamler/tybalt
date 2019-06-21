import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    sidenav: false,
    user: null,
    claims: null
  },
  mutations: {
    toggleMenu(state) {
      state.sidenav = !state.sidenav;
    },
    setUser(state, user) {
      state.user = user;
    },
    setClaims(state, claims) {
      state.claims = claims;
    }
  },
  actions: {}
});
