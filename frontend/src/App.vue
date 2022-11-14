<template>
  <div id="app">
    <SideNav />
    <app-header v-bind:class="{ slidRight: sidenav }" />
    <router-view v-bind:class="{ slidRight: sidenav }" id="main" />
  </div>
</template>

<script lang="ts">
// @ is an alias to /src
import SideNav from "./components/SideNav.vue";
import AppHeader from "./components/AppHeader.vue";
import { mapState } from "vuex";

export default {
  components: {
    SideNav,
    AppHeader,
  },
  computed: mapState(["sidenav"]),
};
</script>

<style>
:root {
  --main-link-color: #00f;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  min-height: 100vh; /* allow app to grow vertically */
  width: 100vw;
  max-width: 100%; /* 100vw ignores width of vertical scrollbar */
}

.attention {
  color: red;
}

#app {
  /* Flexbox Off Canvas Menu similar to this technique
     https://codepen.io/oknoblich/pen/klnjw */
  background-color: rgb(50, 220, 132);

  /*background-color: rgb(50, 60, 70); /* effectively sidenav background */
  display: flex;
  overflow: hidden;
  font-size: 20px;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#sidenav {
  position: absolute;
  /* https://codepen.io/markcaron/pen/pPZVWO */
  /*transform: translateX(-100%);*/
  color: white;
  width: 10em;
  padding: 1em 0em 0em 1em;
  display: flex;
  flex-direction: column;
}

#main {
  /* https://stackoverflow.com/questions/1260122/expand-a-div-to-fill-the-remaining-width */
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: 100vw; /* restrict to view port width */
  background: #fff;
  transform: translate(0);
  transition: transform 0.3s ease-in-out 0.1s, max-width 0.3s ease-in-out;
  box-shadow: 0 0 0.5em #000;
}

#main.slidRight {
  transform: translate(10em);
}

#content {
  display: flex;
  flex-direction: column;
}
.actions,
.header {
  z-index: 1;
  display: flex;
  align-items: center;
  overflow: hidden; /* */
  color: white;
  padding: 0.2em 0.5em 0.2em;
  transform: translate(0);
  transition: transform 0.3s ease-in-out 0.1s, max-width 0.3s ease-in-out;
}
.header.slidRight {
  transform: translate(10em);
}

.actions {
  background-color: rgb(255, 197, 51);
  flex-shrink: 0; /* preserve height */
}
.header {
  background-color: rgb(255, 163, 51);
  position: fixed;
  height: 3em;
  top: 0px;
  width: 100%;
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
.actions button,
.header a {
  margin: 0em 0.7em 0em -0.3em;
  padding: 0em 0.3em 0em;
  font-weight: bold;
  color: white;
  text-decoration: none;
}
#sidenav ul {
  list-style-type: none;
  padding-left: 0.5em;
}
#sidenav li {
  font-weight: bold;
}
#sidenav a:hover,
.header a:hover {
  text-decoration: underline;
}
#sidenav a.router-link-active,
.actions a.router-link-active,
.header a.router-link-active {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 0.25em;
  padding: 0em 0.3em 0em;
  box-shadow: inset 1px 1px 1px rgba(0, 0, 0, 0.05);
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
#listbar {
  display: flex;
  flex-direction: row;
  border-bottom: 1px solid #eee;
}

#listbar input {
  border: none;
}

#listbar span {
  flex: 1 0 5.5em;
  padding-right: 0.3em;
}
.listentry,
.listsummary,
.listheader {
  display: flex;
  font-size: 0.8em;
  flex: 0 0 5em;
  border-bottom: 1px solid #eee;
}
/* week2 gets different background colour */
.week2 {
  background-color: beige;
}
.listsummary {
  border-bottom: none;
  margin-bottom: 1em;
}
.listheader {
  flex-basis: auto;
  padding: 0.1em 0.5em;
  font-weight: bold;
  color: #555555;
  background-color: #b6e1fc;
}
.label,
.listentry .label,
#editor .label {
  background: rgb(218, 252, 255);
  border: 1px solid rgb(121, 242, 255);
  border-radius: 0.25em;
  padding: 0em 0.2em 0em;
  font-size: 0.8em;
  color: rgba(16, 200, 214, 1);
  margin-right: 0.3em;
}
.anchorbox {
  display: flex;
  flex-direction: column;
  flex: 0 0 5em;
  margin: 0em 0.5em 0em;
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

a {
  color: var(--main-link-color);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
a:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
}

.rowactionsbox {
  display: flex;
  flex: 0 0;
  align-items: center;
  margin: 0em 0.6em 0em;
}
.rowactionsbox > * {
  color: var(--main-link-color);
  margin-right: 0.8em;
  text-decoration: none;
  font-weight: bold;
  display: block;
}

.rowactionsbox > a:hover {
  text-decoration: none;
  transition: filter 0.05s ease-in;
  filter: drop-shadow(2px 2px 1px rgb(0 0 0 / 0.3));
}

.rowactionsbox > a:active {
  filter: brightness(0.7) drop-shadow(1px 1px 1px rgb(0 0 0 / 0.3));
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
  padding: 0em 0.4em;
  display: flex;
  flex-direction: column;
}
#editor .field {
  display: flex;
  font-size: 1.2em;
}

input,
select {
  border: none;
}

#content input {
  font-size: 1.25em;
}
#searchbox {
  width: 100%;
  width: -moz-available; /* For Mozzila */
  width: -webkit-fill-available; /* For Chrome */
  padding-left: 0.3em;
  border-bottom: 1px solid #e6e6e6;
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
#editor .field .grow {
  flex-grow: 1;
  font-size: 1em;
  border-radius: 0;
  -moz-appearance: none;
  -webkit-appearance: none;
  border-bottom: 1px solid #e6e6e6;
}
#editor .field .jobNumberInput {
  width: 5em;
  font-size: 1em;
  border-radius: 0;
  -moz-appearance: none;
  -webkit-appearance: none;
  border-bottom: 1px solid #e6e6e6;
}
#editor .field .jobDescription {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
#editor .field input[type="checkbox"] {
  -moz-appearance: checkbox;
  -webkit-appearance: checkbox;
  appearance: checkbox;
  flex-grow: 0;
  width: auto;
}
#editor .field input[type="radio"] {
  -moz-appearance: radio;
  -webkit-appearance: radio;
  margin-right: 0.25em;
  appearance: radio;
  flex-grow: 0;
  width: auto;
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

@media only screen and (min-width: 640px) {
  /* larger screens */
  .header.slidRight {
    max-width: calc(100vw - 10em);
    transform: translate(10em);
  }
  #main.slidRight {
    max-width: calc(100vw - 10em);
    transform: translate(10em);
  }
}
/* for the Modal component to prevent scrolling? */
.overflow-hidden {
  overflow: hidden;
}
#rejectionInput {
  height: 20vh;
  font-family: inherit;
  font-size: inherit;
  resize: none;
  padding: 0.2em;
}

/* horizontal scrolling of wide components that need more space */
.horizontalScroll {
  overflow-x: auto;
}
</style>
