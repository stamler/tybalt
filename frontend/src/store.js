import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    sidenav: false,
    user: null,
    claims: null,

    // state of the waiting message system
    activeTasks: {}, // items to show in the progress UI element
    showTasks: false, // whether to display the progress UI element

    // state of the notification system
    notifications: {} // notifications to display in UI
  },
  getters: {
    // getters for the waiting message system
    // get the first message from the activeTasks object
    oneMessage: state => {
      if (state.showTasks) {
        return state.activeTasks[Object.keys(state.activeTasks)[0]].message;
      } else {
        return "";
      }
    }
  },
  mutations: {
    toggleMenu(state) {
      state.sidenav = !state.sidenav;
    },
    startTask(state, task) {
      const id = task.id;
      delete task.id;
      state.activeTasks[id] = task;
      state.showTasks = true;
    },
    endTask(state, task) {
      delete state.activeTasks[task.id];
      state.showTasks = Object.keys(state.activeTasks).length > 0;
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
