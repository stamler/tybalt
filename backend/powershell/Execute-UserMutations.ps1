# This is an Azure Automation Runbook that will GET available UserMutations from
# the tybalt dispatchMutations endpoint. UserMutations are recieved in JSON
# format as an array of objects. We will iterate through each object and, based
# on the verb property, call the appropriate function to execute the mutation.
# When a function is complete, we will POST to the tybalt mutationComplete
# endpoint a JSON object containing the mutation ID, the result (whether
# completed or error), and an object containing any resultData or error
# messages. This runbook is designed to be run as a scheduled task.

# NB: The folder part of Step 7 of the following permissions must be set for the local credentials that are used to run this runbook:
# https://docs.microsoft.com/en-us/azure/automation/automation-hrw-run-runbooks?tabs=sa-mi#use-a-credential-asset-for-a-hybrid-runbook-worker-group

$dispatchUri = Get-AutomationVariable -Name "dispatchMutationsURI"
$completeUri = Get-AutomationVariable -Name "completeMutationsURI"
$credential = Get-AutomationPSCredential -Name "TybaltUserMutationCredentials"

$headers = @{
  Authorization="TYBALT $($credential.GetNetworkCredential().Password)"
}

# Generate a password, return both plaintext and encrypted version in an object
function Generate-Password {
  $valid_pw = $false
  $pw = $null
  Do {
    $pw = -join ('abcdefghkmnrstuvwxyzABCDEFGHKLMNPRSTUVWXYZ23456789$%&*#'.ToCharArray() | Get-Random -Count 14)
    If ( 
      ($pw -cmatch "[A-Z]") `
      -and ($pw -cmatch "[a-z]") `
      -and ($pw -match "[\d]") `
      -and ($pw -match "[^\w ]") ) {
        $valid_pw = $true
      } else {
        $valid_pw = $false
      }
      $count ++
  } while ($false -eq $valid_pw)
  $SecurePassword = $pw | ConvertTo-SecureString -AsPlainText -Force
  return @{
    plaintext = $pw
    encrypted = $SecurePassword
  }
}

# Return an AD User object when given the corresponding userSourceAnchor
function Get-UserFromSourceAnchor {
  Param(
    [Parameter(Mandatory=$true)]
    [string]$UserSourceAnchor
  )
  
  #search the user from their ms-ds-consistencyguid in PowerShell
  $searchBytes = $UserSourceAnchor -replace '(..)','\$1'
  $adUser = Get-AdUser -LDAPFilter "(ms-ds-consistencyguid=$searchBytes)"
  return $adUser;
}

# Accepts a mutation ID and new user properties then either creates a user or
# creates an error. The result is then POSTed to the mutationComplete endpoint.
function Create-User {
  Param(
    [Parameter(Mandatory=$true)]
    [String]$MutationId,
    [Parameter(Mandatory=$true)]
    [String]$Surname,
    [Parameter(Mandatory=$true)]
    [String]$GivenName,
    [Parameter(Mandatory=$true)]
    [String]$Title,
    [Parameter(Mandatory=$true)]
    [String]$Department,
    [Parameter(Mandatory=$true)]
    [String]$TelephoneNumber,
    [Parameter(Mandatory=$true)]
    [String]$Group = "TBTE_Mobile_Software"
  )

  # create the SamAccountName
	$samAccountName = $GivenName.SubString(0,1).ToLower() + $Surname.ToLower()
  
  # check if this samAccountName already exists in Active Directory. If it does,
  # throw an error.
  try {
    Get-ADUser -Identity $samAccountName -ErrorAction Stop
    # The account already exists. Throw an error that isn't caught below.
    # return an error to the mutationComplete endpoint here.
    $body = @{
      id = $MutationId
      verb = "create"
      result = "error"
      error = "An account with samAccountName $samAccountName already exists"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
    Write-Output "An account with samAccountName $samAccountName already exists"
    return;
  } catch [Microsoft.ActiveDirectory.Management.ADIdentityNotFoundException] {
    # The account doesn't already exist, we can use this samAccountName
    $upn = $samAccountName + "@tbte.ca"
  }
  
  $pwobject = Generate-Password

  try {
    $user = New-ADUser `
    -Name "$GivenName $Surname" `
    -Path "OU=Human Users,DC=main,DC=tbte,DC=ca" `
    -Company "TBT Engineering Limited" `
    -GivenName $GivenName `
    -Surname $Surname `
    -SamAccountName $samAccountName `
    -UserPrincipalName $upn `
    -OfficePhone $TelephoneNumber `
    -AccountPassword $pwobject.encrypted `
    -Enabled $True `
    -OtherAttributes @{'mail'=$upn} `
    -PassThru    
  }
  catch [System.UnauthorizedAccessException] {
    # The account doesn't have permission to create the account. Return an error
    # to the mutationComplete endpoint
    $body = @{
      id = $MutationId
      verb = "create"
      result = "error"
      error = "The Azure Automation Runbook doesn't have permission to create the account"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
    Write-Output "The Azure Automation Runbook doesn't have permission to create an account for $GivenName $Surname"
    return;
  }

  # Add user to groups
  Add-ADGroupMember -Identity "TBTE_General" -Members $samAccountName
  Add-ADGroupMember -Identity $Group -Members $samAccountName

  # send the result to the mutationComplete endpoint here.
  $body = @{
    id = $MutationId
    verb = "create"
    result = "complete"
    password = $pwobject.plaintext
    upn = $upn
    email = $upn
  } | ConvertTo-Json
  Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
  Write-Output "responded to endpoint with complete for create $MutationId"
  return;
}

# Accepts a mutation ID and userSourceAnchor and then generates a new password,
# sets the password, and sends the result to the mutationComplete endpoint.
function Reset-UserPassword {
  Param(
    [Parameter(Mandatory=$true)]
    [string]$MutationId,
    [Parameter(Mandatory=$true)]
    [string]$UserSourceAnchor
  )

  $pwobject = Generate-Password

  $adUser = Get-UserFromSourceAnchor -UserSourceAnchor $UserSourceAnchor

  # The user doesn't exist. Return an error to the mutationComplete endpoint.
  if ($adUser -eq $null) {
    $body = @{
      id = $MutationId
      verb = "reset"
      result = "error"
      error = "User with userSourceAnchor $UserSourceAnchor not found"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
    Write-Output "User with userSourceAnchor $UserSourceAnchor not found"
    return;
  }

  # reset the password
  try {
    $adUser | Set-ADAccountPassword -Reset -NewPassword $pwobject.encrypted
  }
  catch {
    $body = @{
      id = $MutationId
      verb = "reset"
      result = "error"
      error = "Error resetting password for user with userSourceAnchor $UserSourceAnchor"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
    return;
  }
  $body = @{
    id = $MutationId
    verb = "reset"
    result = "complete"
    password = $pwobject.plaintext
  } | ConvertTo-Json
  Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
  Write-Output "Password reset for user with userSourceAnchor $UserSourceAnchor"
}

# Accepts a mutation ID and userSourceAnchor and then generates a new password,
# sets the password, and sends the result to the mutationComplete endpoint.
function Offboard-User {
  Param(
    [Parameter(Mandatory=$true)]
    [string]$MutationId,
    [Parameter(Mandatory=$true)]
    [string]$UserSourceAnchor
  )

  $pwobject = Generate-Password

  $adUser = Get-UserFromSourceAnchor -UserSourceAnchor $UserSourceAnchor

  # The user doesn't exist. Return an error to the mutationComplete endpoint.
  if ($adUser -eq $null) {
    $body = @{
      id = $MutationId
      verb = "reset"
      result = "error"
      error = "User with userSourceAnchor $UserSourceAnchor not found"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
    Write-Output "User with userSourceAnchor $UserSourceAnchor not found"
    return;
  }
  
  try {
    #Disable the account
    $adUser | Set-ADUser -Enabled $false
    
    # Reset the password
    $adUser | Set-ADAccountPassword -Reset -NewPassword $pwobject.encrypted
    
    # Remove group memberships except for group "Domain Users"
    $groups = $adUser | Get-ADPrincipalGroupMembership
    foreach ($group in $groups) {
      if ($group.name -eq "Domain Users") {
        Continue
      }
      Remove-ADGroupMember -Identity $group -Members $adUser -Confirm:$False
    }
    
    #Move to disabled users OU
    $adUser | Move-ADObject -TargetPath "OU=Disabled Users,DC=main,DC=tbte,DC=ca"
  }
  catch {
    $body = @{
      id = $MutationId
      verb = "archive"
      result = "error"
      #TODO: Add error message from exception ($_)
      #https://stackoverflow.com/questions/38419325/catching-full-exception-message
      error = "Error archiving user with userSourceAnchor $UserSourceAnchor. $($_.FullyQualifiedErrorId) / $($_.ErrorDetails.Message)"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
    return;
  }

  # Respond to the mutationComplete endpoint with success so further processing
  # can continue.
  $body = @{
    id = $MutationId
    verb = "archive"
    result = "complete"
    password = $pwobject.plaintext
  } | ConvertTo-Json
  Invoke-RestMethod -Uri $completeUri -Headers $headers -Method Post -ContentType "application/json" -Body $body
  Write-Output "account archived for user with userSourceAnchor $UserSourceAnchor"
}

# TODO: COMPLETE THIS Add function to offboard a user where the mailbox is turned into a
# shared mailbox
function Offboard-ShareMail {
  try {
    #Disable the account
    $adUser | Set-ADUser -Enabled $false
    
    # Reset the password
    $adUser | Set-ADAccountPassword -Reset -NewPassword $pwobject.encrypted
    
    # Remove group memberships except for group "Domain Users"
    $groups = $adUser | Get-ADPrincipalGroupMembership
    foreach ($group in $groups) {
      if ($group.name -eq "Domain Users") {
        Continue
      }
      Remove-ADGroupMember -Identity $group -Members $adUser -Confirm:$False
    }
    
    #Move to DisabledUsersSharedMailbox OU
    $adUser | Move-ADObject -TargetPath "OU=DisabledUsersSharedMailbox,DC=main,DC=tbte,DC=ca"

    # The shared mailbox converion must be performed in the Azure Set the result
    # to onSiteComplete then a further process will check for this result and do
    # the conversion in Azure.

    # The sharing of the mailbox will need to be completed manually in Azure
    # after this is complete.

    # We must also ensure that licenses are removed from these users after they
    # are converted to shared mailboxes.
  }
}

# The result of Invoke-RestMethod will automatically be converted to a PSObject
$response = Invoke-RestMethod -Uri $dispatchUri -Headers $headers -Method Get -ContentType "application/json"

# Iterate through each mutation and execute the appropriate function
foreach ($mutation in $response.mutations) {
  # The value for license won't match the on-premises group name, so we need to
  # replace it with the on-premises group name here.
  $group = switch($mutation.data.license) {
    O365_BUSINESS_PREMIUM { "TBTE_Desktop_Software" }
    O365_BUSINESS_ESSENTIALS { "TBTE_Mobile_Software" }
    SPB { "TBTE_Premium_Software" }
    Default { "TBTE_Mobile_Software" }
  }

  # Choose which function to execute based on the verb
  switch ($mutation.verb) {
    create { 
      Create-User -MutationId $mutation.id `
        -Surname $mutation.data.surname `
        -GivenName $mutation.data.givenName `
        -Title $mutation.data.title `
        -Department $mutation.data.department `
        -TelephoneNumber $mutation.data.telephoneNumber `
        -Group $group
    }
    edit {
      Write-Output "edit" $mutation.id
    }
    reset {
      Reset-UserPassword -MutationId $mutation.id `
        -UserSourceAnchor $mutation.userSourceAnchor
      Write-Output "reset" $mutation.id 
    }
    archive {
      Offboard-User -MutationId $mutation.id `
        -UserSourceAnchor $mutation.userSourceAnchor
      Write-Output "archive" $mutation.id
    }
  }
}
