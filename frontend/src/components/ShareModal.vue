<template>
  <transition name="fade">
    <div class="modal" v-if="show">
      <div class="modal__backdrop" />
      <div class="modal__dialog">
        <div class="modal__header">
          <h1>Share</h1>
          <h5>{{ itemId }}</h5>
        </div>
        <div class="modal__body">
          <h3>{{ viewerIds.length === 0 ? "No " : "" }}Viewers</h3>
          <span v-for="managerUid in viewerIds" v-bind:key="managerUid">
            {{ managers.filter((x) => x.id === managerUid)[0].displayName }}
            <span
              v-on:click="$delete(viewerIds, viewerIds.indexOf(managerUid))"
            >
              <x-circle-icon></x-circle-icon>
            </span>
          </span>

          <span class="field" v-if="viewerIds.length < 4">
            <h3>Add</h3>
            <label for="manager">Manager</label>
            <select name="manager" v-model="newViewer">
              <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
                {{ m.displayName }}
              </option>
            </select>
            <span v-on:click="addViewer()">
              <plus-circle-icon></plus-circle-icon>
            </span>
          </span>
        </div>
        <div class="modal__footer">
          <button v-on:click="closeModal()">Cancel</button>
          <button v-on:click="saveThenClose()">Save</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import Vue from "vue";
import firebase from "../firebase";
import { PlusCircleIcon, XCircleIcon } from "vue-feather-icons";

const db = firebase.firestore();

export default Vue.extend({
  name: "Modal",
  props: ["collection"],
  components: {
    PlusCircleIcon,
    XCircleIcon,
  },
  data() {
    return {
      parentPath: "",
      show: false,
      itemId: "",
      newViewer: "",
      viewerIds: [] as string[],
      managers: [] as firebase.firestore.DocumentData[],
    };
  },
  methods: {
    async saveThenClose() {
      try {
        await db
          .collection(this.collection)
          .doc(this.itemId)
          .update({ viewerIds: this.viewerIds });
        this.closeModal();
      } catch (error) {
        alert(`Update sharing failed: ${error}`);
      }
    },
    closeModal() {
      this.show = false;
      this.itemId = "";
      this.viewerIds = [];
      //document.querySelector("body")?.classList.remove("overflow-hidden");
    },
    openModal(id: string, viewerIds: string[]) {
      this.show = true;
      this.itemId = id;
      this.viewerIds = viewerIds || [];
      //document.querySelector("body")?.classList.add("overflow-hidden");
    },
    addViewer() {
      // add viewer, ignoring duplicate entries
      const ids = new Set(this.viewerIds);
      ids.add(this.newViewer);
      this.viewerIds = Array.from(ids);
      this.newViewer = "";
    },
  },
  created() {
    this.$bind(
      "managers",
      db.collection("ManagerNames").orderBy("displayName")
    );
    this.parentPath =
      this?.$route?.matched[this.$route.matched.length - 1]?.parent?.path ?? "";
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