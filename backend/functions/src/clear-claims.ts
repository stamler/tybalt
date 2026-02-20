// Clear eligible customClaims values from Profiles
//
// Usage:
//   npx ts-node clear-claims.ts
//   npx ts-node clear-claims.ts --make-destructive-changes
//
// Default mode is DRY RUN and makes no writes.

import * as admin from "firebase-admin";

const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const DESTRUCTIVE_FLAG = "--make-destructive-changes";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEligibleClaims(customClaims: unknown): customClaims is { time: true } {
  if (!isPlainObject(customClaims)) {
    return false;
  }

  const keys = Object.keys(customClaims);
  return keys.length === 1 && keys[0] === "time" && customClaims.time === true;
}

async function clearClaims(makeDestructiveChanges: boolean): Promise<void> {
  const db = admin.firestore();

  console.log(
    makeDestructiveChanges
      ? "Mode: DESTRUCTIVE (writes enabled)"
      : "Mode: DRY RUN (no writes will be made)"
  );

  const profilesSnap = await db
    .collection("Profiles")
    .where("timeSheetExpected", "==", false)
    .get();

  console.log(
    `Found ${profilesSnap.size} Profiles documents where timeSheetExpected is explicitly false.`
  );

  const eligibleRefs: FirebaseFirestore.DocumentReference[] = [];
  let skippedCustomClaimsNotObject = 0;
  let skippedCustomClaimsNotOnlyTimeTrue = 0;

  for (const docSnap of profilesSnap.docs) {
    const customClaims = docSnap.get("customClaims");
    const displayName = docSnap.get("displayName");
    const displayNameText = typeof displayName === "string" ? displayName : "<missing displayName>";

    if (!isPlainObject(customClaims)) {
      skippedCustomClaimsNotObject += 1;
      continue;
    }

    if (!isEligibleClaims(customClaims)) {
      skippedCustomClaimsNotOnlyTimeTrue += 1;
      continue;
    }

    eligibleRefs.push(docSnap.ref);
    console.log(
      makeDestructiveChanges
        ? `[WILL UPDATE] id=${docSnap.id} displayName=${displayNameText} customClaims: ${JSON.stringify(customClaims)}`
        : `[DRY RUN] Would clear claims for id=${docSnap.id} displayName=${displayNameText} customClaims: ${JSON.stringify(customClaims)}`
    );
  }

  if (!makeDestructiveChanges) {
    console.log("\nDry run complete.");
    console.log(`Would update ${eligibleRefs.length} Profiles documents.`);
    console.log(`Skipped ${skippedCustomClaimsNotObject} docs (customClaims is missing or not an object).`);
    console.log(`Skipped ${skippedCustomClaimsNotOnlyTimeTrue} docs (customClaims is not exactly { time: true }).`);
    return;
  }

  let updatedCount = 0;
  let batchCount = 0;

  for (let i = 0; i < eligibleRefs.length; i += 500) {
    const batch = db.batch();
    const chunk = eligibleRefs.slice(i, i + 500);

    for (const docRef of chunk) {
      // Preserve the customClaims property itself while removing all items from it.
      batch.update(docRef, { customClaims: {} });
    }

    // eslint-disable-next-line no-await-in-loop
    await batch.commit();

    batchCount += 1;
    updatedCount += chunk.length;
    console.log(`Committed batch ${batchCount}: updated ${chunk.length} documents.`);
  }

  console.log("\nDestructive run complete.");
  console.log(`Updated ${updatedCount} Profiles documents.`);
  console.log(`Skipped ${skippedCustomClaimsNotObject} docs (customClaims is missing or not an object).`);
  console.log(`Skipped ${skippedCustomClaimsNotOnlyTimeTrue} docs (customClaims is not exactly { time: true }).`);
}

function printUsage() {
  console.log("Usage: npx ts-node clear-claims.ts [--make-destructive-changes]");
  console.log("Default mode is dry run.");
}

const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => arg !== DESTRUCTIVE_FLAG);

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
  printUsage();
  process.exit(1);
}

const makeDestructiveChanges = args.includes(DESTRUCTIVE_FLAG);

clearClaims(makeDestructiveChanges)
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
