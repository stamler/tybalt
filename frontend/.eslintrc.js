module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    "plugin:vue/essential",
    "eslint:recommended",
    "@vue/typescript/recommended",
    "@vue/prettier",
    "@vue/prettier/@typescript-eslint",
  ],

  rules: {
    "no-console": import.meta.env.NODE_ENV === "production" ? "error" : "off",
    "no-debugger": import.meta.env.NODE_ENV === "production" ? "error" : "off",
    "vue/no-multiple-template-root": 0,
  },

  parserOptions: {
    parser: "@typescript-eslint/parser",
  },
};
