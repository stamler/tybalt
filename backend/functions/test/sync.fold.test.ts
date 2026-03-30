import "mocha";

import * as chai from "chai";
import { zonedTimeToUtc } from "date-fns-tz";

import { admin, projectId } from "./index.test";
import { cleanupFirestore } from "./helpers";
import { APP_NATIVE_TZ } from "../src/config";
import { foldCollection } from "../src/sync";
import { getFoldAnalyzer } from "../src/fold-policies";

const assert: Chai.Assert = chai.assert;

describe("sync foldCollection time writeback", () => {
  const db = admin.firestore();

  function weekEndingTimestamp(date: string) {
    return admin.firestore.Timestamp.fromDate(
      zonedTimeToUtc(`${date}T23:59:59.999`, APP_NATIVE_TZ)
    );
  }

  function baseTimeSheet(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      uid: "user-1",
      displayName: "Test User",
      surname: "User",
      givenName: "Test",
      managerUid: "manager-1",
      managerName: "Manager",
      bankedHours: 0,
      mealsHoursTally: 0,
      divisionsTally: {},
      jobsTally: {},
      entries: [],
      submitted: false,
      approved: false,
      locked: false,
      weekEnding: weekEndingTimestamp("2026-02-21"),
      ...overrides,
    };
  }

  function baseTimeAmendment(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      uid: "user-1",
      created: admin.firestore.Timestamp.fromDate(new Date("2026-02-19T10:30:00.000Z")),
      commitTime: admin.firestore.Timestamp.fromDate(new Date("2026-02-20T15:45:00.000Z")),
      weekEnding: weekEndingTimestamp("2026-02-14"),
      committedWeekEnding: weekEndingTimestamp("2026-02-21"),
      committed: true,
      exported: true,
      hours: 8,
      ...overrides,
    };
  }

  async function getBusinessKeyMatches(uid: string, weekEnding: FirebaseFirestore.Timestamp) {
    return db
      .collection("TimeSheets")
      .where("uid", "==", uid)
      .where("weekEnding", "==", weekEnding)
      .get();
  }

  beforeEach(async () => {
    await cleanupFirestore(projectId);
  });

  afterEach(async () => {
    await cleanupFirestore(projectId);
  });

  it("creates a new timesheet when neither id nor business key exists", async () => {
    const staged = baseTimeSheet();
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(staged);

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const createdSnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.isTrue(createdSnap.exists);
    assert.equal(createdSnap.get("exported"), false);
    assert.isFalse(stagingSnap.exists);
    assert.equal((await getBusinessKeyMatches("user-1", staged.weekEnding as FirebaseFirestore.Timestamp)).size, 1);
  });

  it("replaces only when the exact id exists with the same business key and is not locked or exported", async () => {
    const weekEnding = weekEndingTimestamp("2026-02-21");
    await db.collection("TimeSheets").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        displayName: "Old User",
        exported: false,
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        displayName: "Fresh User",
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const legacySnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.equal(legacySnap.get("displayName"), "Fresh User");
    assert.equal(legacySnap.get("exported"), false);
    assert.isFalse(stagingSnap.exists);
    assert.equal((await getBusinessKeyMatches("user-1", weekEnding)).size, 1);
  });

  it("treats an identical exact-id timesheet as a no-op and preserves exported even when exported is true", async () => {
    const weekEnding = weekEndingTimestamp("2026-02-21");
    await db.collection("TimeSheets").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        exported: true,
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const legacySnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.equal(legacySnap.get("exported"), true);
    assert.isFalse(stagingSnap.exists);
  });

  it("treats an identical exact-id locked timesheet as a no-op and does not mark a conflict", async () => {
    const weekEnding = weekEndingTimestamp("2026-02-21");
    await db.collection("TimeSheets").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        locked: true,
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        locked: true,
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const legacySnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.isTrue(legacySnap.exists);
    assert.equal(legacySnap.get("locked"), true);
    assert.isFalse(stagingSnap.exists);
  });

  it("records a conflict on staging when the exact-id legacy timesheet is locked", async () => {
    await db.collection("TimeSheets").doc("turbo-ts").set(
      baseTimeSheet({
        locked: true,
        displayName: "Locked User",
        exported: false,
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        displayName: "Fresh User",
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const legacySnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.equal(legacySnap.get("displayName"), "Locked User");
    assert.isTrue(stagingSnap.exists);
    assert.equal(stagingSnap.get("tybaltConflict"), "turbo-ts");
    assert.equal((await getBusinessKeyMatches("user-1", weekEndingTimestamp("2026-02-21"))).size, 1);
  });

  it("records a conflict on staging when the exact-id legacy timesheet is exported", async () => {
    await db.collection("TimeSheets").doc("turbo-ts").set(
      baseTimeSheet({
        displayName: "Exported User",
        exported: true,
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        displayName: "Fresh User",
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const legacySnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.equal(legacySnap.get("displayName"), "Exported User");
    assert.isTrue(stagingSnap.exists);
    assert.equal(stagingSnap.get("tybaltConflict"), "turbo-ts");
    assert.equal((await getBusinessKeyMatches("user-1", weekEndingTimestamp("2026-02-21"))).size, 1);
  });

  it("records a conflict on staging when a different legacy doc already uses the same business key", async () => {
    const weekEnding = weekEndingTimestamp("2026-02-21");
    await db.collection("TimeSheets").doc("legacy-ts").set(
      baseTimeSheet({
        weekEnding,
        displayName: "Legacy User",
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        displayName: "Fresh User",
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const legacySnap = await db.collection("TimeSheets").doc("legacy-ts").get();
    const createdSnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.equal(legacySnap.get("displayName"), "Legacy User");
    assert.isFalse(createdSnap.exists);
    assert.isTrue(stagingSnap.exists);
    assert.equal(stagingSnap.get("tybaltConflict"), "legacy-ts");
    assert.equal((await getBusinessKeyMatches("user-1", weekEnding)).size, 1);
  });

  it("leaves staging in place without tybaltConflict when duplicate legacy business keys already exist", async () => {
    const weekEnding = weekEndingTimestamp("2026-02-21");
    await db.collection("TimeSheets").doc("legacy-a").set(baseTimeSheet({ weekEnding }));
    await db.collection("TimeSheets").doc("legacy-b").set(baseTimeSheet({ weekEnding }));
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        weekEnding,
        displayName: "Fresh User",
        tybaltConflict: "stale-conflict",
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.isTrue(stagingSnap.exists);
    assert.isUndefined(stagingSnap.get("tybaltConflict"));
    assert.equal((await getBusinessKeyMatches("user-1", weekEnding)).size, 2);
    assert.isFalse((await db.collection("TimeSheets").doc("turbo-ts").get()).exists);
  });

  it("records a conflict when the exact-id doc exists for a different business key", async () => {
    await db.collection("TimeSheets").doc("turbo-ts").set(
      baseTimeSheet({
        uid: "user-2",
        weekEnding: weekEndingTimestamp("2026-02-28"),
        displayName: "Other User",
      })
    );
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(
      baseTimeSheet({
        displayName: "Fresh User",
      })
    );

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);

    const exactIdSnap = await db.collection("TimeSheets").doc("turbo-ts").get();
    const stagingSnap = await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get();

    assert.equal(exactIdSnap.get("uid"), "user-2");
    assert.isTrue(stagingSnap.exists);
    assert.equal(stagingSnap.get("tybaltConflict"), "turbo-ts");
    assert.equal(
      (await getBusinessKeyMatches("user-1", weekEndingTimestamp("2026-02-21"))).size,
      0
    );
  });

  it("skips time folds when legacy time editing is enabled", async () => {
    await db.collection("Config").doc("Enable").set({ time: true });
    await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").set(baseTimeSheet());
    await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").set(baseTimeAmendment());

    await foldCollection("TurboTimeSheetsWriteback", "TimeSheets", [], ["exported"]);
    await foldCollection(
      "TurboTimeAmendmentsWriteback",
      "TimeAmendments",
      [{ sourceField: "_id", destField: "_id" }],
      ["exported"]
    );

    assert.equal((await db.collection("TimeSheets").get()).size, 0);
    assert.equal((await db.collection("TimeAmendments").get()).size, 0);
    assert.isTrue((await db.collection("TurboTimeSheetsWriteback").doc("turbo-ts").get()).exists);
    assert.isTrue(
      (await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").get()).exists
    );
  });

  it("replaces a time amendment by id and resets exported", async () => {
    await db.collection("TimeAmendments").doc("amendment-1").set(
      baseTimeAmendment({
        exported: true,
        hours: 4,
      })
    );
    await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").set(
      baseTimeAmendment({
        hours: 12,
      })
    );

    await foldCollection(
      "TurboTimeAmendmentsWriteback",
      "TimeAmendments",
      [{ sourceField: "_id", destField: "_id" }],
      ["exported"]
    );

    const amendmentSnap = await db.collection("TimeAmendments").doc("amendment-1").get();
    const stagingSnap = await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").get();

    assert.isTrue(amendmentSnap.exists);
    assert.equal(amendmentSnap.get("hours"), 12);
    assert.equal(amendmentSnap.get("exported"), false);
    assert.isFalse(stagingSnap.exists);
  });

  it("creates a time amendment by id when no match exists", async () => {
    await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").set(
      baseTimeAmendment({
        hours: 12,
      })
    );

    await foldCollection(
      "TurboTimeAmendmentsWriteback",
      "TimeAmendments",
      [{ sourceField: "_id", destField: "_id" }],
      ["exported"]
    );

    const amendmentSnap = await db.collection("TimeAmendments").doc("amendment-1").get();
    const stagingSnap = await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").get();

    assert.isTrue(amendmentSnap.exists);
    assert.equal(amendmentSnap.get("hours"), 12);
    assert.equal(amendmentSnap.get("exported"), false);
    assert.isFalse(stagingSnap.exists);
  });

  it("normalizes known amendment date fields during fold before writing legacy docs", async () => {
    await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").set({
      uid: "user-1",
      weekEnding: "2026-02-14",
      committedWeekEnding: "2026-02-21",
      date: "2026-02-18",
      commitTime: "2026-02-20T15:45:00.000Z",
      created: "2026-02-19T10:30:00.000Z",
      committed: true,
      exported: true,
      hours: 12,
    });

    await foldCollection(
      "TurboTimeAmendmentsWriteback",
      "TimeAmendments",
      [{ sourceField: "_id", destField: "_id" }],
      ["exported"]
    );

    const amendmentSnap = await db.collection("TimeAmendments").doc("amendment-1").get();

    assert.equal(
      amendmentSnap.get("weekEnding").toMillis(),
      weekEndingTimestamp("2026-02-14").toMillis()
    );
    assert.equal(
      amendmentSnap.get("committedWeekEnding").toMillis(),
      weekEndingTimestamp("2026-02-21").toMillis()
    );
    assert.equal(
      amendmentSnap.get("date").toMillis(),
      admin.firestore.Timestamp.fromDate(
        zonedTimeToUtc("2026-02-18T12:00:00", APP_NATIVE_TZ)
      ).toMillis()
    );
    assert.equal(
      amendmentSnap.get("commitTime").toMillis(),
      admin.firestore.Timestamp.fromDate(new Date("2026-02-20T15:45:00.000Z")).toMillis()
    );
    assert.equal(
      amendmentSnap.get("created").toMillis(),
      admin.firestore.Timestamp.fromDate(new Date("2026-02-19T10:30:00.000Z")).toMillis()
    );
  });

  it("treats an identical time amendment as a no-op and preserves exported", async () => {
    await db.collection("TimeAmendments").doc("amendment-1").set(
      baseTimeAmendment({
        exported: true,
      })
    );
    await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").set(
      baseTimeAmendment()
    );

    await foldCollection(
      "TurboTimeAmendmentsWriteback",
      "TimeAmendments",
      [{ sourceField: "_id", destField: "_id" }],
      ["exported"]
    );

    const amendmentSnap = await db.collection("TimeAmendments").doc("amendment-1").get();
    const stagingSnap = await db.collection("TurboTimeAmendmentsWriteback").doc("amendment-1").get();

    assert.isTrue(amendmentSnap.exists);
    assert.equal(amendmentSnap.get("exported"), true);
    assert.isFalse(stagingSnap.exists);
  });

  it("uses the shared timesheet analyzer for preview-style conflict reporting", async () => {
    const analyzer = getFoldAnalyzer("TimeSheets");
    const weekEnding = weekEndingTimestamp("2026-02-21");
    await db.collection("TimeSheets").doc("legacy-ts").set(
      baseTimeSheet({
        weekEnding,
        displayName: "Legacy User",
      })
    );

    const action = await analyzer(
      db,
      "TimeSheets",
      [],
      "turbo-ts",
      baseTimeSheet({
        weekEnding,
        displayName: "Fresh User",
      }),
      ["exported"]
    );

    assert.deepEqual(action, {
      action: "conflict",
      reason: 'Conflict: Existing doc with same "uid" and "weekEnding" has different id',
      blockingDocId: "legacy-ts",
      sourceDataPatch: {
        tybaltConflict: "legacy-ts",
      },
    });
  });
});
