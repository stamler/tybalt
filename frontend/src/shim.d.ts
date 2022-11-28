// File created in accordance with
// https://v3-migration.vuejs.org/migration-build.html#upgrade-workflow
// exposes the default export (which is no longer present in Vue 3)

declare module "vue" {
  import { CompatVue } from "@vue/runtime-dom";
  const Vue: CompatVue;
  export default Vue;
  export * from "@vue/runtime-dom";
  const { configureCompat } = Vue;
  export { configureCompat };
}
