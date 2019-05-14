<template>
  <div>
    <input v-model="claimsString" placeholder="claims1, claim2...">
    <button v-on:click="process('add')">add claims</button>
    <button v-on:click="process('remove')">remove claims</button>
    <button v-on:click="$emit('cancel')">🔙</button>
  </div>
</template>
<script>
export default {
  data() {
    return {
      claimsString: ""
    }
  },
  methods: {
    process(action) {
      // claims should be separated by commas
      const data = {
        action,
        claims: this.claimsString.split(',').map(s => s.trim())
      }      
      this.$emit('mod-claims', data)
    }
  }
}
</script>
