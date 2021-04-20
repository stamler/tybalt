import * as admin from "firebase-admin";
const projectId = "test-app-tallyAndValidate";
admin.initializeApp({ projectId });
// NOTE: export FIRESTORE_EMULATOR_HOST="localhost:8080" must be set

import "mocha";

import * as chai from "chai";    
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const assert = chai.assert;

//import { tallyAndValidate } from "../src/tallyAndValidate";
import { cleanupFirestore } from "./helpers";

describe("tallyAndValidate", async () => {
  
  beforeEach("reset data", async () => {
    await cleanupFirestore(projectId);
  });

});