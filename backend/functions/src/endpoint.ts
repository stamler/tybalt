import * as functions from "firebase-functions";
import { getAuthObject } from "./utilities";
import { createSSHMySQLConnection2 } from "./sshMysql";
import { queries, loadSQLFileToString } from "./sqlQueries";

interface QueryPayloadObject {
  queryName: string;
  queryValues: any[];
}
function isQueryPayloadObject(data: any): data is QueryPayloadObject {
  if (
    typeof data.queryName === "string" &&
    (data.queryValues === undefined ||
    Array.isArray(data.queryValues))
  ) return true;
  return false;
}

export const queryMySQL = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {

  // Verify data is a QueryPayload that contains queryName, queryValues[]
  if (!isQueryPayloadObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The query payload object didn't validate"
    );
  }

  // get this value from data, for now it's hard coded
  const { queryName, queryValues } = data; 

  // get the SQL and permissions by name from the set of queries
  const query = queries.find(x => x.name===queryName);
  if (query === undefined) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Unable to find a matching SQL query."
    );
  }
  const { name, authorizedClaims } = query;

  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, authorizedClaims);

  // Load and run the query
  const sql = loadSQLFileToString(name);
  const connection = await createSSHMySQLConnection2();
  const [rows, fields] = await connection.query(sql, queryValues);
  
  // process the query and return the data (CSV or JSON) here
  functions.logger.info("field names: " + JSON.stringify(fields.map(x=>x.name)));
  return rows;
});
