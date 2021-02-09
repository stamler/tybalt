import Vue from "vue";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
const db = firebase.firestore();

export default Vue.extend({
  computed: {
    ...mapState(["claims"]),
  },
  methods: {
    bundle(week: Date) {
      store.commit("startTask", {
        id: "bundle",
        message: "verifying...",
      });
      const bundleTimesheet = firebase
        .functions()
        .httpsCallable("bundleTimesheet");
      return bundleTimesheet({ weekEnding: week.getTime() })
        .then(() => {
          store.commit("endTask", { id: "bundle" });
        })
        .catch((error) => {
          store.commit("endTask", { id: "bundle" });
          alert(`Error bundling timesheet: ${error.message}`);
        });
    },
    unbundle(timesheetId: string) {
      store.commit("startTask", { id: "unbundle", message: "unbundling" });
      const unbundleTimesheet = firebase
        .functions()
        .httpsCallable("unbundleTimesheet");
      return unbundleTimesheet({ id: timesheetId })
        .then(() => {
          store.commit("endTask", { id: "unbundle" });
        })
        .catch((error) => {
          store.commit("endTask", { id: "unbundle" });
          alert(`Error unbundling timesheet: ${error.message}`);
        });
    },
    submitExpense(expenseId: string) {
      store.commit("startTask", {
        id: `submit${expenseId}`,
        message: "submitting",
      });
      db.collection("Expenses")
        .doc(expenseId)
        .set({ submitted: true, approved: false }, { merge: true })
        .then(() => {
          store.commit("endTask", { id: `submit${expenseId}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `submit${expenseId}` });
          alert(`Error submitting expense: ${error}`);
        });
    },
    approveExpense(itemId: string) {
      store.commit("startTask", {
        id: `approve${itemId}`,
        message: "approving",
      });
      const item = db.collection("Expenses").doc(itemId);
      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(item)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${itemId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.submitted === true) {
                // timesheet is approvable because it has been submitted
                transaction.update(item, { approved: true });
              } else {
                throw "The expense has not been submitted";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `approve${itemId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `approve${itemId}` });
          alert(`Approval failed: ${error}`);
        });
    },
    rejectExpense(itemId: string, reason: string) {
      store.commit("startTask", {
        id: `reject${itemId}`,
        message: "rejecting",
      });
      const item = db.collection("Expenses").doc(itemId);
      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(item)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${itemId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (
                data !== undefined &&
                data.submitted === true &&
                data.committed === undefined
              ) {
                // timesheet is rejectable because it is submitted and not locked
                transaction.update(item, {
                  approved: false,
                  rejected: true,
                  rejectionReason: reason,
                });
              } else {
                throw "The expense has not been submitted or has been committed";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `reject${itemId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `reject${itemId}` });
          alert(`Rejection failed: ${error}`);
        });
    },
    recallExpense(expenseId: string) {
      // A transaction is used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
      store.commit("startTask", {
        id: `recall${expenseId}`,
        message: "recalling",
      });
      const expense = db.collection("Expenses").doc(expenseId);

      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(expense)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `An expense with id ${expenseId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.approved === false) {
                // timesheet is recallable because it hasn't yet been approved
                transaction.update(expense, { submitted: false });
              } else {
                throw "The expense was already approved by a manager";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `recall${expenseId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `recall${expenseId}` });
          alert(`Recall failed: ${error}`);
        });
    },
    submitTs(timesheetId: string) {
      store.commit("startTask", {
        id: `submit${timesheetId}`,
        message: "submitting",
      });
      db.collection("TimeSheets")
        .doc(timesheetId)
        .set({ submitted: true }, { merge: true })
        .then(() => {
          store.commit("endTask", { id: `submit${timesheetId}` });
        })
        .catch((error) => {
          store.commit("endTask", { id: `submit${timesheetId}` });
          alert(`Error submitting timesheet: ${error}`);
        });
    },
    approveTs(timesheetId: string) {
      store.commit("startTask", {
        id: `approve${timesheetId}`,
        message: "approving",
      });
      const timesheet = db.collection("TimeSheets").doc(timesheetId);
      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(timesheet)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `A timesheet with id ${timesheetId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.submitted === true) {
                // timesheet is approvable because it has been submitted
                transaction.update(timesheet, { approved: true });
              } else {
                throw "The timesheet has not been submitted";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `approve${timesheetId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `approve${timesheetId}` });
          alert(`Approval failed: ${error}`);
        });
    },
    rejectTs(timesheetId: string, reason: string) {
      store.commit("startTask", {
        id: `reject${timesheetId}`,
        message: "rejecting",
      });
      const timesheet = db.collection("TimeSheets").doc(timesheetId);
      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(timesheet)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `A timesheet with id ${timesheetId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (
                data !== undefined &&
                data.submitted === true &&
                data.locked === false
              ) {
                // timesheet is rejectable because it is submitted and not locked
                transaction.update(timesheet, {
                  approved: false,
                  rejected: true,
                  rejectionReason: reason,
                });
              } else {
                throw "The timesheet has not been submitted or is locked";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `reject${timesheetId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `reject${timesheetId}` });
          alert(`Rejection failed: ${error}`);
        });
    },
    recallTs(timesheetId: string) {
      // A transaction is used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
      store.commit("startTask", {
        id: `recall${timesheetId}`,
        message: "recalling",
      });
      const timesheet = db.collection("TimeSheets").doc(timesheetId);

      return db
        .runTransaction(function (transaction) {
          return transaction
            .get(timesheet)
            .then((tsDoc: firebase.firestore.DocumentSnapshot) => {
              if (!tsDoc.exists) {
                throw `A timesheet with id ${timesheetId} doesn't exist.`;
              }
              const data = tsDoc?.data() ?? undefined;
              if (data !== undefined && data.approved === false) {
                // timesheet is recallable because it hasn't yet been approved
                transaction.update(timesheet, { submitted: false });
              } else {
                throw "The timesheet was already approved by a manager";
              }
            });
        })
        .then(() => {
          store.commit("endTask", { id: `recall${timesheetId}` });
        })
        .catch(function (error) {
          store.commit("endTask", { id: `recall${timesheetId}` });
          alert(`Recall failed: ${error}`);
        });
    },
    hasPermission(claim: string): boolean {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, claim) &&
        this.claims[claim] === true
      );
    },
    searchString(item: firebase.firestore.DocumentData) {
      const fields = Object.values(item);
      fields.push(item.id);
      return fields.join(",").toLowerCase();
    },
    del(
      item: firebase.firestore.DocumentData,
      collection: firebase.firestore.CollectionReference
    ) {
      if (collection === null) {
        throw "There is no valid collection object";
      }
      collection
        .doc(item.id)
        .delete()
        .catch((err) => {
          alert(`Error deleting item: ${err}`);
        });
    },
  },
});
