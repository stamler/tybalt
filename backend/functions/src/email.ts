import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {thisTimeLastWeekInTimeZone, nextSaturday} from "./utilities";
import {format, subDays} from "date-fns";
import {utcToZonedTime} from "date-fns-tz";
import { APP_URL } from "./config";
import * as _ from "lodash";

// Send reminder emails to users who haven't submitted a timesheet at 8am on Tue, Wed, Thu "0 12 * * 2,3,4"
export const scheduledSubmitReminder = functions.pubsub
  .schedule("0 8 * * 2,3,4")
  .timeZone("America/Thunder_Bay")
  .onRun(async (context) => {
    const db = admin.firestore();
    const lastWeek = thisTimeLastWeekInTimeZone(nextSaturday(new Date()),"America/Thunder_Bay");
    functions.logger.info(`creating reminders for week ending ${lastWeek}`);
    const profiles = await db.collection("Profiles").where("timeSheetExpected", "==", true).get();
    const submittedTimesheets = await db.collection("TimeSheets")
      .where("weekEnding", "==", lastWeek)
      .where("submitted", "==", true)
      .get();
    const submittedUids = submittedTimesheets.docs.map(x => x.get("uid"));
    const reminderProfiles = profiles.docs.filter(x => !submittedUids.includes(x.id));
    for (const profile of reminderProfiles) {
      await db.collection("Emails").add({
        toUids: [profile.id],
        message: {
          subject: `Please submit a timesheet for last week`,
          text: 
            `Hi ${ profile.get("givenName")},\n\n` +
            `Your time sheet for the week ending ${
              format(utcToZonedTime(lastWeek,"America/Thunder_Bay"), "MMMM d")
            } is due. Please submit one as soon as possible by visiting ${APP_URL}/time/entries/list\n\n` +
            "- Tybalt",
        },
      });
    }
});

// Send reminder emails to managers who have submitted expenses they must approve at 9am on Thu and Fri "0 12 * * 4,5"
export const scheduledExpenseApprovalReminder = functions.pubsub
  .schedule("0 9 * * 4,5")
  .timeZone("America/Thunder_Bay")
  .onRun(async (context) => {
    const db = admin.firestore();
    const pendingDocuments = await db.collection("Expenses")
      .where("submitted","==", true)
      .where("approved", "==", false)
      .get();
    // filter out the pendingDocuments where rejected === true
    const pendingNoRejected = pendingDocuments.docs.filter(x => x.get("rejected") !== true);
    const managerUids = [...new Set(pendingNoRejected.map(x => x.get("managerUid")))];
    functions.logger.info("creating expense approval reminders");
    for (const managerUid of managerUids) {
      const profile = await db.collection("Profiles").doc(managerUid).get();
      if (!profile.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `The profile doesn't exist for managerUid ${managerUid}`
        );
      }
      await db.collection("Emails").add({
        toUids: [profile.id],
        message: {
          subject: `There are expenses awaiting your approval`,
          text: 
            `Hi ${ profile.get("givenName")},\n\n` +
            `One or more of the staff who report to you have submitted ` +
            `expenses requiring your approval. Please approve them at your ` + 
            `earliest convenience by visiting ` + 
            `${APP_URL}/expense/entries/pending\n\n` +
            "- Tybalt",
        },
      });
    }
});

// Send reminder emails to managers who have submitted timesheets they must approve at 9am on Tue, Wed, Thu "0 12 * * 2,3,4"
export const scheduledTimeSheetApprovalReminder = functions.pubsub
.schedule("0 12 * * 2,3,4")
.timeZone("America/Thunder_Bay")
.onRun(async (context) => {
  const db = admin.firestore();
  const pendingDocuments = await db.collection("TimeSheets")
    .where("submitted","==", true)
    .where("approved", "==", false)
    .get();
  const managerUids = [...new Set(pendingDocuments.docs.map(x => x.get("managerUid")))];
  functions.logger.info("creating time sheet approval reminders");
  for (const managerUid of managerUids) {
    const profile = await db.collection("Profiles").doc(managerUid).get();
    if (!profile.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `The profile doesn't exist for managerUid ${managerUid}`
      );
    }
    await db.collection("Emails").add({
      toUids: [profile.id],
      message: {
        subject: `There are time sheets awaiting your approval`,
        text: 
          `Hi ${ profile.get("givenName")},\n\n` +
          `One or more of the staff who report to you have submitted ` +
          `time sheets requiring your approval. Please approve them at your ` + 
          `earliest convenience by visiting ` + 
          `${APP_URL}/time/sheets/pending\n\n` +
          "- Tybalt",
      },
    });
  }
});

// delete emails more than OLD_AGE_DAYS old at midnight
// TODO: if the batch isn't complete before the next run, it's possible that
// this will loop more times than necessary. Use pagination to not overlap 
// operations
export const scheduledEmailCleanup = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone("America/Thunder_Bay")
  .onRun(async (context) => {
    const OLD_AGE_DAYS = 30;
    functions.logger.info(`Cleaning up emails older than ${OLD_AGE_DAYS} days`);
    const batches = [];
    let moreRemaining = true;  
    const db = admin.firestore();
    while (moreRemaining) {
      // eslint-disable-next-line no-await-in-loop 
      const oldEmails = await db.collection("Emails")
        .where("delivery.endTime", "<", subDays(new Date(), OLD_AGE_DAYS))
        .limit(500) // limit 500 ops per batch request
        .get();
      const batch = db.batch();
      oldEmails.forEach(email => batch.delete(email.ref));
      moreRemaining = oldEmails.size > 499;
      functions.logger.info(`deleting ${oldEmails.size} email docs`);
      batches.push(batch.commit());
    }
    return Promise.all(batches);
});

// onUpdate of TimeSheets or Expenses document
export async function emailOnReject(
  change: functions.ChangeJson,
  context: functions.EventContext,
  collection: "TimeSheets" | "Expenses",
) {
  const afterData = change.after?.data();
  const beforeData = change.before?.data();

  // Return with no action if the Document wasn't just rejected.
  if (!(
      afterData.rejected !== beforeData.rejected && 
      afterData.rejected === true
  )) { return; }

  const db = admin.firestore();

  if (collection === "TimeSheets") {
    const weekEndingString = format(utcToZonedTime(afterData.weekEnding.toDate(),"America/Thunder_Bay"), "MMMM d");
    
    // generate the user email
    await db.collection("Emails").add({
      toUids: [afterData.uid],
      message: {
        subject: `Your time sheet was rejected`,
        text: `Hi ${ afterData.givenName },\n\n` +
        `Your time sheet for the week ending ${ weekEndingString} was rejected by ${
        afterData.rejectorName }. The following reason was provided: \n\n"${
        afterData.rejectionReason }"\n\nPlease edit your time sheet then resubmit as` +
        ` soon as possible by visiting ${APP_URL}/time/sheets/list\n\n- Tybalt`,
      },
    });

    // generate the rejector email
    await db.collection("Emails").add({
      toUids: [afterData.rejectorId],
      message: {
        subject: `You rejected ${ afterData.displayName }'s time sheet`,
        text: `Hi ${ afterData.rejectorName },\n\n` +
        `You rejected ${ afterData.displayName }'s time sheet for the week ` +
        `ending ${weekEndingString}. You provided the following reason:\n\n"${
        afterData.rejectionReason }"\n\n- Tybalt`,
      },
    });

    // if the manager isn't the rejector, generate the manager email
    if (afterData.rejectorId !== afterData.managerUid) {
      await db.collection("Emails").add({
        toUids: [afterData.managerUid],
        message: {
          subject: `${afterData.rejectorName} rejected ${ afterData.displayName }'s time sheet`,
          text: `Hi ${ afterData.managerName },\n\n` +
          `${afterData.rejectorName} rejected ${ afterData.displayName }'s time sheet for the week ` +
          `ending ${weekEndingString}. They provided the following reason:\n\n"${
          afterData.rejectionReason }"\n\n- Tybalt`,
        },
      });
    }


  } else if (collection === "Expenses") {
    const expenseDateString = format(utcToZonedTime(afterData.date.toDate(),"America/Thunder_Bay"), "MMMM d");

    // generate the user email
    await db.collection("Emails").add({
      toUids: [afterData.uid],
      message: {
        subject: `Your expense was rejected`,
        text: `Hi ${ afterData.givenName },\n\n` +
        `Your expense with payment type ${afterData.paymentType} dated ${
        expenseDateString } was rejected by ${ afterData.rejectorName }. ` +
        `The following reason was provided: \n\n"${
        afterData.rejectionReason }"\n\nPlease edit your expense as required by visiting ${APP_URL}/expense/entries/list` +
        "\n\n- Tybalt",
      },
    });

    // generate the rejector email
    await db.collection("Emails").add({
      toUids: [afterData.rejectorId],
      message: {
        subject: `You rejected ${ afterData.displayName }'s expense`,
        text: `Hi ${ afterData.rejectorName },\n\n` +
        `You rejected ${ afterData.displayName }'s expense with payment type ${
        afterData.paymentType} dated ${expenseDateString }. ` +
        `You provided the following reason: \n\n"${afterData.rejectionReason 
        }"\n\n- Tybalt`,
      },
    });

    // if the manager isn't the rejector, generate the manager email
    if (afterData.rejectorId !== afterData.managerUid) {
      await db.collection("Emails").add({
        toUids: [afterData.managerUid],
        message: {
          subject: `${afterData.rejectorName} rejected ${ afterData.displayName }'s expense`,
          text: `Hi ${ afterData.managerName },\n\n` +
          `${afterData.rejectorName} rejected ${ afterData.displayName }'s expense with payment type ${
          afterData.paymentType} dated ${expenseDateString }. ` + 
          `They provided the following reason:\n\n"${
          afterData.rejectionReason }"\n\n- Tybalt`,
        },
      });
    }
  }
}

// onUpdate of TimeSheets document, notify affected users that a time sheet was
// shared
export async function emailOnShare(
  change: functions.ChangeJson,
  context: functions.EventContext,
  collection: "TimeSheets",
) {
  const afterData = change.after?.data();
  const beforeData = change.before?.data();

  const afterViewerIds = Array.isArray(afterData.viewerIds) ? afterData.viewerIds : [];
  const beforeViewerIds = Array.isArray(beforeData.viewerIds) ? beforeData.viewerIds : [];
  const difference: string[] = _.difference(afterViewerIds, beforeViewerIds);

  // Return with no action if viewerIds weren't just modified.
  if (
    afterViewerIds.length === beforeViewerIds.length &&
    difference.length === 0
    ) {
    return;
  }
  
  const db = admin.firestore();
  const profile = await db.collection("Profiles").doc(afterData.uid).get();

  // For each new viewer, generate an email
  for (const viewerId of difference) {
    const viewerProfile = await db.collection("Profiles").doc(viewerId).get();

    if (collection === "TimeSheets") {
      const weekEndingString = format(utcToZonedTime(afterData.weekEnding.toDate(),"America/Thunder_Bay"), "MMMM d");
      
      // generate the user email
      await db.collection("Emails").add({
        toUids: [viewerId],
        message: {
          subject: `${profile.get("displayName")}'s time sheet was shared with you`,
          text: `Hi ${ viewerProfile.get("givenName")},\n\n` +
          `${profile.get("displayName")}'s time sheet for the week ending ${ 
          weekEndingString } has been shared with you by ${ profile.get("managerName") 
          }. You can review timesheets that have been shared with you by` +
          ` visiting ${APP_URL}/time/sheets/shared\n\n- Tybalt`,
        },
      });
    }
  }
}
