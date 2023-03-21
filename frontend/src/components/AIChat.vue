<template>
  <div class="chat">
    <div class="chat_messages">
      <div
        class="chat_message"
        v-bind:class="{
          user: message.role === 'user',
          assistant: message.role === 'assistant',
        }"
        v-for="message in messages"
        :key="message.id"
      >
        <div class="chat_message_text" v-html="prettyMsg(message.content)" />
      </div>
      <div class="chat_message_assistant" v-if="item?.error">
        <div class="chat_message_text">
          <div class="error">
            <div class="attention">
              {{ item.errorMessage }}
            </div>
            <action-button type="refresh" @click.prevent="retry">
              Retry
            </action-button>
          </div>
        </div>
      </div>
    </div>
    <div class="chat_input" v-bind:class="{ disabled: lockinput === true }">
      <textarea
        v-show="item?.waiting !== true"
        v-on:input="setInputHeight"
        ref="chatfield"
        v-model="input"
        placeholder="..."
        v-bind:readonly="lockinput === true"
        @keyup.enter="send"
        @keydown.enter.prevent
      />
      <div class="waiting" v-if="item?.waiting">
        {{ item?.responding ? "Responding " : "Sending " }}
        <div class="lds-ellipsis">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import hljs from "highlight.js";
import { marked } from "marked";
import ActionButton from "./ActionButton.vue";
import { defineComponent } from "vue";
import { useStateStore } from "../stores/state";
import { validate as uuidValidate } from "uuid";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFirestore,
  DocumentData,
  collection,
  query,
  doc,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { firebaseApp } from "../firebase";
import { isDocIdObject } from "./types";
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp);
export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask, hideNav } = store;
    return {
      user: store.user,
      claims: store.claims,
      startTask,
      endTask,
      hideNav,
    };
  },
  components: {
    ActionButton,
  },
  name: "AIChat",
  props: ["id"],
  watch: {
    id: function (id) {
      this.setItem(id);
    },
    lockinput: function (newValue) {
      if (newValue === false) {
        this.$nextTick(() => {
          this.setInputHeight();
          this.focusInput();
        });
      }
    },
    messages: {
      handler() {
        this.scrollToEnd();
      },
      deep: true,
    },
    item: function (newValue, oldValue) {
      // turn off the sendLock when the waiting flag changes from true to false
      if (
        newValue?.waiting !== oldValue?.waiting &&
        newValue?.waiting === false
      ) {
        this.sendLock = false;
      }
    },
  },
  data() {
    return {
      sendLock: false,
      // if the props id is a UUID, and doesn't match the newChatUUID value,
      // newChatUUID should be set to the props id and chatId should be set to
      // undefined. This is to let the component know that it should create a
      // new chat.
      chatId: undefined as string | undefined,
      newChatUUID: undefined as string | undefined,
      parentPath: "",
      item: {} as DocumentData | undefined,
      messages: [] as DocumentData[] | undefined,
      input: "",
      inputStorage: "", // store the input here to repopulate input on error
      collectionName: "AIChats",
    };
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
  },
  mounted() {
    this.setItem(this.id);
    this.focusInput();
  },
  computed: {
    lockinput() {
      // TODO: send lock can't turn off until the reply comes back
      return this.item?.waiting || this.sendLock;
    },
    workingId() {
      // If the id chatId is defined, return it. Otherwise, return the
      // prop id.
      return this.chatId === undefined ? this.id : this.chatId;
    },
  },
  methods: {
    focusInput() {
      this.hideNav();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.$refs.chatfield as any).focus();
    },
    setInputHeight(nextTick = false) {
      // TODO: call this on window resize as well.

      const textarea = this.$refs.chatfield as HTMLTextAreaElement;
      // oninput='this.style.height = "";this.style.height = this.scrollHeight + "px"'
      // unsure why setting the height to an empty string first is necessary
      if (nextTick) {
        this.$nextTick(() => {
          textarea.style.height = "";
          textarea.style.height = textarea.scrollHeight + "px";
        });
        return;
      }
      textarea.style.height = "";
      textarea.style.height = textarea.scrollHeight + "px";
    },
    prettyMsg(text: string) {
      let output = text;
      // create html from markdown
      output = marked.parse(output);

      // parse the html and add the hljs class to code blocks
      const parser = new DOMParser();
      const doc = parser.parseFromString(output, "text/html");
      const codeBlocks = doc.querySelectorAll("pre code");
      codeBlocks.forEach((codeBlock) => {
        const el = codeBlock as HTMLElement;
        hljs.highlightElement(el);
      });
      return doc.body.innerHTML;
    },
    scrollToEnd() {
      // scroll using the scrollHeight on the next tick. Next tick is needed to
      // ensure the DOM has been updated with the new message prior to
      // scrolling. This is necessary because the scrollHeight is not updated
      // until the DOM is updated.
      this.$nextTick(() => {
        const chatMessages = this.$el.querySelector(".chat_messages");
        if (chatMessages) {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      });
    },
    setItem(id: string) {
      if (!uuidValidate(id)) {
        // existing chat, bind to firestore documents
        this.$firestoreBind(
          "item",
          doc(collection(db, this.collectionName), id)
        )
          .then(() => {
            this.$firestoreBind(
              "messages",
              query(
                collection(db, this.collectionName, id, "messages"),
                orderBy("time", "asc")
              )
            );
          })
          .catch((error: unknown) => {
            if (error instanceof Error) {
              alert(
                `Can't load ${this.collectionName} document ${id}: ${error.message}`
              );
            } else
              alert(
                `Can't load ${
                  this.collectionName
                } document ${id}: ${JSON.stringify(error)}`
              );
          });
      } else {
        // new chat mode. If the props id doesn't match the newChatUUID, set the
        // newChatUUID to the id and set the chatId to undefined
        if (this.id !== this.newChatUUID) {
          this.newChatUUID = id;
          this.chatId = undefined;
        }

        // we don't run $firestoreUnbind because setItem will automatically
        // rebind next time
        this.item = undefined;
        this.messages = undefined;
        this.focusInput();
      }
    },
    async send() {
      this.inputStorage = this.input;
      // aggregate the data for the new message document
      const message = {
        content: this.input,
        role: "user",
        time: serverTimestamp(),
      };
      const batch = writeBatch(db);

      // Check if the workingId is a UUID. If so, this is a new chat.
      if (uuidValidate(this.workingId)) {
        // New chat. The new message document and the containing chat document
        // are created on the server then the client is redirected to the new
        // chat id on success. This is done on the server because it is not
        // possible to verify the uid on a chat document that doesn't exist yet
        // when determining whether the user is allowed to create a new message.
        this.sendLock = true;
        this.startTask({
          id: `createChat`,
          message: "Creating Chat...",
        });
        const newAiChat = httpsCallable(functions, "newAiChat");

        return newAiChat({ content: this.input })
          .then((result) => {
            this.input = "";
            this.setInputHeight(true);
            this.endTask("createChat");
            // redirect to new chat id
            if (!isDocIdObject(result.data)) {
              throw new Error(
                "Unexpected response from aiChatEndpoint" +
                  +JSON.stringify(result.data)
              );
            }
            this.chatId = result.data.id;
            this.setItem(this.workingId);
          })
          .catch((error) => {
            this.sendLock = false;
            this.endTask("createChat");
            alert(`Error sending message: ${error.message}`);
          });
      }

      // Existing chat. Save the chat message directly to the messages
      // subcollection of the chat. Update the last_updated and count fields
      // of the chat document.
      batch.set(
        doc(collection(db, this.collectionName, this.workingId, "messages")),
        message
      );
      batch.update(doc(collection(db, this.collectionName), this.workingId), {
        last_updated: serverTimestamp(),
        waiting: true,
        count: (this.item?.count || 0) + 1, // TODO: this should be updated in ai.ts
      });
      try {
        await batch.commit();
        this.input = "";
        this.setInputHeight(true);
        return;
      } catch (error) {
        this.input = this.inputStorage;
        this.setInputHeight(true);
        alert(`Error saving message: ${error}`);
        return;
      }
    },
    async retry() {
      // Just call the retry firebase function with the current chat id
      this.startTask({
        id: `retryChat`,
        message: "Retrying Chat...",
      });
      const retryAiChat = httpsCallable(functions, "retryAiChat");
      try {
        await retryAiChat({ id: this.workingId });
        this.endTask("retryChat");
      } catch (error) {
        this.endTask("retryChat");
        alert(`Error retrying chat: ${error}`);
      }
    },
  },
});
</script>
<style>
@import "highlight.js/styles/atom-one-light";
@import "./lds-ellipsis.css";
:not(pre) > code {
  font-weight: bold;
  padding: 0 0.1em;
}
pre > code {
  border-radius: 0.5em;
  margin: 0.5em 0;
  font-family: "Fira Code", "Menlo", "Monaco", "Courier New", monospace;
}
.chat {
  /* Subtract for header and actions bar */
  height: calc(100vh - 60px - 0.4em - 27.5px);
  /* background-color: #6bc7d0; */
  display: flex;
  flex-direction: column;
}
/* The chat messages should occupy at most 80% of the width of the available
area. */
.chat_messages {
  /* flex-grow: 1; */
  scroll-behavior: smooth;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 1em 1em 3.5em;
}
.chat_message {
  margin-bottom: 1em;
  border-radius: 0.5em;
  max-width: 80%;
  padding: 0.5em;
}
/* User messages are right-aligned. They should occupy at most 80% of the width
before wrapping to another line. The text should be left-aligned within the box
but the div itself should be right-aligned.
 */
.chat_message.user {
  background-color: #0d88db;
  color: #fff;
  align-self: flex-end;
}

.chat_message.assistant {
  background-color: #e8e8e8;
  align-self: flex-start;
}

.chat_message_text {
  text-align: left;
}
.chat_message_text > ol,
.chat_message_text ul {
  margin-top: 0.5em;
  margin-right: 0.5em;
  margin-left: 1.2em;
}
.chat_message_text > ol > li {
  list-style-type: decimal;
  margin-top: 0.5em;
}
.chat_message_text > p:not(:first-child) {
  margin-top: 0.5em;
}

.chat_input {
  display: flex;
  align-items: center;
  padding: 0.4em;
  margin: 1em 1.5em;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  border-radius: 0.4em;
  box-shadow: 0 0 1em #000;
}
.chat_input.disabled {
  opacity: 0.5;
}
.chat_input textarea {
  background-color: inherit;
  flex-grow: 1;
  border: none;
  resize: none;
  overflow-y: auto;
  height: 30px;
  padding: 0;
  margin: 0;
  font-family: inherit;
  font-size: inherit;
}
.chat_input textarea:focus {
  outline: none;
}

.waiting {
  display: flex;
  align-items: center;
  font-weight: bold;
  font-size: 1.3em;
  color: #999;
  justify-content: center;
  width: 100%;
}
</style>
