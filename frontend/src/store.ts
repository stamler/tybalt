import firebase from "./firebase";
import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

interface TaskList {
  [key: string]: { message: string };
}

export default new Vuex.Store({
  state: {
    sidenav: false,
    user: null as firebase.User | null,
    claims: null as { [claim: string]: boolean } | null,
    activeTasks: {} as TaskList, // items to show in the progress UI element
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
      state.activeTasks[id] = { message: task.message };
      state.showTasks = true;
    },
    endTask(state, task) {
      delete state.activeTasks[task.id];
      state.showTasks = Object.keys(state.activeTasks).length > 0;
    },
    setUser(state, user: firebase.User) {
      state.user = user;
    },
    setClaims(state, claims: { [claim: string]: boolean }) {
      state.claims = claims;
    }
  },
  actions: {}
});
