# This is an Azure Automation Runbook that will dump the contents of an
# on-premises Active Directory to tybalt. It should be scheduled to run hourly.
# It depends on two variables: The ADDumpURI is the URI of the firebase function
# that will receive the data. The UserOUs is a semi-colon separated list of OUs
# to search for users to dump. Additionally, credentials should be setup in for
# the Azure Automation Runbook to use. The username property will not be used,
# but the password should match the one detailed in the tybalt README.md file
# for azure automation to use. This is in effect a key because the firebase
# function will reject any input that is missing this key

$uri = Get-AutomationVariable -Name "ADDumpURI"
$OUsString = Get-AutomationVariable -Name "UserOUs"
$credential = Get-AutomationPSCredential -Name "TybaltADSyncCredentials"

$ous = $OUsString.split(";")
$headers = @{
  Authorization="TYBALT $($credential.GetNetworkCredential().Password)"
}

$body = $ous | ForEach-Object { 
  Get-ADUser -Filter * -SearchBase $_ -properties Department, mail, userPrincipalName, telephoneNumber, Title, enabled, "mS-DS-ConsistencyGuid"
} |
Select-Object -Property surname,
  givenName,
  Department,
  telephoneNumber,
  Title,
  enabled,
  mail,
  userPrincipalName,
  @{
    n='OU';
    e={
      $_.DistinguishedName.Substring($_.DistinguishedName.IndexOf('OU=') + 3).split(',')[0]
    };
  },
  @{
    n='userSourceAnchor';
    e={
      (($_."mS-DS-ConsistencyGuid"|ForEach-Object ToString X2) -join '').toLower()
    }
  } |
Sort-Object -Property surname, givenName |
ConvertTo-Json

#TODO: sign body with certificate or use a token
Invoke-RestMethod -Method POST -Uri $uri -Body $body -ContentType "application/json" -Headers $headers
