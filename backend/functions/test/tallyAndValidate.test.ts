import { admin, projectId } from "./index.test";

import "mocha";

import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const assert = chai.assert;

//import { tallyAndValidate } from "../src/tallyAndValidate";
import { cleanupFirestore } from "./helpers";

describe("tallyAndValidate", async () => {
  const weekEnding = new Date("2021-01-09T23:59:59.999-05:00");

  beforeEach("reset data", async () => {
    await cleanupFirestore(projectId);
    const db = admin.firestore();
    const doc = db.collection("TimeEntries").doc();
    await doc.set({ weekEnding });
  });

  it("is the first successful test", () => {
    assert(true === true);
  });
});