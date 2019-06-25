<template>
  <div>
    <Header />
    <router-view id="content" />
  </div>
</template>
<script>
import Header from "../components/Header";

export default {
  components: {
    Header
  }
};
</script>
