import Vue from "vue";
import { mapState } from "vuex";
import firebase from "../firebase";
import store from "../store";
import { format, subDays } from "date-fns";
const db = firebase.firestore();
const storage = firebase.storage();

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
                transaction.update(item, { approved: true, committed: false });
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
                (data.committed === false || data.committed === undefined)
              ) {
                // timesheet is rejectable because it is submitted and not committed
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
    async downloadAttachment(item: firebase.firestore.DocumentData) {
      const url = await storage.ref(item.attachment).getDownloadURL();
      const a = document.createElement("a");
      a.href = url;
      a.download = "download";
      a.click();
      return a;
    },
    // Force the download of a blob to a file by creating an
    // anchor and programmatically clicking it.
    downloadBlob(blob: Blob, filename: string) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";

      // release object URL after element has been clicked
      // required for one-off downloads of the blob content
      const clickHandler = () => {
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.removeEventListener("click", clickHandler);
        }, 150);
      };

      // Add the click event listener on the anchor element
      // Comment out this line if you don't want a one-off download of the blob content
      a.addEventListener("click", clickHandler, false);

      // Programmatically trigger a click on the anchor element
      // Useful if you want the download to happen automatically
      // Without attaching the anchor element to the DOM
      // Comment out this line if you don't want an automatic download of the blob content
      a.click();

      // Return the anchor element
      // Useful if you want a reference to the element
      // in order to attach it to the DOM or use it in some other way
      return a;
    },
    exportDateWeekStart(date: Date) {
      const startDate = subDays(date, 6);
      return format(startDate, "yyyy MMM dd");
    },
    exportDate(date: Date) {
      return format(date, "yyyy MMM dd");
    },
  },
});
