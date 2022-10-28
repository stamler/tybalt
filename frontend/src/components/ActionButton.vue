<template>
  <button @click="$emit('click')" :title="title">
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
} from "vue-feather-icons";

export default Vue.extend({
  props: {
    type: String,
    title: String,
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
  },
  name: "ActionButton",
});
</script>

<style scoped>
button {
  color: var(--main-link-color);
  background: none;
  border: none;
  text-decoration: none;
  font-size: 1em;
  font-weight: bold;
  font-family: inherit;
  cursor: pointer;
  margin: inherit;
  margin-left: 0;
  padding: 0;
  display: inline;
}
button:hover {
  transition: filter 0.05s ease-in;
  filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3));
}

button:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
}
</style>
