<script setup lang="ts">
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useStateStore } from "@/stores/state";
import { storeToRefs } from "pinia";
const store = useStateStore();
const { isFirebaseAuthenticated, initializing } = storeToRefs(store);

const router = useRouter();
const route = useRoute();

watch(
  isFirebaseAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated === true) {
      // Go to the previous page or the home page if there is no previous page
      router.push(route.redirectedFrom?.path || { name: "Welcome" });
    }
  },
  { immediate: true },
);

</script>

<template>
  <div>
    <form @submit.prevent="store.loginWithMicrosoftOAuth()">
      <div>
        <h1>Log In</h1>
        <div>
          <button
            type="submit"
            :disabled="initializing"
          >
            {{ initializing ? "Loading" : "Login" }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
