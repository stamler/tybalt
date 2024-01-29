import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { APP_NATIVE_TZ } from "./config";
const db = admin.firestore();

// Log the export status of all locked TimeSheets Wednesdays at 10pm
export const auditExportStatus = onSchedule({
  memory: "1GiB", // default is "256MB
  timeoutSeconds: 120,
  schedule: "30 12,17 * * 1-5", // M-F 12:30 & 5:30pm, 10 times per week,
  timeZone: APP_NATIVE_TZ,
}, async(event) => {
    logger.debug(`auditExportStatus function triggered ${event.jobName}`);
    const lockedTimesheets = await db.collection("TimeSheets")
      .where("locked", "==", true)
      .get();
    const docs = lockedTimesheets.docs;
    const enumerate = (tally: any, currentValue:any) => {
      switch(currentValue.get("exported")) {
        case undefined:
          tally["undefined"] += 1;
          return tally;
        case true:
          tally["true"] += 1;
          return tally;
        case false:
          tally["false"] += 1;
          return tally;
        default:
          tally["other"] += 1;
          return tally;
      }
    };
    const counts = docs.reduce(enumerate,{"true":0, "false":0, "undefined":0, "other": 0});
    logger.info(`retrieved ${docs.length} locked TimeSheets docs ${JSON.stringify(counts)}`);
});
