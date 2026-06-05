import * as test from "firebase-functions-test";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);

import "mocha";

import { admin, projectId } from "./index.test";
import { cleanupFirestore } from "./helpers";
import { auditTimeTracking, manuallyUpdateTimeTracking } from "../src/timesheets";

const assert: Chai.Assert = chai.assert;
interface MissingTimeSheetRecord {
  displayName: string;
  uid: string;
  tsid: string;
  status: string;
}
const db = admin.firestore();
const tester = test();
const wrappedAuditTimeTracking = tester.wrap(auditTimeTracking);
const wrappedManuallyUpdateTimeTracking = tester.wrap(manuallyUpdateTimeTracking);
const reportClaimContext = {
  auth: { uid: "reporter", token: { report: true } },
};
const adminClaimContext = {
  auth: { uid: "admin", token: { admin: true } },
};
const weekEnding = new Date("2026-05-16T23:59:59.999-04:00");

function timeSheet(overrides: Partial<FirebaseFirestore.DocumentData>) {
  return {
    weekEnding,
    displayName: "Alice Example",
    uid: "alice",
    submitted: false,
    approved: false,
    locked: false,
    ...overrides,
  };
}

function validTimeSheet(overrides: Partial<FirebaseFirestore.DocumentData>) {
  return timeSheet({
    surname: "Example",
    givenName: "Alice",
    managerUid: "manager",
    managerName: "Manager Example",
    bankedHours: 0,
    mealsHoursTally: 0,
    divisionsTally: {},
    jobsTally: {},
    entries: [],
    ...overrides,
  });
}

describe("auditTimeTracking", () => {
  beforeEach("reset data", async () => {
    await cleanupFirestore(projectId);
  });

  it("returns no missing timesheets when each status is represented in the correct tracking map", async () => {
    await db.collection("TimeTracking").doc("tracking-1").set({
      weekEnding,
      submitted: { "submitted-ts": {} },
      pending: { "approved-ts": {} },
      timeSheets: { "locked-ts": {} },
    });
    await db.collection("TimeSheets").doc("submitted-ts").set(timeSheet({
      displayName: "Submitted Example",
      uid: "submitted",
      submitted: true,
    }));
    await db.collection("TimeSheets").doc("approved-ts").set(timeSheet({
      displayName: "Approved Example",
      uid: "approved",
      submitted: true,
      approved: true,
    }));
    await db.collection("TimeSheets").doc("locked-ts").set(timeSheet({
      displayName: "Locked Example",
      uid: "locked",
      submitted: true,
      approved: true,
      locked: true,
    }));

    const result = await wrappedAuditTimeTracking({ id: "tracking-1" }, reportClaimContext);

    assert.deepEqual(result, []);
  });

  it("reports missing timesheets instead of throwing when tracking maps are absent", async () => {
    await db.collection("TimeTracking").doc("tracking-1").set({ weekEnding });
    await db.collection("TimeSheets").doc("submitted-ts").set(timeSheet({
      displayName: "Submitted Example",
      uid: "submitted",
      submitted: true,
    }));
    await db.collection("TimeSheets").doc("approved-ts").set(timeSheet({
      displayName: "Approved Example",
      uid: "approved",
      submitted: true,
      approved: true,
    }));
    await db.collection("TimeSheets").doc("locked-ts").set(timeSheet({
      displayName: "Locked Example",
      uid: "locked",
      submitted: true,
      approved: true,
      locked: true,
    }));

    const result = await wrappedAuditTimeTracking({ id: "tracking-1" }, reportClaimContext) as MissingTimeSheetRecord[];

    assert.deepEqual(
      result.sort((a, b) => a.tsid.localeCompare(b.tsid)),
      [
        {
          displayName: "Approved Example",
          uid: "approved",
          tsid: "approved-ts",
          status: "approved",
        },
        {
          displayName: "Locked Example",
          uid: "locked",
          tsid: "locked-ts",
          status: "locked",
        },
        {
          displayName: "Submitted Example",
          uid: "submitted",
          tsid: "submitted-ts",
          status: "submitted",
        },
      ]
    );
  });

  it("rejects when the TimeTracking document does not exist", async () => {
    await assert.isRejected(
      wrappedAuditTimeTracking({ id: "missing-tracking" }, reportClaimContext),
      "The provided document id is not in the TimeTracking collection"
    );
  });

  it("initializes all TimeTracking maps when creating a tracking document", async () => {
    await db.collection("TimeSheets").doc("submitted-ts").set(validTimeSheet({
      displayName: "Submitted Example",
      uid: "submitted",
      submitted: true,
    }));

    await wrappedManuallyUpdateTimeTracking({ id: "submitted-ts" }, adminClaimContext);

    const trackingSnapshot = await db
      .collection("TimeTracking")
      .where("weekEnding", "==", weekEnding)
      .get();
    assert.strictEqual(trackingSnapshot.size, 1);
    const trackingData = trackingSnapshot.docs[0].data();
    assert.hasAllKeys(trackingData, ["created", "pending", "submitted", "timeSheets", "weekEnding"]);
    assert.deepEqual(trackingData.pending, {});
    assert.deepEqual(trackingData.timeSheets, {});
    assert.deepEqual(Object.keys(trackingData.submitted), ["submitted-ts"]);
  });
});
