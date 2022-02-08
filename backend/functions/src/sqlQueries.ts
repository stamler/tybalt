import * as fs from "fs";
import * as path from "path";

// the array of the filenames without the extension. Will also be used as the
// name property in the object that is returned.
export const queries = [
  { name: "payrollReport", authorizedClaims: ["report"] },
  { name: "stats", authorizedClaims: ["report"] },
];

// Extract SQL query from a file and load to a string
export function loadSQLFileToString(fileName: string): string {
  const filepath = path.join(__dirname,`sql/${fileName}.sql`);
  return fs.readFileSync(filepath).toString()
    .replace(/(\r\n|\n|\r)/gm," ") // remove newlines
    .replace(/\s+/g, " ") // excess white space
    .trim();
}