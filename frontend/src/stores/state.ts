import { firebaseApp } from "../firebase";
import { defineStore } from "pinia";
import {
  getAuth,
  onAuthStateChanged,
  User,
  OAuthProvider,
  signInWithPopup,
  signOut,
  AuthError,
  getIdTokenResult,
} from "firebase/auth";
import { getFirestore, getDoc, doc } from "firebase/firestore";
import { MICROSOFT_TENANT_ID } from "../config";
import { getFunctions, httpsCallable } from "firebase/functions";
import { subDays } from "date-fns";
import router from "@/router";

interface TaskList {
  [key: string]: { message: string };
}
interface Task {
  id: string;
  message: string;
}

const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp);

const provider = new OAuthProvider("microsoft.com");
provider.setCustomParameters({ tenant: MICROSOFT_TENANT_ID });

export const useStateStore = defineStore({
  id: "state",
  state: () => ({
    initializing: false,
    isFirebaseAuthenticated: null as boolean | null,
    sidenav: false,
    user: { uid: "", email: "" } as User,
    claims: {} as { [claim: string]: boolean },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expenseRates: null as { [key: string]: any } | null,
    activeTasks: {} as TaskList, // items to show in the progress UI element
    showTasks: false, // whether to display the progress UI element

    // state of the notification system
    notifications: {}, // notifications to display in UI

    // this function will be called upon sign out to unsubscribe from the auth
    // state change listener
    unsubscribe: null as (() => void) | null,
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
    initialize() {
      this.initializing = true;
      const _this = this;
      this.unsubscribe = onAuthStateChanged(auth, async function (user) {
        if (user) {
          _this.isFirebaseAuthenticated = true;
            
          // get the expense rates and store them in the store
          const getExpenseRates = httpsCallable(functions, "expenseRates");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getExpenseRates().then((result: Record<string, any>) =>
            _this.setExpenseRates(result.data)
          );
      
          // TODO: avoid casting to firebase.User
          _this.setUser(auth.currentUser as User);
          // Using true here will force a refresh of the token test this to see if a
          // simple refresh will suffice instead of logging out after claims are
          // updated, then figure out how to refresh the token in the background
          // periodically without logging out
          // https://firebase.google.com/docs/auth/admin/custom-claims
          // https://firebase.google.com/docs/reference/js/auth.user.md#usergetidtokenresult
          getIdTokenResult(user, true).then((token) => {
            const allClaims = token.claims;
            // filter out the properties that don't have a value of true
            const claims = Object.keys(allClaims)
              .filter((key) => allClaims[key] === true)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .reduce((obj: Record<string, any>, key) => {
                obj[key] = allClaims[key];
                return obj;
              }, {});
            _this.setClaims(claims);
          });
        } else {
          // clear the user and claims when signing out
          _this.setUser({ uid: "", email: "" } as User);
          _this.setClaims({});
          _this.setExpenseRates(null);
          
          // clear the state of the app
          _this.isFirebaseAuthenticated = false;

          // TODO: redirect to the login page here using the router
          // This currently causes the following error:
          // Uncaught ReferenceError: can't access lexical declaration 'useStateStore' before initialization
          // TODO: figure out how to fix this
          // router.push({ name: "Login" });
        }
        _this.initializing = false;
      });
    },
    async loginWithMicrosoftOAuth() {
      try {
        const result = await signInWithPopup(auth, provider);
        if (result === null || OAuthProvider.credentialFromResult === null) {
          return null;
        } 
        const credential = OAuthProvider.credentialFromResult(result);
        
        // get token and call graph to load first name, last name
        // and other important data, then save it to the profile
        // https://firebase.google.com/docs/auth/web/microsoft-oauth
        const updateProfileFromMSGraph = httpsCallable(
          functions,
          "updateProfileFromMSGraph"
        );
        if (credential) {
          updateProfileFromMSGraph({
            accessToken: credential.accessToken,
          }).catch((error) => alert(`Update from MS Graph failed: ${error}`));
        } else {
          const currentUser = auth.currentUser;
          if (currentUser !== null) {
            // Validate the age of the profile
            // sign out if the profile is missing msGraphDataUpdated
            // or it was updated more than 7 days ago
            const db = getFirestore(firebaseApp);
            const snap = await getDoc(doc(db, "Profiles", currentUser.uid));
            const profile = snap.data();
            
            if (
              profile !== undefined &&
              (profile.msGraphDataUpdated === undefined ||
                profile.msGraphDataUpdated.toDate() < subDays(new Date(), 7))
              ) {
                alert("Your profile needs an update. Please sign back in.");
                this.signOutTybalt();
            }
          }
        }
      } catch (error) {
        const _error = error as AuthError;
        if (_error.code === "auth/account-exists-with-different-credential") {
          alert(
            `You have already signed up with a different auth provider for email ${_error.customData.email}.`
          );
          // If you are using multiple auth providers on your app you should handle linking
          // the user's accounts here.
        } else if (_error.code === "auth/timeout") {
          history.go();
        } else {
          // eslint-disable-next-line no-console
          console.error(error);
        }    
      }
    },
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
    setUser(user: User) {
      this.user = user;
    },
    setClaims(claims: { [claim: string]: boolean }) {
      this.claims = claims;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setExpenseRates(rates: { [key: string]: any } | null) {
      this.expenseRates = rates;
    },
    async signOutTybalt() {
      if (this.unsubscribe !== null) {
        this.unsubscribe();
      }
      await signOut(auth);
      this.isFirebaseAuthenticated = false;
    }
  },
});
