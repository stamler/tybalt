<template>
  <div id="app">
    <SideNav />
    <router-view v-bind:class="{ slidRight: sidenav }" id="main" />
  </div>
</template>

<script>
// @ is an alias to /src
import SideNav from "@/components/SideNav.vue";
import { mapState } from "vuex";

export default {
  components: {
    SideNav
  },
  computed: mapState(["sidenav"])
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100vh;
  width: 100vw;
}

.attention {
  color: red;
}

#app {
  /* Flexbox Off Canvas Menu similar to this technique
     https://codepen.io/oknoblich/pen/klnjw */
  /* min-height: 100%; /* is this necessary? */
  display: flex;
  overflow: hidden;
  font-size: 20px;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#sidenav {
  position: absolute;
  height: 100vh;
  /* https://codepen.io/markcaron/pen/pPZVWO */
  /*transform: translateX(-100%);*/
  color: white;
  width: 10em;
  background-color: #555;
  padding: 1em 0em 0em 1em;
  display: flex;
  flex-direction: column;
}

#main {
  /* https://stackoverflow.com/questions/1260122/expand-a-div-to-fill-the-remaining-width */
  display: flex;
  flex-direction: column;
  flex: 1;
  background: #fff;
  transform: translate(0);
  transition: transform 0.3s ease-in-out;
  box-shadow: 0 0 0.5em #000;
  /* allow shrinking of content */
  /* min-width: 0; */
}

#main.slidRight {
  transform: translate(10em);
}

#content {
  /* scroll within block if necessary */
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}
.actions,
.header {
  display: flex;
  flex-shrink: 0; /* preserve height */
  color: white;
  background-color: #444440;
  padding: 0.2em 0.5em 0.2em;
}
.header .linksstart {
  display: flex;
  flex: 0 0 auto;
}
.header .linksend {
  display: flex;
  flex-direction: row-reverse;
  flex: 1 0 auto;
}

#sidenav a,
.header .link,
.actions a,
.header a {
  margin-right: 1em;
  font-weight: bold;
  color: white;
  text-decoration: none;
}
#sidenav ul {
  list-style-type: none;
  padding-left: 0.5em;
}
#sidenav a:hover,
.header a:hover {
  text-decoration: underline;
}
#sidenav a.router-link-exact-active,
.actions a.router-link-exact-active,
.header a.router-link-exact-active {
  color: rgb(255, 204, 0);
}
#sidenav .linksstart {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}
#sidenav .linksend {
  margin-top: 1em;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}

#list {
  display: flex;
  flex-direction: column;
}
.listentry {
  display: flex;
  max-width: 100vw; /* restrict the maximum width of a list entry */
  font-size: 0.8em;
  height: 5em; /* replace with flex-basis? */
  border-bottom: 1px solid #eee;
}
.anchorbox {
  display: flex;
  flex: 0 0 6em;
  margin: 0em 0.6em 0em;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.9em;
}
.detailsbox {
  display: flex;
  flex: 1 1;
  min-width: 0; /* allows ellipsis to show */
  flex-direction: column;
  justify-content: center;
}
.rowactionsbox {
  display: flex;
  flex: 0 0;
  align-items: center;
  margin: 0em 0.6em 0em;
}
.rowactionsbox a {
  text-decoration: none;
}

.headline_wrapper {
  display: flex;
}

.headline,
.byline,
.firstline,
.secondline,
.thirdline {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.9em;
}

.headline {
  font-weight: bold;
}

.byline {
  margin-left: 0.3em;
}

.thirdline {
  color: grey;
}

/* Editor Styles */
#editor {
  padding-left: 0.4em;
  display: flex;
  flex-direction: column;
}
#editor .field {
  display: flex;
  font-size: 1.2em;
}

input,
select {
  border-top: none;
  border-left: none;
  border-right: none;
  border-bottom: 1px solid #e6e6e6;
}

#content input {
  width: 100%;
  font-size: 1.25em;
}
#searchbox {
  padding-left: 0.3em;
}
button {
  appearance: none;
  border: none;
  font-weight: bold;
  padding: 0.5em 0.8em 0.5em;
  margin-right: 0.3em;
  margin-top: 0.3em;
  border-radius: 0.5em;
  background: rgb(255, 204, 0);
}
#editor .calendar-input,
#editor .field input,
#editor .field select {
  flex-grow: 1;
  font-size: 1em;
  -moz-appearance: none;
  -webkit-appearance: none;
}

#content input:focus,
#editor .field select:focus,
#editor .field input:focus {
  outline: none;
}
#editor .field label {
  flex-shrink: 0;
  font-size: 1em;
  padding-right: 0.3em;
}
#editor .calendar-input,
#editor .calendar-wrapper {
  width: 100%;
}
</style>
