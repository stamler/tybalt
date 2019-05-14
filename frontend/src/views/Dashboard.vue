<template>
  <div class="dashboard">
    <img alt="TBTE logo" src="../assets/logo.png" />
    <h1>Dashboard</h1>
    <p>{{ msg }}</p>
  </div>
</template>

<script>
export default {
  props: {
    msg: String
  }
};
</script>
