<template>
  <transition name="fade">
    <div class="modal" v-if="show">
      <div class="modal__backdrop" />
      <div class="modal__dialog">
        <div class="modal__header">
          <h1>Reject</h1>
          <h5>{{ itemId }}</h5>
        </div>
        <div class="modal__body">
          <p>What's wrong with this {{ collectionName }} document?</p>
          <textarea
            placeholder="give a reason at least 6 characters long"
            id="rejectionInput"
            v-model="rejectionReason"
          ></textarea>
        </div>
        <div class="modal__footer">
          <button v-on:click="closeModal()">Cancel</button>
          <button
            v-if="rejectionReason.length > 5"
            v-on:click="rejectThenRedirect()"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { firebaseApp } from "../firebase";
import {
  getFirestore,
  doc,
  runTransaction,
  DocumentSnapshot,
} from "firebase/firestore";
import { useStateStore } from "../stores/state";

const db = getFirestore(firebaseApp);

export default defineComponent({
  setup() {
    const store = useStateStore();
    const { startTask, endTask } = store;
    return { startTask, endTask, user: store.user };
  },
  props: ["collectionName"],
  data() {
    return {
      parentPath: "",
      show: false,
      rejectionReason: "",
      itemId: "",
    };
  },
  methods: {
    async rejectThenRedirect() {
      await this.rejectDoc(
        this.itemId,
        this.rejectionReason,
        this.collectionName
      );
      this.closeModal();
      this.$router.push(this.parentPath);
    },
    closeModal() {
      this.show = false;
      this.itemId = "";
      this.rejectionReason = "";
      //document.querySelector("body")?.classList.remove("overflow-hidden");
    },
    openModal(id: string) {
      this.show = true;
      this.itemId = id;
      //document.querySelector("body")?.classList.add("overflow-hidden");
    },
    rejectDoc(docId: string, reason: string, collectionName: string) {
      this.startTask({
        id: `reject${docId}`,
        message: "rejecting",
      });
      const docRef = doc(db, collectionName, docId);
      return runTransaction(db, async (transaction) => {
        return transaction.get(docRef).then((tsDoc: DocumentSnapshot) => {
          if (!tsDoc.exists) {
            throw `A document with id ${docId} doesn't exist.`;
          }
          const data = tsDoc?.data() ?? undefined;
          if (
            (collectionName === "TimeSheets" &&
              data?.submitted === true &&
              data?.locked === false) ||
            (collectionName === "Expenses" &&
              data?.submitted === true &&
              (data?.committed === false || data?.committed === undefined))
          ) {
            // document is rejectable because it is submitted and not locked or committed
            transaction.update(docRef, {
              approved: false,
              submitted: false,
              rejected: true,
              rejectorId: this.user.uid,
              rejectorName: this.user.displayName,
              rejectionReason: reason,
            });
          } else {
            throw "The document has not been submitted or is locked";
          }
        });
      })
        .then(() => {
          this.endTask(`reject${docId}`);
        })
        .catch((error) => {
          this.endTask(`reject${docId}`);
          alert(`Rejection failed: ${error}`);
        });
    },
  },
  created() {
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 2]?.path ?? "";
  },
});
</script>

<style lang="scss" scoped>
.modal {
  color: orange;
  overflow-x: hidden;
  overflow-y: auto;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 9;
  &__backdrop {
    background-color: rgba(0, 0, 0, 0.8);
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 1;
  }
  &__dialog {
    //background-color: #ffffff;
    position: relative;
    width: 600px;
    margin: 20vh auto;
    display: flex;
    flex-direction: column;
    border-radius: 5px;
    z-index: 2;
    @media screen and (max-width: 992px) {
      width: 90%;
    }
  }
  &__close {
    width: 30px;
    height: 30px;
  }
  &__header {
    padding: 20px 20px 10px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  &__body {
    padding: 10px 20px 10px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  &__footer {
    padding: 10px 20px 20px;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
