import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { requestHasValidSecret } from "./utilities";
import { FUNCTIONS_CONFIG_SECRET } from "./secrets";

export const currentADDump = functions
  .runWith({ secrets: [FUNCTIONS_CONFIG_SECRET] })
  .https.onRequest(async (req: functions.https.Request, res: functions.Response<any>): Promise<any> => {
  
    // authenticate the caller
    if (!requestHasValidSecret(req, "azureuserautomation.secret")) {
      return res.status(401).send(
        "request secret doesn't match expected"
      );
    }

    // req.body can be used directly as JSON if this passes
    if (req.get("Content-Type") !== "application/json") {
      return res.status(415).send();
    }

    const adUsers: any[] = req.body;

    if (req.method !== "POST") {
      res.header("Allow", "POST");
      return res.status(405).send();
    }

    // write data to database
    try {
    // This is inefficient. Instead, we should iterate over all existing users,
    // trying to match each one from the submitted request. At the end if there
    // are still users left in the request body, we should add them, marking
    // isInOnPremisesAD as true.
      const db = admin.firestore();
      const users = await db.collection("Users").get();
      for (const user of users.docs) {
        const userSourceAnchor = user.get("userSourceAnchor");
        if (userSourceAnchor !== undefined) {
          const userInRequest = adUsers.find((u: any) => u.userSourceAnchor === userSourceAnchor);
          // The user exists in AD and in Tybalt
          if (userInRequest !== undefined) {
            await user.ref.update({
              department: userInRequest.Department,
              OU: userInRequest.OU,
              title: userInRequest.Title,
              adEnabled: userInRequest.enabled,
              telephoneNumber: userInRequest.telephoneNumber,
              email: userInRequest.mail,
              upn: userInRequest.userPrincipalName,
              givenName: userInRequest.givenName,
              surname: userInRequest.surname,
              isInOnPremisesAD: true,
              isInOnPremisesADLastSet: admin.firestore.FieldValue.serverTimestamp(),
            });
            // remove the user from adUsers so we don't repeat it
            adUsers.splice(adUsers.indexOf(userInRequest), 1);
          }
        } else {
        // The user doesn't exist in AD but does in Tybalt, so mark it as such
          await user.ref.update({
            isInOnPremisesAD: false,
            isInOnPremisesADLastSet: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      functions.logger.debug(`${adUsers.length} users left in request body`);
      functions.logger.debug(adUsers);
      const extraUsers = adUsers.filter((u: any) => u.userSourceAnchor.length > 10);

      // add extra users to Users collection, marking isInOnPremisesAD as true and
      // isInOnPremisesADLastSet as now, but also setting lastComputer to null
      for (const user of extraUsers) {
        await db.collection("Users").add({
          department: user.Department,
          description: user.Description || null,
          OU: user.OU,
          title: user.Title,
          adEnabled: user.enabled,
          telephoneNumber: user.telephoneNumber,
          email: user.mail,
          upn: user.userPrincipalName,
          givenName: user.givenName,
          surname: user.surname,
          isInOnPremisesAD: true,
          isInOnPremisesADLastSet: admin.firestore.FieldValue.serverTimestamp(),
          addedWithoutComputerLogin: admin.firestore.FieldValue.serverTimestamp(), 
          userSourceAnchor: user.userSourceAnchor,
          lastComputer: null,
        });
      }
      return res.status(202).send();
    } catch (error: unknown) {
      functions.logger.error(error);
      const typedError = error as Error;
      return res.status(500).send(typedError.message);
    }
  });

/*
// This function was created to erase an accidental bug in the previous function
// where the property was incorrectly named. It is no longer needed.
async function cleanUsers() {
  const db = admin.firestore();
  const users = await db.collection("Users").get();
  for (const user of users.docs) {
    await user.ref.update({
      onPremisesADLastSync: admin.firestore.FieldValue.delete(),
    });
  }
}
*/