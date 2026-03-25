import * as adminModule from "firebase-admin";

const admin =
  (adminModule as unknown as { default?: typeof import("firebase-admin") }).default ??
  (adminModule as unknown as typeof import("firebase-admin"));

const projectId = "test-app-id";
if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}
// NOTE: export FIRESTORE_EMULATOR_HOST="localhost:8080" must be set

export { admin };
export { projectId };
