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
Holders of this claim can export a time-tracking files for distribution to 
accounting for payroll and to admin for invoicing
*/
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { zonedTimeToUtc, utcToZonedTime } = require("date-fns-tz");
const { format } = require("date-fns");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const os = require("os");

// The bundleTimesheet groups TimeEntries together
// into a timesheet for a given user and week
// time is ignored in weekEnding property of data arg
exports.bundleTimesheet = async (data, context) => {
  const db = admin.firestore();

  // NB: Dates are not supported in Firebase Functions yet so
  // data.weekEnding is the valueOf() a Date object
  // https://github.com/firebase/firebase-functions/issues/316

  // Firestore timestamps and JS Date objects represent a point in time and
  // have no associated time zone info. To determine time zone dependent
  // facts like whether a day is a saturday or to set the time specific to
  // eastern time as desired (for week endings), we must interpret date
  // in a time zone. Hre we rebase time objects to America/Thunder_Bay to
  // do manipulations and validate week days, then we change it back.
  const tbay_week = utcToZonedTime(
    new Date(data.weekEnding),
    "America/Thunder_Bay"
  );

  // Overwrite the time to 23:59:59.999 in America/Thunder_Bay time zone
  tbay_week.setHours(23, 59, 59, 999);

  // verify tbay_week is a Saturday in America/Thunder_Bay time zone
  if (tbay_week.getDay() !== 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The week ending specified is not a Saturday"
    );
  }

  // Convert back to UTC for queries against firestore
  const week = zonedTimeToUtc(new Date(tbay_week), "America/Thunder_Bay");

  // Throw if a timesheet already exists for this week
  const timeSheets = await db
    .collection("TimeSheets")
    .where("uid", "==", context.auth.uid)
    .where("weekEnding", "==", week)
    .get();
  if (!timeSheets.empty) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Only one time sheet can exist for a week. Please edit the existing one."
    );
  }

  // Look for TimeEntries to bundle
  const timeEntries = await db
    .collection("TimeEntries")
    .where("uid", "==", context.auth.uid)
    .where("weekEnding", "==", week)
    .orderBy("date", "asc")
    .get();
  if (!timeEntries.empty) {
    // Outstanding TimeEntries exist, start the bundling process
    const batch = db.batch();

    // Put the existing timeEntries into an array then delete from Collection
    const entries = [];
    const bankEntries = [];
    const offRotationDates = [];
    const nonWorkHoursTally = {}; // key is timetype, value is total
    let mealsHoursTally = 0;
    const workHoursTally = { hours: 0, jobHours: 0, noJobNumber: 0 };
    const divisionsTally = {}; // key is division, value is divisionName
    const jobsTally = {}; // key is job, value is object of name and totals
    timeEntries.forEach((timeEntry) => {
      const item = timeEntry.data();
      if (item.timetype === "OR") {
        // Count the off rotation dates and ensure that there are not two
        // off rotation entries for a given date.
        const orDate = new Date(item.date.toDate().setHours(0, 0, 0, 0));
        if (offRotationDates.includes(orDate.getTime())) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "More than one Off-Rotation entry exists for" +
              format(orDate, "yyyy MMM dd")
          );
        } else {
          offRotationDates.push(orDate.getTime());
        }
        console.log(offRotationDates.toString());
      } else if (item.timetype === "RB") {
        // This is an overtime bank entry, store it in the bankEntries
        // array for processing after completing the tallies.
        bankEntries.push(item);
      } else if (item.timetype === "R") {
        // Tally the regular work hours
        if ("hours" in item) {
          workHoursTally["hours"] += item.hours;
        }
        if ("jobHours" in item) {
          workHoursTally["jobHours"] += item.jobHours;
        }
        if ("mealsHours" in item) {
          mealsHoursTally += item.mealsHours;
        }

        // Tally the divisions (must be present for work hours)
        divisionsTally[item.division] = item.divisionName;

        // Tally the jobs (may not be present)
        if ("job" in item) {
          if (item.job in jobsTally) {
            // a previous entry already tracked this job, add to totals
            const hours = isNaN(item.hours)
              ? jobsTally[item.job].hours
              : jobsTally[item.job].hours + item.hours;
            const jobHours = isNaN(item.jobHours)
              ? jobsTally[item.job].jobHours
              : jobsTally[item.job].jobHours + item.jobHours;
            jobsTally[item.job] = {
              description: item.jobDescription,
              client: item.client,
              hours,
              jobHours,
            };
          } else {
            // first instance of this job in the timesheet, set totals to zero
            jobsTally[item.job] = {
              description: item.jobDescription,
              client: item.client,
              hours: item.hours || 0,
              jobHours: item.jobHours || 0,
            };
          }
        } else {
          // keep track of the number of hours not associated with a job
          // (as opposed to job hours not billable to the client)
          workHoursTally["noJobNumber"] += item.hours;
        }
      } else {
        // Tally the non-work hours
        if (item.timetype in nonWorkHoursTally) {
          nonWorkHoursTally[item.timetype] += item.hours;
        } else {
          nonWorkHoursTally[item.timetype] = item.hours;
        }
      }

      // timeEntry is of type "QueryDocumentSnapshot"
      entries.push(item);
      batch.delete(timeEntry.ref);
    });

    // TimeEntries are done being enumerated, now work on summaries
    // and validation of the TimeSheet as a whole
    let bankedHours = 0;
    if (bankEntries.length > 1) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only one overtime banking entry can exist on a timesheet."
      );
    } else if (bankEntries.length === 1) {
      bankedHours = bankEntries[0].hours;

      // The sum of all hours worked minus the banked hours mustn't be under 44
      if (workHoursTally.hours + workHoursTally.jobHours - bankedHours < 44) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Banked hours cannot bring your total worked hours below 44 hours on a timesheet."
        );
      }
    }
    if (offRotationDates.length > 0) {
      // TODO: check sum of two previous timesheets to ensure that the
      // total isn't greater than 14 days in a two week period
    }

    // get the entire job document for each key in the jobsTally
    // and store it in the tally so the info is available for reports
    // jobsTally entries already have name, hours, jobHours properties
    for (const job in jobsTally) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const snap = await db.collection("Jobs").doc(job).get();
        // fold in existing data
        Object.assign(jobsTally[job], snap.data());
      } catch (error) {
        throw new functions.https.HttpsError(
          "internal",
          `failed to tally details of job ${job}: ${error.message}`
        );
      }
    }
    // Load the profile for the user to get manager information
    const profile = await db.collection("Profiles").doc(context.auth.uid).get();
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
          throw new functions.https.HttpsError("internal", error.message);
        }
        const claims = manager.customClaims;
        if (claims && claims["tapr"] === true) {
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
            offRotationDaysTally: offRotationDates.length,
            workHoursTally,
            mealsHoursTally,
            divisionsTally,
            jobsTally,
            bankedHours,
          });
          return batch.commit();
        } else {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "The manager specified in the Profile doesn't have required permissions"
          );
        }
      } else {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The Profile for this user doesn't contain a managerUid"
        );
      }
    } else {
      throw new functions.https.HttpsError(
        "not-found",
        "A Profile doesn't exist for this user"
      );
    }
  } else {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There are no entries for the week ending ${format(week, "yyyy MMM dd")}`
    );
  }
};

exports.unbundleTimesheet = async (data, context) => {
  const db = admin.firestore();
  const timeSheet = await db.collection("TimeSheets").doc(data.id).get();
  if (timeSheet.exists) {
    // Ensure the caller is authorized
    if (timeSheet.data().uid !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "A timesheet can only be unbundled by its owner"
      );
    }

    if (timeSheet.data().submitted === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "A submitted timesheet cannot be unbundled"
      );
    }
    if (timeSheet.data().approved === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "An approved timesheet cannot be unbundled"
      );
    }
    if (timeSheet.data().locked === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "A locked timesheet cannot be unbundled"
      );
    }

    console.log("TimeSheet found, creating a batch");
    // Start a write batch
    const batch = db.batch();

    // Create new TimeEntres for each entries item in the TimeSheet
    timeSheet.data().entries.forEach((timeEntry) => {
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

exports.writeWeekEnding = functions.firestore
  .document("TimeEntries/{entryId}")
  .onWrite(async (change, context) => {
    if (change.after.exists) {
      // The TimeEntry was not deleted
      let date;
      try {
        // get the date from the TimeEntry
        date = change.after.data().date.toDate();
      } catch (error) {
        console.log(
          `unable to read date for TimeEntry with id ${change.after.id}`
        );
        throw error;
      }
      // If weekEnding is defined on the TimeEntry, get it, otherwise set null
      const weekEnding = Object.prototype.hasOwnProperty.call(
        change.after.data(),
        "weekEnding"
      )
        ? change.after.data().weekEnding.toDate()
        : null;

      // Calculate the correct saturday of the weekEnding
      // (in America/Thunder_Bay timezone)
      let calculatedSaturday;
      if (date.getDay() === 6) {
        // assume the date is already in America/Thunder_Bay Time Zone
        console.log("writeWeekEnding() date is already a saturday");
        calculatedSaturday = zonedTimeToUtc(
          new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            23,
            59,
            59,
            999
          ),
          "America/Thunder_Bay"
        );
      } else {
        console.log("writeWeekEnding() calculating next saturday");
        // assume the date is already in America/Thunder_Bay Time Zone
        const nextsat = new Date(date.valueOf());
        nextsat.setDate(nextsat.getDate() - nextsat.getDay() + 6);
        calculatedSaturday = zonedTimeToUtc(
          new Date(
            nextsat.getFullYear(),
            nextsat.getMonth(),
            nextsat.getDate(),
            23,
            59,
            59,
            999
          ),
          "America/Thunder_Bay"
        );
      }

      // update the TimeEntry only if required
      if (
        weekEnding === null ||
        weekEnding.toDateString() !== calculatedSaturday.toDateString
      ) {
        return change.after.ref.set(
          { weekEnding: calculatedSaturday },
          { merge: true }
        );
      }

      // no changes to be made
      return null;
    } else {
      // The TimeEntry was deleted, do nothing
      console.log("writeWeekEnding() called but time entry was deleted");
      return null;
    }
  });

/*
  If a timesheet is approved, make sure that it is included in the pending
  property of the TimeTracking document for the corresponding weekEnding.
 */
exports.updateTimeTracking = functions.firestore
  .document("TimeSheets/{timesheetId}")
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const after = change.after.data();
    const beforeApproved = change.before.exists
      ? change.before.data().approved
      : false;
    const weekEnding = change.before.exists
      ? change.before.data().weekEnding.toDate()
      : after.weekEnding.toDate();

    // Get the TimeTracking doc if it exists, otherwise create it.
    const querySnap = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let timeTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      timeTrackingDocRef = querySnap.docs[0].ref;
    } else {
      timeTrackingDocRef = db.collection("TimeTracking").doc();
      await timeTrackingDocRef.set({ weekEnding });
    }

    if (
      change.after.exists &&
      after.approved !== beforeApproved &&
      after.approved === true &&
      after.locked === false
    ) {
      timeTrackingDocRef.set(
        {
          pending: admin.firestore.FieldValue.arrayUnion(change.after.ref.path),
        },
        { merge: true }
      );
    } else {
      timeTrackingDocRef.set(
        {
          pending: admin.firestore.FieldValue.arrayRemove(
            change.after.ref.path
          ),
        },
        { merge: true }
      );
    }
  });

/*
  Given a weekEnding as a property of data, lock all of the currently
  approved TimeSheets and add their ids to the timeSheets property array
  of the TimeTracking doc.

  TODO:
  write exportTimesheets function that triggers on TimeTracking write and
  exports *new* items in the timeSheets array to a new JSON doc in Google Cloud
  Storage. The TimeTracking "exports" array field is updated with a link to
  the new document. The function also updates a "consolidated" document which
  contains all of the exports together as well as the individual exports. In
  this way users can see what they've already done.
 */
exports.lockTimesheets = async (data, context) => {
  if (!hasPermission(context)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Call to lockTimesheets() failed"
    );
  }

  const tbay_week = utcToZonedTime(
    new Date(data.weekEnding),
    "America/Thunder_Bay"
  );

  // Overwrite the time to 23:59:59.999 in America/Thunder_Bay time zone
  tbay_week.setHours(23, 59, 59, 999);

  // verify tbay_week is a Saturday in America/Thunder_Bay time zone
  if (tbay_week.getDay() !== 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The week ending specified is not a Saturday"
    );
  }

  // Convert back to UTC for queries against firestore
  const weekEnding = zonedTimeToUtc(new Date(tbay_week), "America/Thunder_Bay");

  // Look for TimeSheets to export
  const db = admin.firestore();
  const timeSheets = await db
    .collection("TimeSheets")
    .where("approved", "==", true)
    .where("locked", "==", false)
    .where("weekEnding", "==", weekEnding)
    .get();

  if (!timeSheets.empty) {
    /* TODO: for each Timesheet, run a transaction to verify
      that submitted & approved are true and that it isn't locked. Then lock it, 
      and add it as an array element to the timeSheets property of the export
      document that has week_ending.getTime() as ID. Create the export document
      if it doesn't already exist.
        
      The idea here is that at some point we can delete locked TimeSheets from
      the database as they're aggregated into TimeTracking. This assists in data
      management while preserving values for future use and reducing queries
    */

    // Get the TimeTracking doc if it exists, otherwise create it.
    const querySnap = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let timeTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      timeTrackingDocRef = querySnap.docs[0].ref;
    } else {
      throw new Error(
        `There is no TimeTracking document for weekEnding ${weekEnding}`
      );
    }

    const transactions = [];
    timeSheets.forEach((timeSheet) => {
      const trans = db.runTransaction(async (transaction) => {
        return transaction.get(timeSheet.ref).then(async (tsSnap) => {
          if (
            tsSnap.data().submitted === true &&
            tsSnap.data().approved === true &&
            tsSnap.data().locked === false
          ) {
            // timesheet is lockable, lock it then add it to the export
            return transaction
              .update(timeSheet.ref, { locked: true })
              .update(timeTrackingDocRef, {
                timeSheets: admin.firestore.FieldValue.arrayUnion(tsSnap.id),
              });
          } else {
            throw new Error(
              "The timesheet has either not been submitted and approved " +
                "or it was already locked"
            );
          }
        });
      });
      transactions.push(trans);
    });
    return Promise.all(transactions).then(() => {
      return this.exportJson(
        { timeTrackingId: timeTrackingDocRef.id },
        context
      );
    });
  } else {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `There are no outstanding approved timesheets for the week ending ${format(
        utcToZonedTime(weekEnding, "America/Thunder_Bay"),
        "yyyy MMM dd"
      )}`
    );
  }
};

// Given a TimeTracking id, create or update a file on Google storage
// with the locked timeSheets
exports.exportJson = async (data, context) => {
  if (hasPermission(context)) {
    // Get locked TimeSheets
    const db = admin.firestore();
    const trackingSnapshot = await db
      .collection("TimeTracking")
      .doc(data.timeTrackingId)
      .get();
    const timeSheetsSnapshot = await db
      .collection("TimeSheets")
      .where("approved", "==", true)
      .where("locked", "==", true)
      .where("weekEnding", "==", trackingSnapshot.get("weekEnding"))
      .get();

    // delete internal properties for each timeSheet
    const timeSheets = timeSheetsSnapshot.docs.map((doc) => {
      const data = doc.data();
      delete data.submitted;
      delete data.approved;
      delete data.locked;
      delete data.rejected;
      delete data.rejectionReason;
      data.weekEnding = data.weekEnding.toDate();
      data.entries.map((entry) => {
        delete entry.weekEnding;
        entry.date = entry.date.toDate();
        return entry;
      });
      return data;
    });

    // generate JSON output
    const output = JSON.stringify(timeSheets);

    // make the filename based on milliseconds since UTC epoch
    const filename = `${trackingSnapshot
      .get("weekEnding")
      .toDate()
      .getTime()}.json`;
    const tempLocalFileName = path.join(os.tmpdir(), filename);

    return new Promise((resolve, reject) => {
      //write contents of json into the temp file
      fs.writeFile(tempLocalFileName, output, (error) => {
        if (error) {
          reject(error);
          return;
        }

        const bucket = admin.storage().bucket();
        const destination = "TimeTrackingExports/" + filename;
        const newToken = uuidv4();

        // upload the file into the current firebase project default bucket
        bucket
          .upload(tempLocalFileName, {
            destination,
            // Workaround: firebase console not generating token for files
            // uploaded via Firebase Admin SDK
            // https://github.com/firebase/firebase-admin-node/issues/694
            metadata: {
              metadata: {
                firebaseStorageDownloadTokens: newToken,
              },
            },
          })
          .then(async (uploadResponse) => {
            // put the path to the new file into the TimeTracking document
            await trackingSnapshot.ref.update({
              json: createPersistentDownloadUrl(
                admin.storage().bucket().name,
                destination,
                newToken
              ),
            });
            return resolve();
          })
          .catch((error) => reject(error));
      });
    });
  } else {
    throw new functions.https.HttpsError(
      "permission-denied",
      "call to exportJson() failed"
    );
  }
};

// Confirm the context has "tadm" claim and throw userful errors as necessary
function hasPermission(context) {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  // caller must have the "tadm" claim
  if (
    !(
      Object.prototype.hasOwnProperty.call(context.auth.token, "tadm") &&
      context.auth.token["tadm"] === true
    )
  ) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "permission-denied",
      `Caller must have the time administration permission`
    );
  } else {
    return true;
  }
}

// If a file object's metadata changes, ensure that the links to it
// inside the corresponding TimeTracking object are updated so that
// downloads continue to work. This allows us to update the token in
// the firebase console for security reasons without breaking the app
// https://www.sentinelstand.com/article/guide-to-firebase-storage-download-urls-tokens
exports.writeFileLinks = functions.storage
  .object()
  .onMetadataUpdate(async (object) => {
    const db = admin.firestore();

    // The object name is milliseconds since epoch UTC of weekEnding
    // derrive the weekEnding from it.
    const parsed = path.parse(object.name);
    const weekEnding = new Date(Number(parsed.name));

    if (isNaN(weekEnding)) {
      throw new Error(
        `filename ${parsed.name} cannot be converted to a date object`
      );
    }

    // Get the TimeTracking doc or throw
    const querySnap = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();

    let timeTrackingDocRef;
    if (querySnap.size > 1) {
      throw new Error(
        `There is more than one document in TimeTracking for weekEnding ${weekEnding}`
      );
    } else if (querySnap.size === 1) {
      timeTrackingDocRef = querySnap.docs[0].ref;
    } else {
      throw new Error(
        `There are no documents in TimeTracking for weekEnding ${weekEnding}`
      );
    }

    return timeTrackingDocRef.update({
      [parsed.ext.substring(1)]: createPersistentDownloadUrl(
        admin.storage().bucket().name,
        object.name,
        object.metadata.firebaseStorageDownloadTokens
      ),
    });
  });

const createPersistentDownloadUrl = (bucket, pathToFile, downloadToken) => {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    pathToFile
  )}?alt=media&token=${downloadToken}`;
};
