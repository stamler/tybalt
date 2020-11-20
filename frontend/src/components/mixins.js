import firebase from "@/firebase";
import store from "../store";
const db = firebase.firestore();

const mixins = {
  methods: {
    bundle(week) {
      store.commit("startTask", { id: "bundle", message: "bundling" });
      const bundleTimesheet = firebase
        .functions()
        .httpsCallable("bundleTimesheet");
      return bundleTimesheet({ weekEnding: week.getTime() })
        .then(() => {
          store.commit("endTask", { id: "bundle" });
        })
        .catch(error => {
          store.commit("endTask", { id: "bundle" });
          alert(`Error bundling timesheet: ${error.message}`);
        });
    },
    unbundle(timesheetId) {
      store.commit("startTask", { id: "unbundle", message: "unbundling" });
      const unbundleTimesheet = firebase
        .functions()
        .httpsCallable("unbundleTimesheet");
      return unbundleTimesheet({ id: timesheetId })
        .then(() => {
          store.commit("endTask", { id: "unbundle" });
        })
        .catch(error => {
          store.commit("endTask", { id: "unbundle" });
          alert(`Error unbundling timesheet: ${error.message}`);
        });
    },
    submitTs(timesheetId) {
      store.commit("startTask", {
        id: `submit${timesheetId}`,
        message: "submitting"
      });
      this.collection
        .doc(timesheetId)
        .set({ submitted: true }, { merge: true })
        .then(() => {
          store.commit("endTask", { id: `submit${timesheetId}` });
        })
        .catch(err => {
          store.commit("endTask", { id: `submit${timesheetId}` });
          alert(`Error submitting timesheet: ${err}`);
        });
    },
    approveTs(timesheetId) {
      store.commit("startTask", {
        id: `approve${timesheetId}`,
        message: "approving"
      });
      const timesheet = db.collection("TimeSheets").doc(timesheetId);
      return db
        .runTransaction(function(transaction) {
          return transaction.get(timesheet).then(function(tsDoc) {
            if (tsDoc.data().submitted === true) {
              // timesheet is approvable because it has been submitted
              transaction.update(timesheet, { approved: true });
            } else {
              throw "The timesheet has not been submitted or was recalled";
            }
          });
        })
        .then(() => {
          store.commit("endTask", { id: `approve${timesheetId}` });
        })
        .catch(function(error) {
          store.commit("endTask", { id: `approve${timesheetId}` });
          alert(`Approval failed: ${error}`);
        });
    },
    rejectTs(timesheetId) {
      store.commit("startTask", {
        id: `reject${timesheetId}`,
        message: "rejecting"
      });
      const timesheet = db.collection("TimeSheets").doc(timesheetId);
      return db
        .runTransaction(function(transaction) {
          return transaction.get(timesheet).then(function(tsDoc) {
            if (
              tsDoc.data().submitted === true &&
              tsDoc.data().locked === false
            ) {
              // timesheet is rejectable because it is submitted and not locked
              transaction.update(timesheet, {
                approved: false,
                rejected: true,
                rejectionReason: "no reason provided"
              });
            } else {
              throw "The timesheet has not been submitted or is locked";
            }
          });
        })
        .then(() => {
          store.commit("endTask", { id: `reject${timesheetId}` });
        })
        .catch(function(error) {
          store.commit("endTask", { id: `reject${timesheetId}` });
          alert(`Approval failed: ${error}`);
        });
    },
    recallTs(timesheetId) {
      // A transaction is used to update the submitted field by
      // first verifying that approved is false. Similarly an approve
      // function for the approving manager must use a transaction and
      // verify that the timesheet is submitted before marking it approved
      store.commit("startTask", {
        id: `recall${timesheetId}`,
        message: "recalling"
      });
      const timesheet = db.collection("TimeSheets").doc(timesheetId);

      return db
        .runTransaction(function(transaction) {
          return transaction.get(timesheet).then(function(tsDoc) {
            if (tsDoc.data().approved === false) {
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
        .catch(function(error) {
          store.commit("endTask", { id: `recall${timesheetId}` });
          alert(`Recall failed: ${error}`);
        });
    },
    hasPermission(claim) {
      return (
        Object.prototype.hasOwnProperty.call(this.claims, claim) &&
        this.claims[claim] === true
      );
    }
  }
};
export default mixins;
