#!/usr/bin/env bash
set -euo pipefail

COMMON_SBOM_ARGS=(
  -t caxa
  -t jar
  -t php
  -t ruby
  --lifecycle post-build
  --include-formulation
  --no-install-deps
)

CAXA_PACKAGE="${CAXA_PACKAGE:-@appthreat/caxa@^3.0.1}"
ARTIFACT_STAGING_DIR="$(mktemp -d)"

run_caxa() {
  pnpm --package="$CAXA_PACKAGE" dlx caxa "$@"
}

install_production_dependencies() {
  pnpm install:prod --config.node-linker=hoisted "$@"
  rm -rf .pnpm-store
}

reinstall_production_dependencies() {
  rm -rf node_modules
  install_production_dependencies
}

reinstall_without_optional_dependencies() {
  rm -rf node_modules
  install_production_dependencies --no-optional
}

create_targets_file() {
  local file_path="$1"
  shift

  node --input-type=module - "$file_path" "$@" <<'NODE'
    import { writeFileSync } from "node:fs";

    const [, , filePath, ...entries] = process.argv;
    const targets = [];

    for (const entry of entries) {
      const [output, metadataFile, entryPoint] = entry.split("::");
      targets.push({
        output,
        metadataFile,
        command: ["{{caxa}}/node_modules/.bin/node", `{{caxa}}/${entryPoint}`],
      });
    }

    writeFileSync(filePath, JSON.stringify(targets, null, 2));
NODE
}

build_binaries() {
  local targets_file="$1"
  local caxa_args=(
    --input .
    --targets-file "$targets_file"
  )

  if [[ "$(uname -s)" == "Linux" ]]; then
    caxa_args+=(--upx --upx-args '--best' '--lzma')
  fi

  run_caxa "${caxa_args[@]}"
}

build_binary() {
  local output="$1"
  local metadata_file="$2"
  local entry_point="$3"
  local caxa_args=(
    --input .
    --metadata-file "$metadata_file"
    --output "$output"
  )

  if [[ "$(uname -s)" == "Linux" ]]; then
    caxa_args+=(--upx --upx-args '--best' '--lzma')
  fi

  caxa_args+=(-- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/$entry_point")

  run_caxa "${caxa_args[@]}"
  node bin/cdxgen.js "${COMMON_SBOM_ARGS[@]}" -o ".${output}-postbuild.cdx.json"
  chmod +x "$output"
  "./$output" --version
  "./$output" --help
  stage_binary_artifacts "$output" "$metadata_file"
}

postbuild_binary_artifacts() {
  local output="$1"
  local metadata_file=".${output}-metadata.json"

  node bin/cdxgen.js "${COMMON_SBOM_ARGS[@]}" -o ".${output}-postbuild.cdx.json"
  chmod +x "$output"
  "./$output" --version
  "./$output" --help
  stage_binary_artifacts "$output" "$metadata_file"
}

postbuild_binaries() {
  for output in "$@"; do
    postbuild_binary_artifacts "$output"
  done
}

stage_binary_artifacts() {
  local output="$1"
  local metadata_file="$2"

  mv "$output" "$ARTIFACT_STAGING_DIR/$output"
  mv ".${output}-postbuild.cdx.json" "$ARTIFACT_STAGING_DIR/.${output}-postbuild.cdx.json"
  rm -f "$metadata_file"
}

restore_staged_artifacts() {
  shopt -s nullglob
  for artifact in "$ARTIFACT_STAGING_DIR"/* "$ARTIFACT_STAGING_DIR"/.*.json; do
    [[ -e "$artifact" ]] || continue
    mv "$artifact" .
  done
  rmdir "$ARTIFACT_STAGING_DIR"
}

install_optional_dependencies() {
  local package_json_backup
  local lockfile_backup=""
  local install_status=0

  package_json_backup="$(mktemp)"
  cp package.json "$package_json_backup"
  if [[ -f pnpm-lock.yaml ]]; then
    lockfile_backup="$(mktemp)"
    cp pnpm-lock.yaml "$lockfile_backup"
  fi
  node --input-type=module - "$@" <<'NODE' || install_status=$?
    import { readFileSync, writeFileSync } from "node:fs";

    const [, , ...packageNames] = process.argv;
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    packageJson.dependencies ??= {};

    for (const packageName of packageNames) {
      const packageVersion = packageJson.optionalDependencies?.[packageName];
      if (!packageVersion) {
        console.error(`Missing optional dependency version for ${packageName}`);
        process.exit(1);
      }
      packageJson.dependencies[packageName] = packageVersion;
      delete packageJson.optionalDependencies[packageName];
    }

    writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
  if [[ "$install_status" -eq 0 ]]; then
    pnpm install --prod \
      --no-frozen-lockfile \
      --no-optional \
      --config.node-linker=hoisted \
      --config.strict-dep-builds=true \
      --package-import-method copy || install_status=$?
  fi
  mv "$package_json_backup" package.json
  if [[ -n "$lockfile_backup" ]]; then
    mv "$lockfile_backup" pnpm-lock.yaml
  fi
  return "$install_status"
}

resolve_hbom_plugin_package_name() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";

    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const targetOs = process.env.TARGET_OS;
    const targetArch = process.env.TARGET_ARCH;
    const targetLibc = process.env.TARGET_LIBC;
    let packageName = `@cdxgen/cdxgen-plugins-bin-${targetOs}-${targetArch}`;

    if (targetOs === "linux" && targetLibc === "musl") {
      packageName = `@cdxgen/cdxgen-plugins-bin-linuxmusl-${targetArch}`;
    }

    if (!packageJson.optionalDependencies?.[packageName]) {
      console.error(
        `Missing HBOM plugins optional dependency for ${targetOs}/${targetArch}/${targetLibc}: ${packageName}`,
      );
      process.exit(1);
    }

    console.log(packageName);
  '
}

rm -rf \
  *.cdx.json \
  *.md \
  cdx-audit \
  cdx-convert \
  cdx-hbom \
  cdx-hbom-slim \
  cdx-sign \
  cdx-validate \
  cdx-verify \
  cdxgen \
  cdxgen-slim \
  hbom \
  hbom-slim \
  ci \
  contrib \
  devenv.* \
  pyproject.toml \
  renovate.json \
  semicolon_delimited_script \
  test \
  tools_config \
  uv.lock \
  pnpm-workspace.yaml \
  .versions \
  upx-5.*

find lib -name "*.poku.js" -exec rm -f {} +
rm -rf types

install_production_dependencies

build_binary cdxgen .cdxgen-metadata.json bin/cdxgen.js

reinstall_without_optional_dependencies

build_binary cdxgen-slim .cdxgen-slim-metadata.json bin/cdxgen.js

reinstall_production_dependencies

create_targets_file .caxa-targets-core.json \
  'cdx-audit::.cdx-audit-metadata.json::bin/audit.js' \
  'cdx-verify::.cdx-verify-metadata.json::bin/verify.js' \
  'cdx-sign::.cdx-sign-metadata.json::bin/sign.js' \
  'cdx-validate::.cdx-validate-metadata.json::bin/validate.js' \
  'cdx-convert::.cdx-convert-metadata.json::bin/convert.js'
build_binaries .caxa-targets-core.json
rm -f .caxa-targets-core.json
postbuild_binaries cdx-audit cdx-verify cdx-sign cdx-validate cdx-convert

reinstall_without_optional_dependencies
install_optional_dependencies "$(resolve_hbom_plugin_package_name)" @cdxgen/cdx-hbom @appthreat/cdx-proto
rm -rf .pnpm-store

build_binary cdx-hbom .cdx-hbom-metadata.json bin/hbom.js

reinstall_without_optional_dependencies
install_optional_dependencies @cdxgen/cdx-hbom
rm -rf .pnpm-store

build_binary cdx-hbom-slim .cdx-hbom-slim-metadata.json bin/hbom.js
restore_staged_artifacts
mv cdx-hbom hbom
mv .cdx-hbom-postbuild.cdx.json .hbom-postbuild.cdx.json
mv cdx-hbom-slim hbom-slim
mv .cdx-hbom-slim-postbuild.cdx.json .hbom-slim-postbuild.cdx.json
