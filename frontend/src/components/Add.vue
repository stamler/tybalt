<template>
  <div id="editor">
      <span class="field" v-for="field in Object.keys(schema)" v-bind:key="field">
        <label for="">{{ field }}</label>
        <input v-if="schema[field].id" type="text" v-model="item.id"/>
        <input v-else type="text" v-model="item[field]"/>
      </span>
      <button v-on:click="saveItem()">Save</button>
  </div>
</template>

<script>
export default {
  props: ['id'],
  data() {
    return {
      schema: {},
      collection: null,
      item: {}
    }
  },
  watch: {
    id: {
      immediate: true,
      handler(id) {
        console.log(id);
        this.item = id ? this.$bind('item', this.$parent.collection.doc(id)) : {};
      },
    },
  },
  created() {
    this.schema = this.$parent.schema;
    this.collection = this.$parent.collection;
  },
  methods: {
    saveItem() {
      // TODO: consider this model
      // https://simonkollross.de/posts/vuejs-using-v-model-with-objects-for-custom-components
      // if one of the properties in schema has id = true then use
      // that as an arg to doc(), otherwise leave it blank.
      const id_attribs = Object.keys(this.schema).filter(i => this.schema[i].id);
      if (id_attribs.length === 0) {
        // no attributes with id property in schema
        this.collection.doc().set(this.item).then(docRef => {
          this.clearEditor();
        });
      } else if (id_attribs.length === 1) {
        // one attribute with id property in schema. Remove it
        // from the data and add it to the id
        const new_id = this.item[id_attribs[0]];
        delete this.item[id_attribs[0]];
        this.collection.doc(new_id).set(this.item).then(docRef => {
          this.clearEditor();
        });
      } else {
        // ERROR: the schema stipulates more than one attribute is id
        console.log("The schema says multiple attributes are id, not saving");
      }
    },
    clearEditor() {
      this.item = {};
    }
  }
}
</script>
<style>
.field {
  display: flex;
}
.field label {
  width: 100px;
}
.field input {
  width: 200px;
}
</style>
