import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {thisTimeLastWeekInTimeZone, nextSaturday} from "./utilities";
import {format, subDays} from "date-fns";
import {utcToZonedTime} from "date-fns-tz";

// Send reminder emails to users who haven't submitted a timesheet at noon GMT on Tue, Wed, Thu "0 12 * * 2,3,4"
export const scheduledSubmitReminder = functions.pubsub
  .schedule("0 12 * * 2,3,4")
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
            } is due. Please submit one as soon as possible.\n\n` +
            "- Tybalt",
        },
      });
    }
});

// Send reminder emails to managers who have submitted expenses they must approve at noon GMT on Thu and Fri "0 12 * * 4,5"
export const scheduledExpenseApprovalReminder = functions.pubsub
  .schedule("0 12 * * 4,5")
  .onRun(async (context) => {
    const db = admin.firestore();
    const pendingExpenses = await db.collection("Expenses")
      .where("submitted","==", true)
      .where("approved", "==", false)
      .get();
    const managerUids = [...new Set(pendingExpenses.docs.map(x => x.get("managerUid")))];
    functions.logger.info("creating expense approval reminders");
    for (const managerUid in managerUids) {
      const profile = await db.collection("Profiles").doc(managerUid).get();
      await db.collection("Emails").add({
        toUids: [profile.id],
        message: {
          subject: `There are expenses awaiting your approval`,
          text: 
            `Hi ${ profile.get("givenName")},\n\n` +
            `One or more of the staff who report to you have submitted ` +
            `expenses requiring your approval. Please approve them at your ` + 
            `earliest convenience by visiting ` + 
            `https://tybalt.tbte.ca/expense/entries/pending\n\n` +
            "- Tybalt",
        },
      });
    }
});

// delete emails more than OLD_AGE_DAYS old at midnight UTC 
// TODO: if the batch isn't complete before the next run, it's possible that
// this will loop more times than necessary. Use pagination to not overlap 
// operations
export const scheduledEmailCleanup = functions.pubsub
  .schedule("0 0 * * *")
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
