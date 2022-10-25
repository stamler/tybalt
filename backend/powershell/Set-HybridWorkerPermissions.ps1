# This script addresses the issues found in the following article:
# https://learn.microsoft.com/en-us/azure/automation/automation-hrw-run-runbooks?tabs=sa-mi#use-a-credential-asset-for-a-hybrid-runbook-worker-group
# by setting the correct permissions on the Hybrid Runbook account $user

$user = "DOMAIN\USERNAME"

# Set Folder Permissions
$path = "C:\ProgramData\AzureConnectedMachineAgent\Tokens"
$acl = Get-Acl $path
$ar = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($ar)
Set-Acl $path $acl

$path2 = "C:\Packages\Plugins\Microsoft.Azure.Automation.HybridWorker.HybridWorkerForWindows\0.1.0.22\HybridWorkerPackage\HybridWorkerAgent"
$acl = Get-Acl $path2
$ar = New-Object System.Security.AccessControl.FileSystemAccessRule("TBTE\hybridworker", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($ar)
Set-Acl $path2 $acl

# I found that for our purposes it was unnecessary to set the permissions on the following folders
# Set full-access permissions for registry
# $regkeys = "HKLM:\SYSTEM\CurrentControlSet\Services\WinSock2\Parameters",
# "HKLM:\SOFTWARE\Microsoft\Wbem\CIMOM",
# "HKLM:\Software\Policies\Microsoft\SystemCertificates\Root",
# "HKLM:\Software\Microsoft\SystemCertificates",
# "HKLM:\Software\Microsoft\EnterpriseCertificates",
# "HKLM:\software\Microsoft\HybridRunbookWorkerV2",
# "HKCU:\SOFTWARE\Policies\Microsoft\SystemCertificates\Disallowed",
# "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Setup\PnpLockdownFiles" 

# foreach ($key in $regkeys) {
#   $acl = Get-Acl $key
#   $ar = New-Object System.Security.AccessControl.RegistryAccessRule ($user, "FullControl", "None", "None", "Allow")
#   $acl.AddAccessRule($ar)
#   Set-Acl $path $acl
# } 
