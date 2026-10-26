# Repository instructions

Apply these instructions when changing the `ai-assisted-planning` source package. To use the installed planning agents, follow [README.md](README.md). Their role-specific limits do not restrict repository development.

## Edit the source, not installed copies

Change role instructions in `.apm/agents/` and skill rules in `.apm/skills/`. Treat `apm_modules/`, `.opencode/`, `.agents/`, and `build/` as installed or test copies, not package sources.

Preserve Spanish agent identifiers, configuration keys, and output filenames. Keep the language of existing instructions unless the task requests a translation.

Before editing a rule, find its owner:

- For story criteria, read [user-stories](.apm/skills/user-stories/SKILL.md). For output formats, read [plantillas-entregables](.apm/skills/plantillas-entregables/SKILL.md). Keep detailed rules in their references. Role files define mission, routing, sequence, and completion criteria.
- For evidence, configuration precedence, or publication and review rules, read the relevant reference linked by [operativa-comun](.apm/skills/operativa-comun/SKILL.md). Change that reference rather than repeating the rule across roles.
- For architecture scope or continuation, read [flujo-arquitectura.md](flujo-arquitectura.md). Compare implemented capabilities with [docs/roadmap.md](docs/roadmap.md) before changing claims of availability.
- For specialized output formats, use the [deliverable catalog](README.md#inspect-deliverables) to find their owner. Keep that catalog reachable by the distributed roles.

## Preserve runtime controls

For permission or delegation changes, inspect both the affected role and [plugin/agent-session.ts](plugin/agent-session.ts). Prompt text does not replace runtime enforcement.

For Jira access changes, read [consulta-jira](.apm/skills/consulta-jira/SKILL.md) and [jira_access.test.ts](jira_access.test.ts). Preserve read-only access under both supported MCP aliases. Roles that use Code Mode need `execute: allow`. Keep broad denials before specific exceptions.

For publication changes, inspect [tools/session_store.ts](tools/session_store.ts) and [session_publication.test.ts](session_publication.test.ts). Keep the identity resolver bound to the plugin instance that registers the tools. Shared module state can break publication after a reload. Verify saved content before and after a real OpenCode location reload.

## Preserve consumer installations

For settings changes, check [tools/agent_settings.ts](tools/agent_settings.ts), [agent-settings.example.json](agent-settings.example.json), and [scripts/migrate-agent-settings.mjs](scripts/migrate-agent-settings.mjs) together. Verify compatibility with existing settings as well as new defaults.

For installation changes, inspect [scripts/setup-opencode.mjs](scripts/setup-opencode.mjs) and [migration.test.ts](migration.test.ts). Preserve unrelated consumer settings, JSONC comments, dependencies, and customized files. Keep legacy-file conflicts explicit rather than overwriting them. The source `plugin/` directory deploys to `.opencode/plugins/`, not `.opencode/plugin/`.

Test installation in a separate consumer fixture. Setup rejects this source repository as its host. Keep the user's shared OpenCode service and credentials untouched during tests. Use private servers and isolated consumer configuration as in [test-support/opencode.mjs](test-support/opencode.mjs).

## Run checks for the changed behavior

Use the tools listed in the [installation prerequisites](README.md#install-in-your-project). Run commands from the repository root. Install development dependencies with `npm install`. The repository does not track `package-lock.json`, so `npm ci` requires a local lockfile first.

For changes to runtime code, settings, permissions, installation, or role behavior, run the root suite:

```sh
node --test *.test.ts
```

For documentation-only changes, check local links, the deliverable catalog, and the architecture contract:

```sh
node --test --test-name-pattern 'formatos y catálogo|consumidores comparten|plan integrado' plantillas_entregables.test.ts
```

For illustration changes, read [docs/agentic-flow/README.md](docs/agentic-flow/README.md) for synchronization, build, and browser checks. Run the model tests:

```sh
node --test docs/agentic-flow/model.test.mjs
```

Before finishing, run `git diff --check`. Report the checks actually run and any failures, skips, or checks left unrun. Distinguish local regressions from live Jira, Codegraph, and model-driven validation.

## Keep documentation in its intended place

Keep installation and usage in `README.md`, repository maintenance here, and operational rules in their existing skill or contract. Update links when moving content. Preserve inbound anchors used by other documents.

Treat verification reports in `docs/` as records of their named versions and environments. Record new results separately from historical results. Leave local diagnostics and generated test artifacts intact unless the task requires changing them.
