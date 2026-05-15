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

CAXA_PACKAGE="${CAXA_PACKAGE:-@appthreat/caxa@^3.0.0}"

run_caxa() {
  pnpm --package="$CAXA_PACKAGE" dlx caxa "$@"
}

install_production_dependencies() {
  pnpm install:prod --config.node-linker=hoisted "$@"
  rm -rf .pnpm-store
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
    caxa_args+=(--upx)
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
    caxa_args+=(--upx)
  fi

  caxa_args+=(-- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/$entry_point")

  run_caxa "${caxa_args[@]}"
  node bin/cdxgen.js "${COMMON_SBOM_ARGS[@]}" -o ".${output}-postbuild.cdx.json"
  chmod +x "$output"
  "./$output" --version
  "./$output" --help
}

postbuild_binary_artifacts() {
  local output="$1"

  node bin/cdxgen.js "${COMMON_SBOM_ARGS[@]}" -o ".${output}-postbuild.cdx.json"
  chmod +x "$output"
  "./$output" --version
  "./$output" --help
}

postbuild_binaries() {
  for output in "$@"; do
    postbuild_binary_artifacts "$output"
  done
}

read_optional_dependency_version() {
  local package_name="$1"

  node --input-type=module -e '
    import { readFileSync } from "node:fs";

    const packageName = process.argv[1];
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const packageVersion = packageJson.optionalDependencies?.[packageName];

    if (!packageVersion) {
      console.error(`Missing optional dependency version for ${packageName}`);
      process.exit(1);
    }

    console.log(packageVersion);
  ' "$package_name"
}

install_optional_dependency() {
  local package_name="$1"
  local package_version

  package_version="$(read_optional_dependency_version "$package_name")"
  pnpm add --prod \
    --config.node-linker=hoisted \
    --config.strict-dep-builds=true \
    --package-import-method copy \
    "$package_name@$package_version"
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

prune_hbom_only_plugins() {
  find node_modules -type d \( -path "*/plugins/dosai" -o -path "*/plugins/sourcekitten" -o -path "*/plugins/trivy" -o -path "*/plugins/trustinspector" \) -prune -exec rm -rf {} +
}

verify_hbom_only_plugins_pruned() {
  local remaining_plugins

  remaining_plugins="$(find node_modules -type d \( -path "*/plugins/dosai" -o -path "*/plugins/sourcekitten" -o -path "*/plugins/trivy" -o -path "*/plugins/trustinspector" \) -print)"

  if [[ -n "$remaining_plugins" ]]; then
    echo "HBOM SEA preflight failed: expected only the osquery plugin directory to remain before packaging hbom." >&2
    echo "$remaining_plugins" >&2
    exit 1
  fi
}

rm -rf \
  *.cdx.json \
  *.md \
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

create_targets_file .caxa-targets-core.json \
  'cdx-audit::.cdx-audit-metadata.json::bin/audit.js' \
  'cdx-verify::.cdx-verify-metadata.json::bin/verify.js' \
  'cdx-sign::.cdx-sign-metadata.json::bin/sign.js' \
  'cdx-validate::.cdx-validate-metadata.json::bin/validate.js' \
  'cdx-convert::.cdx-convert-metadata.json::bin/convert.js'
build_binaries .caxa-targets-core.json
rm -f .caxa-targets-core.json
postbuild_binaries cdx-audit cdx-verify cdx-sign cdx-validate cdx-convert

install_optional_dependency "$(resolve_hbom_plugin_package_name)"
install_optional_dependency @cdxgen/cdx-hbom
rm -rf .pnpm-store
prune_hbom_only_plugins
verify_hbom_only_plugins_pruned

build_binary hbom .hbom-metadata.json bin/hbom.js

reinstall_without_optional_dependencies
install_optional_dependency @cdxgen/cdx-hbom
rm -rf .pnpm-store

build_binary hbom-slim .hbom-slim-metadata.json bin/hbom.js
