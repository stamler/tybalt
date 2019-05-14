import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    appStatus: "loading",
    user: null
  },
  mutations: {
    setAppStatus(state, status) {
      state.appStatus = status;
    },
    setUser(state, user) {
      state.user = user;
    }
  },
  actions: {}
});
