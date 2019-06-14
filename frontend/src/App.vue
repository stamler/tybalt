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
  font-size: 16pt;
  font-family: "Avenir", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.nav {
  display: flex;
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
</style>
