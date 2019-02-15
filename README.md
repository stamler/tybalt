
# tybalt

A firebase project

Send raw login data from the radiator powershell script to the tybalt rawLogins endpoint and have it sorted by user, login, and computer.
Log in to firebase with credentials presented by Azure AD

## install

1. edit `.firebaserc`
2. Set environment variables

    ``` bash
    firebase functions:config:set tybalt.radiator.secret="tybalt secret"
    firebase functions:config:set tybalt.azure.allowedtenants='["tenantGUID1","tenantGUID2"]'
    firebase functions:config:set tybalt.azure.appid="Azure Application ID (GUID)"
    ```

3. `firebase deploy`
