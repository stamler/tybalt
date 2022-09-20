// Cloud functions to receive mutation requests from the client and to handle
// callbacks from the Azure Automation service.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getAuthObject, requestHasValidSecret } from "./utilities";

// The supported mutations are:
type VerbTypes = "disable" | "enable" | "reset" | "archive" | "restore" | "create" | "edit";

interface AzureAutomationMutationResponse {
  id: string;
  verb: VerbTypes;
  result: "complete" | "error";
  error?: string;
  password?: string;
  upn?: string;
  email?: string;
}

function isAzureAutomationMutationResponse(data: any): data is AzureAutomationMutationResponse {
  const validId = typeof data.id === "string" && data.id.length > 16;
  const validVerbWithoutData = ["disable", "enable", "archive", "restore", "edit"].includes(data.verb);
  const isError = typeof data.error === "string" && data.result === "error" && data.error.length > 12;
  const hasPassword = typeof data.password === "string" && data.password.length > 13;
  const hasUpn = typeof data.upn === "string" && data.upn.length > 10;
  const hasEmail = typeof data.email === "string" && data.email.length > 10;
  const hasNewUserData = hasPassword && hasUpn && hasEmail; // This doesn't include many fields because they won't have changed from what's already in the UserMutations document.
  if (
    validId && 
    (
      (
        !isError &&
        (
          (data.verb === "create" && hasNewUserData) ||
          (data.verb === "reset" && hasPassword) ||
          validVerbWithoutData
        )
      ) || isError
    )
  ) {
    return true;
  }
  return false;
}


// Only the data that can be edited by the user is allowed to be sent to the
// server.
interface ExistingADUserData {
  surname: string;
  givenName: string;
  department: string; // TODO: possibly make this optional?
  title: string; // TODO: possibly make this optional?
  areaCode: string;
  centralOffice: string;
  station: string;
}

// All of the data that is sent to the server is stored in this object. It is a
// superset of ExistingADUserData because it contains some fields which will be
// used to populate a profile document after the user logs in for the first
// time.
interface NewADUserData extends ExistingADUserData {
  defaultDivision: string;
  remuneration: string;
  license: string;
}

// Type Guard for ADUserData
function isExistingADUserData(data: any): data is ExistingADUserData {
  const areaCodeInt = parseInt(data.areaCode, 10);
  const centralOfficeInt = parseInt(data.centralOffice, 10);
  const stationInt = parseInt(data.station, 10);
  if (
      typeof data.surname === "string" && data.surname.length > 2 &&
      typeof data.givenName === "string" && data.givenName.length > 2 &&
      typeof data.department === "string" &&
      typeof data.title === "string" &&
      areaCodeInt > 199 && areaCodeInt < 1000 &&
      centralOfficeInt > 199 && centralOfficeInt < 1000 &&
      stationInt > 0 && stationInt < 10000
    ) {
    return true;
  }
  return false;
}
function isNewADUserData(data: any): data is NewADUserData {
  const areaCodeInt = parseInt(data.areaCode, 10);
  const centralOfficeInt = parseInt(data.centralOffice, 10);
  const stationInt = parseInt(data.station, 10);
  if (
      typeof data.surname === "string" && data.surname.length > 2 &&
      typeof data.givenName === "string" && data.givenName.length > 2 &&
      typeof data.department === "string" &&
      typeof data.title === "string" &&
      //typeof data.areaCode === "number" && data.areaCode > 199 && data.areaCode < 1000 &&
      //typeof data.centralOffice === "number" && data.centralOffice > 199 && data.centralOffice < 1000 &&
      //typeof data.station === "number" && data.station > 0 && data.station < 10000 &&
      areaCodeInt > 199 && areaCodeInt < 1000 &&
      centralOfficeInt > 199 && centralOfficeInt < 1000 &&
      stationInt > 0 && stationInt < 10000 &&
      typeof data.defaultDivision === "string" && data.defaultDivision.length > 1 &&
      (data.remuneration === "Hourly" || data.remuneration === "Salary") &&
      (data.license === "O365_BUSINESS_ESSENTIALS" || data.license === "O365_BUSINESS_PREMIUM" || data.license === "SPB")
    ) {
    return true;
  }
  return false;
}
// Extract the correct format for the user data from the data property of the
// UserMutationRequest
function mutationDataFromFields(fields: NewADUserData | ExistingADUserData) {
  if (isNewADUserData(fields)) {
    return {
      surname: fields.surname,
      givenName: fields.givenName,
      department: fields.department,
      title: fields.title,
      defaultDivision: fields.defaultDivision,
      remuneration: fields.remuneration,
      telephoneNumber: `+1 (${fields.areaCode}) ${fields.centralOffice}-${fields.station}`,
      license: fields.license,
    };
  } else if (isExistingADUserData(fields)) {
    return {
      surname: fields.surname,
      givenName: fields.givenName,
      department: fields.department,
      title: fields.title,
      telephoneNumber: `+1 (${fields.areaCode}) ${fields.centralOffice}-${fields.station}`,
    };
  }
  throw new functions.https.HttpsError(
    "invalid-argument",
    "The data property of the UserMutationRequest is invalid."
  );
}

// UserMutationRequest is the raw data from the client. It is used to create a
// UserMutation but the rest of the data is populated from the context or the
// firestore.

interface UserMutationRequestWithoutData {
  verb: "disable" | "enable" | "reset" | "archive" | "restore";
  userId: string;
}
interface UserMutationRequestCreate {
  verb: "create";
  data: NewADUserData;
}
interface UserMutationRequestEdit {
  verb: "edit";
  userId: string;
  data: ExistingADUserData;
}
type UserMutationRequest = UserMutationRequestWithoutData | UserMutationRequestCreate | UserMutationRequestEdit;
// UserMutations must conform to the following type.
type UserMutation = UserMutationRequest & {
  status: "unapproved" | "pending" | "dispatched" | "completed" | "error";
  surname: string;
  givenName: string;
  created: admin.firestore.Timestamp | admin.firestore.FieldValue;
  creatorUid: string;
  creatorName: string;
  userSourceAnchor?: string;
  data?: any;
}

// User-defined Type Guard for UserMutationRequest
function isUserMutationRequest(data: any): data is UserMutationRequest {
  if (data.verb === "disable" || data.verb === "enable" || data.verb === "reset" || data.verb === "archive" || data.verb === "restore") {
    if (typeof data.userId === "string" && data.userId.length > 16 && Object.prototype.hasOwnProperty.call(data,"data") === false) {
      return true;
    }
  } else if (data.verb === "create") {
    if (Object.prototype.hasOwnProperty.call(data, "userId") === false && isNewADUserData(data.data)) {
      return true;
    }
  } else if (data.verb === "edit") {
    if (typeof data.userId === "string" && data.userId.length > 16 && isExistingADUserData(data.data)) {
      return true;
    }
  }
  return false;
}

export const addMutation = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  // throw if the caller isn't authenticated & authorized. For now only allow
  // clients with the 'admin' claim to create mutations.
  const auth = getAuthObject(context, ["admin","hr"]);
  
  // Validate the data or throw
  // use a User Defined Type Guard
  let mutationRequest: UserMutationRequest;
  if (isUserMutationRequest(data)) {
    mutationRequest = data;
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data isn't a valid mutation request"
    );
  }

  const db = admin.firestore();

  // Get the profile document for the caller.
  const profile = await db.collection("Profiles").doc(auth.uid).get();
  if (!profile.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "A Profile doesn't exist for the caller"
    );
  }
  const creatorName = profile.get("displayName");
  if (creatorName === undefined) {
    throw new functions.https.HttpsError("failed-precondition", `The profile document ${auth.uid} is missing the displayName field`);
  }

  // Create the mutation document from the request based on the verb. If the
  // verb isn't create then we get the existing user data from the Users
  // collection to populate surname, givenName, and the userSourceAnchor.
  let userDocId: string;
  let mutation: UserMutation;
  if (mutationRequest.verb !== "create") {
    // If the mutationRequest verb is not "create", get the existing user
    // document from the firestore Users collection.
    const userDoc = await db.collection("Users").doc(mutationRequest.userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("not-found", `The user document ${mutationRequest.userId} was not found`);
    }
    userDocId = userDoc.id;
    if (userDoc.get("currentMutationVerb") !== undefined) {
      throw new functions.https.HttpsError(
        "already-exists",
        `A mutation (${userDoc.get('currentMutationVerb')}) already exists for the user. Please wait for it to complete.`
      );
    }

    // if the mutationRequest verb is not "edit", create the document without a
    // data property. Otherwise add the data property to the mutation.
    const surname = userDoc.get("surname");
    if (surname === undefined) {
      throw new functions.https.HttpsError("failed-precondition", `The user document ${mutationRequest.userId} is missing the surname field`);
    }
    const givenName = userDoc.get("givenName");
    if (givenName === undefined) {
      throw new functions.https.HttpsError("failed-precondition", `The user document ${mutationRequest.userId} is missing the givenName field`);
    }
    const userSourceAnchor = userDoc.get("userSourceAnchor");
    if (userSourceAnchor === undefined) {
      throw new functions.https.HttpsError("failed-precondition", `The user document ${mutationRequest.userId} is missing the userSourceAnchor field`);
    }
    mutation = {
      ...mutationRequest,
      status: "unapproved",
      surname, givenName,
      created: admin.firestore.FieldValue.serverTimestamp(),
      creatorUid: auth.uid,
      creatorName,
      userSourceAnchor,
    }
    if (mutationRequest.verb === "edit") {
      mutation.data = mutationDataFromFields(mutationRequest.data);
    }

  } else {
    // Create a mutation to add a new user. Since the userId won't exist in the
    // request, we can't use the existing user data to populate the fields.
    mutation = {
      ...mutationRequest,
      status: "unapproved",
      surname: mutationRequest.data.surname,
      givenName: mutationRequest.data.givenName,
      data: mutationDataFromFields(mutationRequest.data),
      created: admin.firestore.FieldValue.serverTimestamp(),
      creatorUid: auth?.uid,
      creatorName,
    };
  }

  // check if a mutation already exists for the user. If so, throw an error.
  // Earlier we checked for the existance of a mutation in existing users by
  // verifying whether the currentMutationVerb property was populated. However
  // "create" mutations do not check this property since the Users document
  // still shouldn't exist. Therefore we need to check for existing mutations
  // using properties from the data of the create operation using the givenName
  // and surname fields.
  if (mutationRequest.verb === "create") {
    const existingMutations = db
      .collection("UserMutations")
      .where("surname", "==", mutationRequest.data.surname)
      .where("givenName", "==", mutationRequest.data.givenName);
    await db.runTransaction(t => {
      return t.get(existingMutations)
        .then(async (querySnapshot) => {
          if (querySnapshot.empty === false) {
            throw new functions.https.HttpsError(
              "already-exists",
              "A mutation already exists for the user. Please wait for it to complete."
            );
          }
          return t.create(db.collection("UserMutations").doc(), mutation);
        });
    });
  } else {
    await db.runTransaction(t => {
      return t.get(db.collection("Users").doc(userDocId))
        .then(async (userDoc) => {
          if (userDoc.exists === false) {
            throw new functions.https.HttpsError(
              "not-found",
              `The user document ${userDocId} was not found`
            );
          }
          if (userDoc.get("currentMutationVerb") !== undefined) {
            throw new functions.https.HttpsError(
              "already-exists",
              `A mutation (${userDoc.get('currentMutationVerb')}) already exists for the user. Please wait for it to complete.`
            );
          }
          const newMutationDocRef = db.collection("UserMutations").doc();
          t.create(newMutationDocRef, mutation);
          t.update(db.collection("Users").doc(userDocId), { 
            currentMutationVerb: mutationRequest.verb,
            currentMutationId: newMutationDocRef.id,
          });
        });
    });
  }
});

interface DeleteMutationPayloadObject {
  id: string;
}
function isDeleteMutationPayloadObject(data: any): data is DeleteMutationPayloadObject {
  if (typeof data.id === "string" && data.id.length > 16 ) return true;
  return false;
}

export const deleteMutation = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  if (!context.auth) {
    // Throw an HttpsError so that the client gets the error details
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Caller must be authenticated"
    );
  }

  // throw if the caller isn't authenticated & authorized. For now only allow
  // clients with the 'admin' claim to delete mutations.
  getAuthObject(context, ["admin", "hr"]);
  
  const db = admin.firestore();

  // In a transaction, get the mutation document and the corresponding user
  // document if it exists. Delete the currentMutationVerb and currentMutationId
  // fields from the user document. Delete the mutation document.

  if (!isDeleteMutationPayloadObject(data)) {
    throw new functions.https.HttpsError("invalid-argument", "The id of the mutation is required");
  }

  const mutationDoc = db.collection("UserMutations").doc(data.id);

  await db.runTransaction(t => {
    return t.get(mutationDoc)
      .then(async (mutationDocSnapshot) => {
        if (!mutationDocSnapshot.exists) {
          throw new functions.https.HttpsError("not-found", `The mutation document ${data.id} was not found`);
        }
        const status = mutationDocSnapshot.get("status");
        if (status !== "unapproved" && status !== "pending" && status !== "complete") {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `Only mutations with status unapproved, pending or completed can be deleted.`
          );
        }
        // This update shouldn't be done if the mutation is a create operation
        // because the user document shouldn't exist.
        if (mutationDocSnapshot.get("verb") !== "create") {
          t.update(
            db.collection("Users").doc(mutationDocSnapshot.get("userId")), 
            { 
              currentMutationVerb: admin.firestore.FieldValue.delete(), 
              currentMutationId: admin.firestore.FieldValue.delete(),
            }
          );
        }
        return t.delete(mutationDoc);
      })
  });

});

// This is called by the Azure Automation Powershell script on a scheduled
// basis. It returns a list of the pending mutations. The script then uses this
// list to action the mutations and then calls the mutationComplete function to
// do any further processing including error handling.
export const dispatchMutations = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response<any>): Promise<any> => {

  // authenticate the caller
  if (!requestHasValidSecret(req, "azureuserautomation.secret")) {
    return res.status(401).send(
      `request secret doesn't match expected`
    );
  }

  // validate the request type
  if (req.method !== "GET") {
    res.header("Allow", "GET");
    return res.status(405).send();
  }

  // Get all of the pending mutations in a transaction, build the response, then
  // update the status of the mutations to dispatched.
  const db = admin.firestore();
  const pendingMutations = db.collection("UserMutations").where("status", "==", "pending");
  await db.runTransaction(t => {
    return t.get(pendingMutations).then(async (querySnapshot) => {
      const mutations = querySnapshot.docs.map(doc => {
        return {
          id: doc.id,
          verb: doc.get("verb"),
          userSourceAnchor: doc.get("userSourceAnchor"),
          data: doc.get("data"),
        };
      });
      const response = {
        mutations,
      };
      mutations.forEach(mutation => {
        t.update(db.collection("UserMutations").doc(mutation.id), { status: "dispatched" });
      });
      return res.status(200).send(response);
    });
  })
});

// This is called by the Azure Automation Powershell script after it completes
// actioning an individual mutation. The request will contain the mutation id
// and the result of the mutation action. If there is follow up work to do, the
// function will update the status in the UserMutation document to indicate
// which phase it is in for downstream functions to pick up. Otherwise it will
// simply set the status of the UserMutations document to either "complete" or
// "error". Any errors will written to the UserMutations document in the
// returnedData property.
export const mutationComplete = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response<any>): Promise<any> => {
  // authenticate the caller
  if (!requestHasValidSecret(req, "azureuserautomation.secret")) {
    return res.status(401).send(
      `request secret doesn't match expected`
    );
  }

  // validate the request type. Use post since the URL doesn't contain the ID of
  // the mutation and the response can only be received once (don't expect
  // idempontent requests)
  if (req.method !== "POST") {
    res.header("Allow", "POST");
    return res.status(405).send();
  }
  
  // req.body can be used directly as JSON if this passes
  if (req.get("Content-Type") !== "application/json") {
    return res.status(415).send();
  }
  
  // get the request body as JSON, ensure it contains the id and result fields,
  // possibly the data field
  const d = req.body;

  if (!isAzureAutomationMutationResponse(d)) {
    return res.status(400).send("The request body is not a valid Azure Automation Mutation Response");
  }

  const db = admin.firestore();

  // update the mutation document with the new status and data if it exists
  const mutation = db.collection("UserMutations").doc(d.id);
  await db.runTransaction(async t => {
    return t.get(mutation).then(async (docSnap) => {
      if (!docSnap.exists) {
        // If the mutation doesn't exist, it was deleted after being dispatched.
        // Don't update the status. Throw an error to prevent the transaction
        // from committing.
        functions.logger.error(`The mutation ${d.id} was not found`);
        throw new functions.https.HttpsError(
          "not-found",
          "The mutation doesn't exist"
        );
      }
      if (docSnap.get("status") !== "dispatched") {
        // If the mutation has been updated since it was dispatched, don't
        // update the status. Throw an error to prevent the transaction from
        // committing.
        throw new functions.https.HttpsError(
          "invalid-argument",
          "The mutation status is not dispatched as expected. Aborting update."
        );
      }
      if (d.result === "complete") {
        // If the mutation is an edit operation, update the status to
        // "complete". The next sync will ensure that the Users document is
        // updated.

        // TODO: the currentADDump function will check for any onPremEdited
        // mutations and update the corresponding Profiles document the next
        // time it runs. currentADDump will then set the status of the
        // UserMutations document to "complete".
        if (d.verb === "edit") {
          return t.update(mutation, {
            status: "onPremEdited",
            statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
          });      
        }

        // If the mutation is a create operation, write back the password and
        // upn and email to the UserMutation document under the "returnedData"
        // property then set the status to "onPremCreated". 

        // TODO: Upon first user login, the createProfile function will be
        // called to create the user profile using the data from the
        // UserMutation document. createProfile will then set the status
        // of the UserMutations document to "complete".
        if (d.verb === "create") {
          return t.update(mutation, {
            status: "onPremCreated",
            statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
            returnedData: {
              password: d.password,
              upn: d.upn,
              email: d.email,
            },
          });      
        }

        // If the mutation is a reset operation, write back the new password to
        // the UserMutations document under the "returnedData" property then set
        // the status to "complete". The administrator can then communicate this
        // password to the user. In the future an automated SMS message could be
        // sent to the user.

        // TODO: archived users will need to have timesheet not expected set in
        // their profile after the complete mutation is received.

        if (d.verb === "reset" || d.verb === "archive") {
          return t.update(mutation, {
            status: "complete",
            statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
            returnedData: {
              password: d.password,
            },
          });
        }

        // For all other verbs, just update the status to "complete" or "error".
        return t.update(mutation, {
          status: "complete",
          statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        return t.update(mutation, {
          status: "error",
          returnedData: d.error,
        });
      }      
    })
  });
  return res.status(202).send();
});

export const approveMutation = functions.https.onCall(async (data: any, context: functions.https.CallableContext): Promise<any> => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in to approve a mutation"
    );
  }

  // throw if the caller isn't authenticated & authorized. Only allow clients
  // with the 'admin' claim to approve mutations.
  getAuthObject(context, ["admin"]);

  if (!data.id) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a mutation id"
    );
  }
  const db = admin.firestore();
  const mutation = db.collection("UserMutations").doc(data.id);
  return db.runTransaction(async t => {
    return t.get(mutation).then(async (docSnap) => {
      if (!docSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "The mutation doesn't exist"
        );
      }
      if (docSnap.get("status") !== "unapproved") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The mutation status is not unapproved as expected. Aborting update."
        );
      }
      return t.update(mutation, {
        status: "pending",
        statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  });
});