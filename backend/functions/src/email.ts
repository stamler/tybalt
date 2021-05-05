import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {thisTimeLastWeekInTimeZone, nextSaturday} from "./utilities";
import {format} from "date-fns";
import {utcToZonedTime} from "date-fns-tz";

// Send reminder emails to users who haven't submitted a timesheet at noon GMT on Tue, Wed, Thu "0 12 * * 2,3,4"
export const scheduledSubmitReminder = functions.pubsub
  .schedule("*/5 * * * *")
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
        toUids: profile.id,
        message: {
          subject: `Please submit a timesheet for last week`,
          text: 
            `Hi ${ profile.get("givenName")},\n\n` +
            `You haven't yet submitted a time sheet for the week ending ${
              format(utcToZonedTime(lastWeek,"America/Thunder_Bay"), "MMMM d")
            }. Please submit one as soon as possible.\n\n` +
            "-tybalt",
        },
      })
    }
});
