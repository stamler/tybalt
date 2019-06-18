<template>
  <div id="app">
    <NavBar />
    <router-view />
  </div>
</template>

<script>
// @ is an alias to /src
import NavBar from "@/components/NavBar.vue";

export default {
  components: {
    NavBar
  },
  data() {
    return {
      user: null
    };
  }
};
</script>

<style>
body {
  margin: 0px;
  padding: 0px;
}

#app {
  font-size: 20px;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.nav {
  display: flex;
  font-size: 0.8em;
  /* https://iamsteve.me/blog/entry/using-flexbox-for-horizontal-scrolling-navigation */
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none; /* hide scrollbar firefox (experimental */
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: -ms-autohiding-scrollbar; /* hide scrollbar edge */
  color: white;
  background-color: #444440;
  padding: 4px 10px 4px;

  /*
  CSS Scrolling shadows?
  https://stackoverflow.com/questions/9333379/check-if-an-elements-content-is-overflowing
  */
}

.nav::-webkit-scrollbar {
  display: none; /* hide scrollbar in safari */
}

.nav a {
  font-weight: bold;
  color: white;
  text-decoration: none;
}

.nav a:hover {
  text-decoration: underline;
}

.nav a.router-link-exact-active {
  color: yellow;
}

.navlinksstart {
  display: flex;
  flex: 0 0 auto;
}

.navlink {
  margin-right: 1em;
}

.navlinksend {
  margin-left: auto;
  flex: 0 0 auto;
}

#container input:focus {
  outline: none;
}
#container input {
  border-top: none;
  border-left: none;
  border-right: none;
  border-bottom: 1px solid #e6e6e6;
  margin: 0;
  padding: 0;
  width: 100%;
  font-size: 1.25em;
}

.listentry {
  display: flex;
  flex-grow: 1;
  font-size: 0.8em;
  height: 5em;
  border-bottom: 1px solid #eee;
}
.anchorbox {
  display: flex;
  flex-shrink: 0;
  margin: 0em 0.6em 0em;
  width: 3.2em;
  align-items: center;
  font-weight: bold;
  font-size: 0.9em;
}
.detailsbox {
  display: flex;
  /* ensure ellipsis works on children 
  https://css-tricks.com/flexbox-truncated-text/ */
  min-width: 0;
  justify-content: center;
  flex-grow: 1;
  flex-direction: column;
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
  margin: 0em;
  padding: 0em;
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
</style>
