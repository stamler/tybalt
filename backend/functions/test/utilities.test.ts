import * as admin from "firebase-admin";
const projectId = "test-app-id";
admin.initializeApp({ projectId });
// NOTE: export FIRESTORE_EMULATOR_HOST="localhost:8080" must be set

import axios from "axios";
import "mocha";

import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const assert = chai.assert;

import { getPayPeriodFromWeekEnding, isPayrollWeek2, getTrackingDoc } from "../src/utilities";

export async function cleanupFirestore(projectId: string) {
  // clear data
  // https://firebase.google.com/docs/emulator-suite/connect_fi restore#clear_your_database_between_tests
  const endpoint = `/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const u: URL = new URL(endpoint, "http://" + process.env.FIRESTORE_EMULATOR_HOST);
  return axios.delete(u.toString());
}

describe("utilities.ts", () => {
  describe("isPayrollWeek2()", () => {
    it("returns true when argument is a valid week 2 of a pay period", () => {
      let weekEnding = new Date("2021-01-09T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === true);
      weekEnding = new Date("2021-03-06T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === true);
      weekEnding = new Date("2021-03-20T23:59:59.999-04:00");
      assert(isPayrollWeek2(weekEnding) === true);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === true);
    });
    it("returns false when argument is a not a valid week 2 of a pay period", () => {
      let weekEnding = new Date("2021-01-02T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-13T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === false);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-04:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2020-11-14T23:59:59.999-06:00");
      assert(isPayrollWeek2(weekEnding) === false);
            
      // account for DST change: the date and time are correct but offset is not
      weekEnding = new Date("2021-03-20T23:59:59.999-03:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-20T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-20T23:59:59.999-06:00");
      assert(isPayrollWeek2(weekEnding) === false);
    });
  });
  describe("getPayPeriodFromWeekEnding", () => {
    it("returns argument when argument is a valid payroll week 2", () => {
      let weekEnding = new Date("2021-01-09T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
      weekEnding = new Date("2021-03-06T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
      weekEnding = new Date("2021-03-20T23:59:59.999-04:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
    });
    it("returns weekEnding of corresponding week2 when argument is weekEnding of week1 of pay period", () => {
      let weekEnding = new Date("2021-01-02T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding).getTime() === new Date("2021-01-09T23:59:59.999-05:00").getTime());

      // account for DST time change
      weekEnding = new Date("2021-03-13T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding).getTime() === new Date("2021-03-20T23:59:59.999-04:00").getTime());
    });
    it("throws if the date isn't a valid week ending", () => {
      let weekEnding = new Date("2021-02-01T23:59:59.999-05:00");
      assert.throws(() => { getPayPeriodFromWeekEnding(weekEnding)});
    });
  });
  describe("getTrackingDoc", () => {

    beforeEach("reset data", async () => {
      await cleanupFirestore(projectId);
    });
    
    it("creates a new Tracking document when no document exists in the collection for date arg", async () => {
      const date = new Date("2021-01-09T23:59:59.999-05:00");
      const docRef = await getTrackingDoc(date, "TimeTracking","weekEnding");
      const docSnap = await docRef.get()      
      assert(docSnap.get("weekEnding").toDate().getTime() === date.getTime());
    });
    it("returns the existing Tracking document when exactly one document exists in the collection for date arg", async () => {
      const date = new Date("2021-01-09T23:59:59.999-05:00");
      const db = admin.firestore();
      const doc = db.collection("TimeTracking").doc("id1");
      await doc.set({ weekEnding: date, unique: "existingTest1" });
      const docRef = await getTrackingDoc(date, "TimeTracking","weekEnding");
      const docSnap = await docRef.get()      
      assert(docSnap.id === "id1");
    });
    it("throws when more than one Tracking document exists in the collection for date arg", async () => {
      const date = new Date("2021-01-09T23:59:59.999-05:00");
      const db = admin.firestore();
      const doc2 = db.collection("TimeTracking").doc("id2");
      const doc3 = db.collection("TimeTracking").doc("id3");
      await doc2.set({ weekEnding: date, unique: "throwTest2" }); 
      await doc3.set({ weekEnding: date, unique: "throwTest3" });
      assert.isRejected(getTrackingDoc(date, "TimeTracking","weekEnding"));
    });
  });
});