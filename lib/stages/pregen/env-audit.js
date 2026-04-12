import process from "node:process";

import { table } from "table";

import { isSecureMode, toCamel } from "../../helpers/utils.js";

const PERMISSION_FLAGS = [
  "--permission",
  "--allow-fs-read",
  "--allow-fs-write",
  "--allow-child-process",
  "--allow-addons",
  "--allow-worker",
  "--allow-net",
  "--allow-env",
  "--allow-wasi",
];

const CODE_EXECUTION_PATTERNS = [
  /--require\b|\b-r\b/i,
  /--eval\b|\b-e\b/i,
  /--print\b|\b-p\b/i,
  /--import\b/i,
  /--loader\b/i,
  /--inspect\b|--inspect-brk\b/i,
  /--test\b/i,
  /--env-file\b/i,
];

const DANGEROUS_VARS = [
  "NODE_PATH",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_NO_WARNINGS",
  "NODE_PENDING_DEPRECATION",
  "UV_THREADPOOL_SIZE",
];

export function auditEnvironment(env = process.env) {
  const findings = [];
  const nodeOptions = env.NODE_OPTIONS || env.CDXGEN_NODE_OPTIONS || "";
  const hasPermission = PERMISSION_FLAGS.some((f) =>
    new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      nodeOptions,
    ),
  );
  for (const varName of DANGEROUS_VARS) {
    if (env[varName] != null && env[varName] !== "") {
      findings.push({
        type: "environment-variable",
        variable: varName,
        severity: varName === "NODE_PATH" ? "high" : "medium",
        message: `${varName} is set and may affect module resolution or runtime behavior.`,
        mitigation: `Unset ${varName} before processing untrusted repositories.`,
      });
    }
  }
  if (nodeOptions) {
    for (const pattern of CODE_EXECUTION_PATTERNS) {
      if (pattern.test(nodeOptions)) {
        findings.push({
          type: "code-execution",
          variable: "NODE_OPTIONS",
          severity: "high",
          message: `NODE_OPTIONS contains code execution flag: ${pattern.source}`,
          mitigation: hasPermission
            ? "Ensure permission scope is minimal; code execution flags bypass sandbox boundaries."
            : "Remove flag or run with --permission to enable sandboxing.",
        });
      }
    }
    if (hasPermission && !env.CDXGEN_SECURE_MODE && !process.permission) {
      findings.push({
        type: "permission-misuse",
        variable: "NODE_OPTIONS",
        severity: "medium",
        message:
          "Permission flags detected but Node.js permissions API not active.",
        mitigation:
          "Use Node.js ≥20.0.0 with --permission flag, or remove permission flags.",
      });
    }
  }

  return findings;
}

export function displaySelfThreatModel(
  filePath,
  config,
  options,
  envAuditFindings = [],
) {
  const TLP = options.tlpClassification || "CLEAR";
  const risks = [];
  let riskScore = 0;

  const addRisk = (level, reason, category = "config") => {
    const scores = { low: 1, medium: 3, high: 5, critical: 8 };
    riskScore = Math.min(10, riskScore + scores[level]);
    risks.push({ level, reason, category });
  };

  // Config file risks
  if (Object.keys(config).length > 0) {
    addRisk("medium", "Config file loaded from current directory", "config");
    const sensitive = ["server-url", "api-key", "include-formulation"];
    for (const key of sensitive) {
      if (config[key] || config[toCamel(key)]) {
        addRisk(
          key === "api-key" ? "high" : "medium",
          `Config overrides '${key}'`,
          "config",
        );
      }
    }
  }

  // Remote submission risks
  if (options.serverUrl) {
    const isHttps = options.serverUrl.startsWith("https://");
    addRisk(
      isHttps ? "medium" : "critical",
      `SBOM submission to ${options.serverUrl}${!isHttps ? " (INSECURE: http)" : ""}`,
      "remote",
    );
    if (options.skipDtTlsCheck) {
      addRisk(
        "high",
        "TLS verification disabled for Dependency-Track.",
        "remote",
      );
    }
  }

  // Data exposure risks
  if (options.includeFormulation) {
    addRisk(
      "medium",
      "Formulation enabled: may include git metadata, emails, build environment.",
      "data",
    );
  }
  if (options.evidence || options.deep) {
    addRisk(
      "medium",
      "Deep/evidence mode: may execute build tools, access source code.",
      "data",
    );
  }
  if (options.installDeps) {
    addRisk(
      "high",
      "Auto-install dependencies: may execute package manager hooks.",
      "data",
    );
  }

  // Environment variable risks
  const envSensitive = [
    "CDXGEN_SERVER_URL",
    "CDXGEN_API_KEY",
    "CDXGEN_INCLUDE_FORMULATION",
  ];
  for (const env of envSensitive) {
    if (process.env[env]) {
      addRisk("low", `Sensitive value set via ${env}.`, "environment");
    }
  }

  // Integrate environment audit findings
  if (envAuditFindings?.length) {
    for (const f of envAuditFindings) {
      const categoryMap = {
        "code-execution": "runtime",
        "debug-exposure": "runtime",
        "environment-variable": "environment",
        "permission-misuse": "runtime",
      };
      addRisk(
        f.severity,
        `${f.variable}: ${f.message}`,
        categoryMap[f.type] || "config",
      );
    }
  }
  const nodeOptions = process.env.NODE_OPTIONS || "";
  const riskLevel =
    riskScore >= 8
      ? "CRITICAL"
      : riskScore >= 6
        ? "HIGH"
        : riskScore >= 3
          ? "MEDIUM"
          : "LOW";

  const riskColor = {
    CRITICAL: "\x1b[1;31m",
    HIGH: "\x1b[1;33m",
    MEDIUM: "\x1b[1;36m",
    LOW: "\x1b[1;32m",
  };
  const reset = "\x1b[0m";
  const tlpGuidance = {
    CLEAR: "May be shared publicly. No restrictions.",
    GREEN: "Limited to community/peers. Not for public posting.",
    AMBER: "Limited to organization + trusted partners. Requires NDA.",
    AMBER_AND_STRICT: "Organization only. No external sharing.",
    RED: "Eyes only. Not for distribution. Destroy after use.",
  };
  const headerData = [
    ["TLP Classification", `${TLP} — ${tlpGuidance[TLP]}`],
    ["Risk Score", `${riskScore}/10`],
    ["Risk Level", `${riskColor[riskLevel]}${riskLevel}${reset}`],
  ];
  const headerConfig = {
    header: {
      alignment: "center",
      content: "cdxgen Threat Model Report\nGenerated with \u2665 by cdxgen",
    },
    columns: [{ width: 30, alignment: "right" }, { width: 70 }],
    columnDefault: { wrapWord: true },
  };

  console.log(table(headerData, headerConfig));
  if (risks.length > 0) {
    const findingsData = [["#", "Severity", "Category", "Finding"]];
    risks.forEach(({ level, reason, category }, i) => {
      const severityColor =
        level === "critical"
          ? "\x1b[1;31m"
          : level === "high"
            ? "\x1b[1;33m"
            : level === "medium"
              ? "\x1b[1;36m"
              : "\x1b[1;32m";
      findingsData.push([
        `${i + 1}`,
        `${severityColor}${level.toUpperCase()}${reset}`,
        category,
        reason,
      ]);
    });
    const findingsConfig = {
      header: {
        alignment: "center",
        content: `Findings (${risks.length})`,
      },
      columns: [
        { width: 5, alignment: "right" },
        { width: 12 },
        { width: 15 },
        { width: 68 },
      ],
      columnDefault: { wrapWord: true },
    };
    console.log(table(findingsData, findingsConfig));
  } else {
    const noFindingsData = [
      [
        `${riskColor[riskLevel]}✅ No high-risk configuration detected.${reset}`,
      ],
    ];
    const noFindingsConfig = {
      header: { alignment: "center", content: "\n📋 Findings" },
      columns: [{ width: 100, alignment: "center" }],
    };
    console.log(table(noFindingsData, noFindingsConfig));
  }
  const configData = [
    ["Setting", "Value"],
    ["Project", options.projectName || filePath],
    ["Types", options.projectType?.join(", ") || "auto-detect"],
    ["Path", filePath],
    ["Output", options.output],
    ["Remote Submission", options.serverUrl || "none"],
    ["Include Formulation", options.includeFormulation ? "yes" : "no"],
    ["Evidence Mode", options.evidence ? "yes" : "no"],
    ["Install Dependencies", options.installDeps ? "yes" : "no"],
    ["NODE_OPTIONS", nodeOptions || "(not set)"],
  ];
  const effConfigTableConfig = {
    header: { alignment: "center", content: "Effective Configuration" },
    columns: [{ width: 25 }, { width: 75 }],
    columnDefault: { wrapWord: true },
  };
  console.log(table(configData, effConfigTableConfig));
  const recommendations = [];
  if (["AMBER", "AMBER_AND_STRICT", "RED"].includes(TLP)) {
    recommendations.push([
      "High",
      "Avoid --include-formulation unless required",
    ]);
    if (TLP === "RED") {
      recommendations.push(["Critical", "Run in isolated container/VM"]);
      recommendations.push([
        "Critical",
        "Disable automatic Dependency-Track submission",
      ]);
    }
  }
  if (riskScore >= 5) {
    recommendations.push(["High", "Review findings above before proceeding"]);
    recommendations.push([
      "Medium",
      "Consider --no-install-deps for untrusted code",
    ]);
  }
  if (envAuditFindings.some((f) => f.type === "code-execution")) {
    recommendations.push([
      "High",
      "Remove --require/--eval from NODE_OPTIONS for untrusted repos",
    ]);
  }
  if (envAuditFindings.some((f) => f.variable === "NODE_PATH")) {
    recommendations.push([
      "High",
      "Unset NODE_PATH to prevent module resolution poisoning",
    ]);
  }
  if (/--permission\b/i.test(nodeOptions)) {
    recommendations.push([
      "Medium",
      "Audit --allow-* scopes; prefer absolute paths over wildcards",
    ]);
  }
  recommendations.push([
    "Low",
    "Quick hardening: cdxgen -t js . --no-install-deps --output ./sbom.json",
  ]);
  const recommendationsData = [["Priority", "Action"]];
  recommendations.forEach(([priority, action]) => {
    const priorityColor =
      priority === "Critical"
        ? "\x1b[1;31m"
        : priority === "High"
          ? "\x1b[1;33m"
          : priority === "Medium"
            ? "\x1b[1;36m"
            : "\x1b[1;32m";
    recommendationsData.push([`${priorityColor}${priority}${reset}`, action]);
  });
  const recommendationsConfig = {
    header: {
      alignment: "center",
      content: `Recommendations for TLP:${TLP}`,
    },
    columns: [{ width: 12 }, { width: 88 }],
    columnDefault: { wrapWord: true },
  };

  console.log(table(recommendationsData, recommendationsConfig));
  if (isSecureMode && riskScore >= 5) {
    const abortData = [
      [
        `${riskColor[riskLevel]}🚫 SECURE MODE: High-risk config detected. Aborting.${reset}`,
      ],
    ];
    const abortConfig = {
      columns: [{ width: 100, alignment: "center" }],
    };
    console.log(table(abortData, abortConfig));
    process.exit(1);
  }
}
