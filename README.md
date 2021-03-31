
# tybalt

Corporate time and expense tracking, computer asset management, and reporting in firebase

*Send raw login data from the radiator powershell script to the tybalt rawLogins endpoint and have it sorted by user, login, and computer.
*Log in to firebase with credentials presented by Azure AD
*have employees enter time and bundle time entries into time sheets for approval
*have employees submit expenses including receipt attachments
*generate reports for invoicing and payroll

## install

1. edit `.firebaserc`
2. Set environment variables

    ``` bash
    firebase functions:config:set tybalt.radiator.secret="tybalt secret"
    firebase functions:config:set algolia.apikey="algolia key with addObject and deleteObject permission"
    firebase functions:config:set algolia.appid="algolia app id"
    ```

3. `firebase deploy`
