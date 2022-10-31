<template>
  <button @click.prevent="$emit('click')" :title="title" :style="cssProps">
    <slot />
    <send-icon v-if="type === 'send'" />
    <x-circle-icon v-if="type === 'delete'" />
    <check-circle-icon v-if="type === 'approve'" />
    <archive-icon v-if="type === 'archive'" />
    <rewind-icon v-if="type === 'recall'" />
    <lock-icon v-if="type === 'lock'" />
    <unlock-icon v-if="type === 'unlock'" />
    <user-minus-icon v-if="type === 'removeuser'" />
    <user-plus-icon v-if="type === 'adduser'" />
    <download-icon v-if="type === 'download'" />
    <plus-circle-icon v-if="type === 'add'" />
    <copy-icon v-if="type === 'copy'" />
    <share-icon v-if="type === 'share'" />
    <clipboard-icon v-if="type === 'clipboard'" />
    <key-icon v-if="type === 'key'" />
    <file-minus-icon v-if="type === 'removefile'" />
    <refresh-cw-icon v-if="type === 'refresh'" />
    <eye-icon v-if="type === 'view'" />
  </button>
</template>

<script lang="ts">
import Vue from "vue";
import {
  SendIcon,
  XCircleIcon,
  CheckCircleIcon,
  ArchiveIcon,
  RewindIcon,
  LockIcon,
  UnlockIcon,
  UserMinusIcon,
  UserPlusIcon,
  DownloadIcon,
  PlusCircleIcon,
  CopyIcon,
  ShareIcon,
  ClipboardIcon,
  KeyIcon,
  FileMinusIcon,
  RefreshCwIcon,
  EyeIcon,
} from "vue-feather-icons";

export default Vue.extend({
  props: {
    type: String,
    title: String,
    color: String,
  },
  computed: {
    cssProps() {
      return {
        "--button-link-color": this.color ? this.color : "#00f",
      };
    },
  },
  components: {
    SendIcon,
    XCircleIcon,
    CheckCircleIcon,
    ArchiveIcon,
    RewindIcon,
    LockIcon,
    UnlockIcon,
    UserMinusIcon,
    UserPlusIcon,
    DownloadIcon,
    PlusCircleIcon,
    CopyIcon,
    ShareIcon,
    ClipboardIcon,
    KeyIcon,
    FileMinusIcon,
    RefreshCwIcon,
    EyeIcon,
  },
  name: "ActionButton",
});
</script>

<style scoped>
button {
  color: var(--button-link-color);
  background: none;
  border: none;
  border-radius: 0;
  text-decoration: none;
  font-size: 1em;
  font-weight: bold;
  font-family: inherit;
  cursor: pointer;
  margin: inherit;
  margin-left: 0;
  padding: 0;
}
button:hover {
  transition: filter 0.05s ease-in;
  filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3));
}

button:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
}
</style>
