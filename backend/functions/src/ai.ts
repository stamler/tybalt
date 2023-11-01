// ai.ts

import * as functions from "firebase-functions";
import { getAuthObject, isDocIdObject, isChatPayloadObject } from "./utilities";
import * as admin from "firebase-admin";
import axios, { isAxiosError } from "axios";
import { v4 as uuidv4 } from "uuid";

const db = admin.firestore();
// This google cloud function is called by the client to save a new chat message
// to the database After the message is saved, a separate function is triggered
// via a database trigger to send the message to the chat correct chat bot. This
// function expects an object containing the following properties: { content:
// string, id?: string }. content is the message to be sent to the chat bot and
// id is the id of the chat thread. If it is not provided, a new document is
// created, otherwise the message is added to the existing document. The
// function always returns the id of the chat thread.
export const newAiChat = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
  
    // Verify data is a ChatPayload
    if (!isChatPayloadObject(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The chat payload object didn't validate"
      );
    }
  
    // get this value from data, for now it's hard coded
    const { content } = data;
  
    // throw if the caller isn't authenticated & authorized
    const auth = getAuthObject(context, ["chat"]);

    // look for a bot string on the profile of the user
    const profileRef = db.collection("Profiles").doc(auth.uid);
    const profileSnapshot = await profileRef.get();
    if (!profileSnapshot.exists) {
      throw new Error(`A profile doesn't exist for uid ${auth.uid}`);
    }
    const bot = profileSnapshot.get("bot");
    
    const batch = db.batch();
    const newChatDoc: ChatDoc = {
      responding: false,
      waiting: true,
      uid: auth.uid,
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
      count: 1,
      // if the content is longer than 32 characters, truncate it to 29
      // characters and add "..." to make the title. Otherwise, use the
      // content as the title. After the second user message we will query the
      // AI to make a better title for the chat and update the document
      title: content.length > 32 ? content.slice(0, 29) + "..." : content,
    };
    if (bot !== undefined) {
      newChatDoc["bot"] = bot;
    }
    const newDocRef = db.collection("AIChats").doc();
    batch.set(newDocRef, newChatDoc);
    batch.set(newDocRef.collection("messages").doc(), {
        role: "user",
        content,
        time: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
      await batch.commit();
      return { id: newDocRef.id };          
    } catch (error) {
      functions.logger.error(error);
      throw new functions.https.HttpsError(
        "internal",
        "There was an error creating the chat document"
      );
    }
});

interface ChatDoc {
  responding: boolean;
  waiting: boolean;
  uid: string;
  last_updated: admin.firestore.Timestamp | admin.firestore.FieldValue;
  count: number;
  title: string;
  bot?: string;
}
// This function deleteChat is called by the client to delete a chat document
// and all of the messages in the subcollection. It throws if everything isn't
// deleted. It iterates over the messages subcollection and deletes each
// document. Then it deletes the chat document. The function expects an object
// containing the following properties: { id: string }. id is the id of the
// AIChats document. On success, the function returns nothing. It throws if 
// the caller isn't authenticated & authorized or if the document doesn't exist.
export const deleteChat = functions.https.onCall(async (data: unknown, context: functions.https.CallableContext) => {
    
    // Verify data is a DocIdObject
    if (!isDocIdObject(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The provided data doesn't contain a document id"
      );
    }
    
    // get document id from data
    const { id } = data;
  
    // throw if the caller isn't authenticated & authorized
    getAuthObject(context, ["chat"]);

    // throw if the document's uid doesn't match the caller's uid
    const docRef = db.collection("AIChats").doc(id);
    const docSnapshot = await docRef.get();
    if (!docSnapshot.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "The chat document doesn't exist"
      );
    }
    const docData = docSnapshot.data();
    if (docData?.uid !== context.auth?.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not authorized to delete this document"
      );
    }

    // first delete up to 499 messages in the subcollection. If there are more
    // than 499 messages, the function will not handle them so we'll need to
    // code a solution later. This is because batches can only contain 500
    // operations. We'll need to delete the messages in batches of 499 until
    // there are no more messages to delete. Then we'll delete the chat
    // document. We'll return the number of messages deleted so the client can
    // display a message to the user.
    const batch = db.batch();
    const messagesRef = docRef.collection("messages");
    const messagesSnapshot = await messagesRef.limit(499).get();
    const messagesCount = messagesSnapshot.size;
    if (messagesCount === 499) {
      functions.logger.warn(
        "There are more than 499 messages in the subcollection. The function will not delete all of them and they will become orphaned."
      );
    }
    // delete the messages
    if (!messagesSnapshot.empty) {
      messagesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
    }
    // delete the chat document
    batch.delete(docRef);
    try {
      await batch.commit();
      return { messagesCount };
    } catch (error) {
      functions.logger.error(error);
      throw new functions.https.HttpsError(
        "internal",
        "There was an error deleting the messages"
      );
  }
});

// When a new message is added to a chat document, this function is triggered
// via a database trigger. It sends the message to the chat bot and saves the
// response to the database. This function waits for a maximum of 180 seconds
// before timing out. This means dispatching the message to the chat bot can
// take up to 180 seconds. The dispatch functions should timeout before this
export const aiResponder = functions.runWith({ timeoutSeconds: 180 }).firestore.document("AIChats/{chatId}/messages/{messageId}").onCreate(async (snap, context) => {
  return sharedAiResponder(context.params.chatId, context.eventId, context.params.messageId, snap);
});

// The user may call the retryAiChat function to retry a chat that has failed to
// receive a response. This function is exactly the same as the aiResponder
// except it can be called by the user and it receives id as a parameter. It is
// implemented by calling a shared function with the id parameter. This function
// is shared with aiResponder. When the function returns successfully, the
// chat's error flag is set to false and the error message is cleared.
export const retryAiChat = functions.https.onCall(async (data, context) => {
  // Verify data is a DocIdObject
  if (!isDocIdObject(data)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The provided data doesn't contain a document id"
    );
  }
  // get document id from data
  const { id } = data;
  // throw if the caller isn't authenticated & authorized
  getAuthObject(context, ["chat"]);
  // get the chat document
  const chatRef = db.collection("AIChats").doc(id);
  const chatSnapshot = await chatRef.get();
  if (!chatSnapshot.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "The chat document doesn't exist"
    );
  }
  const chatData = chatSnapshot.data();
  if (chatData?.uid !== context.auth?.uid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not authorized to retry this chat"
    );
  }
  // get the last message in the chat
  const messagesRef = chatRef.collection("messages");
  const messagesSnapshot = await messagesRef.orderBy("time", "desc").limit(1).get();
  if (messagesSnapshot.empty) {
    throw new functions.https.HttpsError(
      "not-found",
      "The chat document doesn't contain any messages"
    );
  }
  const messageSnapshot = messagesSnapshot.docs[0];
  const messageId = messageSnapshot.id;
  // call the shared function
  try {
    return sharedAiResponder(id, undefined, messageId, messageSnapshot);
  } catch (error) {
    functions.logger.error(error);
    throw new functions.https.HttpsError(
      "internal",
      "There was an error retrying the chat"
    );
  }
});

const sharedAiResponder = async (chatId: string, receivedEventId: string | undefined, messageId: string, messageSnapshot: admin.firestore.DocumentSnapshot ) => {

      // if the event id is undefined, this function was called by the user so
      // we create a new event id which is randomly generated
      const eventId = receivedEventId === undefined ? uuidv4() + "_manual" : receivedEventId;

      // get the message data
      const messageData = messageSnapshot.data();
      if (!messageData) {
        throw new Error(`message ${messageId} belonging to chat ${chatId} is empty`);
      }
      const { content, role } = messageData;

      // only respond to messages from the user
      if (role !== "user") {
        functions.logger.info(`Ignoring message ${messageId} because it's not from a user.`);
        return;
      }
  
      // since this is a user message, get the chat data
      const chatRef = db.collection("AIChats").doc(chatId);
      const chatSnapshot = await chatRef.get();
      if (!chatSnapshot.exists) {
        throw new Error(`Chat doc ${chatId} doesn't exist`);
      }
      const chatData = chatSnapshot.data();
      if (!chatData) {
        throw new Error(`The chat document ${chatId} is empty`);
      }
      const { uid, bot } = chatData;

      // set the responding flag to true, on error silently continue. To make
      // this function idempotent, check if a message with the same eventId is
      // already in the database before setting the responding flag to true. If
      // it is, we should return. This will prevent the function from being
      // triggered multiple times.
      const existingMsg = await chatRef.collection("messages").where("eventId", "==", eventId).get();
      if (existingMsg.size > 0) {
        functions.logger.warn(`A message for eventId ${eventId} already exists in the database`);
        return;
      }
      try {
        await chatRef.update({ responding: true });
      } catch (error) {
        functions.logger.error(`There was an error updating the responding flag for chat ${chatId}`);
      }

      const batch = db.batch();

      // check the chat document for a specific bot string, then dispatch the
      // message to the appropriate bot. If the bot errors, set the waiting and
      // responding flags to false and set the error flag to true.
      let message, response;
      try {
        switch (bot) {
          case "gpt-3.5-turbo-unmodified":
            // get all the messages in the chat document as context for the openAI
            // bot
            const messagesSnapshot = await chatRef.collection("messages").orderBy("time","asc").get();
            const messages = messagesSnapshot.docs.map((doc) => { 
              return { 
                content: doc.get("content"), 
                role: doc.get("role"),
              }
            });
            functions.logger.info(`dispatching message ${messageId} to ${bot}`);
            ({ message, response } = await queryChatGPT(messages, uid));
            break;
          default:
            functions.logger.info(`dispatching message ${messageId} to default bot`);
            ({ message, response } = await queryLatinBot(content));
        }
      } catch (error) {
        const errorMessage = (error as Error).message;
        functions.logger.error(`message ${messageId} to bot ${bot} has error ${errorMessage}`);
        batch.set(chatRef, {
          waiting: false,
          responding: false,
          error: true,
          errorMessage,
        }, { merge: true });
      }
      
      if (message) {
        batch.set(chatRef.collection("messages").doc(), {
          ...message,
          time: admin.firestore.FieldValue.serverTimestamp(),
          eventId,
          response,
        });
        batch.set(chatRef, {
          error: admin.firestore.FieldValue.delete(),
          errorMessage: admin.firestore.FieldValue.delete(),
          waiting: false,
          responding: false,
          count: chatData.count + 1, // TODO: this should be a count() aggregation value
         }, { merge: true });
      }
      return batch.commit();
};

// The latin bot is a simple bot that responds to the user's message with a
// random phrase of random length. It's a placeholder for a more sophisticated bot. It
// returns an object with properties content: string, role: string
async function queryLatinBot(prompt: string) {
  functions.logger.info(`querying latin bot with prompt: ${prompt}`);
  const length = Math.floor(Math.random() * 3);
  const url = `https://baconipsum.com/api/?type=meat-and-filler&paras=${length}&format=text`;
  const response = await axios.get(url);
  const text: string = await response.data;
  return { message: { content:text, role: "assistant" }, response: response.data };
}

// The OpenAI bot is a more sophisticated bot that uses the OpenAI API to
// generate a response to the user's message. It returns an object with
// properties content: string, role: string
interface OpenAIChatMessage {
  content: string;
  role: string;
}

async function queryChatGPT(messages: OpenAIChatMessage[], uid: string) {
  const apiKey = functions.config().tybalt.openai.key;

  // TODO: put the givenName in the chat document so we don't have to query
  // TODO: just pass the chat document to this function and others that run queries
  const givenName =  await (await (db.collection("Profiles").doc(uid).get())).get("givenName");

  
  const systemPrompt = 
    `You are Tibby, a chatbot at TBT Engineering Limited, Northwestern Ontario's largest independent engineering firm. You assist users inside the company, not clients!. You don't have access to any corporate information that isn't on the public internet. You are talking to a ${givenName}. They say:`;
  // Send the request to the OpenAI API with a timeout of 60 seconds
  let response;
  try {
    response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        messages: [{ role: "system", content: systemPrompt},...messages],
        model: "gpt-3.5-turbo",
        user: uid,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
      },
    );
    return { message: response.data.choices[0].message, response: response.data} ;        
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(error.message);
    } else {
      throw error;
    }
  }
}