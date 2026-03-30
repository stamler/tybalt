/**
 * inspect-missing-expense-attachments.ts
 *
 * Read-only Firestore + Cloud Storage inspection for committed expense attachments.
 *
 * Purpose:
 * - Find Expenses documents whose `attachment` field points to a missing object in
 *   the legacy Firebase Storage bucket.
 * - Inspect a single attachment path from Cloud Function logs.
 * - Scan all committed+approved expenses or narrow to a single committed week ending.
 *
 * Usage (from backend/functions):
 *   npx ts-node src/inspect-missing-expense-attachments.ts "179_mcidjha551.qsimInvoice#1885.pdf"
 *   npx ts-node src/inspect-missing-expense-attachments.ts --weekEnding 2026-03-28
 *   npx ts-node src/inspect-missing-expense-attachments.ts --all --limit 200
 *
 * Auth:
 * - Uses the same local serviceAccountKey.json pattern as other scripts in this repo.
 *
 * Exit codes:
 * - 0: no missing attachments found
 * - 1: script/config/runtime failure
 * - 2: one or more missing attachments found
 */

import * as admin from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");

const DEFAULT_BUCKET = "charade-ca63f.appspot.com";
const PAGE_SIZE = 500;
const EXISTENCE_CHECK_CONCURRENCY = 20;

interface StorageBucketLike {
  name: string;
  file(path: string): {
    exists(): Promise<[boolean]>;
  };
}

interface ScanOptions {
  attachmentPath?: string;
  weekEnding?: string;
  limit?: number;
}

interface ExpenseAttachmentRow {
  id: string;
  attachment: string | null;
  uid: string | null;
  displayName: string | null;
  immutableID: string | null;
  date: string | null;
  committedWeekEnding: string | null;
  payPeriodEnding: string | null;
  total: unknown;
  approved: boolean | null;
  committed: boolean | null;
}

function initApp(): { db: admin.firestore.Firestore; bucket: StorageBucketLike } {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET,
    });
  }

  return {
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
  };
}

function printUsage() {
  console.log(`
Usage:
  npx ts-node src/inspect-missing-expense-attachments.ts <attachmentPath>
  npx ts-node src/inspect-missing-expense-attachments.ts --weekEnding YYYY-MM-DD [--limit N]
  npx ts-node src/inspect-missing-expense-attachments.ts --all [--limit N]

Examples:
  npx ts-node src/inspect-missing-expense-attachments.ts "179_mcidjha551.qsimInvoice#1885.pdf"
  npx ts-node src/inspect-missing-expense-attachments.ts --weekEnding 2026-03-28
  npx ts-node src/inspect-missing-expense-attachments.ts --all --limit 50
`);
}

function parseArgs(argv: string[]): ScanOptions {
  if (argv.length === 0) {
    printUsage();
    process.exit(1);
  }

  const options: ScanOptions = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--all") {
      continue;
    }

    if (arg === "--weekEnding") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--weekEnding requires a YYYY-MM-DD value");
      }
      options.weekEnding = value;
      i++;
      continue;
    }

    if (arg === "--limit") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--limit requires a positive integer");
      }
      const parsed = parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      options.limit = parsed;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    if (options.attachmentPath !== undefined) {
      throw new Error("Provide either one attachment path or a scan mode, not multiple attachment paths");
    }
    options.attachmentPath = arg;
  }

  if (options.attachmentPath && options.weekEnding) {
    throw new Error("Use either an exact attachment path or --weekEnding, not both");
  }

  return options;
}

function timestampToDateOnly(value: unknown): string | null {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value.slice(0, 10);
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function looksLikeAttachmentPath(attachment: string): string {
  if (attachment.startsWith("Writeback/Expenses/")) {
    return "writeback-gcs-path";
  }
  if (attachment.startsWith("Expenses/")) {
    return "legacy-gcs-path";
  }
  if (attachment.includes("/")) {
    return "other-path";
  }
  return "bare-filename";
}

function toRow(
  doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot
): ExpenseAttachmentRow {
  const data = (doc.data() || {}) as Record<string, unknown>;
  return {
    id: doc.id,
    attachment: asNonEmptyString(data.attachment),
    uid: asNonEmptyString(data.uid),
    displayName: asNonEmptyString(data.displayName),
    immutableID: asNonEmptyString(data.immutableID),
    date: timestampToDateOnly(data.date),
    committedWeekEnding: timestampToDateOnly(data.committedWeekEnding),
    payPeriodEnding: timestampToDateOnly(data.payPeriodEnding),
    total: data.total,
    approved: typeof data.approved === "boolean" ? data.approved : null,
    committed: typeof data.committed === "boolean" ? data.committed : null,
  };
}

async function loadExactAttachmentMatches(
  db: admin.firestore.Firestore,
  attachmentPath: string
): Promise<ExpenseAttachmentRow[]> {
  const snap = await db
    .collection("Expenses")
    .where("attachment", "==", attachmentPath)
    .get();

  return snap.docs.map((doc) => toRow(doc));
}

async function loadCommittedApprovedExpenses(
  db: admin.firestore.Firestore,
  options: ScanOptions
): Promise<ExpenseAttachmentRow[]> {
  const rows: ExpenseAttachmentRow[] = [];
  let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query = db
      .collection("Expenses")
      .where("approved", "==", true)
      .where("committed", "==", true)
      .orderBy("attachment")
      .limit(PAGE_SIZE)
      .select(
        "attachment",
        "uid",
        "displayName",
        "immutableID",
        "date",
        "committedWeekEnding",
        "payPeriodEnding",
        "total",
        "approved",
        "committed"
      );

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) {
      break;
    }

    for (const doc of snap.docs) {
      const row = toRow(doc);
      if (!row.attachment) {
        continue;
      }
      if (options.weekEnding && row.committedWeekEnding !== options.weekEnding) {
        continue;
      }
      rows.push(row);
      if (options.limit !== undefined && rows.length >= options.limit) {
        return rows;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return rows;
}

async function findMissingAttachments(
  bucket: StorageBucketLike,
  rows: ExpenseAttachmentRow[]
): Promise<ExpenseAttachmentRow[]> {
  const missing: ExpenseAttachmentRow[] = [];

  for (let i = 0; i < rows.length; i += EXISTENCE_CHECK_CONCURRENCY) {
    const chunk = rows.slice(i, i + EXISTENCE_CHECK_CONCURRENCY);
    const existenceResults = await Promise.all(
      chunk.map(async (row) => {
        const [exists] = await bucket.file(row.attachment as string).exists();
        return { row, exists };
      })
    );

    existenceResults.forEach(({ row, exists }) => {
      if (!exists) {
        missing.push(row);
      }
    });
  }

  return missing;
}

function printRows(rows: ExpenseAttachmentRow[]) {
  rows.forEach((row) => {
    console.log(`- expenseId: ${row.id}`);
    console.log(`  attachment: ${row.attachment}`);
    console.log(`  attachmentStyle: ${looksLikeAttachmentPath(row.attachment || "")}`);
    console.log(`  immutableID: ${row.immutableID ?? "(missing)"}`);
    console.log(`  uid: ${row.uid ?? "(missing)"}`);
    console.log(`  displayName: ${row.displayName ?? "(missing)"}`);
    console.log(`  date: ${row.date ?? "(missing)"}`);
    console.log(`  committedWeekEnding: ${row.committedWeekEnding ?? "(missing)"}`);
    console.log(`  payPeriodEnding: ${row.payPeriodEnding ?? "(missing)"}`);
    console.log(`  approved: ${row.approved === null ? "(missing)" : String(row.approved)}`);
    console.log(`  committed: ${row.committed === null ? "(missing)" : String(row.committed)}`);
    console.log(`  total: ${row.total === undefined ? "(missing)" : JSON.stringify(row.total)}`);
    console.log("");
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { db, bucket } = initApp();

  console.log(`Using bucket: ${bucket.name}`);
  console.log("");

  if (options.attachmentPath) {
    console.log(`Looking up Expenses documents with attachment == ${JSON.stringify(options.attachmentPath)}`);
    console.log("");

    const exactRows = await loadExactAttachmentMatches(db, options.attachmentPath);
    if (exactRows.length === 0) {
      console.log("No Expenses documents matched that attachment path.");
      process.exit(0);
    }

    const exactMissing = await findMissingAttachments(bucket, exactRows);
    console.log(`Matched Expenses documents: ${exactRows.length}`);
    console.log(`Missing storage objects: ${exactMissing.length}`);
    console.log("");

    printRows(exactRows);
    process.exit(exactMissing.length > 0 ? 2 : 0);
  }

  console.log(
    options.weekEnding
      ? `Scanning committed approved Expenses for committedWeekEnding ${options.weekEnding}`
      : "Scanning committed approved Expenses for missing attachments"
  );
  if (options.limit !== undefined) {
    console.log(`Row limit: ${options.limit}`);
  }
  console.log("");

  const rows = await loadCommittedApprovedExpenses(db, options);
  const missing = await findMissingAttachments(bucket, rows);

  const suspiciousMissing = missing.filter((row) => {
    const style = looksLikeAttachmentPath(row.attachment || "");
    return style === "bare-filename" || style === "other-path";
  });

  console.log("Expense attachment inspection summary");
  console.log("-----------------------------------");
  console.log(`Committed approved expenses checked: ${rows.length}`);
  console.log(`Missing storage objects: ${missing.length}`);
  console.log(`Missing with suspicious attachment style: ${suspiciousMissing.length}`);
  console.log("");

  if (missing.length > 0) {
    printRows(missing);
    process.exit(2);
  }

  console.log("No missing attachment objects found.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});
