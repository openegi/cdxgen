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

$caxaPackage = if ($env:CAXA_PACKAGE) { $env:CAXA_PACKAGE } else { "@appthreat/caxa@^3.0.1" }

function Invoke-BinaryBuild {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Output,
    [Parameter(Mandatory = $true)]
    [string]$MetadataFile,
    [Parameter(Mandatory = $true)]
    [string]$EntryPoint
  )

  pnpm --package=$caxaPackage dlx caxa --input . --metadata-file $MetadataFile --output "$Output.exe" -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/$EntryPoint"
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

function Install-OptionalDependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$PackageNames
  )

  $packageJsonBackup = [System.IO.Path]::GetTempFileName()
  Copy-Item -Path package.json -Destination $packageJsonBackup -Force

  $lockfileBackup = $null
  if (Test-Path pnpm-lock.yaml) {
    $lockfileBackup = [System.IO.Path]::GetTempFileName()
    Copy-Item -Path pnpm-lock.yaml -Destination $lockfileBackup -Force
  }

  $packageJson = Get-Content -Path package.json -Raw | ConvertFrom-Json -AsHashtable
  if (-not $packageJson.ContainsKey("dependencies")) {
    $packageJson["dependencies"] = [ordered]@{}
  }
  foreach ($packageName in $PackageNames) {
    $packageVersion = $packageJson["optionalDependencies"][$packageName]
    if (-not $packageVersion) {
      throw "Missing optional dependency version for $packageName"
    }
    $packageJson["dependencies"][$packageName] = $packageVersion
    $packageJson["optionalDependencies"].Remove($packageName)
  }
  $packageJson | ConvertTo-Json -Depth 100 | Set-Content -Path package.json

  pnpm install --prod --no-frozen-lockfile --no-optional --config.node-linker=hoisted --config.strict-dep-builds=true --package-import-method copy

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

Install-OptionalDependencies -PackageNames @((Get-HbomPluginsPackageName), "@cdxgen/cdx-hbom")
Remove-Item -Path .pnpm-store -Force -Recurse -ErrorAction SilentlyContinue
Invoke-BinaryBuild -Output "cdx-hbom" -MetadataFile ".cdx-hbom-metadata.json" -EntryPoint "bin/hbom.js"

Reset-WithoutOptionalDependencies

Install-OptionalDependencies -PackageNames "@cdxgen/cdx-hbom"
Remove-Item -Path .pnpm-store -Force -Recurse -ErrorAction SilentlyContinue

Invoke-BinaryBuild -Output "cdx-hbom-slim" -MetadataFile ".cdx-hbom-slim-metadata.json" -EntryPoint "bin/hbom.js"
Move-Item -Path "cdx-hbom.exe" -Destination "hbom.exe" -Force
Move-Item -Path ".cdx-hbom-postbuild.cdx.json" -Destination ".hbom-postbuild.cdx.json" -Force
Move-Item -Path "cdx-hbom-slim.exe" -Destination "hbom-slim.exe" -Force
Move-Item -Path ".cdx-hbom-slim-postbuild.cdx.json" -Destination ".hbom-slim-postbuild.cdx.json" -Force
