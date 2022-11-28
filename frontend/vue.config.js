// copied from
// https://v3-migration.vuejs.org/migration-build.html#upgrade-workflow

// vue.config.js
module.exports = {
  chainWebpack: (config) => {
    config.resolve.alias.set("vue", "@vue/compat");

    config.module
      .rule("vue")
      .use("vue-loader")
      .tap((options) => {
        return {
          ...options,
          compilerOptions: {
            compatConfig: {
              MODE: 3,
            },
          },
        };
      });
  },
};
