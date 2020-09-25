/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable

*/

// The bundleTimesheet groups TimeEntries together 
// into a timesheet for a given user and week
exports.bundleTimesheet = async (data, context, db) => {

    // Get non-entry information
    return {
      uid: context.auth.uid,
      week_ending: data.end_date, // verify that it's a saturday
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

exports.writeWeekEnding = async (snap, context) => {
  // TODO: this is currently called with onCreate() trigger, meaning that
  // it isn't called if an entry is updated. Updated entries can have new
  // dates and so may need to have their week_ending changed as well.
  // We must fix this by calling this function with the trigger onWrite() 
  // instead and then checking here whether the document exists so that 
  // the delete case is handled

  const date = snap.data().date.toDate();
  if (date.getDay() === 6) {
    date.setHours(23,59,59,999);
    return snap.ref.set({ week_ending: date }, { merge: true } );
  } else {
    const nextsaturday = new Date();
    nextsaturday.setDate(nextsaturday.getDate() + (6 - date.getDay()));
    nextsaturday.setHours(23,59,59,999);
    return snap.ref.set({ week_ending: nextsaturday }, { merge: true } );
  }
}