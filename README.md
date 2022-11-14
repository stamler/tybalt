
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
    firebase functions:config:set tybalt.azureuserautomation.secret="TBTAzureTenant secret" 
    firebase functions:config:set tybalt.wireguard.secret="WireGuard server secret" 
    firebase functions:config:set tybalt.radiator.secret="tybalt secret"
    
    firebase functions:config:set algolia.apikey="algolia key with addObject and deleteObject permission"
    firebase functions:config:set algolia.appid="algolia app id"

    firebase functions:config:set mysql.host="mysql hostname"
    firebase functions:config:set mysql.port="mysql port number"
    firebase functions:config:set mysql.user="mysql username"
    firebase functions:config:set mysql.pass="mysql password"
    firebase functions:config:set mysql.db="mysql database"

    firebase functions:config:set mysqlSSH.host="mysql ssh tunnel hostname"
    firebase functions:config:set mysqlSSH.port="mysql ssh tunnel port number"
    firebase functions:config:set mysqlSSH.user="mysql ssh tunnel username"
    firebase functions:config:set mysqlSSH.pass="mysql ssh tunnel password"
    ```

3. Setup credential in Azure Automation account with username *TBTAzureTenant* and secret matching the secret in step 2. This is used for dumping AD to Tybalt cloud function.

4. Setup the "Trigger Email" extension in firebase. The email documents collection is `Emails` and the users collection is `Profiles`. Also set an appropriate FROM address and SMTP connection URI.  

5. `firebase deploy`
