<template>
  <div id="container">
    <div>
      <input type="textbox" placeholder="search..." />
    </div>
    <table>
      <thead>
        <tr>
          <th>{{ items.length }}</th>
          <th><a href="#" v-on:click="sort('givenName')">First</a>&nbsp;<a href="#" v-on:click="sort('surname')">Last</a></th>
          <th><a href="#" v-on:click="sort('updated')">updated</a></th>
          <th><a href="#" v-on:click="sort('userSourceAnchor')">ms-DS-ConsistencyGuid</a></th>
          <th><a href="#" v-on:click="sort('lastComputer')">last computer</a></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in processedItems" v-bind:key="item.id">
          <td></td>
          <td>{{ item.givenName }} {{ item.surname }}</td>
          <td>{{ item.updated.toDate() | relativeTime }}</td>
          <td>{{ item.userSourceAnchor }}</td>
          <td>{{ item.lastComputer }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script>
import firebase from "@/firebase";
import { mapState } from "vuex";
const db = firebase.firestore();
const items = db.collection("Users");
import componentMaker from "./shared.js";

const component = componentMaker(items);
const computed = mapState({ claims: state => state.claims });

Object.assign(component.computed, computed);

export default component;
</script>

<style scoped>
#container {
  text-align: left;
}
</style>
