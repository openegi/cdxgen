$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$commonSbomArgs = @(
  "-t",
  "caxa",
  "-t",
  "jar",
  "-t",
  "php",
  "-t",
  "ruby",
  "--lifecycle",
  "post-build",
  "--include-formulation",
  "--no-install-deps"
)

function Invoke-BinaryBuild {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Output,
    [Parameter(Mandatory = $true)]
    [string]$MetadataFile,
    [Parameter(Mandatory = $true)]
    [string]$EntryPoint
  )

  pnpm --package=@appthreat/caxa dlx caxa --input . --metadata-file $MetadataFile --output "$Output.exe" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/$EntryPoint"
  node bin/cdxgen.js @commonSbomArgs -o ".${Output}-postbuild.cdx.json"
  & ".\$Output.exe" --version
  & ".\$Output.exe" --help
}

function Install-ProductionDependencies {
  param(
    [switch]$NoOptional
  )

  $installArgs = @("install:prod", "--config.node-linker=hoisted")
  if ($NoOptional) {
    $installArgs += "--no-optional"
  }

  pnpm @installArgs
  Remove-Item -Path .pnpm-store -Force -Recurse -ErrorAction SilentlyContinue
}

function Reset-WithoutOptionalDependencies {
  Remove-Item -Path node_modules -Force -Recurse -ErrorAction SilentlyContinue
  Install-ProductionDependencies -NoOptional
}

function Get-OptionalDependencyVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackageName
  )

  $packageJson = Get-Content -Path package.json -Raw | ConvertFrom-Json
  $packageVersion = $packageJson.optionalDependencies.PSObject.Properties[$PackageName].Value
  if (-not $packageVersion) {
    throw "Missing optional dependency version for $PackageName"
  }
  return $packageVersion
}

function Install-OptionalDependency {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackageName
  )

  $packageVersion = Get-OptionalDependencyVersion -PackageName $PackageName
  $packageJsonBackup = [System.IO.Path]::GetTempFileName()
  Copy-Item -Path package.json -Destination $packageJsonBackup -Force

  $lockfileBackup = $null
  if (Test-Path pnpm-lock.yaml) {
    $lockfileBackup = [System.IO.Path]::GetTempFileName()
    Copy-Item -Path pnpm-lock.yaml -Destination $lockfileBackup -Force
  }

  pnpm add --prod --no-optional --config.node-linker=hoisted --config.strict-dep-builds=true --package-import-method copy "$PackageName@$packageVersion"

  Move-Item -Path $packageJsonBackup -Destination package.json -Force
  if ($lockfileBackup) {
    Move-Item -Path $lockfileBackup -Destination pnpm-lock.yaml -Force
  }
}

function Get-HbomPluginsPackageName {
  $packageJson = Get-Content -Path package.json -Raw | ConvertFrom-Json
  $packageName = "@cdxgen/cdxgen-plugins-bin-$env:TARGET_OS-$env:TARGET_ARCH"

  if ($env:TARGET_OS -eq "linux" -and $env:TARGET_LIBC -eq "musl") {
    $packageName = "@cdxgen/cdxgen-plugins-bin-linuxmusl-$env:TARGET_ARCH"
  }

  if (-not $packageJson.optionalDependencies.PSObject.Properties[$packageName].Value) {
    throw "Missing HBOM plugins optional dependency for $env:TARGET_OS/$env:TARGET_ARCH/$env:TARGET_LIBC: $packageName"
  }

  return $packageName
}

function Remove-HbomOnlyPlugins {
  Get-ChildItem -Path node_modules -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -in @("dosai", "sourcekitten", "trivy", "trustinspector") -and
      $_.FullName -match '[\\/]plugins[\\/](dosai|sourcekitten|trivy|trustinspector)$'
    } |
    ForEach-Object {
      Remove-Item -Path $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
    }
}

function Assert-HbomOnlyPluginsPruned {
  $remainingPlugins = Get-ChildItem -Path node_modules -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -in @("dosai", "sourcekitten", "trivy", "trustinspector") -and
      $_.FullName -match '[\\/]plugins[\\/](dosai|sourcekitten|trivy|trustinspector)$'
    } |
    Select-Object -ExpandProperty FullName

  if ($remainingPlugins) {
    Write-Error "HBOM SEA preflight failed: expected only the osquery plugin directory to remain before packaging hbom."
    $remainingPlugins | ForEach-Object { Write-Error $_ }
    throw "HBOM SEA plugin pruning verification failed"
  }
}

$cleanupTargets = @(
  "*.md",
  "ci",
  "contrib",
  "devenv.*",
  "pyproject.toml",
  "renovate.json",
  "test",
  "types",
  "tools_config",
  "uv.lock",
  "pnpm-workspace.yaml"
)

foreach ($target in $cleanupTargets) {
  Remove-Item -Path $target -Force -Recurse -ErrorAction SilentlyContinue
}

Get-ChildItem -Path lib -Filter "*.poku.js" -Recurse | ForEach-Object {
  Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
}

Install-ProductionDependencies

Invoke-BinaryBuild -Output "cdxgen" -MetadataFile ".cdxgen-metadata.json" -EntryPoint "bin/cdxgen.js"

Reset-WithoutOptionalDependencies

Invoke-BinaryBuild -Output "cdxgen-slim" -MetadataFile ".cdxgen-slim-metadata.json" -EntryPoint "bin/cdxgen.js"
Invoke-BinaryBuild -Output "cdx-audit" -MetadataFile ".cdx-audit-metadata.json" -EntryPoint "bin/audit.js"
Invoke-BinaryBuild -Output "cdx-verify" -MetadataFile ".cdx-verify-metadata.json" -EntryPoint "bin/verify.js"
Invoke-BinaryBuild -Output "cdx-sign" -MetadataFile ".cdx-sign-metadata.json" -EntryPoint "bin/sign.js"
Invoke-BinaryBuild -Output "cdx-validate" -MetadataFile ".cdx-validate-metadata.json" -EntryPoint "bin/validate.js"
Invoke-BinaryBuild -Output "cdx-convert" -MetadataFile ".cdx-convert-metadata.json" -EntryPoint "bin/convert.js"

Install-OptionalDependency -PackageName (Get-HbomPluginsPackageName)
Install-OptionalDependency -PackageName "@cdxgen/cdx-hbom"
Remove-Item -Path .pnpm-store -Force -Recurse -ErrorAction SilentlyContinue
Remove-HbomOnlyPlugins
Assert-HbomOnlyPluginsPruned
Invoke-BinaryBuild -Output "hbom" -MetadataFile ".hbom-metadata.json" -EntryPoint "bin/hbom.js"

Reset-WithoutOptionalDependencies

Install-OptionalDependency -PackageName "@cdxgen/cdx-hbom"
Remove-Item -Path .pnpm-store -Force -Recurse -ErrorAction SilentlyContinue

Invoke-BinaryBuild -Output "hbom-slim" -MetadataFile ".hbom-slim-metadata.json" -EntryPoint "bin/hbom.js"
