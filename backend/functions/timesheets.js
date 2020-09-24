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
      year: data.year,
      week: data.week
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
    .where("date", ">=", start_date)
    .where("date", "<=", end_date)
    .orderBy("date", "asc")

  Create new Timesheet document in TimeSheets that contains the following properties:
    uid, start_date, end_date, year, week, entries
    
  const result = await db.collection('TimeSheets').add({ uid, start_date, end_date, year, week, entries });

}

*/