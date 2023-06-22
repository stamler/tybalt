<template>
  <button @click.stop :title="title" :style="cssProps">
    <slot />
    <Icon icon="feather:send" width="24px" v-if="type === 'send'" />
    <Icon icon="feather:x-circle" width="24px" v-if="type === 'delete'" />
    <Icon icon="feather:check-circle" width="24px" v-if="type === 'approve'" />
    <Icon icon="feather:archive" width="24px" v-if="type === 'archive'" />
    <Icon icon="feather:rewind" width="24px" v-if="type === 'recall'" />
    <Icon icon="feather:lock" width="24px" v-if="type === 'lock'" />
    <Icon icon="feather:unlock" width="24px" v-if="type === 'unlock'" />
    <Icon icon="feather:user-minus" width="24px" v-if="type === 'removeuser'" />
    <Icon icon="feather:user-plus" width="24px" v-if="type === 'adduser'" />
    <Icon icon="feather:user" width="24px" v-if="type === 'user'" />
    <Icon icon="feather:download" width="24px" v-if="type === 'download'" />
    <Icon icon="feather:plus-circle" width="24px" v-if="type === 'add'" />
    <Icon icon="feather:copy" width="24px" v-if="type === 'copy'" />
    <Icon icon="feather:share" width="24px" v-if="type === 'share'" />
    <Icon icon="feather:clipboard" width="24px" v-if="type === 'clipboard'" />
    <Icon icon="feather:key" width="24px" v-if="type === 'key'" />
    <Icon icon="feather:file-minus" width="24px" v-if="type === 'removefile'" />
    <Icon icon="feather:refresh-cw" width="24px" v-if="type === 'refresh'" />
    <Icon icon="feather:eye" width="24px" v-if="type === 'view'" />
    <Icon icon="feather:edit" width="24px" v-if="type === 'edit'" />
    <Icon icon="feather:frown" width="24px" v-if="type === 'problem'" />
    <Icon icon="feather:save" width="24px" v-if="type === 'save'" />
  </button>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { Icon } from "@iconify/vue";

export default defineComponent({
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
  components: { Icon },
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
