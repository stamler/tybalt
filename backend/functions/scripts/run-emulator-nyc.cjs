#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const mochaArgs = process.argv.slice(2);
const hasExplicitSpec = mochaArgs.some((arg) => /[/*]|\.([cm]?[jt]sx?)$/.test(arg));
const innerCommand = [
  "./node_modules/.bin/nyc",
  "./node_modules/.bin/mocha",
  "--no-config",
  "--no-package",
  "--require",
  "ts-node/register/transpile-only",
  "--require",
  "source-map-support/register",
  "--reporter",
  "spec",
  "--exit",
  ...(hasExplicitSpec ? [] : ["test/**/*.ts"]),
  ...mochaArgs,
].map(shellQuote).join(" ");

const result = spawnSync(
  "firebase",
  ["emulators:exec", "--only", "firestore", innerCommand],
  {
    stdio: "inherit",
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
