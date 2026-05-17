import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assert, describe, it } from "poku";

import { ensureProtoBomSupport, isProtoBomPath } from "./protobomLoader.js";
import { getTmpDir } from "./utils.js";

describe("protobomLoader helpers", () => {
  it("detects protobuf bom file extensions", () => {
    assert.strictEqual(isProtoBomPath("bom.cdx"), true);
    assert.strictEqual(isProtoBomPath("bom.cdx.bin"), true);
    assert.strictEqual(isProtoBomPath("bom.proto"), true);
    assert.strictEqual(isProtoBomPath("bom.json"), false);
  });

  it("throws a helpful error when protobuf support is unavailable", () => {
    const tempDir = mkdtempSync(join(getTmpDir(), "cdxgen-proto-loader-"));
    const entryFile = join(tempDir, "entry.mjs");
    writeFileSync(entryFile, "");
    try {
      assert.throws(
        () =>
          ensureProtoBomSupport(
            "cdx-test",
            "protobuf BOM input",
            pathToFileURL(entryFile).href,
          ),
        /cdx-test protobuf BOM input requires the optional '@appthreat\/cdx-proto' dependency/u,
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
