import * as admin from "firebase-admin";
import { FieldPair, FoldAction, analyzeFoldAction, objDiff } from "./fold-utils";
import { normalizeTimeAmendmentWritebackData } from "./writebackDateUtils";

export type FoldAnalyzer = (
  db: FirebaseFirestore.Firestore,
  destCollection: string,
  fieldPairs: FieldPair[],
  sourceDocId: string,
  sourceData: Record<string, unknown>,
  preserveFields: string[]
) => Promise<FoldAction>;

export interface FoldPolicy {
  enableField?: string;
  resetExported?: boolean;
  analyze?: FoldAnalyzer;
}

function conflictPatch(blockingDocId?: string): Record<string, unknown> {
  if (blockingDocId) {
    return { tybaltConflict: blockingDocId };
  }

  return {
    tybaltConflict: admin.firestore.FieldValue.delete(),
  };
}

function timestampsEqual(left: unknown, right: unknown): boolean {
  return (
    left instanceof admin.firestore.Timestamp &&
    right instanceof admin.firestore.Timestamp &&
    left.seconds === right.seconds
  );
}

/**
 * Collection-specific fold policy for TimeSheets.
 *
 * TimeSheets are intentionally stricter than the generic fold matcher:
 * 1. The staged doc ID is treated as the primary identity. Automatic replacement is
 *    only allowed when TimeSheets/<sourceDocId> already exists.
 * 2. A second TimeSheets document with the same business key must never be created.
 *    The business key is uid + weekEnding, which is expected to be unique.
 * 3. If another legacy TimeSheets doc already owns the same uid + weekEnding under a
 *    different ID, the staged doc is left in TurboTimeSheetsWriteback and annotated
 *    with tybaltConflict pointing at the blocking legacy doc.
 * 4. Existing locked or exported legacy TimeSheets docs are hard no-touch conflicts
 *    when the staged payload would change them.
 * 5. If multiple legacy docs already share the same uid + weekEnding, that is treated
 *    as data corruption. The staged doc is left in place and any stale tybaltConflict
 *    marker is cleared because there is no single authoritative blocker to reference.
 *
 * Preserve fields are still applied before change detection, which allows exact no-op
 * matches to pass through as "replace" results that the fold engine will downgrade to a
 * skip/delete-source operation when objDiff shows no effective changes.
 */
export async function analyzeTimeSheetFoldAction(
  db: FirebaseFirestore.Firestore,
  destCollection: string,
  _fieldPairs: FieldPair[],
  sourceDocId: string,
  sourceData: Record<string, unknown>,
  preserveFields: string[] = []
): Promise<FoldAction> {
  const uid = sourceData.uid;
  const weekEnding = sourceData.weekEnding;

  if (typeof uid !== "string" || uid.trim() === "") {
    return {
      action: "error",
      reason: 'Missing required source field "uid"',
      sourceDataPatch: conflictPatch(),
    };
  }
  if (!(weekEnding instanceof admin.firestore.Timestamp)) {
    return {
      action: "error",
      reason: 'Missing or invalid required source field "weekEnding"',
      sourceDataPatch: conflictPatch(),
    };
  }

  const [exactIdDoc, matchingSnap] = await Promise.all([
    db.collection(destCollection).doc(sourceDocId).get(),
    db
      .collection(destCollection)
      .where("uid", "==", uid)
      .where("weekEnding", "==", weekEnding)
      .get(),
  ]);

  if (matchingSnap.size > 1) {
    return {
      action: "error",
      reason: 'DATA CORRUPTION: Multiple docs match on business key "uid+weekEnding"',
      sourceDataPatch: conflictPatch(),
    };
  }

  if (exactIdDoc.exists) {
    const existingData = exactIdDoc.data() || {};
    const sameUid = existingData.uid === uid;
    const sameWeekEnding = timestampsEqual(existingData.weekEnding, weekEnding);

    if (!sameUid || !sameWeekEnding) {
      return {
        action: "conflict",
        reason:
          'Conflict: Existing doc with same id has different "uid" or "weekEnding"',
        blockingDocId: exactIdDoc.id,
        sourceDataPatch: conflictPatch(exactIdDoc.id),
      };
    }

    const mergedData = { ...sourceData };
    for (const field of preserveFields) {
      if (field in existingData) {
        mergedData[field] = existingData[field];
      }
    }

    const diff = objDiff(existingData, mergedData);
    const hasChanges = Object.keys(diff).length > 0;
    if (hasChanges && (existingData.locked === true || existingData.exported === true)) {
      return {
        action: "conflict",
        reason: "Conflict: Existing matching doc is locked or exported",
        blockingDocId: exactIdDoc.id,
        sourceDataPatch: conflictPatch(exactIdDoc.id),
      };
    }

    return {
      action: "replace",
      destDocId: exactIdDoc.id,
      existingData,
      newData: mergedData,
    };
  }

  if (matchingSnap.empty) {
    return {
      action: "create",
      destDocId: sourceDocId,
      data: sourceData,
    };
  }

  return {
    action: "conflict",
    reason: 'Conflict: Existing doc with same "uid" and "weekEnding" has different id',
    blockingDocId: matchingSnap.docs[0].id,
    sourceDataPatch: conflictPatch(matchingSnap.docs[0].id),
  };
}

export async function analyzeTimeAmendmentFoldAction(
  db: FirebaseFirestore.Firestore,
  destCollection: string,
  fieldPairs: FieldPair[],
  sourceDocId: string,
  sourceData: Record<string, unknown>,
  preserveFields: string[] = []
): Promise<FoldAction> {
  return analyzeFoldAction(
    db,
    destCollection,
    fieldPairs,
    sourceDocId,
    normalizeTimeAmendmentWritebackData(sourceData),
    preserveFields
  );
}

/**
 * Per-collection fold policies.
 *
 * Jobs:
 * - Uses the generic matcher supplied by the caller.
 * - Respects Config/Enable.jobs.
 *
 * Expenses:
 * - Uses the generic matcher supplied by the caller.
 * - Resets exported to false on create/replace so downstream export can rerun.
 * - Respects Config/Enable.expenses.
 *
 * TimeSheets:
 * - Uses analyzeTimeSheetFoldAction above instead of the generic matcher.
 * - Resets exported to false on create/replace.
 * - Respects Config/Enable.time.
 *
 * TimeAmendments:
 * - Normalizes known writeback date/datetime fields before matching.
 * - Otherwise uses the generic matcher supplied by the caller, currently _id -> _id.
 * - Resets exported to false on create/replace.
 * - Respects Config/Enable.time.
 */
const collectionFoldPolicies: Record<string, FoldPolicy> = {
  Jobs: {
    enableField: "jobs",
  },
  Expenses: {
    enableField: "expenses",
    resetExported: true,
  },
  TimeSheets: {
    enableField: "time",
    resetExported: true,
    analyze: analyzeTimeSheetFoldAction,
  },
  TimeAmendments: {
    enableField: "time",
    resetExported: true,
    analyze: analyzeTimeAmendmentFoldAction,
  },
};

export function getFoldPolicy(destCollection: string): FoldPolicy {
  return collectionFoldPolicies[destCollection] || {};
}

export function getFoldAnalyzer(destCollection: string): FoldAnalyzer {
  return getFoldPolicy(destCollection).analyze || analyzeFoldAction;
}

export function applyFoldPolicyData(
  destCollection: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const policy = getFoldPolicy(destCollection);
  return policy.resetExported ? { ...data, exported: false } : data;
}

export async function getFoldSkipReason(
  db: FirebaseFirestore.Firestore,
  destCollection: string
): Promise<string | null> {
  const enableField = getFoldPolicy(destCollection).enableField;
  if (!enableField) {
    return null;
  }

  const enableDoc = await db.collection("Config").doc("Enable").get();
  const enableData = enableDoc.data() || {};
  if (enableData[enableField] === true) {
    return `Fold skipped: ${destCollection} editing is enabled in legacy Tybalt (Config/Enable.${enableField} = true)`;
  }

  return null;
}
