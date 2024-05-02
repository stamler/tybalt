<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useStateStore } from "@/stores/state";
import { storeToRefs } from "pinia";
const email = ref("");
const password = ref("");
const store = useStateStore();
const { isFirebaseAuthenticated, initializing } = storeToRefs(store);

const router = useRouter();
const route = useRoute();
const message = ref("");
const messageIsError = ref(false);

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

const login = async function (email: string, password: string) {
  const { error } = await auth.login(email, password);
  if (error !== null) {
    message.value = error.message;
    messageIsError.value = true;
    return;
  }
};
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
