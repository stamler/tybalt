import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    user: null,
    claims: null
  },
  mutations: {
    setUser(state, user) {
      state.user = user;
    },
    setClaims(state, claims) {
      state.claims = claims;
    }
  },
  actions: {}
});
