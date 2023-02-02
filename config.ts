// This is the global configuration file for the application. During frontend
// build, this file is copied into frontend/src directory by the copyconfig
// script which is called by the prebuild script. During backend build, this
// file is copied into backend/functions/src by the prebuild script.

export const APP_PROTOCOL = "https";
export const APP_HOSTNAME = "tybalt.tbte.ca";
export const APP_URL = APP_PROTOCOL + "://" + APP_HOSTNAME;
export const UPN_SUFFIX = "@tbte.ca";
export const COMPANY_SHORTNAME = "TBTE";
export const MICROSOFT_TENANT_ID = "tbte.onmicrosoft.com";
