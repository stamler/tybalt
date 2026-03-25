import "mocha";

import * as chai from "chai";
import * as sinon from "sinon";
import axios from "axios";
import { zonedTimeToUtc } from "date-fns-tz";

import { admin, projectId } from "./index.test";
import { cleanupFirestore } from "./helpers";
import { APP_NATIVE_TZ } from "../src/config";
import { fetchAndSyncTimeSheetsWriteback } from "../src/turboSync";

const assert: Chai.Assert = chai.assert;

describe("turboSync time writeback staging", () => {
  const db = admin.firestore();
  const sandbox = sinon.createSandbox();

  function noonTimestamp(date: string) {
    return admin.firestore.Timestamp.fromDate(
      zonedTimeToUtc(`${date}T12:00:00`, APP_NATIVE_TZ)
    );
  }

  function endOfDayTimestamp(date: string) {
    return admin.firestore.Timestamp.fromDate(
      zonedTimeToUtc(`${date}T23:59:59.999`, APP_NATIVE_TZ)
    );
  }

  function isoTimestamp(dateTime: string) {
    return admin.firestore.Timestamp.fromDate(new Date(dateTime));
  }

  async function collectionIds(collectionName: string) {
    const snap = await db.collection(collectionName).get();
    return snap.docs.map((doc) => doc.id).sort();
  }

  beforeEach(async () => {
    await cleanupFirestore(projectId);
  });

  afterEach(async () => {
    sandbox.restore();
    await cleanupFirestore(projectId);
  });

  it("stages time sheets and time amendments with normalized date fields", async () => {
    sandbox.stub(axios, "get").resolves({
      data: {
        timeSheets: [
          {
            id: "ts-1",
            weekEnding: "2026-02-21",
            employeeName: "Test User",
            entries: [
              {
                id: "te-1",
                weekEnding: "2026-02-21",
                date: "2026-02-16",
                hours: 8,
              },
            ],
          },
        ],
        timeAmendments: [
          {
            id: "ta-1",
            weekEnding: "2026-02-14",
            committedWeekEnding: "2026-02-21",
            date: "2026-02-18",
            committed: "2026-02-20T15:45:00.000Z",
            committer: "user-1",
            committerName: "Approver Name",
          },
        ],
      },
    } as any);

    const result = await fetchAndSyncTimeSheetsWriteback(
      "https://turbo.example",
      "Bearer test-token",
      ["2026-02-21"]
    );

    assert.deepEqual(result, { timeSheets: 1, timeAmendments: 1 });
    assert.deepEqual(await collectionIds("TurboTimeSheetsWriteback"), ["ts-1"]);
    assert.deepEqual(await collectionIds("TurboTimeAmendmentsWriteback"), ["ta-1"]);

    const timesheetSnap = await db.collection("TurboTimeSheetsWriteback").doc("ts-1").get();
    const amendmentSnap = await db.collection("TurboTimeAmendmentsWriteback").doc("ta-1").get();

    assert.equal(
      timesheetSnap.get("weekEnding").toMillis(),
      endOfDayTimestamp("2026-02-21").toMillis()
    );

    const entries = timesheetSnap.get("entries") as Array<Record<string, any>>;
    assert.lengthOf(entries, 1);
    assert.equal(
      entries[0].weekEnding.toMillis(),
      endOfDayTimestamp("2026-02-21").toMillis()
    );
    assert.equal(entries[0].date.toMillis(), noonTimestamp("2026-02-16").toMillis());

    assert.equal(
      amendmentSnap.get("weekEnding").toMillis(),
      endOfDayTimestamp("2026-02-14").toMillis()
    );
    assert.equal(
      amendmentSnap.get("committedWeekEnding").toMillis(),
      endOfDayTimestamp("2026-02-21").toMillis()
    );
    assert.equal(
      amendmentSnap.get("date").toMillis(),
      noonTimestamp("2026-02-18").toMillis()
    );
    assert.equal(
      amendmentSnap.get("committed").toMillis(),
      isoTimestamp("2026-02-20T15:45:00.000Z").toMillis()
    );
  });

  it("rejects malformed time writeback responses without clearing staged data", async () => {
    await db.collection("TurboTimeSheetsWriteback").doc("existing-ts").set({ keep: true });
    await db.collection("TurboTimeAmendmentsWriteback").doc("existing-ta").set({ keep: true });

    sandbox.stub(axios, "get").resolves({
      data: {
        timeSheets: [],
      },
    } as any);

    try {
      await fetchAndSyncTimeSheetsWriteback(
        "https://turbo.example",
        "Bearer test-token",
        ["2026-02-21"]
      );
      assert.fail("expected malformed time writeback response to reject");
    } catch (error) {
      assert.include(String(error), "Expected timeAmendments array");
    }

    assert.deepEqual(await collectionIds("TurboTimeSheetsWriteback"), ["existing-ts"]);
    assert.deepEqual(await collectionIds("TurboTimeAmendmentsWriteback"), ["existing-ta"]);
  });

  it("aborts the full snapshot when any requested week fails", async () => {
    await db.collection("TurboTimeSheetsWriteback").doc("existing-ts").set({ keep: true });
    await db.collection("TurboTimeAmendmentsWriteback").doc("existing-ta").set({ keep: true });

    const axiosGet = sandbox.stub(axios, "get");
    axiosGet.onFirstCall().resolves({
      data: {
        timeSheets: [{ id: "new-ts", weekEnding: "2026-02-21", entries: [] }],
        timeAmendments: [{ id: "new-ta", weekEnding: "2026-02-14", committedWeekEnding: "2026-02-21" }],
      },
    } as any);
    axiosGet.onSecondCall().rejects(new Error("week fetch failed"));

    try {
      await fetchAndSyncTimeSheetsWriteback(
        "https://turbo.example",
        "Bearer test-token",
        ["2026-02-21", "2026-02-28"]
      );
      assert.fail("expected failed week fetch to reject");
    } catch (error) {
      assert.include(String(error), "week fetch failed");
    }

    assert.deepEqual(await collectionIds("TurboTimeSheetsWriteback"), ["existing-ts"]);
    assert.deepEqual(await collectionIds("TurboTimeAmendmentsWriteback"), ["existing-ta"]);
  });

  it("clears both staging collections for a valid but empty four-week snapshot", async () => {
    await db.collection("TurboTimeSheetsWriteback").doc("stale-ts").set({ keep: true });
    await db.collection("TurboTimeAmendmentsWriteback").doc("stale-ta").set({ keep: true });

    const axiosGet = sandbox.stub(axios, "get");
    for (let i = 0; i < 4; i++) {
      axiosGet.onCall(i).resolves({
        data: {
          timeSheets: [],
          timeAmendments: [],
        },
      } as any);
    }

    const result = await fetchAndSyncTimeSheetsWriteback(
      "https://turbo.example",
      "Bearer test-token",
      [
        "2026-02-21",
        "2026-02-14",
        "2026-02-07",
        "2026-01-31",
      ]
    );

    assert.deepEqual(result, { timeSheets: 0, timeAmendments: 0 });
    assert.deepEqual(await collectionIds("TurboTimeSheetsWriteback"), []);
    assert.deepEqual(await collectionIds("TurboTimeAmendmentsWriteback"), []);
  });
});
