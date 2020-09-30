/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/
const functions = require('firebase-functions');

// The bundleTimesheet groups TimeEntries together 
// into a timesheet for a given user and week
exports.bundleTimesheet = async (data, context, db) => {
    // Get non-entry information
    // NB: Dates are not supported in Firebase Functions yet
    // https://github.com/firebase/firebase-functions/issues/316

    // make week_ending a date and verify it's a Saturday
    const week = new Date(data.week_ending);
    week.setHours(23,59,59,999);
    if (week.getDay() !== 6) {
      throw new functions.https.HttpsError('invalid-argument', 'The week' + 
      ' ending specified is not a Saturday');
    }
    
    const timeEntries = await db.collection("TimeEntries").where("uid", "==", context.auth.uid).where("week_ending", "==", week).orderBy("date", "asc").get();
    if (!timeEntries.empty) {
      console.log("there are TimeEntries, creating a batch");
      // Start a write batch
      const batch = db.batch();

      // Put the existing timeEntries into an array then delete from Collection
      const entries = [];
      timeEntries.forEach(timeEntry => {
        // timeEntry is of type "QueryDocumentSnapshot"
        // TODO: Possibly remove redundant data here like timetypeName etc.
        // NB if we remove fields, we'll have to re-add them in an unbundle.
        entries.push(timeEntry.data());
        batch.delete(timeEntry.ref);
      });
      
      // Build the TimeSheet including entries array created in previous step
      const timesheet = db.collection("TimeSheets").doc();
      batch.set(timesheet, {
        uid: context.auth.uid,
        week_ending: week,
        entries,
        manager: "approving manager uid", 
        approved: false  
      });
      return batch.commit();

    } else {
      console.log("there are no entries, returning null");
      return null;
    }
};

exports.unbundleTimesheet = async(data, context, db) => {
  return null;
};

exports.writeWeekEnding = async (change, context) => {
  // TODO: overwrite any week_ending values submitted from client
  if (change.after.exists) {
    // The time entry was either created or updated
    const date = change.after.data().date.toDate();
    const previousDate = change.before.exists ? change.before.data().date.toDate() : null;
    if (  !previousDate ||
          previousDate.toDateString() !== date.toDateString() ||
          change.before.data().week_ending.toDate().toDateString() !==
          change.after.data().week_ending.toDate().toDateString()) {
      // Short-circuit evaluation means that at this point either there was
      // no previous document (i.e. create event) OR that the previous
      // document's date has changed. The third clause ensures that manual 
      // changes to week_ending submitted from the client are overwritten.
      if (date.getDay() === 6) {
        console.log("writeWeekEnding() date is already a saturday");
        date.setHours(23,59,59,999);
        return change.after.ref.set({ week_ending: date }, { merge: true } );
      } else {
        console.log("writeWeekEnding() calculating and setting next saturday");
        const nextsat = new Date(date.valueOf());
        nextsat.setDate(nextsat.getDate() - nextsat.getDay() + 6);
        nextsat.setHours(23,59,59,999);
        return change.after.ref.set({ week_ending: nextsat }, { merge: true } );
      }
    } else {
      // the date was not changed in an update operation
      console.log("writeWeekEnding() called but date hasn't changed");
      return null;
    }
  } else {
    // The TimeEntry was deleted, do nothing
    console.log("writeWeekEnding() called but time entry was deleted");
    return null;
  }
}