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

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { firebaseApp } from "../firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useStateStore } from "../stores/state";

const functions = getFunctions(firebaseApp);

const props = defineProps({
  collectionName: {
    type: String,
    required: true,
  },
});

const router = useRouter();
const route = useRoute();
const parentPath = ref(route.matched[route.matched.length - 2]?.path ?? "");
const show = ref(false);
const rejectionReason = ref("");
const itemId = ref("");

const store = useStateStore();
const { startTask, endTask } = store;

const rejectThenRedirect = async function () {
  await rejectDoc(itemId.value, rejectionReason.value, props.collectionName);
  closeModal();
  router.push(parentPath.value);
};

const closeModal = function () {
  show.value = false;
  itemId.value = "";
  rejectionReason.value = "";
  //document.querySelector("body")?.classList.remove("overflow-hidden");
};

const openModal = function (id: string) {
  show.value = true;
  itemId.value = id;
  //document.querySelector("body")?.classList.add("overflow-hidden");
};

const rejectDoc = async function (
  docId: string,
  reason: string,
  collectionName: string
) {
  startTask({
    id: `reject${docId}`,
    message: "rejecting",
  });
  const rejectDoc = httpsCallable(functions, "rejectDoc");
  try {
    await rejectDoc({ id: docId, collectionName, reason });
    endTask(`reject${docId}`);
  } catch (error: unknown) {
    endTask(`reject${docId}`);
    if (error instanceof Error) {
      alert(`Error rejecting: ${error.message}`);
    } else alert(`Error rejecting: ${JSON.stringify(error)}`);
  }
};

defineExpose({
  openModal,
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
