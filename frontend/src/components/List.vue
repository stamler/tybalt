<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button v-if="claims.projects === true" v-on:click="deleteSelected()">
        Delete {{ selected.length }} items
      </button>
      <button v-if="showNewItem === false" v-on:click="showNewItem = true" >
        New Project
      </button>
      <button v-else v-on:click="showNewItem = false" >
        Done Creating Projects
      </button>
    </div>
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
            {{ selected.length }}/{{ processedItems.length }}
          </th>
          <th v-for="col in Object.keys(schema)" v-bind:key="col">
            <span v-if="schema[col] && schema[col].sort === false">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </span>
            <a v-else-if="schema[col] && schema[col].id" href="#" v-on:click="sort('id')">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </a>
            <a v-else href="#" v-on:click="sort('id')">
              {{ schema[col] && schema[col].display ? schema[col].display : col }}
            </a>
          </th>
        </tr>
      </thead>
      <tbody>
        <Editor 
          v-if="showNewItem === true" 
          v-on:clearEditor="clearEditor()"
          v-bind:schema="schema"
          v-bind:data="editingObject"
          v-bind:collection="collection"
        />
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td>
            <input type="checkbox" v-bind:value="item.id" v-model="selected">
          </td>
          <td v-for="col in Object.keys(schema)" v-bind:key="col">
            {{ schema[col] && schema[col].id === true ? item.id : item[col] }}
          </td>  
          <td><button>✏️</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import componentMaker from "../components/shared.js";

const component = componentMaker();

component.created = function() {
  this.schema = this.$parent.schema;
  this.collection = this.$parent.collection;
  this.items = this.$parent.items;
  this.$bind("items", this.items);
}

export default component;
</script>