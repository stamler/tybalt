import { admin, projectId } from "./index.test";

import "mocha";

import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const assert = chai.assert;

import { makeSlug, getAuthObject, getPayPeriodFromWeekEnding, isPayrollWeek2, getTrackingDoc, nextSaturday } from "../src/utilities";
import { CallableContext } from "firebase-functions/lib/providers/https";
import { cleanupFirestore } from "./helpers";

describe("utilities.ts", () => {
  describe("makeSlug()", () => {
    it("correctly forms slugs from manufacturer and serial number", () => {
      assert.isTrue(makeSlug("kQDS 9/452,At", "Dell, Inc. Ltd  ") === "kQDS9452At,dell");
      assert.isTrue(makeSlug("LENISJ/PFU ", "Lenovo Computer, Inc. Ltd  ") === "LENISJPFU,lenovo_computer");
    });
    it("throws if the serial number is under 4 characters long", () => {
      assert.throws(() => {makeSlug("FE/K","Dell, Inc. Ltd")});
      assert.isTrue(makeSlug("FE/KJ","Dell, Inc. Ltd") === "FEKJ,dell");
    });
    it("throws if the manufacturer is under 2 characters long", () => {
      assert.throws(() => {makeSlug("FE/KJ","J Inc.")});
      assert.isTrue(makeSlug("FE/KJ","JR Inc.") === "FEKJ,jr");
    });
  });
  describe("getAuthObject()", () => {
    const context = { auth: { token: { claim1: true, claim2: true, claim3: true, unique: "jkl" }}} as unknown;
    it("throws if the callable context contains no auth object", () => {
      assert.throws(() => {getAuthObject({} as CallableContext,["claim1"])}, "Caller must be authenticated");
    });
    it("throws if the auth object contains no valid claims", () => {
      assert.throws(() => {getAuthObject(context as CallableContext,["claim5"])}, "Caller must have one of [claim5] claims");
    });
    it("returns the auth object if the auth object contains a valid claim", () => {
      const auth = getAuthObject(context as CallableContext,["claim1"]);
      assert.isTrue(auth.token.unique === "jkl");
    });
    it("returns the auth object if the auth object contains at least one valid claim", () => {
      const auth = getAuthObject(context as CallableContext,["claim5","claim3"]);
      assert.isTrue(auth.token.unique === "jkl");
    });
  });
  describe("nextSaturday()", () => {
    it("returns the following Saturday at 23:59:59.999 in America/Thunder_Bay timezone", () => {
      const date1 = new Date("2021-01-09T23:59:59.999-05:00"); // a valid weekEnding
      const date2 = new Date("2021-01-03T16:23:45.000-05:00"); // a Sunday afternoon
      const date3 = new Date("2021-03-14T01:59:59.999-05:00"); // Sunday morning the millisecond before EDT kicks in
      const date4 = new Date("2021-04-15T13:55:01.000-05:00"); // a Thursday afternoon
      const date5 = new Date("2021-05-01T21:25:00.000-04:00"); // finaltest cmach
      const date6 = new Date("2021-05-02T00:31:00.000-00:00"); // other test
      assert.isTrue(nextSaturday(date1).getTime() === date1.getTime());
      assert.isTrue(nextSaturday(date2).getTime() === date1.getTime());
      assert.isTrue(nextSaturday(date3).getTime() === (new Date("2021-03-20T23:59:59.999-04:00")).getTime());
      assert.isTrue(nextSaturday(date4).getTime() === (new Date("2021-04-17T23:59:59.999-04:00")).getTime());
      assert.isTrue(nextSaturday(date5).getTime() === (new Date("2021-05-01T23:59:59.999-04:00")).getTime());
      assert.isTrue(nextSaturday(date6).getTime() === (new Date("2021-05-02T03:59:59.999-00:00")).getTime());
    });
  });
  describe("isPayrollWeek2()", () => {
    it("returns true when argument is a valid week 2 of a pay period", () => {
      let weekEnding = new Date("2021-01-09T23:59:59.999-05:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === true);
      weekEnding = new Date("2021-03-06T23:59:59.999-05:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === true);
      weekEnding = new Date("2021-03-20T23:59:59.999-04:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === true);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-05:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === true);
    });
    it("returns false when argument is a not a valid week 2 of a pay period", () => {
      let weekEnding = new Date("2021-01-02T23:59:59.999-05:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-13T23:59:59.999-05:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-04:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2020-11-14T23:59:59.999-06:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);
            
      // account for DST change: the date and time are correct but offset is not
      weekEnding = new Date("2021-03-20T23:59:59.999-03:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-20T23:59:59.999-05:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-20T23:59:59.999-06:00");
      assert.isTrue(isPayrollWeek2(weekEnding) === false);
    });
  });
  describe("getPayPeriodFromWeekEnding()", () => {
    it("returns argument when argument is a valid payroll week 2", () => {
      let weekEnding = new Date("2021-01-09T23:59:59.999-05:00");
      assert.isTrue(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
      weekEnding = new Date("2021-03-06T23:59:59.999-05:00");
      assert.isTrue(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
      weekEnding = new Date("2021-03-20T23:59:59.999-04:00");
      assert.isTrue(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-05:00");
      assert.isTrue(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
    });
    it("returns weekEnding of corresponding week2 when argument is weekEnding of week1 of pay period", () => {
      let weekEnding = new Date("2021-01-02T23:59:59.999-05:00");
      assert.isTrue(getPayPeriodFromWeekEnding(weekEnding).getTime() === new Date("2021-01-09T23:59:59.999-05:00").getTime());

      // account for DST time change
      weekEnding = new Date("2021-03-13T23:59:59.999-05:00");
      assert.isTrue(getPayPeriodFromWeekEnding(weekEnding).getTime() === new Date("2021-03-20T23:59:59.999-04:00").getTime());
    });
    it("throws if the date isn't a valid week ending", () => {
      let weekEnding = new Date("2021-02-01T23:59:59.999-05:00");
      assert.throws(() => { getPayPeriodFromWeekEnding(weekEnding)});
    });
  });
  describe("getTrackingDoc()", () => {

    beforeEach("reset data", async () => {
      await cleanupFirestore(projectId);
    });
    
    it("creates a new Tracking document when no document exists in the collection for date arg", async () => {
      const date = new Date("2021-01-09T23:59:59.999-05:00");
      const docRef = await getTrackingDoc(date, "TimeTracking","weekEnding");
      const docSnap = await docRef.get()      
      assert.isTrue(docSnap.get("weekEnding").toDate().getTime() === date.getTime());
    });
    it("returns the existing Tracking document when exactly one document exists in the collection for date arg", async () => {
      const date = new Date("2021-01-09T23:59:59.999-05:00");
      const db = admin.firestore();
      const doc = db.collection("TimeTracking").doc("id1");
      await doc.set({ weekEnding: date, unique: "existingTest1" });
      const docRef = await getTrackingDoc(date, "TimeTracking","weekEnding");
      const docSnap = await docRef.get()      
      assert.isTrue(docSnap.id === "id1");
    });
    it("throws when more than one Tracking document exists in the collection for date arg", async () => {
      const date = new Date("2021-01-09T23:59:59.999-05:00");
      const db = admin.firestore();
      const doc2 = db.collection("TimeTracking").doc("id2");
      const doc3 = db.collection("TimeTracking").doc("id3");
      await doc2.set({ weekEnding: date, unique: "throwTest2" }); 
      await doc3.set({ weekEnding: date, unique: "throwTest3" });
      await assert.isRejected(getTrackingDoc(date, "TimeTracking","weekEnding"));
    });
    it("throws when the provided date argument is not a saturday at 23:59:59.999 in America/Thunder_Bay", async () => {
      const date1 = new Date("2021-01-09T23:59:59.990-05:00"); // should fail (wrong msec)
      const date2 = new Date("2021-01-10T23:59:59.999-05:00"); // should fail (not saturday)
      const date3 = new Date("2021-04-17T23:59:59.999-04:00"); // should succeed (EDT, week2)
      const date4 = new Date("2021-01-02T23:59:59.999-05:00"); // should succeed (week1)
      const db = admin.firestore();
      const doc1 = db.collection("TimeTracking").doc("id1");
      const doc2 = db.collection("TimeTracking").doc("id2");
      const doc3 = db.collection("TimeTracking").doc("id3");
      const doc4 = db.collection("TimeTracking").doc("id4");
      await doc1.set({ weekEnding: date1, unique: "throwTest01" }); 
      await doc2.set({ weekEnding: date2, unique: "throwTest02" }); 
      await doc3.set({ weekEnding: date3, unique: "success03" });
      await doc4.set({ weekEnding: date4, unique: "success04" });
      await assert.isRejected(getTrackingDoc(date1, "TimeTracking","weekEnding"));
      await assert.isRejected(getTrackingDoc(date2, "TimeTracking","weekEnding"));
      let docRef = await getTrackingDoc(date3, "TimeTracking","weekEnding");
      let docSnap = await docRef.get()      
      assert.isTrue(docSnap.get("unique") === "success03");
      docRef = await getTrackingDoc(date4, "TimeTracking","weekEnding");
      docSnap = await docRef.get()      
      assert.isTrue(docSnap.get("unique") === "success04");
    });
  });
});