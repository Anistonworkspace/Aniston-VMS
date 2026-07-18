<#
  .SYNOPSIS
    Inject/clear a simulated health fault for a demo camera (Windows/PowerShell
    equivalent of fault-inject.sh).

  .DESCRIPTION
    The backend's health checkers read `sim:fault:<cameraCode>` from Redis when
    HEALTH_SIM_MODE=true (see backend/src/modules/health/health.checkers.ts)
    and synthesize the matching failure/diagnosis instead of touching real
    hardware. This wraps `redis-cli SET sim:fault:CAM-00X <FAULT>` (or DEL to
    clear).

  .PARAMETER CameraCode
    Camera code, e.g. CAM-001.

  .PARAMETER Fault
    One of: SITE_INTERNET_DOWN, SIM_SIGNAL_ISSUE, NETWORK_UNSTABLE,
    CAMERA_OFFLINE, CONFIG_ERROR, STREAM_DEGRADED, IMAGE_PROBLEM, or 'clear'
    to remove the fault key.

  .PARAMETER List
    List all currently active sim:fault:* keys instead of setting one.

  .PARAMETER RedisHost / RedisPort / RedisCliPath
    Override Redis connection details. Defaults to localhost:6379 and
    'redis-cli' on PATH.

  .EXAMPLE
    ./fault-inject.ps1 -CameraCode CAM-001 -Fault CAMERA_OFFLINE
  .EXAMPLE
    ./fault-inject.ps1 -CameraCode CAM-001 -Fault clear
  .EXAMPLE
    ./fault-inject.ps1 -List
#>
[CmdletBinding(DefaultParameterSetName = 'Set')]
param(
  [Parameter(ParameterSetName = 'Set', Position = 0, Mandatory = $true)]
  [string]$CameraCode,

  [Parameter(ParameterSetName = 'Set', Position = 1, Mandatory = $true)]
  [ValidateSet('SITE_INTERNET_DOWN', 'SIM_SIGNAL_ISSUE', 'NETWORK_UNSTABLE', 'CAMERA_OFFLINE', 'CONFIG_ERROR', 'STREAM_DEGRADED', 'IMAGE_PROBLEM', 'clear')]
  [string]$Fault,

  [Parameter(ParameterSetName = 'List')]
  [switch]$List,

  [string]$RedisHost = 'localhost',
  [int]$RedisPort = 6379,
  [string]$RedisCliPath = 'redis-cli'
)

$ErrorActionPreference = 'Stop'

function Invoke-RedisCli {
  param([string[]]$Arguments)
  & $RedisCliPath '-h' $RedisHost '-p' $RedisPort @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "redis-cli exited with code $LASTEXITCODE"
  }
}

if ($List) {
  Write-Host 'Active sim faults:'
  $keys = Invoke-RedisCli @('--scan', '--pattern', 'sim:fault:*')
  foreach ($key in $keys) {
    if ([string]::IsNullOrWhiteSpace($key)) { continue }
    $value = Invoke-RedisCli @('get', $key)
    $code = $key -replace '^sim:fault:', ''
    Write-Host "  $code -> $value"
  }
  return
}

$key = "sim:fault:$CameraCode"

if ($Fault -eq 'clear') {
  Invoke-RedisCli @('del', $key) | Out-Null
  Write-Host "Cleared fault for $CameraCode"
  return
}

Invoke-RedisCli @('set', $key, $Fault) | Out-Null
Write-Host "Injected $Fault on $CameraCode (key $key)"
