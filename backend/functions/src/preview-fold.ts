/**
 * Preview script for fold operations.
 * Shows what would happen without making any changes.
 *
 * Usage:
 *   npx ts-node src/preview-fold.ts <sourceCollection> <destCollection> <fieldPairs> [preserveFields]
 *
 * Example:
 *   npx ts-node src/preview-fold.ts TurboJobsWriteback Jobs "_id:_id,immutableID:immutableID" "hasTimeEntries,lastTimeEntryDate"
 *
 * Field pairs format: comma-separated pairs of "sourceField:destField"
 * Use "_id" to reference the document ID.
 *
 * Preserve fields format: comma-separated field names to preserve from destination doc during REPLACE.
 */

import * as admin from "firebase-admin";
import { FieldPair, objDiff, analyzeFoldAction, FoldAction } from "./fold-utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

/**
 * Formats a diff object into a human-readable string with Added/Changed/Removed sections.
 */
function formatDiff(diff: Record<string, [unknown, unknown]>): string {
  const added: [string, unknown][] = [];
  const changed: [string, unknown, unknown][] = [];
  const removed: [string, unknown][] = [];

  for (const [key, [oldVal, newVal]] of Object.entries(diff)) {
    if (oldVal === null) {
      added.push([key, newVal]);
    } else if (newVal === null) {
      removed.push([key, oldVal]);
    } else {
      changed.push([key, oldVal, newVal]);
    }
  }

  // Sort each group alphabetically by key
  added.sort((a, b) => a[0].localeCompare(b[0]));
  changed.sort((a, b) => a[0].localeCompare(b[0]));
  removed.sort((a, b) => a[0].localeCompare(b[0]));

  const lines: string[] = [];

  if (added.length > 0) {
    lines.push("  Added:");
    for (const [key, val] of added) {
      lines.push(`    ${key}: ${JSON.stringify(val)}`);
    }
  }

  if (changed.length > 0) {
    lines.push("  Changed:");
    for (const [key, oldVal, newVal] of changed) {
      lines.push(`    ${key}: ${JSON.stringify(oldVal)} -> ${JSON.stringify(newVal)}`);
    }
  }

  if (removed.length > 0) {
    lines.push("  Removed:");
    for (const [key] of removed) {
      lines.push(`    ${key}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "  (no changes detected)";
}

/**
 * Formats document data for display (indented, key-sorted).
 */
function formatDocData(data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort();
  const lines = keys.map((key) => `    ${key}: ${JSON.stringify(data[key])}`);
  return lines.join("\n");
}

/**
 * Parses field pairs from CLI argument.
 * Format: "sourceField:destField,sourceField:destField,..."
 */
function parseFieldPairs(arg: string): FieldPair[] {
  return arg.split(",").map((pair) => {
    const [sourceField, destField] = pair.split(":");
    if (!sourceField || !destField) {
      throw new Error(`Invalid field pair: "${pair}". Expected format: "sourceField:destField"`);
    }
    return { sourceField, destField };
  });
}

interface PreviewResults {
  creates: Array<{ id: string; destDocId: string; data: Record<string, unknown> }>;
  replaces: Array<{ id: string; destDocId: string; diffFormatted: string }>;
  skips: Array<{ id: string; destDocId: string }>;
  errors: Array<{ id: string; reason: string }>;
}

/**
 * Previews the fold operation without making any changes.
 */
async function previewFold(
  sourceCollection: string,
  destCollection: string,
  fieldPairs: FieldPair[],
  preserveFields: string[] = []
): Promise<PreviewResults> {
  const results: PreviewResults = {
    creates: [],
    replaces: [],
    skips: [],
    errors: [],
  };

  const sourceSnap = await db.collection(sourceCollection).get();

  if (sourceSnap.empty) {
    return results;
  }

  for (const sourceDoc of sourceSnap.docs) {
    const sourceData = sourceDoc.data();
    const action: FoldAction = await analyzeFoldAction(
      db,
      destCollection,
      fieldPairs,
      sourceDoc.id,
      sourceData,
      preserveFields
    );

    switch (action.action) {
    case "create":
      results.creates.push({
        id: sourceDoc.id,
        destDocId: action.destDocId,
        data: action.data,
      });
      break;

    case "replace": {
      const diff = objDiff(action.existingData, action.newData);
      if (Object.keys(diff).length === 0) {
        results.skips.push({
          id: sourceDoc.id,
          destDocId: action.destDocId,
        });
      } else {
        results.replaces.push({
          id: sourceDoc.id,
          destDocId: action.destDocId,
          diffFormatted: formatDiff(diff),
        });
      }
      break;
    }

    case "error":
      results.errors.push({
        id: sourceDoc.id,
        reason: action.reason,
      });
      break;
    }
  }

  return results;
}

/**
 * Main function - parses args and runs preview.
 */
async function main() {
  if (process.argv.length < 5 || process.argv.length > 6) {
    console.log(`
Usage:
  npx ts-node src/preview-fold.ts <sourceCollection> <destCollection> <fieldPairs> [preserveFields]

Arguments:
  sourceCollection  Name of the source Firestore collection
  destCollection    Name of the destination Firestore collection
  fieldPairs        Comma-separated field pairs in format "sourceField:destField"
                    Use "_id" to reference document ID
  preserveFields    (Optional) Comma-separated field names to preserve from destination
                    doc during REPLACE operations (destination wins)

Examples:
  npx ts-node src/preview-fold.ts TurboJobsWriteback Jobs "_id:_id,immutableID:immutableID"
  npx ts-node src/preview-fold.ts TurboJobsWriteback Jobs "_id:_id,immutableID:immutableID" "hasTimeEntries,lastTimeEntryDate"
`);
    process.exit(1);
  }

  const sourceCollection = process.argv[2];
  const destCollection = process.argv[3];
  const fieldPairsArg = process.argv[4];
  const preserveFieldsArg = process.argv[5];

  let fieldPairs: FieldPair[];
  try {
    fieldPairs = parseFieldPairs(fieldPairsArg);
  } catch (err) {
    console.error(`Error parsing field pairs: ${err}`);
    process.exit(1);
  }

  const preserveFields = preserveFieldsArg
    ? preserveFieldsArg.split(",").map((f) => f.trim())
    : [];

  console.log("=== FOLD PREVIEW ===");
  console.log(`Source: ${sourceCollection} -> Destination: ${destCollection}`);
  console.log(
    `Field pairs: ${fieldPairs.map((p) => `${p.sourceField} -> ${p.destField}`).join(", ")}`
  );
  if (preserveFields.length > 0) {
    console.log(`Preserve fields: ${preserveFields.join(", ")}`);
  }
  console.log("");

  const results = await previewFold(sourceCollection, destCollection, fieldPairs, preserveFields);

  // --- CREATE section ---
  console.log(`--- CREATE (${results.creates.length} documents) ---`);
  console.log("");
  if (results.creates.length === 0) {
    console.log("  (none)");
  } else {
    for (const item of results.creates) {
      console.log(`${item.id} -> ${item.destDocId}`);
      console.log(formatDocData(item.data));
      console.log("");
    }
  }
  console.log("");

  // --- REPLACE section ---
  console.log(`--- REPLACE (${results.replaces.length} documents) ---`);
  console.log("");
  if (results.replaces.length === 0) {
    console.log("  (none)");
  } else {
    for (const item of results.replaces) {
      console.log(`${item.id} -> ${item.destDocId}`);
      console.log(item.diffFormatted);
      console.log("");
    }
  }
  console.log("");

  // --- SKIP section ---
  console.log(`--- SKIP (${results.skips.length} documents, no changes) ---`);
  console.log("");
  if (results.skips.length === 0) {
    console.log("  (none)");
  } else {
    for (const item of results.skips) {
      console.log(`${item.id} -> ${item.destDocId}`);
    }
  }
  console.log("");

  // --- ERRORS section ---
  console.log(`--- ERRORS (${results.errors.length} documents) ---`);
  console.log("");
  if (results.errors.length === 0) {
    console.log("  (none)");
  } else {
    for (const item of results.errors) {
      console.log(`${item.id}`);
      console.log(`  ${item.reason}`);
      console.log("");
    }
  }
  console.log("");

  // --- SUMMARY ---
  console.log("=== SUMMARY ===");
  console.log(`Would create: ${results.creates.length}`);
  console.log(`Would replace: ${results.replaces.length}`);
  console.log(`Would skip (no changes): ${results.skips.length}`);
  console.log(`Errors: ${results.errors.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
