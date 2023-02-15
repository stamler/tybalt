import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAuthObject, isWeekReference } from "./utilities";
import { tallyAndValidate } from "./tallyAndValidate";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";
import { format, subMilliseconds, addMilliseconds } from "date-fns";

const EXACT_TIME_SEARCH = false; // WAS true, but turned to false because firestore suddently stopped matching "==" Javascript Date Objects
const WITHIN_MSEC = 1;

// The bundleTimesheet groups TimeEntries together
// into a timesheet for a given user and week
// time is ignored in weekEnding property of data arg
export async function bundleTimesheet(
  data: unknown, 
  context: functions.https.CallableContext
) {
  const db = admin.firestore();

  // throw if the caller isn't authenticated & authorized
  const auth = getAuthObject(context, ["time"]);

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isWeekReference(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid week reference"
    );
  }

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

  // This function must be idempotent because sometimes it is triggered
  // more than once. In a transaction, we first CONFIRM that a document with the
  // id auth.uid doesn't exist in "Locks". If it does, we throw. Otherwise
  // create a document in "Locks" with the id auth.uid and a description stating
  // "Timesheet bundling in progress" along with a timestamp. Then we do the
  // work of bundling the timesheets. If the work is successful, we delete the
  // document in "Locks" with the id auth.uid in the batch that does the
  // bundling. If the work fails, we make sure to delete the document in "Locks"
  // where the failure occurred then throw any errors.
  await db.runTransaction(async (t) => {
    const lockDoc = await t.get(db.collection("Locks").doc(auth.uid));
    if (lockDoc.exists) {
      functions.logger.warn(`Lock document exists for ${auth.uid}`);
      throw new functions.https.HttpsError(
        "failed-precondition",
        "A timesheet bundling operation is already in progress for this user."
        );
    }
    return t.set(db.collection("Locks").doc(auth.uid), {
      description: "Timesheet bundling in progress",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  // At this point, other instances of this function will throw because a lock
  // document exists for this user. We must delete the lock document in the
  // batch that does the bundling or in the catch block if the bundling fails.

  let timeSheets;
  if (EXACT_TIME_SEARCH) {
    timeSheets = await db
      .collection("TimeSheets")
      .where("uid", "==", auth.uid)
      .where("weekEnding", "==", week)
      .get();
  } else {
    timeSheets = await db
      .collection("TimeSheets")
      .where("uid", "==", auth.uid)
      .where("weekEnding", ">", subMilliseconds(week, WITHIN_MSEC))
      .where("weekEnding", "<", addMilliseconds(week, WITHIN_MSEC))
      .get();    
  }
  if (!timeSheets.empty) {
    // delete the lock document
    await db.collection("Locks").doc(auth.uid).delete();

    throw new functions.https.HttpsError(
      "failed-precondition",
      "Only one time sheet can exist for a week. Please edit the existing one."
    );
  }

  // Look for TimeEntries to bundle
  let timeEntries;
  if (EXACT_TIME_SEARCH) {
    timeEntries = await db
      .collection("TimeEntries")
      .where("uid", "==", auth.uid)
      .where("weekEnding", "==", week)
      .orderBy("date", "asc")
      .get();
  } else {
    timeEntries = await db
      .collection("TimeEntries")
      .where("uid", "==", auth.uid)
      .where("weekEnding", ">", subMilliseconds(week, WITHIN_MSEC))
      .where("weekEnding", "<", addMilliseconds(week, WITHIN_MSEC))
      .get();
  }
  if (timeEntries.empty) {
    // delete the lock document
    await db.collection("Locks").doc(auth.uid).delete();

    throw new functions.https.HttpsError(
      "failed-precondition",
      `There are no entries for the week ending ${format(week, "yyyy MMM dd")}`
    );
  }
  // Outstanding TimeEntries exist, start the bundling process
  const batch = db.batch();

  // delete the lock document
  batch.delete(db.collection("Locks").doc(auth.uid));

  // Load the profile for the user to get manager and salary information
  const profile = await db.collection("Profiles").doc(auth.uid).get();
  if (!profile.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "A Profile doesn't exist for this user"
    );
  }
  
  // tally and validate the TimeEntries then delete them
  const timesheetData = await tallyAndValidate(auth, profile, timeEntries, week);
  timeEntries.forEach((entry) => {batch.delete(entry.ref)});

  // Verify that the auth user with managerUid exists
  let manager, managerProfile;
  try {
    manager = await admin.auth().getUser(profile.get("managerUid"));
    managerProfile = await db.collection("Profiles").doc(profile.get("managerUid")).get();
  } catch (error: unknown) {
    const typedError = error as Error;

    // The Profile for this user likely specifies an identifier
    // (managerUid) that doesn't correspond to valid User Record.
    throw new functions.https.HttpsError("internal", typedError.message);
  }
  const claims = manager.customClaims;
  if (claims && claims["tapr"] === true) {
    if (timesheetData.skipMinTimeCheck === true) {
      // the flag was previously set, clear it
      batch.update(profile.ref,{ skipMinTimeCheckOnNextBundle: admin.firestore.FieldValue.delete() })
    }
    // delete the flag from the return value of tallyAndValidate(), the new timesheet
    delete timesheetData.skipMinTimeCheck;

    if (managerProfile.get("doNotAcceptSubmissions") === true) {
      const alternate = managerProfile.get("alternateManager");
      if (alternate !== undefined) {
        const alternateProfile = await db.collection("ManagerNames").doc(alternate).get();
        const displayName = alternateProfile.get("displayName")
        if (displayName !== undefined) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `${managerProfile.get("displayName")} is not accepting submissions but has specified ${displayName} as their alternate manager. Please choose another manager.`
          )
        }
      }
      throw new functions.https.HttpsError(
        "failed-precondition",
        `${managerProfile.get("displayName")} is not accepting submissions. Please choose another manager.`
      )
    }

    // The profile contains a valid manager, build the TimeSheet document
    const tsRef = db.collection("TimeSheets").doc();
    batch.set(tsRef, timesheetData);
    return batch.commit();
  } else {
    // delete the lock document
    await db.collection("Locks").doc(auth.uid).delete();
    throw new functions.https.HttpsError(
      "failed-precondition",
      `${managerProfile.get("displayName")} doesn't have required permissions`
    );
  }
};
