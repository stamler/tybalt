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
import { APP_NATIVE_TZ, TURBO_BASE_URL } from "./config";

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
 * Contains separate arrays for jobs, clients, and client contacts.
 */
export interface JobsWritebackResponse {
  jobs: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  clientContacts: Record<string, unknown>[];
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

function convertWritebackJobDates(job: Record<string, unknown>): Record<string, unknown> {
  const converted = { ...job };
  for (const field of WRITEBACK_DATE_FIELDS) {
    if (field in converted) {
      converted[field] = toNoonEasternTimestamp(converted[field]);
    }
  }
  return converted;
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
 * Fetches the jobs writeback response (object with jobs, clients, clientContacts arrays)
 * and syncs each array to its respective Firestore collection.
 * 
 * @param url The URL to fetch the structured response from
 * @param authHeader Authorization header value
 * @returns Promise resolving to counts of documents written per collection
 */
export async function fetchAndSyncJobsWriteback(
  url: string,
  authHeader: string
): Promise<{ jobs: number; clients: number; clientContacts: number }> {
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

  functions.logger.info(
    `Fetched ${data.jobs.length} jobs, ${data.clients.length} clients, ${data.clientContacts.length} contacts`
  );

  // Sync each array to its respective collection
  // Jobs use "number" as key (to match legacy Jobs collection for fold operation)
  // Clients and contacts use "id" (PocketBase ID) as key
  const convertedJobs = data.jobs.map(convertWritebackJobDates);
  const [jobsWritten, clientsWritten, contactsWritten] = await Promise.all([
    syncArrayToFirestore(convertedJobs, "number", "TurboJobsWriteback"),
    syncArrayToFirestore(data.clients, "id", "TurboClientsWriteback"),
    syncArrayToFirestore(data.clientContacts, "id", "TurboClientContactsWriteback"),
  ]);

  return {
    jobs: jobsWritten,
    clients: clientsWritten,
    clientContacts: contactsWritten,
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
  // TODO: Normalize expense date fields to Firestore Timestamps (like jobs) to
  // avoid exportExpenses() errors when .toDate() is called.
  const [expensesWritten, vendorsWritten, posWritten] = await Promise.all([
    syncArrayToFirestore(data.expenses, "immutableID", "TurboExpensesWriteback"),
    syncArrayToFirestore(data.vendors, "id", "TurboVendorsWriteback"),
    syncArrayToFirestore(data.purchaseOrders, "id", "TurboPurchaseOrdersWriteback"),
  ]);

  return {
    expenses: expensesWritten,
    vendors: vendorsWritten,
    purchaseOrders: posWritten,
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
 * Scheduled function that syncs Jobs, Clients, and ClientContacts data from Turbo every 30 minutes.
 * 
 * Fetches all jobs updated since 2026-01-01 from Turbo's export_legacy API
 * and writes:
 * - jobs array to TurboJobsWriteback collection
 * - clients array to TurboClientsWriteback collection  
 * - clientContacts array to TurboClientContactsWriteback collection
 */
export const scheduledTurboJobsWritebackSync = functions
  .runWith({ secrets: [TURBO_AUTH_TOKEN_SECRET_NAME] })
  .pubsub
  .schedule("every 30 minutes")
  .onRun(async (context) => {
    functions.logger.info("Starting scheduled Turbo Jobs/Clients/Contacts sync");
    
    try {
      const result = await fetchAndSyncJobsWriteback(
        `${TURBO_BASE_URL}/api/export_legacy/jobs/2026-01-01`,
        `Bearer ${TURBO_AUTH_TOKEN.value()}`
      );
      
      functions.logger.info("Scheduled Turbo sync completed successfully", {
        jobsWritten: result.jobs,
        clientsWritten: result.clients,
        contactsWritten: result.clientContacts,
      });
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
