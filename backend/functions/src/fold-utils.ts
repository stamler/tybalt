/**
 * Shared utilities for the fold operation.
 * Used by both sync.ts (actual fold) and preview-fold.ts (preview mode).
 */

import { isEqual } from "lodash";

/**
 * Defines a field pair for matching documents between source and destination collections.
 * Use "_id" as a special value to reference the document ID instead of a field.
 */
export interface FieldPair {
  /** Field name in source doc, or "_id" to use the source document ID */
  sourceField: string;
  /** Field name in dest doc, or "_id" to use direct doc lookup by ID */
  destField: string;
}

/**
 * Compares two objects and returns a record of fields that differ.
 * Uses deep equality comparison via lodash isEqual.
 * @param oldObj - The original object
 * @param newObj - The new object to compare against
 * @returns Record where keys are field names and values are [oldValue, newValue] tuples
 */
export function objDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): Record<string, [unknown, unknown]> {
  const result: Record<string, [unknown, unknown]> = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const oldVal = key in oldObj ? oldObj[key] : null;
    const newVal = key in newObj ? newObj[key] : null;

    if (!isEqual(oldVal, newVal)) {
      result[key] = [oldVal, newVal];
    }
  }

  return result;
}

/**
 * Result of analyzing what fold action should be taken for a source document.
 */
export type FoldAction =
  | {
      action: "create";
      destDocId: string;
      data: Record<string, unknown>;
    }
  | {
      action: "replace";
      destDocId: string;
      existingData: Record<string, unknown>;
      newData: Record<string, unknown>;
    }
  | {
      action: "error";
      reason: string;
    };

/**
 * Analyzes what fold action should be taken for a given source document.
 * This function only reads from Firestore - it does not perform any writes.
 *
 * @param db - Firestore database instance
 * @param destCollection - Name of the destination collection
 * @param fieldPairs - Array of field pairs defining match rules
 * @param sourceDocId - ID of the source document
 * @param sourceData - Data from the source document
 * @param preserveFields - Optional array of field names to preserve from destination doc during REPLACE.
 *                         These fields will be copied from the existing doc into newData (destination wins).
 * @returns The action that should be taken (create, replace, or error)
 */
export async function analyzeFoldAction(
  db: FirebaseFirestore.Firestore,
  destCollection: string,
  fieldPairs: FieldPair[],
  sourceDocId: string,
  sourceData: Record<string, unknown>,
  preserveFields: string[] = []
): Promise<FoldAction> {
  const matchedDocIds: Set<string>[] = []; // One set per field pair
  let hasMultipleMatch = false;
  let multipleMatchField = "";

  // For each field pair, find matching destination docs
  for (const pair of fieldPairs) {
    const sourceValue =
      pair.sourceField === "_id" ? sourceDocId : sourceData[pair.sourceField];

    let matchingIds: Set<string>;

    if (pair.destField === "_id") {
      // Direct doc lookup by ID
      const destDoc = await db
        .collection(destCollection)
        .doc(sourceValue as string)
        .get();
      matchingIds = destDoc.exists ? new Set([destDoc.id]) : new Set();
    } else {
      // Field query - can return multiple docs
      const querySnap = await db
        .collection(destCollection)
        .where(pair.destField, "==", sourceValue)
        .get();
      matchingIds = new Set(querySnap.docs.map((d) => d.id));
      if (matchingIds.size > 1) {
        hasMultipleMatch = true;
        multipleMatchField = pair.destField;
      }
    }

    matchedDocIds.push(matchingIds);
  }

  // ERROR: A field matched multiple destination docs (data corruption)
  if (hasMultipleMatch) {
    return {
      action: "error",
      reason: `DATA CORRUPTION: Multiple docs match on field "${multipleMatchField}"`,
    };
  }

  // Check if all field pairs found nothing
  const allEmpty = matchedDocIds.every((s) => s.size === 0);
  if (allEmpty) {
    // CREATE: No matches found for any field pair
    // Determine the destination doc ID from the field pair that maps to "_id"
    const idPair = fieldPairs.find((p) => p.destField === "_id");
    const destDocId = idPair
      ? idPair.sourceField === "_id"
        ? sourceDocId
        : (sourceData[idPair.sourceField] as string)
      : sourceDocId; // Default to source doc ID if no _id mapping

    return {
      action: "create",
      destDocId,
      data: sourceData,
    };
  }

  // Check if all non-empty sets contain exactly one ID and it's the same doc
  const nonEmptySets = matchedDocIds.filter((s) => s.size > 0);
  const allSingleMatch = nonEmptySets.every((s) => s.size === 1);
  const uniqueDocIds = new Set(nonEmptySets.flatMap((s) => [...s]));
  const allSameDoc = allSingleMatch && uniqueDocIds.size === 1;

  if (allSameDoc && nonEmptySets.length === matchedDocIds.length) {
    // REPLACE: All field pairs match the same single destination doc
    const destDocId = [...uniqueDocIds][0];

    // Fetch existing doc to include in result
    const existingDoc = await db.collection(destCollection).doc(destDocId).get();
    const existingData = existingDoc.data() || {};

    // Merge preserved fields from existing doc into new data (destination wins)
    const mergedData = { ...sourceData };
    for (const field of preserveFields) {
      if (field in existingData) {
        mergedData[field] = existingData[field];
      }
    }

    return {
      action: "replace",
      destDocId,
      existingData,
      newData: mergedData,
    };
  }

  // ERROR: Conflict - some fields match, some don't, or they match different docs
  const matchSummary = fieldPairs
    .map((pair, i) => {
      const ids = [...matchedDocIds[i]];
      return `${pair.sourceField}->${pair.destField}: ${ids.length === 0 ? "no match" : ids.join(",")}`;
    })
    .join("; ");

  return {
    action: "error",
    reason: `Conflict: ${matchSummary}`,
  };
}
