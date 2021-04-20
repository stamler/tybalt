import axios from "axios";

export async function cleanupFirestore(projectId: string) {
  // clear data
  // https://firebase.google.com/docs/emulator-suite/connect_fi restore#clear_your_database_between_tests
  const endpoint = `/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const u: URL = new URL(endpoint, "http://" + process.env.FIRESTORE_EMULATOR_HOST);
  return axios.delete(u.toString());
}
