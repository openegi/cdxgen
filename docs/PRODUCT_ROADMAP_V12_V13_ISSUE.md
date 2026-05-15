# Product roadmap: make cdxgen the universal transparency engine for software, runtime, hardware, crypto, and AI

## Summary

cdxgen already spans far more than classic SBOM generation. It covers SBOM, OBOM, HBOM, CBOM, SaaSBOM, CDXA, signing, verification, validation, predictive audit, AI/MCP inventory, and SPDX export.

The next product step is to package these capabilities into a clearer product story and roadmap that serves multiple personas:

- developers
- AppSec
- SOC / incident response
- compliance / GRC
- platform / SRE
- AI platform teams
- software publishers

This issue proposes a bold product direction plus a two-phase roadmap:

- **v12:** productize the current moat
- **v13:** expand cdxgen from generator to transparency platform

## Problem statement

cdxgen has strong and differentiated capabilities, but its value is still easier to understand for power users than for broader product and buyer audiences.

The market is moving from:

- "generate an SBOM"

to:

- "prove what is shipped, running, exposed, trusted, and evidenced"

At the same time, buyer needs are shifting because of:

- CRA and SCVS-driven compliance expectations
- demand for signed and explainable BOM delivery
- growth in runtime and host posture use cases
- increasing need to inventory AI agents, MCP servers, and model-facing integrations
- stronger demand for drift and change visibility instead of point-in-time output only

## Vision

Position cdxgen as the **universal transparency engine** for digital systems.

cdxgen should become the open-source standard for answering:

- What do we ship?
- What is actually running?
- What is exposed or trusted?
- What evidence supports those claims?

## Explicit non-goals

Do **not** use this roadmap for:

- vulnerability database expansion or SCA platform work already handled by OWASP dep-scan
- expanding atom / reachability language coverage, which belongs in a separate roadmap discussion

## Why now

- **Regulatory pressure:** CRA timelines are increasing demand for trustworthy BOM delivery workflows.
- **Buyer expectations:** teams want evidence, signatures, validation, and explainability rather than raw package lists.
- **AI supply chain shift:** MCP and AI agent inventory are emerging needs with little established tooling.
- **Competitive differentiation:** cdxgen already has unique breadth across OBOM, HBOM, CBOM, SaaSBOM, predictive audit, and AI inventory.

## Strategic themes

- **Persona-first productization** over feature sprawl
- **Evidence-backed transparency** over flat inventory
- **Operational workflows** over one-time generation
- **Cross-domain relationships** over isolated BOM documents
- **Signed, reviewable delivery** over raw output

## v12 roadmap: productize the moat

### 1. Persona-first workflows

Deliver opinionated workflows and entry points for key personas so users can adopt cdxgen without needing to learn every command first.

**Sub-tasks**

- [ ] Define the primary persona journeys for developers, AppSec, compliance, SOC, platform, AI, and publishers
- [ ] Standardize recommended command flows and profile combinations per persona
- [ ] Create persona-specific documentation landing pages and quick starts
- [ ] Identify which existing commands should be grouped into guided workflows

### 2. Compliance delivery kit

Package cdxgen as a cleaner generate → validate → sign → verify → export workflow for regulated delivery.

**Sub-tasks**

- [ ] Define a CRA and SCVS-focused delivery workflow using existing cdxgen commands
- [ ] Add issue-ready documentation and examples for compliance teams and publishers
- [ ] Standardize report and output expectations for customer-deliverable BOM packages
- [ ] Clarify signing and verification guidance for regulated use cases

### 3. Drift, diff, and change-review workflows

Make cdxgen useful for ongoing review, not only one-time generation.

**Sub-tasks**

- [ ] Define a roadmap for release-to-release SBOM diff workflows
- [ ] Define a roadmap for OBOM and HBOM drift review workflows
- [ ] Define a roadmap for CBOM and AI/MCP inventory drift workflows
- [ ] Identify which comparisons should produce human-readable review summaries

### 4. AI and MCP inventory productization

Turn current MCP and AI skill inventory into a clearer product story with stronger review and policy workflows.

**Sub-tasks**

- [ ] Define the product narrative for AI inventory, MCP inventory, and AI agent review
- [ ] Prioritize stronger policy packs and review outputs for AI-facing BOMs
- [ ] Improve documentation for AI security, trust, and credential-exposure review
- [ ] Define examples and demos for AI platform teams

### 5. SaaSBOM and service evidence workflow

Make service discovery and evidence collection more consumable for SaaS and cloud-native teams.

**Sub-tasks**

- [ ] Clarify the SaaSBOM workflow and its target personas
- [ ] Improve documentation around service evidence, outbound dependencies, and inferred API context
- [ ] Define better review outputs for service-centric BOMs
- [ ] Identify the minimum “service transparency” workflow that should feel turnkey in v12

### 6. Portfolio and batch operations

Improve cdxgen for governance and platform teams working across many BOMs instead of one repo at a time.

**Sub-tasks**

- [ ] Define batch workflows for validation, audit, signing verification, and reporting
- [ ] Identify portfolio summary use cases and expected output shapes
- [ ] Prioritize multi-BOM operational workflows for governance teams
- [ ] Define how batch results should map to CI and broader reporting systems

### 7. Documentation and discoverability overhaul

Reduce friction caused by the current discoverability gap.

**Sub-tasks**

- [ ] Reorganize documentation around user journeys instead of command-by-command discovery
- [ ] Add clearer cross-links between SBOM, OBOM, HBOM, CBOM, SaaSBOM, AI, audit, and validation docs
- [ ] Add product-level comparison and positioning pages for different personas
- [ ] Create a concise “why cdxgen” narrative aligned to the new vision

## v13 roadmap: expand into a transparency platform

### 1. Continuous transparency workflows

Evolve cdxgen from point-in-time execution into recurring operational workflows.

**Sub-tasks**

- [ ] Define recurring inventory workflows for release, runtime, and host collection
- [ ] Define event-driven review points for signed delivery and drift inspection
- [ ] Prioritize which recurring workflows should become first-class product patterns
- [ ] Identify the reporting and storage expectations for repeated runs

### 2. Cloud and platform topology visibility

Strengthen the platform engineering and cloud runtime story beyond current repo- and image-centric workflows.

**Sub-tasks**

- [ ] Define the target cloud and platform visibility model for v13
- [ ] Identify the highest-value topology relationships for services, workloads, and deployments
- [ ] Prioritize the personas that benefit most from platform topology output
- [ ] Define how this roadmap complements rather than duplicates existing container and host flows

### 3. BOM relationship intelligence

Make cross-domain relationships a first-class product capability.

**Sub-tasks**

- [ ] Define the most important relationship types across software, services, runtime, hardware, crypto, and AI
- [ ] Prioritize which relationships need better summaries and review outputs
- [ ] Define how cross-domain relationships should be explained to users
- [ ] Identify which relationship workflows best demonstrate cdxgen differentiation

### 4. Signed delivery and attestable release workflows

Make signed BOM delivery a complete publisher story.

**Sub-tasks**

- [ ] Define a first-class release workflow for signed and attestable BOM delivery
- [ ] Clarify the target personas for multi-party signing and verification
- [ ] Identify documentation and UX gaps in the current signing story
- [ ] Prioritize integration guidance for customer-facing software delivery workflows

### 5. CBOM for crypto modernization and PQC readiness

Position CBOM as a practical program tool for cryptographic inventory and migration planning.

**Sub-tasks**

- [ ] Define the core CBOM user journeys for crypto inventory and migration planning
- [ ] Align CBOM positioning with audit, validation, and reporting workflows
- [ ] Identify the most valuable reporting outputs for crypto modernization programs
- [ ] Prioritize roadmap items that strengthen CBOM as a differentiated cdxgen capability

### 6. Executive and reviewer-friendly outputs

Support non-CLI personas with more reviewable and shareable outputs.

**Sub-tasks**

- [ ] Define the most important reviewer-facing and executive-facing output formats
- [ ] Prioritize concise summaries for compliance, product security, and procurement audiences
- [ ] Identify where detailed evidence should be preserved versus summarized
- [ ] Define output expectations for issue review, release review, and audit review workflows

### 7. Ecosystem integrations

Strengthen cdxgen as the preferred producer feeding larger transparency and governance systems.

**Sub-tasks**

- [ ] Prioritize integration workflows for Dependency-Track, GUAC, SARIF, and CI systems
- [ ] Define the minimum integration stories needed for enterprise adoption
- [ ] Identify where cdxgen should provide opinionated guidance instead of broad optionality
- [ ] Align integration guidance with the persona-first product flows from v12

## Success criteria

- cdxgen is easier to explain in one sentence and one workflow per persona
- regulated teams can adopt a clear compliance delivery workflow
- AI platform teams can use cdxgen as a credible AI and MCP inventory solution
- platform and SOC teams can use cdxgen for repeatable runtime and host transparency workflows
- publishers can deliver signed, reviewable BOM packages with confidence
- cdxgen is recognized as broader than SBOM generation and distinct from SCA tools

## Product positioning summary

cdxgen should not try to win by becoming a bigger vulnerability database or a generic SCA platform.

cdxgen should win by becoming the best open-source product for:

- software transparency
- runtime transparency
- hardware transparency
- cryptographic transparency
- AI and MCP transparency
- evidence-backed and signed BOM delivery

## Proposed next step

- [ ] Review and refine this roadmap with maintainers
- [ ] Split approved v12 items into implementation issues
- [ ] Split approved v13 items into discovery and design issues
- [ ] Decide which roadmap items should be tracked publicly versus internally
