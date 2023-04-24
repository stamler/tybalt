import * as fs from "fs";
import * as path from "path";
import { thisTimeNextWeekInTimeZone } from "./utilities";
import { format, addDays } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";
import * as functions from "firebase-functions";
import { APP_NATIVE_TZ } from "./config";

// the array of the filenames without the extension. Will also be used as the
// name property in the object that is returned.
// name: the basename of the sql query file and a unique reference
// authorizedClaims: required claims to call this query
// valueMutator: a function to preprocess the queryValues
export const queries = [
  { name: "jobEntriesSummary-startsWith", authorizedClaims: ["time"] },
  { name: "jobEntriesSummary", authorizedClaims: ["time"] },
  { name: "jobReport-startsWith", authorizedClaims: ["report", "tapr"] },
  { name: "jobReport", authorizedClaims: ["report", "tapr"] },
  { name: "payrollReport-TimeEntriesOnly", authorizedClaims: ["report"] },
  { name: "payrollReport-FoldedAmendments", authorizedClaims: ["report"], valueMutator: (x: any)=>[x,x,x] },
  { name: "utilizationRate", authorizedClaims: ["kpi"] },
  { name: "utilizationRate-withTimeOff", authorizedClaims: ["kpi"] },
  { name: "stats", authorizedClaims: ["kpi"] },
  { name: "timetypeSummary", authorizedClaims: ["kpi"] },
  { name: "payablesPayrollCSV", authorizedClaims: ["report"], beforeFunction: waitingPeriodPassed },
  { name: "payablesWeeklyCSV", authorizedClaims: ["report"] },
  { name: "weeklyTimeSummaryPerEmployee", authorizedClaims: ["report"] },
];

/* 
throw if the current datetime is before the end of the week following the pay
period because more expenses may still be committed. This allows adding and
committing of expenses up to a full week following the end of the pay period to
be paid out during that period
*/
function waitingPeriodPassed(queryValues: any) {
  // queryValues[0] is a date-only string, it needs to be a date object with the
  // correct time for the timezone. weekEndingAsZulu is a date object as though
  // the time of record is zulu time. We need to add the timezone offset to get
  // the correct time for the timezone (still represented in zulu).
  const weekEndingLocal = new Date(queryValues[0]+"T23:59:59.999Z")
  const zoned_week = zonedTimeToUtc(weekEndingLocal, APP_NATIVE_TZ);

  if (new Date() < thisTimeNextWeekInTimeZone(zoned_week, APP_NATIVE_TZ)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Wait until ${format(addDays(weekEndingLocal,8), "MMM dd")} to process expenses for pay period ending ${format(weekEndingLocal, "MMM dd")}`
    )
  }
}

// Extract SQL query from a file and load to a string
export function loadSQLFileToString(fileName: string): string {
  const filepath = path.join(__dirname,`sql/${fileName}.sql`);
  return fs.readFileSync(filepath).toString()
    .replace(/(\r\n|\n|\r)/gm," ") // remove newlines
    .replace(/\s+/g, " ") // excess white space
    .trim();
}