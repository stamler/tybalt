/**
 * Sync data from Turbo writeback API routes into legacy Tybalt's Firestore
 * staging collections.
 *
 * This module provides utilities to poll Turbo every 30 minutes and store
 * returned writeback payloads in Firestore collections that downstream legacy
 * sync processes can consume.
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import axios, { isAxiosError } from "axios";
import { format } from "date-fns";
import { TURBO_BASE_URL } from "./config";
import { foldCollection } from "./sync";
import {
  normalizeTimeAmendmentWritebackData,
  toEndOfDayTimestamp,
  toNoonEasternTimestamp,
  toTimestampFromISO,
} from "./writebackDateUtils";

const db = admin.firestore();
const FIRESTORE_BATCH_SIZE = 500;

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
 * Contains separate arrays for expenses, vendors, purchase orders, and po approver props.
 */
export interface ExpensesWritebackResponse {
  expenses: Record<string, unknown>[];
  vendors: Record<string, unknown>[];
  purchaseOrders: Record<string, unknown>[];
  poApproverProps: Record<string, unknown>[];
}

/**
 * Response format from time writeback endpoint.
 * Contains separate arrays for time sheets and time amendments.
 */
export interface TimeWritebackResponse {
  timeSheets: Record<string, unknown>[];
  timeAmendments: Record<string, unknown>[];
}

const WRITEBACK_DATE_FIELDS = [
  "projectAwardDate",
  "proposalOpeningDate",
  "proposalSubmissionDueDate",
] as const;

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

function convertWritebackTimeAmendmentDates(
  amendment: Record<string, unknown>
): Record<string, unknown> {
  return normalizeTimeAmendmentWritebackData(amendment);
}

function parseTimeWritebackResponse(url: string, data: unknown): TimeWritebackResponse {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Expected object response from ${url}, got ${typeof data}`);
  }

  const response = data as Partial<TimeWritebackResponse>;
  if (!Array.isArray(response.timeSheets)) {
    throw new Error(`Expected timeSheets array in response from ${url}`);
  }
  if (!Array.isArray(response.timeAmendments)) {
    throw new Error(`Expected timeAmendments array in response from ${url}`);
  }

  return {
    timeSheets: response.timeSheets,
    timeAmendments: response.timeAmendments,
  };
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
  let totalWritten = 0;

  for (let i = 0; i < data.length; i += FIRESTORE_BATCH_SIZE) {
    const batchData = data.slice(i, i + FIRESTORE_BATCH_SIZE);
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

async function clearFirestoreCollection(collectionName: string): Promise<void> {
  const querySnap = await db.collection(collectionName).get();

  for (let i = 0; i < querySnap.docs.length; i += FIRESTORE_BATCH_SIZE) {
    const batchDocs = querySnap.docs.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batch = db.batch();

    for (const doc of batchDocs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
  }

  functions.logger.info(`Cleared ${querySnap.docs.length} documents from ${collectionName}`);
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
  // clients and clientContacts are exported as full snapshots, so clear stale
  // docs before rewriting by id.
  const convertedJobs = data.jobs.map(convertWritebackJobDates);
  await clearFirestoreCollection("TurboClientsWriteback");
  await clearFirestoreCollection("TurboClientContactsWriteback");
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
): Promise<{ expenses: number; vendors: number; purchaseOrders: number; poApproverProps: number }> {
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
  if (!Array.isArray(data.poApproverProps)) {
    throw new Error(`Expected poApproverProps array in response from ${url}`);
  }

  functions.logger.info(
    `Fetched ${data.expenses.length} expenses, ${data.vendors.length} vendors, ` +
    `${data.purchaseOrders.length} purchaseOrders, ${data.poApproverProps.length} poApproverProps`
  );

  // Sync each array to its respective collection
  // Expenses use "immutableID" as key (to match legacy Expenses collection for fold operation)
  // Vendors and purchaseOrders use "id" (PocketBase ID) as key
  const convertedExpenses = data.expenses.map(convertWritebackExpenseDates);
  // vendors and poApproverProps are exported as full snapshots, so clear stale
  // docs before rewriting by id. This prevents absorbed/deleted vendors from
  // lingering in Firestore staging after they disappear from Turbo's export.
  await clearFirestoreCollection("TurboVendorsWriteback");
  await clearFirestoreCollection("TurboPoApproverProps");
  const [expensesWritten, vendorsWritten, posWritten, poApproverPropsWritten] = await Promise.all([
    syncArrayToFirestore(convertedExpenses, "immutableID", "TurboExpensesWriteback"),
    syncArrayToFirestore(data.vendors, "id", "TurboVendorsWriteback"),
    syncArrayToFirestore(data.purchaseOrders, "id", "TurboPurchaseOrdersWriteback"),
    syncArrayToFirestore(data.poApproverProps, "id", "TurboPoApproverProps"),
  ]);

  return {
    expenses: expensesWritten,
    vendors: vendorsWritten,
    purchaseOrders: posWritten,
    poApproverProps: poApproverPropsWritten,
  };
}

/**
 * Fetches time writeback data for multiple week endings from Turbo's
 * export_legacy API and stages both time sheets and time amendments in
 * Firestore. The requested week window is treated as a full snapshot: every
 * week must fetch and validate successfully before either staging collection
 * is cleared and rewritten.
 *
 * @param baseUrl The base URL of the Turbo API
 * @param authHeader Authorization header value
 * @param weekEndings Array of week ending dates (YYYY-MM-DD format)
 * @returns Promise resolving to counts written for each staging collection
 */
export async function fetchAndSyncTimeSheetsWriteback(
  baseUrl: string,
  authHeader: string,
  weekEndings: string[]
): Promise<{ timeSheets: number; timeAmendments: number }> {
  functions.logger.info(`Fetching time writeback data for ${weekEndings.length} weeks`, { weekEndings });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader,
  };

  const fetchPromises = weekEndings.map(async (weekEnding) => {
    const url = `${baseUrl}/api/export_legacy/time_sheets/${weekEnding}`;

    try {
      const response = await axios.get(url, { headers });
      const parsed = parseTimeWritebackResponse(url, response.data);
      functions.logger.info(`Fetched time writeback for ${weekEnding}`, {
        weekEnding,
        timeSheets: parsed.timeSheets.length,
        timeAmendments: parsed.timeAmendments.length,
      });
      return parsed;
    } catch (error) {
      if (isAxiosError(error)) {
        functions.logger.error(`Failed to fetch time writeback for ${weekEnding}: ${error.message}`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url,
        });
      } else {
        functions.logger.error(`Malformed time writeback response for ${weekEnding}`, {
          url,
          error: error instanceof Error ? error.message : error,
        });
      }
      throw error;
    }
  });

  const results = await Promise.all(fetchPromises);
  const allTimeSheets = results.flatMap((result) => result.timeSheets);
  const allTimeAmendments = results.flatMap((result) => result.timeAmendments);

  functions.logger.info(
    `Validated time writeback snapshot for ${weekEndings.length} weeks`,
    {
      weekEndings,
      timeSheets: allTimeSheets.length,
      timeAmendments: allTimeAmendments.length,
    }
  );

  const convertedTimeSheets = allTimeSheets.map(convertWritebackTimesheetDates);
  const convertedTimeAmendments = allTimeAmendments.map(convertWritebackTimeAmendmentDates);

  await Promise.all([
    clearFirestoreCollection("TurboTimeSheetsWriteback"),
    clearFirestoreCollection("TurboTimeAmendmentsWriteback"),
  ]);

  const [timeSheetsWritten, timeAmendmentsWritten] = await Promise.all([
    syncArrayToFirestore(convertedTimeSheets, "id", "TurboTimeSheetsWriteback"),
    syncArrayToFirestore(convertedTimeAmendments, "id", "TurboTimeAmendmentsWriteback"),
  ]);

  return {
    timeSheets: timeSheetsWritten,
    timeAmendments: timeAmendmentsWritten,
  };
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
 * - poApproverProps array to TurboPoApproverProps collection
 */
export const scheduledTurboExpensesWritebackSync = functions
  .runWith({ secrets: [TURBO_AUTH_TOKEN_SECRET_NAME] })
  .pubsub
  .schedule("every 30 minutes")
  .onRun(async (context) => {
    // Operational kill switch for the Turbo -> Firestore expenses writeback pull.
    // This is intentionally separate from Config/Enable.expenses, which controls
    // legacy expense editing/fold behavior but does not stop new Turbo data from
    // being fetched into Firestore staging collections.
    const enableSnap = await db.collection("Config").doc("Enable").get();
    if (enableSnap.get("disableTurboExpensesWriteback") === true) {
      functions.logger.info(
        "Turbo expenses writeback disabled via Config/Enable.disableTurboExpensesWriteback"
      );
      return null;
    }

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
        poApproverPropsWritten: result.poApproverProps,
      });
      return null;
    } catch (error) {
      functions.logger.error("Scheduled Turbo expenses sync failed", { error });
      throw error;
    }
  });

/**
 * Scheduled function that syncs staged time writeback data from Turbo every 30 minutes.
 *
 * Fetches the last 4 week endings from Turbo's export_legacy API:
 * - If today is Saturday: syncs today + previous 3 Saturdays
 * - Otherwise: syncs next Saturday + previous 3 Saturdays
 *
 * Writes the validated snapshot to:
 * - timeSheets array to TurboTimeSheetsWriteback collection
 * - timeAmendments array to TurboTimeAmendmentsWriteback collection
 */
export const scheduledTurboTimeSheetsWritebackSync = functions
  .runWith({ secrets: [TURBO_AUTH_TOKEN_SECRET_NAME] })
  .pubsub
  .schedule("every 30 minutes")
  .onRun(async (context) => {
    // Operational kill switch for the Turbo -> Firestore time writeback pull.
    // This is intentionally separate from Config/Enable.time, which controls
    // legacy time fold/export behavior but does not stop new Turbo data from
    // being fetched into Firestore staging collections.
    const enableSnap = await db.collection("Config").doc("Enable").get();
    if (enableSnap.get("disableTurboTimeWriteback") === true) {
      functions.logger.info(
        "Turbo time writeback disabled via Config/Enable.disableTurboTimeWriteback"
      );
      return null;
    }

    const weekEndings = getSaturdaysToSync(4);
    functions.logger.info("Starting scheduled Turbo time writeback sync", { weekEndings });

    try {
      const result = await fetchAndSyncTimeSheetsWriteback(
        TURBO_BASE_URL,
        `Bearer ${TURBO_AUTH_TOKEN.value()}`,
        weekEndings
      );

      functions.logger.info("Scheduled Turbo time writeback sync completed successfully", {
        timeSheetsWritten: result.timeSheets,
        timeAmendmentsWritten: result.timeAmendments,
        weekEndings,
      });
      return null;
    } catch (error) {
      functions.logger.error("Scheduled Turbo time writeback sync failed", { error, weekEndings });
      throw error;
    }
  });
