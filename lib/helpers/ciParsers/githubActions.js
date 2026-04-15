import { readFileSync } from "node:fs";

import { PackageURL } from "packageurl-js";
import { v4 as uuidv4 } from "uuid";
import { parse as _load } from "yaml";

import { disambiguateSteps } from "./common.js";

/**
 * Analyse workflow-level or job-level permissions map for any write grants.
 *
 * @param {Object|string} permissions
 * @returns {boolean}
 */
function analyzePermissions(permissions) {
  if (!permissions || typeof permissions !== "object") {
    return false;
  }
  const writeScopes = [
    "actions",
    "artifact-metadata",
    "attestations",
    "checks",
    "contents",
    "deployments",
    "discussions",
    "id-token",
    "issues",
    "models",
    "packages",
    "pages",
    "pull-requests",
    "security-events",
    "statuses",
  ];
  for (const scope of writeScopes) {
    if (permissions[scope] === "write") {
      return true;
    }
  }
  return false;
}

/**
 * Detect if a step uses actions/checkout and extract persist-credentials setting
 */
function analyzeCheckoutStep(step) {
  const props = [];
  if (step.uses?.includes("actions/checkout")) {
    const persistCreds = step.with?.["persist-credentials"] ?? true;
    props.push({
      name: "cdx:github:checkout:persistCredentials",
      value: String(persistCreds),
    });
  }
  return props;
}

/**
 * Detect cache action usage and extract key/path metadata
 */
function analyzeCacheStep(step) {
  const props = [];
  if (step.uses?.includes("actions/cache")) {
    if (step.with?.key) {
      props.push({ name: "cdx:github:cache:key", value: step.with.key });
    }
    if (step.with?.path) {
      props.push({ name: "cdx:github:cache:path", value: step.with.path });
    }
    if (step.with?.["restore-keys"]) {
      let keys = step.with["restore-keys"];
      if (Array.isArray(keys)) {
        keys = keys.join(",");
      } else if (typeof keys === "string" && keys.includes("\n")) {
        keys = keys
          .split("\n")
          .map((k) => k.trim())
          .filter((k) => k)
          .join(",");
      }
      props.push({ name: "cdx:github:cache:restoreKeys", value: keys });
    }
  }
  return props;
}

/**
 * Detect untrusted expression interpolation in run: blocks
 */
function detectUntrustedInterpolation(runValue) {
  if (!runValue) return { hasInterpolation: false, vars: [] };
  const pattern = /\$\{\{\s*([^}]+(?:}[^}])*)}}/g;
  const matches = [...runValue.matchAll(pattern)];
  const untrustedVars = [];

  for (const match of matches) {
    const expr = match[1].trim();
    if (
      expr.startsWith("github.event.pull_request") ||
      expr.startsWith("github.event.issue") ||
      expr.startsWith("github.event.comment") ||
      expr.startsWith("github.head_ref") ||
      expr.startsWith("inputs.")
    ) {
      untrustedVars.push(expr);
    }
  }

  return {
    hasInterpolation: untrustedVars.length > 0,
    vars: untrustedVars,
  };
}

/**
 * Classify a GitHub Actions version reference as "sha", "tag", or "branch".
 *
 * @param {string} versionRef
 * @returns {string}
 */
function getVersionPinningType(versionRef) {
  if (!versionRef) {
    return "unknown";
  }
  if (/^[a-f0-9]{40}$/.test(versionRef) || /^[a-f0-9]{7,}$/.test(versionRef)) {
    return "sha";
  }
  if (
    versionRef === "main" ||
    versionRef === "master" ||
    versionRef.includes("/")
  ) {
    return "branch";
  }
  return "tag";
}

/**
 * Parse a single GitHub Actions workflow file and return formulation-shaped data.
 *
 * @param {string} f Absolute path to a workflow YAML file
 * @param {Object} _options CLI options (currently unused but kept for interface consistency)
 * @returns {{ workflows: Object[], components: Object[], dependencies: Object[] }}
 */
function parseWorkflowFile(f, _options) {
  const workflows = [];
  const components = [];
  const dependencies = [];

  let raw;
  try {
    raw = readFileSync(f, { encoding: "utf-8" });
  } catch (_e) {
    return { workflows, components, dependencies };
  }

  let yamlObj;
  try {
    yamlObj = _load(raw);
  } catch (_e) {
    return { workflows, components, dependencies };
  }

  if (!yamlObj?.jobs) {
    return { workflows, components, dependencies };
  }

  const workflowName =
    yamlObj.name ||
    f
      .split("/")
      .pop()
      .replace(/\.[^.]+$/, "");
  const workflowTriggers = yamlObj.on || yamlObj.true;
  const workflowPermissions = yamlObj.permissions || {};
  const workflowHasWritePermissions =
    analyzePermissions(workflowPermissions) ||
    (typeof workflowPermissions === "string" &&
      workflowPermissions.includes("write"));
  const hasIdTokenWrite = workflowPermissions?.["id-token"] === "write";

  const workflowRef = uuidv4();
  const tasks = [];
  const workflowDependsOn = [];

  for (const jobName of Object.keys(yamlObj.jobs)) {
    const job = yamlObj.jobs[jobName];
    const jobRef = uuidv4();
    const steps = [];
    const jobDependsOn = [];

    // Job needs (dependency links)
    let jobNeeds = job.needs || [];
    if (!Array.isArray(jobNeeds)) {
      jobNeeds = [jobNeeds];
    }

    const jobRunner = job["runs-on"] || "unknown";
    const jobEnvironment = job.environment?.name || job.environment || "";
    const jobPermissions = job.permissions || {};
    const jobHasWritePermissions = analyzePermissions(jobPermissions);
    const jobServices = job.services ? Object.keys(job.services) : [];

    const jobProperties = [
      { name: "cdx:github:job:name", value: jobName },
      {
        name: "cdx:github:job:runner",
        value: Array.isArray(jobRunner) ? jobRunner.join(",") : jobRunner,
      },
    ];
    if (jobEnvironment) {
      jobProperties.push({
        name: "cdx:github:job:environment",
        value: jobEnvironment,
      });
    }
    if (jobHasWritePermissions) {
      jobProperties.push({
        name: "cdx:github:job:hasWritePermissions",
        value: "true",
      });
    }
    if (jobServices.length) {
      jobProperties.push({
        name: "cdx:github:job:services",
        value: jobServices.join(","),
      });
    }
    if (jobNeeds.length) {
      jobProperties.push({
        name: "cdx:github:job:needs",
        value: jobNeeds.join(","),
      });
    }
    if (workflowHasWritePermissions) {
      jobProperties.push({
        name: "cdx:github:workflow:hasWritePermissions",
        value: "true",
      });
    }
    if (hasIdTokenWrite) {
      jobProperties.push({
        name: "cdx:github:workflow:hasIdTokenWrite",
        value: "true",
      });
    }
    if (workflowTriggers) {
      const triggers =
        typeof workflowTriggers === "string"
          ? workflowTriggers
          : Object.keys(workflowTriggers).join(",");
      jobProperties.push({
        name: "cdx:github:workflow:triggers",
        value: triggers,
      });
    }
    const highRiskTriggers = [
      "pull_request_target",
      "issue_comment",
      "workflow_run",
    ];
    const jobHasHighRisk =
      (typeof workflowTriggers === "string" &&
        highRiskTriggers.includes(workflowTriggers)) ||
      (typeof workflowTriggers === "object" &&
        Object.keys(workflowTriggers).some((t) =>
          highRiskTriggers.includes(t),
        ));
    if (jobHasHighRisk) {
      jobProperties.push({
        name: "cdx:github:workflow:hasHighRiskTrigger",
        value: "true",
      });
    }
    for (const step of job.steps || []) {
      const stepName = step.name || step.uses || "unnamed step";
      const commands = [];
      let actionProperties = [];
      if (step.uses) {
        commands.push({ executed: step.uses });
        // Collect action references as components
        const tmpA = step.uses.split("@");
        if (tmpA.length === 2) {
          const groupName = tmpA[0];
          const tagOrCommit = tmpA[1];
          const versionPinningType = getVersionPinningType(tagOrCommit);
          const isShaPinned = versionPinningType === "sha";

          const tmpB = groupName.split("/");
          const name = tmpB.length >= 2 ? tmpB.pop() : tmpB[0];
          const group = tmpB.join("/");
          const purl = new PackageURL(
            "github",
            group || undefined,
            name,
            tagOrCommit,
            null,
            null,
          ).toString();

          actionProperties = [
            ...actionProperties,
            { name: "SrcFile", value: f },
            { name: "cdx:github:workflow:name", value: workflowName },
            { name: "cdx:github:job:name", value: jobName },
            {
              name: "cdx:github:job:runner",
              value: Array.isArray(jobRunner) ? jobRunner.join(",") : jobRunner,
            },
            { name: "cdx:github:action:uses", value: step.uses },
            {
              name: "cdx:github:action:versionPinningType",
              value: versionPinningType,
            },
            {
              name: "cdx:github:action:isShaPinned",
              value: isShaPinned.toString(),
            },
          ];
          if (step.name) {
            actionProperties.push({
              name: "cdx:github:step:name",
              value: step.name,
            });
          }
          if (step.if) {
            actionProperties.push({
              name: "cdx:github:step:condition",
              value: step.if,
            });
          }
          if (workflowHasWritePermissions || jobHasWritePermissions) {
            actionProperties.push({
              name: "cdx:github:workflow:hasWritePermissions",
              value: "true",
            });
          }
          if (hasIdTokenWrite) {
            actionProperties.push({
              name: "cdx:github:workflow:hasIdTokenWrite",
              value: "true",
            });
          }
          if (group?.startsWith("github/") || group === "actions") {
            actionProperties.push({
              name: "cdx:actions:isOfficial",
              value: "true",
            });
          }
          if (group?.startsWith("github/")) {
            actionProperties.push({
              name: "cdx:actions:isVerified",
              value: "true",
            });
          }
          if (workflowTriggers) {
            const triggers =
              typeof workflowTriggers === "string"
                ? workflowTriggers
                : Object.keys(workflowTriggers).join(",");
            actionProperties.push({
              name: "cdx:github:workflow:triggers",
              value: triggers,
            });
          }
          actionProperties.push(...analyzeCheckoutStep(step));
          actionProperties.push(...analyzeCacheStep(step));
          const highRiskTriggers = [
            "pull_request_target",
            "issue_comment",
            "workflow_run",
          ];
          const componentHasHighRisk =
            (typeof workflowTriggers === "string" &&
              highRiskTriggers.includes(workflowTriggers)) ||
            (typeof workflowTriggers === "object" &&
              Object.keys(workflowTriggers).some((t) =>
                highRiskTriggers.includes(t),
              ));
          if (componentHasHighRisk) {
            actionProperties.push({
              name: "cdx:github:workflow:hasHighRiskTrigger",
              value: "true",
            });
          }
          components.push({
            "bom-ref": purl,
            type: "application",
            group,
            name,
            version: tagOrCommit,
            purl,
            properties: actionProperties,
          });
          jobDependsOn.push(purl);
        }
      } else if (step.run) {
        commands.push({ executed: step.run.trim().split("\n")[0] });
        const stepRef = `${jobRef}-step-${steps.length + 1}`;
        const runProperties = [
          { name: "SrcFile", value: f },
          { name: "cdx:github:workflow:name", value: workflowName },
          { name: "cdx:github:job:name", value: jobName },
          { name: "cdx:github:step:type", value: "run" },
          {
            name: "cdx:github:step:command",
            value: step.run.trim().split("\n")[0],
          },
        ];
        if (workflowHasWritePermissions || jobHasWritePermissions) {
          runProperties.push({
            name: "cdx:github:workflow:hasWritePermissions",
            value: "true",
          });
        }
        if (hasIdTokenWrite) {
          runProperties.push({
            name: "cdx:github:workflow:hasIdTokenWrite",
            value: "true",
          });
        }
        if (workflowTriggers) {
          const triggers =
            typeof workflowTriggers === "string"
              ? workflowTriggers
              : Object.keys(workflowTriggers).join(",");
          runProperties.push({
            name: "cdx:github:workflow:triggers",
            value: triggers,
          });
        }
        const highRiskTriggers = [
          "pull_request_target",
          "issue_comment",
          "workflow_run",
        ];
        const runStepHasHighRisk =
          (typeof workflowTriggers === "string" &&
            highRiskTriggers.includes(workflowTriggers)) ||
          (typeof workflowTriggers === "object" &&
            Object.keys(workflowTriggers).some((t) =>
              highRiskTriggers.includes(t),
            ));
        if (runStepHasHighRisk) {
          runProperties.push({
            name: "cdx:github:workflow:hasHighRiskTrigger",
            value: "true",
          });
        }
        const { hasInterpolation, vars } = detectUntrustedInterpolation(
          step.run,
        );
        if (hasInterpolation) {
          runProperties.push({
            name: "cdx:github:step:hasUntrustedInterpolation",
            value: "true",
          });
          runProperties.push({
            name: "cdx:github:step:interpolatedVars",
            value: vars.join(","),
          });
        }
        components.push({
          "bom-ref": stepRef,
          type: "process",
          name: stepName,
          purl: `pkg:github/workflow/${workflowName}/${jobName}/step/${steps.length + 1}`,
          properties: runProperties,
        });

        jobDependsOn.push(stepRef);
      }

      steps.push({
        name: stepName,
        commands: commands.length ? commands : undefined,
      });
    }

    const task = {
      "bom-ref": jobRef,
      uid: jobRef,
      name: jobName,
      taskTypes: ["build"],
      steps: disambiguateSteps(steps),
      properties: jobProperties,
    };

    tasks.push(task);
    workflowDependsOn.push(jobRef);

    // Wire job→action dependencies
    if (jobDependsOn.length) {
      dependencies.push({ ref: jobRef, dependsOn: jobDependsOn });
    }
  }

  // Build workflow-level properties
  const workflowProperties = [{ name: "cdx:github:workflow:file", value: f }];
  if (workflowHasWritePermissions) {
    workflowProperties.push({
      name: "cdx:github:workflow:hasWritePermissions",
      value: "true",
    });
  }
  if (hasIdTokenWrite) {
    workflowProperties.push({
      name: "cdx:github:workflow:hasIdTokenWrite",
      value: "true",
    });
  }
  // Handle triggers and high-risk detection for BOTH string and object types
  if (workflowTriggers) {
    const triggers =
      typeof workflowTriggers === "string"
        ? workflowTriggers
        : Object.keys(workflowTriggers).join(",");
    workflowProperties.push({
      name: "cdx:github:workflow:triggers",
      value: triggers,
    });

    // Check for high-risk triggers regardless of workflowTriggers type
    const highRiskTriggers = [
      "pull_request_target",
      "issue_comment",
      "workflow_run",
    ];
    const hasHighRisk =
      (typeof workflowTriggers === "string" &&
        highRiskTriggers.includes(workflowTriggers)) ||
      (typeof workflowTriggers === "object" &&
        Object.keys(workflowTriggers).some((t) =>
          highRiskTriggers.includes(t),
        ));
    if (hasHighRisk) {
      workflowProperties.push({
        name: "cdx:github:workflow:hasHighRiskTrigger",
        value: "true",
      });
    }
  }

  const workflow = {
    "bom-ref": workflowRef,
    uid: workflowRef,
    name: workflowName,
    taskTypes: ["build"],
    tasks: tasks.length ? tasks : undefined,
    properties: workflowProperties,
  };

  workflows.push(workflow);

  if (workflowDependsOn.length) {
    dependencies.push({ ref: workflowRef, dependsOn: workflowDependsOn });
  }

  return { workflows, components, dependencies };
}

/**
 * GitHub Actions formulation parser.
 *
 * Matches `.github/workflows/*.yml` and `*.yaml` files and converts them into
 * CycloneDX formulation workflow objects, with referenced actions as components.
 *
 * Parser contract: `parse(files, options)` returns
 * `{ workflows, components, services, properties, dependencies }`.
 */
export const githubActionsParser = {
  id: "github-actions",
  patterns: [".github/workflows/*.{yml,yaml}"],

  /**
   * @param {string[]} files Matched workflow file paths
   * @param {Object} options CLI options
   * @returns {{ workflows: Object[], components: Object[], services: Object[], properties: Object[], dependencies: Object[] }}
   */
  parse(files, options) {
    const workflows = [];
    const components = [];
    const dependencies = [];

    for (const f of files) {
      const result = parseWorkflowFile(f, options);
      workflows.push(...result.workflows);
      components.push(...result.components);
      dependencies.push(...result.dependencies);
    }

    return {
      workflows,
      components,
      services: [],
      properties: [],
      dependencies,
    };
  },
};
