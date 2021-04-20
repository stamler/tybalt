import { admin, projectId } from "./index.test";

import "mocha";

import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const assert = chai.assert;

//import { tallyAndValidate } from "../src/tallyAndValidate";
import { cleanupFirestore } from "./helpers";

describe("tallyAndValidate", async () => {

  const db = admin.firestore();
  // a valid week2 ending
  const weekEnding = new Date("2021-01-09T23:59:59.999-05:00");

  const alice = { uid: "alice", displayName: "Alice Example" };
  const workDescription = "Generic Description";
  const fullITDay = { division: "CI", divisionName: "Information Technology", timetype: "R", timetypeName: "Hours Worked", hours: 8, workDescription };

  beforeEach("reset data", async () => {
    await cleanupFirestore(projectId);
    await db.collection("TimeEntries").add({ date: new Date(2020,0,4), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,5), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,6), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,7), uid: alice.uid, weekEnding, ...fullITDay });
    await db.collection("TimeEntries").add({ date: new Date(2020,0,8), uid: alice.uid, weekEnding, ...fullITDay });
  });

  it("is the first successful test", async () => {
    const timeEntries = await db
      .collection("TimeEntries")
      .where("uid", "==", alice.uid)
      .where("weekEnding", "==", weekEnding)
      .orderBy("date", "asc")
      .get();
    assert.equal(timeEntries.size,5);
  });
});