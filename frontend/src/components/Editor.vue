<template>
    <tr id="editor">
      <td></td>
      <td v-for="field in Object.keys(schema)" v-bind:key="field">
        <input type="text" v-model="data[field]"/>
      </td>
      <td><button v-on:click="saveItem()">Save</button></td>
    </tr>
</template>
<script>
export default {
  // schema: an object description of the data shape
  // data: an existing or new blank object matching schema
  // collection: a reference to the parent collection
  props: ['schema','data','collection'],
  methods: {
    saveItem() {
      // TODO: consider this model
      // https://simonkollross.de/posts/vuejs-using-v-model-with-objects-for-custom-components
      // if one of the properties in schema has id = true then use
      // that as an arg to doc(), otherwise leave it blank.
      const id_attribs = Object.keys(this.schema).filter(i => this.schema[i].id);
      if (id_attribs.length === 0) {
        // the schema says no attributes are marked id
        this.collection.doc().set(this.data).then(docRef => {
          this.$emit('clearEditor');
        });
      } else if (id_attribs.length === 1) {
        // the schema stipulates one attribute is id. Remove it
        // from the data and add it to the id
        const id = this.data[id_attribs[0]];
        delete this.data[id_attribs[0]];
        this.collection.doc(id).set(this.data).then(docRef => {
          this.$emit('clearEditor');
        });
      } else {
        // ERROR: the schema stipulates more than one attribute is id
        console.log("The schema says multiple attributes are id, not saving");
      }
    }
  }
}
</script>
