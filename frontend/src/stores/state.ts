import firebase from "../firebase";
import { defineStore } from "pinia";

interface TaskList {
  [key: string]: { message: string };
}
interface Task {
  id: string;
  message: string;
}

export const useStateStore = defineStore({
  id: "state",
  state: () => ({
    sidenav: false,
    user: { uid: "", email: "" } as firebase.User,
    claims: {} as { [claim: string]: boolean },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expenseRates: null as { [key: string]: any } | null,
    activeTasks: {} as TaskList, // items to show in the progress UI element
    showTasks: false, // whether to display the progress UI element

    // state of the notification system
    notifications: {}, // notifications to display in UI
  }),
  getters: {
    // getters for the waiting message system
    // get the first message from the activeTasks object
    oneMessage: (state) => {
      if (state.showTasks) {
        return state.activeTasks[Object.keys(state.activeTasks)[0]].message;
      } else {
        return "";
      }
    },
  },
  actions: {
    toggleMenu() {
      this.sidenav = !this.sidenav;
    },
    hideNav() {
      this.sidenav = false;
    },
    startTask(task: Task) {
      const id = task.id;
      this.activeTasks[id] = { message: task.message };
      this.showTasks = true;
    },
    endTask(id: string) {
      delete this.activeTasks[id];
      this.showTasks = Object.keys(this.activeTasks).length > 0;
    },
    setUser(user: firebase.User) {
      this.user = user;
    },
    setClaims(claims: { [claim: string]: boolean }) {
      this.claims = claims;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setExpenseRates(rates: { [key: string]: any }) {
      this.expenseRates = rates;
    },
  },
});
