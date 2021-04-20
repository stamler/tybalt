import * as admin from "firebase-admin";
const projectId = "test-app-id";
admin.initializeApp({ projectId });
// NOTE: export FIRESTORE_EMULATOR_HOST="localhost:8080" must be set

export { admin };
export { projectId };