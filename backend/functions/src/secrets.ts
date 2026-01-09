/**
 * Centralized secrets management using Firebase's defineJsonSecret.
 * This replaces the deprecated functions.config() API.
 * 
 * Usage in v1 functions:
 *   import { functionsConfig, FUNCTIONS_CONFIG_SECRET } from "./secrets";
 *   
 *   export const myFunction = functions
 *     .runWith({ secrets: [FUNCTIONS_CONFIG_SECRET] })
 *     .https.onRequest((req, res) => {
 *       const config = functionsConfig();
 *       const apiKey = config.algolia.apikey;
 *     });
 */

import { defineJsonSecret } from "firebase-functions/params";

// The secret name (for v1 runWith which expects string names)
export const FUNCTIONS_CONFIG_SECRET = "FUNCTIONS_CONFIG_EXPORT";

// Define the secret that holds all our configuration
// This was created by running: firebase functions:config:export
const FUNCTIONS_CONFIG = defineJsonSecret(FUNCTIONS_CONFIG_SECRET);

// Type definition for our config structure
export interface FunctionsConfigType {
  algolia: {
    appid: string;
    apikey: string;
    searchkey: string;
  };
  aws: {
    accesskeysecret: string;
    accesskeyid: string;
  };
  mysql: {
    db: string;
    user: string;
    port: string;
    host: string;
    pass: string;
  };
  mysqlssh: {
    host: string;
    port: string;
    user: string;
    pass: string;
  };
  tybalt: {
    azureuserautomation: {
      secret: string;
    };
    radiator: {
      secret: string;
    };
    wireguard: {
      secret: string;
    };
  };
}

/**
 * Get the functions config. Must be called from within a function
 * that has bound FUNCTIONS_CONFIG as a secret.
 */
export function functionsConfig(): FunctionsConfigType {
  return FUNCTIONS_CONFIG.value() as FunctionsConfigType;
}
