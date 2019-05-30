<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." v-model="search" />
      <button v-if="claims.projects === true" v-on:click="deleteSelected()">
        Delete {{ selected.length }} items
      </button>
      <button v-if="showNewItem === false" v-on:click="showNewItem = true" >New Project</button>
      <button v-else v-on:click="showNewItem = false" >Done Creating Projects</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" v-model="selectAll" v-on:click="toggleAll()">
            {{ selected.length }}/{{ processedItems.length }}
          </th>
          <th><a href="#" v-on:click="sort('job')">Job</a></th>
          <th><a href="#" v-on:click="sort('manager')">Project Manager</a></th>
          <th><a href="#" v-on:click="sort('client')">Client</a></th>
          <th><a href="#" v-on:click="sort('proposal')">Proposal</a></th>
          <th>Description</th>
          <th><a href="#" v-on:click="sort('status')">Status</a></th>
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
          <td>{{ item.id }}</td>
          <td>{{ item.manager }}</td>
          <td>{{ item.client }}</td>
          <td>{{ item.proposal }}</td>
          <td>{{ item.description }}</td>
          <td>{{ item.status }}</td>
          <td><button>✏️</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import firebase from "@/firebase";
const db = firebase.firestore();
import componentMaker from "../components/shared.js";

const component = componentMaker();

component.created = function() {
  this.schema = {
    job: {id: true},
    manager: true,
    client: true,
    proposal: true,
    description: true,
    status: true
  };
  this.collection = db.collection("Projects");
  this.$bind("items", db.collection("Projects"));
}

export default component;
</script>