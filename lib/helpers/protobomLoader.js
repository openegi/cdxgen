import { createRequire } from "node:module";

const PROTO_BOM_FILE_EXTENSIONS = [".cdx", ".cdx.bin", ".proto"];
const PROTO_SUPPORT_INSTALL_HINT =
  "Install it or use a build that bundles protobuf support.";

/**
 * Determine whether a path looks like a CycloneDX protobuf file.
 *
 * @param {string} filePath File path
 * @returns {boolean} true when the path looks like a protobuf BOM file
 */
export function isProtoBomPath(filePath) {
  const normalizedPath = `${filePath || ""}`.toLowerCase();
  return PROTO_BOM_FILE_EXTENSIONS.some((extension) =>
    normalizedPath.endsWith(extension),
  );
}

/**
 * Ensure protobuf BOM support is installed before importing the helper module.
 *
 * @param {string} [commandName="cdxgen"] Command name for tailored guidance.
 * @param {string} [featureDescription="protobuf support"] Feature name for tailored guidance.
 * @param {string} [parentUrl=import.meta.url] Parent module URL used for resolution.
 * @returns {void}
 */
export function ensureProtoBomSupport(
  commandName = "cdxgen",
  featureDescription = "protobuf support",
  parentUrl = import.meta.url,
) {
  try {
    createRequire(parentUrl).resolve("@appthreat/cdx-proto");
  } catch (error) {
    if (
      error?.code === "MODULE_NOT_FOUND" ||
      `${error?.message || ""}`.includes("@appthreat/cdx-proto")
    ) {
      throw new Error(
        `${commandName} ${featureDescription} requires the optional '@appthreat/cdx-proto' dependency. ${PROTO_SUPPORT_INSTALL_HINT}`,
      );
    }
    throw error;
  }
}

/**
 * Import the protobuf BOM helper after preflight validation.
 *
 * @param {string} [commandName="cdxgen"] Command name for tailored guidance.
 * @param {string} [featureDescription="protobuf support"] Feature name for tailored guidance.
 * @param {string} [parentUrl=import.meta.url] Parent module URL used for resolution.
 * @returns {Promise<object>} Loaded protobom helper module.
 */
export async function importProtobomModule(
  commandName = "cdxgen",
  featureDescription = "protobuf support",
  parentUrl = import.meta.url,
) {
  ensureProtoBomSupport(commandName, featureDescription, parentUrl);
  return await import("./protobom.js");
}
