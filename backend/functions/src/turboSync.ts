/**
 * Sync data from Turbo writeback API routes to legacy Firestore collections.
 * 
 * This module provides utilities to poll Turbo every 30 minutes and store
 * the returned data in legacy Tybalt's Firestore collections.
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import axios, { isAxiosError } from "axios";
import { zonedTimeToUtc } from "date-fns-tz";
import { format } from "date-fns";
import { APP_NATIVE_TZ, TURBO_BASE_URL } from "./config";
import { foldCollection } from "./sync";

const db = admin.firestore();

/**
 * Generic transform function type.
 * Takes an object from the API response and returns the transformed object
 * to be stored in Firestore.
 * 
 * Use this to modify data before writing, for example:
 * - Adding a sync timestamp
 * - Renaming or removing fields
 * - Converting data types
 * 
 * @example
 * // Add a timestamp to each synced document
 * const addTimestamp: TransformFunction = (item) => ({
 *   ...item,
 *   syncedAt: admin.firestore.FieldValue.serverTimestamp(),
 * });
 * 
 * @example
 * // Rename a field and remove another
 * const transformJob: TransformFunction = (item) => {
 *   const { oldFieldName, fieldToRemove, ...rest } = item;
 *   return {
 *     ...rest,
 *     newFieldName: oldFieldName,
 *   };
 * };
 */
export type TransformFunction<T = Record<string, unknown>> = (item: T) => Record<string, unknown>;

/**
 * Options for the fetchAndSyncToFirestore function.
 */
export interface FetchAndSyncOptions<T = Record<string, unknown>> {
  /** The URL to fetch JSON data from */
  url: string;
  /** The field name in each object to use as the Firestore document ID */
  idField: string;
  /** The Firestore collection name to write documents to */
  collectionName: string;
  /** Optional transform function to modify objects before writing */
  transform?: TransformFunction<T>;
  /** Optional authorization header value (e.g., "Bearer <token>") */
  authHeader?: string;
}

/**
 * Response format from jobs writeback endpoint.
 * Contains separate arrays for jobs, clients, client contacts, and rate data.
 */
export interface JobsWritebackResponse {
  jobs: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  clientContacts: Record<string, unknown>[];
  rateRoles: Record<string, unknown>[];
  rateSheets: Record<string, unknown>[];
  rateSheetEntries: Record<string, unknown>[];
}

/**
 * Response format from expenses writeback endpoint.
 * Contains separate arrays for expenses, vendors, and purchase orders.
 */
export interface ExpensesWritebackResponse {
  expenses: Record<string, unknown>[];
  vendors: Record<string, unknown>[];
  purchaseOrders: Record<string, unknown>[];
}

const WRITEBACK_DATE_FIELDS = [
  "projectAwardDate",
  "proposalOpeningDate",
  "proposalSubmissionDueDate",
] as const;

function toNoonEasternTimestamp(value: unknown): admin.firestore.Timestamp | unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return value;
  }
  const noonEastern = zonedTimeToUtc(`${trimmed}T12:00:00`, APP_NATIVE_TZ);
  return admin.firestore.Timestamp.fromDate(noonEastern);
}

// For weekEnding fields: 23:59:59.999 Thunder Bay time
function toEndOfDayTimestamp(value: unknown): admin.firestore.Timestamp | unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return value;
  const endOfDay = zonedTimeToUtc(`${trimmed}T23:59:59.999`, APP_NATIVE_TZ);
  return admin.firestore.Timestamp.fromDate(endOfDay);
}

// For commitTime: parse ISO datetime string
function toTimestampFromISO(value: unknown): admin.firestore.Timestamp | unknown {
  if (typeof value !== "string") return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return admin.firestore.Timestamp.fromDate(parsed);
}

function convertWritebackJobDates(job: Record<string, unknown>): Record<string, unknown> {
  const converted = { ...job };
  for (const field of WRITEBACK_DATE_FIELDS) {
    if (field in converted) {
      converted[field] = toNoonEasternTimestamp(converted[field]);
    }
  }
  return converted;
}

const EXPENSE_NOON_FIELDS = ["date"] as const;
const EXPENSE_END_OF_DAY_FIELDS = ["committedWeekEnding", "payPeriodEnding"] as const;
const EXPENSE_ISO_DATETIME_FIELDS = ["commitTime"] as const;

function convertWritebackExpenseDates(expense: Record<string, unknown>): Record<string, unknown> {
  const converted = { ...expense };
  for (const field of EXPENSE_NOON_FIELDS) {
    if (field in converted) converted[field] = toNoonEasternTimestamp(converted[field]);
  }
  for (const field of EXPENSE_END_OF_DAY_FIELDS) {
    if (field in converted) converted[field] = toEndOfDayTimestamp(converted[field]);
  }
  for (const field of EXPENSE_ISO_DATETIME_FIELDS) {
    if (field in converted) converted[field] = toTimestampFromISO(converted[field]);
  }
  return converted;
}

/**
 * Converts date strings in a timesheet writeback object to Firestore Timestamps.
 * - weekEnding (top-level and in entries): end-of-day (23:59:59.999 Thunder Bay time)
 * - date (in entries): noon Eastern time
 */
function convertWritebackTimesheetDates(timesheet: Record<string, unknown>): Record<string, unknown> {
  const converted = { ...timesheet };
  // Convert top-level weekEnding
  if ("weekEnding" in converted) {
    converted["weekEnding"] = toEndOfDayTimestamp(converted["weekEnding"]);
  }
  // Convert date fields in entries array
  if (Array.isArray(converted["entries"])) {
    converted["entries"] = (converted["entries"] as Record<string, unknown>[]).map((entry) => {
      const convertedEntry = { ...entry };
      if ("weekEnding" in convertedEntry) {
        convertedEntry["weekEnding"] = toEndOfDayTimestamp(convertedEntry["weekEnding"]);
      }
      if ("date" in convertedEntry) {
        convertedEntry["date"] = toNoonEasternTimestamp(convertedEntry["date"]);
      }
      return convertedEntry;
    });
  }
  return converted;
}

/**
 * Returns an array of Saturday dates (YYYY-MM-DD) to sync.
 * - If today is Saturday: returns today + previous (count-1) Saturdays
 * - Otherwise: returns next Saturday + previous (count-1) Saturdays
 */
function getSaturdaysToSync(count: number): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
  
  // If today is Saturday, use today; otherwise use next Saturday
  const daysToAdd = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
  const baseSaturday = new Date(now);
  baseSaturday.setDate(now.getDate() + daysToAdd);
  
  const saturdays: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseSaturday);
    d.setDate(baseSaturday.getDate() - (i * 7));
    saturdays.push(format(d, "yyyy-MM-dd"));
  }
  return saturdays;
}

/**
 * Fetches a JSON array from a URL and writes each object to a Firestore collection.
 * 
 * For each object in the array:
 * 1. Extracts the value of the specified id field to use as the document ID
 * 2. Optionally transforms the object using the provided transform function
 * 3. Writes the object to the specified Firestore collection
 * 
 * @param options Configuration options for the sync operation
 * @returns Promise resolving to the number of documents written
 * @throws Error if the fetch fails or the response is not a valid JSON array
 */
export async function fetchAndSyncToFirestore<T extends Record<string, unknown>>(
  options: FetchAndSyncOptions<T>
): Promise<number> {
  const { url, idField, collectionName, transform, authHeader } = options;
  
  functions.logger.info(`Fetching data from ${url} to sync to ${collectionName}`);
  
  // Fetch the data from the URL
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  
  let response;
  try {
    response = await axios.get(url, { headers });
  } catch (error) {
    if (isAxiosError(error)) {
      functions.logger.error(`Failed to fetch from ${url}: ${error.message}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
    }
    throw error;
  }
  
  const data = response.data;
  
  // Validate that the response is an array
  if (!Array.isArray(data)) {
    throw new Error(`Expected JSON array from ${url}, got ${typeof data}`);
  }
  
  if (data.length === 0) {
    functions.logger.info(`No data returned from ${url}, nothing to sync`);
    return 0;
  }
  
  // Process in batches of 500 (Firestore batch limit)
  const BATCH_SIZE = 500;
  let totalWritten = 0;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batchData = data.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    
    for (const item of batchData) {
      // Extract the document ID from the specified field
      const docId = item[idField];
      if (docId === undefined || docId === null) {
        functions.logger.warn(`Skipping item without ${idField} field`, { item });
        continue;
      }
      
      // Convert the ID to string (in case it's a number or other type)
      const docIdStr = String(docId);
      
      // Apply transform if provided, otherwise use the item as-is
      const docData = transform ? transform(item as T) : item;
      
      // Write to Firestore (full overwrite since this is staging data)
      const docRef = db.collection(collectionName).doc(docIdStr);
      batch.set(docRef, docData);
      totalWritten++;
    }
    
    await batch.commit();
    functions.logger.debug(`Committed batch of ${batchData.length} documents to ${collectionName}`);
  }
  
  functions.logger.info(`Successfully synced ${totalWritten} documents to ${collectionName}`);
  return totalWritten;
}

/**
 * Syncs an array of objects to a Firestore collection in batches.
 * 
 * @param data Array of objects to sync
 * @param idField The field name to use as the Firestore document ID
 * @param collectionName The Firestore collection to write to
 * @returns Promise resolving to the number of documents written
 */
async function syncArrayToFirestore(
  data: Record<string, unknown>[],
  idField: string,
  collectionName: string
): Promise<number> {
  if (data.length === 0) {
    functions.logger.info(`No data to sync to ${collectionName}`);
    return 0;
  }

  // Process in batches of 500 (Firestore batch limit)
  const BATCH_SIZE = 500;
  let totalWritten = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batchData = data.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const item of batchData) {
      // Extract the document ID from the specified field
      const docId = item[idField];
      if (docId === undefined || docId === null) {
        functions.logger.warn(`Skipping item without ${idField} field`, { item });
        continue;
      }

      // Convert the ID to string (in case it's a number or other type)
      const docIdStr = String(docId);

      // Write to Firestore (full overwrite since this is staging data)
      const docRef = db.collection(collectionName).doc(docIdStr);
      batch.set(docRef, item);
      totalWritten++;
    }

    await batch.commit();
    functions.logger.debug(`Committed batch of ${batchData.length} documents to ${collectionName}`);
  }

  functions.logger.info(`Successfully synced ${totalWritten} documents to ${collectionName}`);
  return totalWritten;
}

/**
 * Fetches the jobs writeback response (object with jobs, clients, clientContacts, and rate data arrays)
 * and syncs each array to its respective Firestore collection.
 * 
 * @param url The URL to fetch the structured response from
 * @param authHeader Authorization header value
 * @returns Promise resolving to counts of documents written per collection
 */
export async function fetchAndSyncJobsWriteback(
  url: string,
  authHeader: string
): Promise<{
  jobs: number;
  clients: number;
  clientContacts: number;
  rateRoles: number;
  rateSheets: number;
  rateSheetEntries: number;
}> {
  functions.logger.info(`Fetching jobs writeback data from ${url}`);

  // Fetch the data from the URL
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader,
  };

  let response;
  try {
    response = await axios.get(url, { headers });
  } catch (error) {
    if (isAxiosError(error)) {
      functions.logger.error(`Failed to fetch from ${url}: ${error.message}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
    }
    throw error;
  }

  const data = response.data as JobsWritebackResponse;

  // Validate that the response has the expected structure
  if (!data || typeof data !== "object") {
    throw new Error(`Expected object response from ${url}, got ${typeof data}`);
  }
  if (!Array.isArray(data.jobs)) {
    throw new Error(`Expected jobs array in response from ${url}`);
  }
  if (!Array.isArray(data.clients)) {
    throw new Error(`Expected clients array in response from ${url}`);
  }
  if (!Array.isArray(data.clientContacts)) {
    throw new Error(`Expected clientContacts array in response from ${url}`);
  }
  if (!Array.isArray(data.rateRoles)) {
    throw new Error(`Expected rateRoles array in response from ${url}`);
  }
  if (!Array.isArray(data.rateSheets)) {
    throw new Error(`Expected rateSheets array in response from ${url}`);
  }
  if (!Array.isArray(data.rateSheetEntries)) {
    throw new Error(`Expected rateSheetEntries array in response from ${url}`);
  }

  functions.logger.info(
    `Fetched ${data.jobs.length} jobs, ${data.clients.length} clients, ${data.clientContacts.length} contacts, ` +
    `${data.rateRoles.length} rateRoles, ${data.rateSheets.length} rateSheets, ${data.rateSheetEntries.length} rateSheetEntries`
  );

  // Sync each array to its respective collection
  // Jobs use "number" as key (to match legacy Jobs collection for fold operation)
  // All other collections use "id" (PocketBase ID) as key
  const convertedJobs = data.jobs.map(convertWritebackJobDates);
  const [
    jobsWritten,
    clientsWritten,
    contactsWritten,
    rateRolesWritten,
    rateSheetsWritten,
    rateSheetEntriesWritten,
  ] = await Promise.all([
    syncArrayToFirestore(convertedJobs, "number", "TurboJobsWriteback"),
    syncArrayToFirestore(data.clients, "id", "TurboClientsWriteback"),
    syncArrayToFirestore(data.clientContacts, "id", "TurboClientContactsWriteback"),
    syncArrayToFirestore(data.rateRoles, "id", "TurboRateRolesWriteback"),
    syncArrayToFirestore(data.rateSheets, "id", "TurboRateSheetsWriteback"),
    syncArrayToFirestore(data.rateSheetEntries, "id", "TurboRateSheetEntriesWriteback"),
  ]);

  return {
    jobs: jobsWritten,
    clients: clientsWritten,
    clientContacts: contactsWritten,
    rateRoles: rateRolesWritten,
    rateSheets: rateSheetsWritten,
    rateSheetEntries: rateSheetEntriesWritten,
  };
}

/**
 * Fetches the expenses writeback response (object with expenses, vendors, purchaseOrders arrays)
 * and syncs each array to its respective Firestore collection.
 * 
 * @param url The URL to fetch the structured response from
 * @param authHeader Authorization header value
 * @returns Promise resolving to counts of documents written per collection
 */
export async function fetchAndSyncExpensesWriteback(
  url: string,
  authHeader: string
): Promise<{ expenses: number; vendors: number; purchaseOrders: number }> {
  functions.logger.info(`Fetching expenses writeback data from ${url}`);

  // Fetch the data from the URL
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader,
  };

  let response;
  try {
    response = await axios.get(url, { headers });
  } catch (error) {
    if (isAxiosError(error)) {
      functions.logger.error(`Failed to fetch from ${url}: ${error.message}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
    }
    throw error;
  }

  const data = response.data as ExpensesWritebackResponse;

  // Validate that the response has the expected structure
  if (!data || typeof data !== "object") {
    throw new Error(`Expected object response from ${url}, got ${typeof data}`);
  }
  if (!Array.isArray(data.expenses)) {
    throw new Error(`Expected expenses array in response from ${url}`);
  }
  if (!Array.isArray(data.vendors)) {
    throw new Error(`Expected vendors array in response from ${url}`);
  }
  if (!Array.isArray(data.purchaseOrders)) {
    throw new Error(`Expected purchaseOrders array in response from ${url}`);
  }

  functions.logger.info(
    `Fetched ${data.expenses.length} expenses, ${data.vendors.length} vendors, ${data.purchaseOrders.length} purchaseOrders`
  );

  // Sync each array to its respective collection
  // Expenses use "immutableID" as key (to match legacy Expenses collection for fold operation)
  // Vendors and purchaseOrders use "id" (PocketBase ID) as key
  const convertedExpenses = data.expenses.map(convertWritebackExpenseDates);
  const [expensesWritten, vendorsWritten, posWritten] = await Promise.all([
    syncArrayToFirestore(convertedExpenses, "immutableID", "TurboExpensesWriteback"),
    syncArrayToFirestore(data.vendors, "id", "TurboVendorsWriteback"),
    syncArrayToFirestore(data.purchaseOrders, "id", "TurboPurchaseOrdersWriteback"),
  ]);

  return {
    expenses: expensesWritten,
    vendors: vendorsWritten,
    purchaseOrders: posWritten,
  };
}

/**
 * Fetches time sheets for multiple week endings from Turbo's export_legacy API
 * and syncs them to the TurboTimeSheetsWriteback Firestore collection.
 * 
 * @param baseUrl The base URL of the Turbo API
 * @param authHeader Authorization header value
 * @param weekEndings Array of week ending dates (YYYY-MM-DD format)
 * @returns Promise resolving to count of timesheets written
 */
export async function fetchAndSyncTimeSheetsWriteback(
  baseUrl: string,
  authHeader: string,
  weekEndings: string[]
): Promise<{ timesheets: number }> {
  functions.logger.info(`Fetching timesheets writeback data for ${weekEndings.length} weeks`, { weekEndings });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader,
  };

  // Fetch all week endings in parallel
  const fetchPromises = weekEndings.map(async (weekEnding) => {
    try {
      const url = `${baseUrl}/api/export_legacy/time_sheets/${weekEnding}`;
      const response = await axios.get(url, { headers });
      const data = response.data;
      
      if (!Array.isArray(data)) {
        functions.logger.warn(`Expected array from ${url}, got ${typeof data}`);
        return [];
      }
      return data as Record<string, unknown>[];
    } catch (error) {
      if (isAxiosError(error)) {
        functions.logger.error(`Failed to fetch timesheets for ${weekEnding}: ${error.message}`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
        });
      }
      // Return empty array on error to allow other weeks to succeed
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  
  // Flatten all results into a single array
  const allTimesheets = results.flat();
  
  if (allTimesheets.length === 0) {
    functions.logger.info("No timesheets returned from any week ending");
    return { timesheets: 0 };
  }

  functions.logger.info(`Fetched ${allTimesheets.length} timesheets across ${weekEndings.length} weeks`);

  // Convert date fields
  const convertedTimesheets = allTimesheets.map(convertWritebackTimesheetDates);

  // Sync to Firestore using "id" as document key
  const timesheetsWritten = await syncArrayToFirestore(
    convertedTimesheets,
    "id",
    "TurboTimeSheetsWriteback"
  );

  return { timesheets: timesheetsWritten };
}

// =============================================================================
// Scheduled sync functions
// =============================================================================

/**
 * Secret for authenticating with Turbo's export_legacy API.
 * 
 * This token is created via Turbo's Machine Secrets UI (/machine_secrets) and
 * stored in Google Cloud Secret Manager as TURBO_AUTH_TOKEN.
 * 
 * ## IMPORTANT: Updating the Secret
 * 
 * When you update the secret in Google Secret Manager, **you must redeploy
 * the Cloud Functions** that depend on it. Cloud Function instances cache
 * secret values at startup and don't automatically pick up changes.
 * 
 * To redeploy after updating the secret:
 * ```bash
 * firebase deploy --only functions:scheduledTurboJobsWritebackSync
 * ```
 * 
 * Without redeploying, the function will continue using the old (possibly
 * disabled/expired) token until the instances are recycled.
 */
const TURBO_AUTH_TOKEN_SECRET_NAME = "TURBO_AUTH_TOKEN";
const TURBO_AUTH_TOKEN = defineSecret(TURBO_AUTH_TOKEN_SECRET_NAME);

/**
 * Scheduled function that syncs Jobs, Clients, ClientContacts, and Rate data from Turbo every 30 minutes.
 * 
 * Fetches all jobs updated since 2026-01-01 from Turbo's export_legacy API
 * and writes:
 * - jobs array to TurboJobsWriteback collection
 * - clients array to TurboClientsWriteback collection  
 * - clientContacts array to TurboClientContactsWriteback collection
 * - rateRoles array to TurboRateRolesWriteback collection
 * - rateSheets array to TurboRateSheetsWriteback collection
 * - rateSheetEntries array to TurboRateSheetEntriesWriteback collection
 */
export const scheduledTurboJobsWritebackSync = functions
  .runWith({ secrets: [TURBO_AUTH_TOKEN_SECRET_NAME], timeoutSeconds: 180, memory: "1GB" })
  .pubsub
  .schedule("every 20 minutes")
  .onRun(async (context) => {
    functions.logger.info("Starting scheduled Turbo Jobs/Clients/Contacts/Rates sync");
    
    try {
      const result = await fetchAndSyncJobsWriteback(
        `${TURBO_BASE_URL}/api/export_legacy/jobs/2026-01-01`,
        `Bearer ${TURBO_AUTH_TOKEN.value()}`
      );
      
      functions.logger.info("Scheduled Turbo sync completed successfully", {
        jobsWritten: result.jobs,
        clientsWritten: result.clients,
        contactsWritten: result.clientContacts,
        rateRolesWritten: result.rateRoles,
        rateSheetsWritten: result.rateSheets,
        rateSheetEntriesWritten: result.rateSheetEntries,
      });

      // Fold TurboJobsWriteback into Jobs immediately after writeback
      // Errors are logged but not thrown - data remains in TurboJobsWriteback for next run
      try {
        await foldCollection(
          "TurboJobsWriteback",
          "Jobs",
          [
            { sourceField: "_id", destField: "_id" },
            { sourceField: "immutableID", destField: "immutableID" },
          ],
          ["hasTimeEntries", "lastTimeEntryDate"]
        );
        functions.logger.info("TurboJobsWriteback fold completed successfully");
      } catch (foldError) {
        functions.logger.error("TurboJobsWriteback fold failed, will retry next run", { foldError });
      }
    } catch (error) {
      functions.logger.error("Scheduled Turbo sync failed", { error });
      throw error;
    }
  });

/**
 * Scheduled function that syncs Expenses, Vendors, and PurchaseOrders data from Turbo every 30 minutes.
 * 
 * Fetches all expenses updated since 2026-01-01 from Turbo's export_legacy API
 * and writes:
 * - expenses array to TurboExpensesWriteback collection
 * - vendors array to TurboVendorsWriteback collection
 * - purchaseOrders array to TurboPurchaseOrdersWriteback collection
 */
export const scheduledTurboExpensesWritebackSync = functions
  .runWith({ secrets: [TURBO_AUTH_TOKEN_SECRET_NAME] })
  .pubsub
  .schedule("every 30 minutes")
  .onRun(async (context) => {
    functions.logger.info("Starting scheduled Turbo Expenses/Vendors/PurchaseOrders sync");
    
    try {
      const result = await fetchAndSyncExpensesWriteback(
        `${TURBO_BASE_URL}/api/export_legacy/expenses/2026-01-01`,
        `Bearer ${TURBO_AUTH_TOKEN.value()}`
      );
      
      functions.logger.info("Scheduled Turbo expenses sync completed successfully", {
        expensesWritten: result.expenses,
        vendorsWritten: result.vendors,
        purchaseOrdersWritten: result.purchaseOrders,
      });
    } catch (error) {
      functions.logger.error("Scheduled Turbo expenses sync failed", { error });
      throw error;
    }
  });

/**
 * Scheduled function that syncs TimeSheets data from Turbo every 30 minutes.
 * 
 * Fetches committed time sheets for the last 6 weeks from Turbo's export_legacy API:
 * - If today is Saturday: syncs today + previous 5 Saturdays
 * - Otherwise: syncs next Saturday + previous 5 Saturdays
 * 
 * Writes to:
 * - timesheets array to TurboTimeSheetsWriteback collection
 */
export const scheduledTurboTimeSheetsWritebackSync = functions
  .runWith({ secrets: [TURBO_AUTH_TOKEN_SECRET_NAME] })
  .pubsub
  .schedule("every 30 minutes")
  .onRun(async (context) => {
    const weekEndings = getSaturdaysToSync(6);
    functions.logger.info("Starting scheduled Turbo TimeSheets sync", { weekEndings });
    
    try {
      const result = await fetchAndSyncTimeSheetsWriteback(
        TURBO_BASE_URL,
        `Bearer ${TURBO_AUTH_TOKEN.value()}`,
        weekEndings
      );
      
      functions.logger.info("Scheduled Turbo timesheets sync completed successfully", {
        timesheetsWritten: result.timesheets,
        weekEndings,
      });
    } catch (error) {
      functions.logger.error("Scheduled Turbo timesheets sync failed", { error });
      throw error;
    }
  });
