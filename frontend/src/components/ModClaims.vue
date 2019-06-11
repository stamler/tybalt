<template>
  <div>
    <input v-model="claimsString" placeholder="claim1, claim2..." />
    <button v-on:click="process('add')">add</button>
    <button v-on:click="process('remove')">remove</button>
    <button v-on:click="$emit('cancel')">🔙</button>
  </div>
</template>
<script>
import firebase from "@/firebase";

export default {
  data() {
    return {
      claimsString: ""
    };
  },
  methods: {
    process(action) {
      // claims should be separated by commas
      const data = {
        action,
        claims: this.claimsString.split(",").map(s => s.trim()),
        users: this.$parent.selected
      };
      const modClaims = firebase.functions().httpsCallable("modClaims");
      modClaims(data)
        .then(result => {
          // TODO: get and handle real responses from callable
          console.log(JSON.stringify(result));
        })
        .catch(error => {
          // TODO: get and handle real responses from callable
          console.log(error);
        });
    }
  }
};
</script>
