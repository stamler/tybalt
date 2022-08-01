# Remove any licenses that are still applied to deleted users in Microsoft 365

# Connect to Microsoft 365
$Credential = Get-AutomationPSCredential -Name "Azure Automation Bot"
Connect-MsolService -Credential $Credential

# Remove licenses from deleted users
$licensedDeletedUsers = Get-MsolUser -ReturnDeletedUsers | Where-Object {$_.IsLicensed -eq $true}
Write-Output "Found $($licensedDeletedUsers.Count) licensed deleted users"
$licensedDeletedUsers | foreach {
  $upn = $_.UserPrincipalName
  try {
    Restore-MsolUser -UserPrincipalName $upn    
  }
  catch {
    Write-Output "Failed to restore user $upn"
    continue
  }
  (get-MsolUser -UserPrincipalName $upn).licenses.AccountSkuId | foreach {
    $License = $_
    try {
      Set-MsolUserLicense -UserPrincipalName $upn -RemoveLicenses $License -ErrorAction Stop
    }
    catch {
      Write-Output "Error removing license $License from $upn"
      continue
    }
  }
  try {
    Remove-MsolUser -UserPrincipalName $upn -Force -ErrorAction Stop
  }
  catch {
    Write-Output "Error deleting user $upn"
    continue
  }
  Write-Output "Removed licenses from $upn"
}
