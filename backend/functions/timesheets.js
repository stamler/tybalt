/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/

// The bundleTimesheet groups TimeEntries together 
// into a timesheet for a given user and week
exports.bundleTimesheet = async (data, context, db) => {
    // Get non-entry information
    // NB: Dates are not supported in Firebase Functions yet
    // https://github.com/firebase/firebase-functions/issues/316
    return {
      uid: context.auth.uid,
      week_ending: data.week_ending, // verify that it's a saturday
      manager: "approving manager uid", 
      approved: false
    }

};

/*
// Pseudocode
function bundle_entries(year, week) {
  let start_date = get_start_date(year, week);
  let end_date = get_end_date(year, week);

  let entries = db
    .collection("TimeEntries")
    .where("uid", "==", store.state.user.uid)
    .where("week_ending", "==", week_ending)
    .orderBy("date", "asc")

  Create new Timesheet document in TimeSheets that contains the following properties:
    uid, end_date, entries, manager, approved:false
    
  const result = await db.collection('TimeSheets').add({ uid, start_date, end_date, year, week, entries });

}

*/

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