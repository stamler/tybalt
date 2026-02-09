/**
 * analyze-turbo-writeback.ts
 *
 * Read-only Firestore analysis for Turbo writeback staging collections:
 * - TurboClientsWriteback
 * - TurboClientContactsWriteback
 *
 * Purpose:
 * - Find contacts whose clientId is missing from TurboClientsWriteback (will fail MySQL FK).
 * - Find duplicate client names that would collide with MySQL UNIQUE(name) on TurboClients.
 *
 * Usage (from backend/functions):
 *   npx ts-node src/analyze-turbo-writeback.ts
 *
 * Auth:
 * - Uses the same local serviceAccountKey.json pattern as other scripts in this repo.
 */
import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("../../../../../Downloads/serviceAccountKey.json");

type ClientRow = { id: string; name: string | null };
type ContactRow = { id: string; clientId: string | null };

function normalizeMysqlUnicodeCi(s: string): string {
  // Approximate utf8mb3_unicode_ci: case-insensitive, accent-insensitive, ignores leading/trailing spaces.
  // This is not a perfect collation match, but it is good enough to flag likely collisions.
  return s
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks (accents)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function initFirestore(): admin.firestore.Firestore {
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

async function loadClients(db: admin.firestore.Firestore): Promise<ClientRow[]> {
  const snap = await db.collection("TurboClientsWriteback").select("name").get();
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name : null;
    return { id: d.id, name };
  });
}

async function loadContacts(db: admin.firestore.Firestore): Promise<ContactRow[]> {
  const snap = await db.collection("TurboClientContactsWriteback").select("clientId").get();
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const clientId = typeof data.clientId === "string" ? data.clientId : null;
    return { id: d.id, clientId: clientId && clientId.trim() !== "" ? clientId : null };
  });
}

async function main() {
  const db = initFirestore();

  const [clients, contacts] = await Promise.all([loadClients(db), loadContacts(db)]);

  const clientIds = new Set(clients.map((c) => c.id));

  // 1) FK integrity: contacts.clientId must exist in clients ids (or be null)
  const contactsWithNullClientId = contacts.filter((c) => !c.clientId);
  const contactsWithMissingClient = contacts.filter(
    (c) => c.clientId !== null && !clientIds.has(c.clientId)
  );

  // 2) MySQL UNIQUE(name) collision risk
  const byNormName = new Map<string, ClientRow[]>();
  for (const c of clients) {
    if (!c.name) continue;
    const norm = normalizeMysqlUnicodeCi(c.name);
    const arr = byNormName.get(norm) ?? [];
    arr.push(c);
    byNormName.set(norm, arr);
  }
  const duplicateNameGroups = Array.from(byNormName.entries())
    .filter(([, group]) => group.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  // Output summary first (easy to scan in logs)
  console.log("Turbo writeback Firestore analysis");
  console.log("--------------------------------");
  console.log(`TurboClientsWriteback: ${clients.length}`);
  console.log(`TurboClientContactsWriteback: ${contacts.length}`);
  console.log("");
  console.log("FK integrity (TurboClientContactsWriteback.clientId -> TurboClientsWriteback doc id):");
  console.log(`- contacts with null/empty clientId: ${contactsWithNullClientId.length}`);
  console.log(`- contacts with missing clientId reference: ${contactsWithMissingClient.length}`);
  if (contactsWithMissingClient.length > 0) {
    console.log("  sample missing refs (contactId -> clientId):");
    for (const c of contactsWithMissingClient.slice(0, 25)) {
      console.log(`  - ${c.id} -> ${c.clientId}`);
    }
    if (contactsWithMissingClient.length > 25) {
      console.log(`  ... ${contactsWithMissingClient.length - 25} more`);
    }
  }
  console.log("");
  console.log("MySQL UNIQUE(name) collision risk in TurboClientsWriteback (approx utf8mb3_unicode_ci):");
  console.log(`- duplicate name groups: ${duplicateNameGroups.length}`);
  if (duplicateNameGroups.length > 0) {
    for (const [norm, group] of duplicateNameGroups.slice(0, 25)) {
      const names = Array.from(new Set(group.map((x) => x.name ?? ""))).filter(Boolean);
      console.log(`- "${norm}" -> ${group.length} ids (names: ${names.join(" | ")})`);
      for (const c of group) {
        console.log(`    - id=${c.id} name=${JSON.stringify(c.name)}`);
      }
    }
    if (duplicateNameGroups.length > 25) {
      console.log(`... ${duplicateNameGroups.length - 25} more duplicate groups`);
    }
  }

  // Non-zero exit code if we found anything actionable (useful in CI/automation)
  const hasIssues = contactsWithMissingClient.length > 0 || duplicateNameGroups.length > 0;
  process.exit(hasIssues ? 2 : 0);
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});

