<template>
    <tr id="editor">
      <td></td>
      <td v-for="field in schema" v-bind:key="field">
        <input type="text" v-model="data[field]"/>
      </td>
      <td><button v-on:click="addItem()">Save</button></td>
    </tr>
</template>
<script>
export default {
  // schema: an object description of the data shape
  // data: an existing or new blank object matching schema
  // collection: a reference to the parent collection
  props: ['schema','data','collection'],
  methods: {
    addItem() {
      // TODO: if one of the properties in schema has key = true then use
      // that as an arg to doc(), otherwise leave it blank.
      this.collection.doc().set(this.data).then(docRef => {
        this.data = {}; // TODO: this warns because we're modifying a prop
        // could emit a message to hide the editor here
      })
    }
  }
}
</script>
