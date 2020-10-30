/* 

This module exports callable handlers (functions.https.onCall(<handler_func>))
https://firebase.google.com/docs/functions/callable


Claims permissions: these should perhaps be in an array and simpler to get
below the 1000 byte limit

time: true 
The default. Holders of this claim can create TimeEntries, bundle and unbundle
their own TimeSheets, and submit them for approval

tapr: true
Holders of this claim can approve submitted timesheets whose 
managerUid field matches their uid.

tadm: true
Holders of this claim can export a time-tracking CSV for distribution to 
accounting for payroll and to admin for invoicing
*/
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { zonedTimeToUtc, utcToZonedTime } = require('date-fns-tz');

// The bundleTimesheet groups TimeEntries together 
// into a timesheet for a given user and week
// time is ignored in weekEnding property of data arg
exports.bundleTimesheet = async (data, context, db) => {
    // NB: Dates are not supported in Firebase Functions yet so
    // data.weekEnding is the valueOf() a Date object
    // https://github.com/firebase/firebase-functions/issues/316

    // Firestore timestamps and JS Date objects represent a point in time and
    // have no associated time zone info. To determine time zone dependent 
    // facts like whether a day is a saturday or to set the time specific to
    // eastern time as desired (for week endings), we must interpret date
    // in a time zone. Hre we rebase time objects to America/Thunder_Bay to
    // do manipulations and validate week days, then we change it back. 
    const tbay_week = utcToZonedTime(new Date(data.weekEnding), 'America/Thunder_Bay');

    // Overwrite the time to 23:59:59.999 in America/Thunder_Bay time zone
    tbay_week.setHours(23, 59, 59, 999);

    // verify tbay_week is a Saturday in America/Thunder_Bay time zone
    if (tbay_week.getDay() !== 6) {
      throw new functions.https.HttpsError('invalid-argument', 'The week' + 
      ' ending specified is not a Saturday');
    }

    // Convert back to UTC for queries against firestore
    const week = zonedTimeToUtc(
      new Date(tbay_week),
      'America/Thunder_Bay'
    );
    
    // Throw if a timesheet already exists for this week
    const timeSheets = await db.collection("TimeSheets")
      .where("uid", "==", context.auth.uid)
      .where("weekEnding", "==", week)
      .get();
    if (!timeSheets.empty) {
      throw new functions.https.HttpsError('failed-precondition', "Only one" +
      " time sheet can exist for a week. Please edit the existing one.");
    }

    const timeEntries = await db.collection("TimeEntries").where("uid", "==", context.auth.uid).where("weekEnding", "==", week).orderBy("date", "asc").get();
    if (!timeEntries.empty) {
      // Outstanding TimeEntries exist, start the bundling process
      const batch = db.batch();

      // Put the existing timeEntries into an array then delete from Collection
      const entries = [];
      const nonWorkHoursTally = {}; // key is timetype, value is total
      const workHoursTally = { hours:0, jobHours: 0, mealsHours: 0};
      const divisionsTally = {}; // key is division, value is divisionName
      const projectsTally = {}; // key is project, value is projectName
      timeEntries.forEach(timeEntry => {
        const item = timeEntry.data();
 
        if (item.timetype !== 'R') {
          // Tally the non-work hours
          if (item.timetype in nonWorkHoursTally) {
            nonWorkHoursTally[item.timetype] += item.hours;
          } else {
            nonWorkHoursTally[item.timetype] = item.hours;
          }
        } else {
          // Tally the work hours
          if ("hours" in item) {
            workHoursTally["hours"] += item.hours;
          }
          if ("jobHours" in item) {
            workHoursTally["jobHours"] += item.jobHours;
          }
          if ("mealsHours" in item) {
            workHoursTally["mealsHours"] += item.mealsHours;
          }

          // Tally the divisions (must be present for work hours)
          divisionsTally[item.division] = item.divisionName;
          
          // Tally the projects (may not be present)
          if ("project" in item) {
            projectsTally[item.project] = item.projectName;
          }
        }

        // timeEntry is of type "QueryDocumentSnapshot"
        entries.push(item);
        batch.delete(timeEntry.ref);
      });
      
      // Load the profile for the user to get manager information
      const profile = await db.collection("Profiles").doc(context.auth.uid).get()
      if (profile.exists) {
        const managerUid = profile.get("managerUid");
        if (managerUid !== undefined) {

          // Verify that the auth user with managerUid exists 
          let manager;
          try {
            manager = await admin.auth().getUser(managerUid);
          } catch (error) {
            // The Profile for this user likely specifies an identifier 
            // (managerUid) that doesn't correspond to valid User Record.
            throw new functions.https.HttpsError('internal', error.message);  
          }
          const claims = manager.customClaims
          if (claims && claims['tapr'] === true) {
            // The profile contains a valid manager, build the TimeSheet document
            const timesheet = db.collection("TimeSheets").doc();
            batch.set(timesheet, {
              uid: context.auth.uid,
              displayName: profile.get("displayName"),
              managerName: profile.get("managerName"),
              weekEnding: week,
              managerUid: managerUid,
              locked: false,
              approved: false,
              rejected: false,
              rejectionReason: "",
              submitted: false,
              entries,
              nonWorkHoursTally,
              workHoursTally,
              divisionsTally,
              projectsTally,
            });
            return batch.commit();
          } else {
            throw new functions.https.HttpsError('failed-precondition', "The manager" +
              " specified in the Profile doesn't have required permissions");
          }
        } else {
         throw new functions.https.HttpsError('failed-precondition', "The Profile for" + 
          " this user doesn't contain a managerUid");
        }
      } else {
        throw new functions.https.HttpsError('not-found', "A Profile doesn't" + 
        " exist for this user");
      }
    } else {
      console.log("there are no entries, returning null");
      return null;
    }
};

exports.unbundleTimesheet = async(data, context, db) => {
  const timeSheet = await db.collection("TimeSheets").doc(data.id).get();
  if (timeSheet.exists) {
    if (timeSheet.data().submitted === true) {
      throw new functions.https.HttpsError('failed-precondition', 'A' + 
      ' submitted TimeSheet cannot be unbundled');
    }
    if (timeSheet.data().approved === true) {
      throw new functions.https.HttpsError('failed-precondition', 'An' + 
      ' approved TimeSheet cannot be unbundled');
    }
    if (timeSheet.data().locked === true) {
      throw new functions.https.HttpsError('failed-precondition', 'A' + 
      ' locked TimeSheet cannot be unbundled');
    }

    console.log("TimeSheet found, creating a batch");
    // Start a write batch
    const batch = db.batch();

    // Create new TimeEntres for each entries item in the TimeSheet
    timeSheet.data().entries.forEach(timeEntry => {
      // timeEntry is of type "QueryDocumentSnapshot"
      // TODO: Possibly must add back redundant data removed in bundle
      let entry = db.collection("TimeEntries").doc();
      batch.set(entry, timeEntry);
    });
    
    // Delete the TimeSheet
    batch.delete(timeSheet.ref);
    return batch.commit();

  } else {
    console.log("no TimeSheet found, returning null");
    return null;
  }
};

exports.writeWeekEnding = functions.firestore.document('TimeEntries/{entryId}').onWrite( async (change, context) => {
  // TODO: overwrite any weekEnding values submitted from client
  if (change.after.exists) {
    // The TimeEntry was not deleted
    let date
    try {
      // get the date from the TimeEntry
      date = change.after.data().date.toDate();
    } catch (error) {
      console.log(`unable to read date for TimeEntry with id ${change.after.id}`);
      throw (error);
    }
    // If weekEnding is defined on the TimeEntry, get it, otherwise set null
    const weekEnding = Object.prototype.hasOwnProperty.call(change.after.data(), "weekEnding") ? change.after.data().weekEnding.toDate() : null;

    // Calculate the correct saturday of the weekEnding 
    // (in America/Thunder_Bay timezone)
    let calculatedSaturday;
    if (date.getDay() === 6) {
      // assume the date is already in America/Thunder_Bay Time Zone
      console.log("writeWeekEnding() date is already a saturday");
      calculatedSaturday = zonedTimeToUtc(
        new Date(
          date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999
        ),
        'America/Thunder_Bay'
      );
    } else {
      console.log("writeWeekEnding() calculating next saturday");
      // assume the date is already in America/Thunder_Bay Time Zone
      const nextsat = new Date(date.valueOf());
      nextsat.setDate(nextsat.getDate() - nextsat.getDay() + 6);
      calculatedSaturday = zonedTimeToUtc(
        new Date(
          nextsat.getFullYear(), nextsat.getMonth(), nextsat.getDate(), 23, 59, 59, 999
        ),
        'America/Thunder_Bay'
      );
    }

    // update the TimeEntry only if required
    if (weekEnding === null || weekEnding.toDateString() !== calculatedSaturday.toDateString) {
      return change.after.ref.set({ weekEnding: calculatedSaturday }, { merge: true } );
    }

    // no changes to be made
    return null;
  } else {
    // The TimeEntry was deleted, do nothing
    console.log("writeWeekEnding() called but time entry was deleted");
    return null;
  }
});