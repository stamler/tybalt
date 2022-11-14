// backend functions for wireguard
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getAuthObject, isDocIdObject, requestHasValidSecret } from "./utilities";
import * as _ from "lodash";

interface WireguardClientPayloadObject {
  uid: string;
  computerId: string;
}

interface WireguardClientPublicKeyPayloadObject {
  id: string;
  publicKey: string;
}

const db = admin.firestore();

function isWireguardClientPayloadObject(data: any): data is WireguardClientPayloadObject {
  if (
    typeof data.uid === "string" &&
    typeof data.computerId === "string"
  ) return true;
  return false;
}

function isWireguardClientPublicKeyPayloadObject(data: any): data is WireguardClientPublicKeyPayloadObject {
  if (
    typeof data.id === "string" &&
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(data.id) &&
    typeof data.publicKey === "string" &&
    data.publicKey.length > 40
  ) return true;
  return false;
}

// add a new wireguard peer in WireGuardClients collection
export const wgCreateKeylessClient = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {

  // throw if the caller isn't authenticated & authorized. For now only allow
  // clients with the 'admin' claim create a client config
  getAuthObject(context, ["admin"]);

  // Verify data is a WireguardClientPayloadObject
  if (!isWireguardClientPayloadObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The wireguard client payload object didn't validate"
    );
  }

  // create a new document in the WireGuardClients collection. First check that
  // the uid exists in the Profiles collection and that the computerId exists in
  // the Computers collection. If so, create a new document in the
  // WireGuardClients collection by first copying the WireGuard document in the
  // Config collection and then adding the uid and computerId properties.
  // Finally set the enabled property to false. At this point the user can see
  // the document in the ui and generate their private and public keys in their
  // browser. When they generate the keys, the PublicKey will be added to the
  // WireGuardClients document and finally the administator can enable the
  // client.
  const newClientDocSnap = await db.collection("Config").doc("WireGuard").get();
  if (!newClientDocSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "A WireGuard config document does not exist"
    );
  }
  const newClient = newClientDocSnap.data();
  if (!newClient) {
    throw new functions.https.HttpsError(
      "not-found",
      "The WireGuard config document is empty"
    );
  }

  const profile = await db.collection("Profiles").doc(data.uid).get();
  if (!profile.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "A profile for the uid does not exist"
    );
  }
  const computer = await db.collection("Computers").doc(data.computerId).get();
  if (!computer.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "A computer for the computerId does not exist"
    );
  }

  newClient.samAccountName = profile.get("email").split("@")[0];
  newClient.uid = data.uid;
  newClient.computerId = data.computerId;
  newClient.displayName = profile.get("displayName");
  newClient.computerName = computer.get("computerName");
  newClient.enabled = false;
  
  // get the next available IP address in the given range from the exisintg
  // WireGuardClients documents
  const allIps = Array.from(ipRange(newClient.IPRange.lowerBound, newClient.IPRange.upperBound));
  const wireguardClients = await db.collection("WireGuardClients").get();
  const usedIps = wireguardClients.docs.map((doc) => doc.id);
  const unusedIps = _.difference(allIps, usedIps);
  const ip = unusedIps.sort()[0];
  delete newClient.IPRange;

  functions.logger.debug(`newClient: ${JSON.stringify(newClient)}`);
  // TOOD: ensure that the ip is not already in use possilby using a transaction
  return db.collection("WireGuardClients").doc(ip).set(newClient);

});


// This generator creates an iterable object that yields all IP addresses in the
// provided range inclusive of the start and end addresses.
export function* ipRange(
  lowerBound: string,
  upperBound: string
): Generator<string, void, void> {
  const lower = lowerBound.split(".").map((octet) => parseInt(octet));
  const upper = upperBound.split(".").map((octet) => parseInt(octet));
  const ip = lower;
  while (ip[0] <= upper[0]) {
    while (ip[1] <= upper[1]) {
      while (ip[2] <= upper[2]) {
        while (ip[3] <= upper[3]) {
          yield ip.join(".");
          ip[3]++;
        }
        ip[3] = 0;
        ip[2]++;
      }
      ip[2] = 0;
      ip[1]++;
    }
    ip[1] = 0;
    ip[0]++;
  }
}

// enable or disable a wireguard peer in WireGuardClients collection
export const wgToggleEnableClient = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  // throw if the caller isn't authenticated & authorized. For now only allow
  // clients with the 'admin' claim create a client config
  getAuthObject(context, ["admin"]);

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }

  // get the document from the WireGuardClients collection
  const doc = await db.collection("WireGuardClients").doc(data.id).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "The document does not exist"
    );
  }

  // if the document is enabled, disable it
  const enabled = doc.get("enabled");
  if (enabled === true) {
    // disable the client
    return doc.ref.update({ enabled: false });
  }

  // otherwise check if the document has a PublicKey and if so, enable it
  if (doc.get("PublicKey") === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The client is missing a PublicKey and so cannot be enabled"
    );
  }
  return doc.ref.update({ enabled: true });
});

// delete a wireguard peer in WireGuardClients collection
export const wgDeleteClient = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  // throw if the caller isn't authenticated & authorized. For now only allow
  // clients with the 'admin' claim create a client config
  getAuthObject(context, ["admin"]);

  // Validate the data or throw
  // use a User Defined Type Guard
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }

  // get the document from the WireGuardClients collection
  const doc = await db.collection("WireGuardClients").doc(data.id).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "The document does not exist"
    );
  }

  // delete the document
  return doc.ref.delete();
});

// deliver the peers list to the wireguard server at regular intervals
export const wgPeersIni = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response<any>): Promise<any> => {
    // authenticate the caller
    if (!requestHasValidSecret(req, "wireguard.secret")) {
      // TODO: consider not returning anything here and just timing out
      // return;
      return res.status(401).send(
        `request secret doesn't match expected`
      );
    }
  
    if (req.method !== "GET") {
      res.header("Allow", "GET");
      return res.status(405).send();
    }
  
    // get the list of enabled peers
    const wireguardClients = await db.collection("WireGuardClients").where("enabled", "==", true).get();
    const peers = wireguardClients.docs.map((doc) => {
      const data = doc.data();
      return {
        displayName: data.displayName,
        computerName: data.computerName,
        PublicKey: data.PublicKey,
        AllowedIPs: `${doc.id}/32`,
      };
    });

    // generate the wireguard config peers.conf file (ini format) and return it
    const config = peers.map((peer) => {
      return `[Peer]
# ${peer.displayName} - ${peer.computerName}
PublicKey = ${peer.PublicKey}
AllowedIPs = ${peer.AllowedIPs}
`;
    });
    res.setHeader('content-type', 'text/plain');
    return res.status(200).send(config.join("\n"));
});

// receive the wireguard client's public key and store it in the config
export const wgSetPublicKey = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  // throw if the caller isn't authenticated & authorized
  const auth = getAuthObject(context, ["time"]);

  // validate that the data contains both an id string for a WireGuardClients
  // document and a PublicKey string
  if (!isWireguardClientPublicKeyPayloadObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id and a PublicKey"
    );
  }

  // validate that the uid on the auth object matches the uid on the
  // WireGuardClients document
  const doc = await db.collection("WireGuardClients").doc(data.id).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "The WireGuardClients document doesn't exist"
    );
  }
  if (doc.get("uid") !== auth.uid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "The document does not belong to the authenticated user"
    );
  }

  // Throw if the WireGuardClients document already have a PublicKey property
  if (doc.get("PublicKey") !== undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The WireGuardClients document already has a PublicKey property"
    );
  }
  
  // update the WireGuardClients document with the PublicKey, also disable it
  // as a security measure to require oversight with new keys
  return doc.ref.update({ PublicKey: data.publicKey, enabled: false });
});

// clear the wireguard client's public key from tybalt
export const wgClearPublicKey = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  // throw if the caller isn't authenticated & authorized. For now only allow
  // clients with the 'admin' claim create a client config
  getAuthObject(context, ["admin"]);

  // validate that the data contains an id string for a WireGuardClients
  // document
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }

  // get the document from the WireGuardClients collection
  const doc = await db.collection("WireGuardClients").doc(data.id).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "The document does not exist"
    );
  }

  // delete the PublicKey from the WireGuardClients document, also disable it
  return doc.ref.update({ PublicKey: admin.firestore.FieldValue.delete(), enabled: false });
});