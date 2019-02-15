
# tybalt

A firebase project

Send raw login data from the radiator powershell script to the tybalt rawLogins endpoint and have it sorted by user, login, and computer.
Log in to firebase with credentials presented by Azure AD

## install

0. edit `.firebaserc`
1. Set environment variables
    `firebase functions:config:set tybalt.secret="tybalt secret"
     firebase functions:config:set azure_allowed_tenants="JSON string representing array of tenant GUID strings"
     firebase functions:config:set azure_app_id="Azure Application ID (GUID)"`

2. `firebase deploy`