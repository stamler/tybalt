import * as fs from "fs";
import * as path from "path";

// the array of the filenames without the extension. Will also be used as the
// name property in the object that is returned.
// name: the basename of the sql query file and a unique reference
// authorizedClaims: required claims to call this query
// valueMutator: a function to preprocess the queryValues
export const queries = [
  { name: "jobEntriesSummary-startsWith", authorizedClaims: ["time"] },
  { name: "jobEntriesSummary", authorizedClaims: ["time"] },
  { name: "jobReport-startsWith", authorizedClaims: ["report"] },
  { name: "jobReport", authorizedClaims: ["report"] },
  { name: "payrollReport-TimeEntriesOnly", authorizedClaims: ["report"] },
  { name: "payrollReport-FoldedAmendments", authorizedClaims: ["report"], valueMutator: (x: any)=>[x,x,x] },
  { name: "utilizationRate", authorizedClaims: ["kpi"] },
  { name: "stats", authorizedClaims: ["kpi"] },
];

// Extract SQL query from a file and load to a string
export function loadSQLFileToString(fileName: string): string {
  const filepath = path.join(__dirname,`sql/${fileName}.sql`);
  return fs.readFileSync(filepath).toString()
    .replace(/(\r\n|\n|\r)/gm," ") // remove newlines
    .replace(/\s+/g, " ") // excess white space
    .trim();
}