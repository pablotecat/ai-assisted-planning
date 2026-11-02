# AI-assisted planning

Use these OpenCode agents to investigate code and requirements, refine user stories, and prepare technical plans with reviewed UI acceptance tests.

Start with `planificador` for story refinement, `arquitecto` for technical planning, or `investigador` for a specific research question. The agents read your sources and publish Markdown deliverables. They do not implement changes, run your test suite, or write to Jira. You create the resulting issues and tests in your task manager manually.

Backend and frontend specialists are not available yet. Architecture plans include reviewed UI test proposals and identify work that still needs those specialists. See the [current architecture contract](flujo-arquitectura.md) and [roadmap](docs/roadmap.md) for scope.

Agent names, configuration keys, and output filenames retain their Spanish names. Most agent instructions and linked project documents are in Spanish.

## Install in your project

Install the following tools and make them available in `PATH`:

- [OpenCode V2](https://opencode.ai/v2/docs/). The package pins `@opencode/plugin` to `2.1.2` in [package.json](package.json).
- [Agent Package Manager, APM](https://microsoft.github.io/apm/getting-started/installation/).
- [Node.js 24 or later](https://nodejs.org/en/download), with npm.
- [Git](https://git-scm.com/downloads), which APM uses to download packages.

Wait for active agent assignments to finish before installing or updating.

1. Open a terminal in the root of the project where you want to use the agents. Do not run setup from `.opencode/` or from this package's source repository.
2. Run the installation commands:

	```sh
	apm install pablotecat/ai-assisted-planning --target opencode
	node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
	```

3. Close OpenCode. Restart its background service:

	```sh
	opencode service restart
	```

4. Reopen OpenCode in the same project. Start a new session.

You do not need to clone this repository. APM deploys agents to `.opencode/agents/` and skills with their references to `.agents/skills/`. Setup registers the skills, installs npm dependencies and tools, and deploys plugins to `.opencode/plugins/`. It also copies the architecture contract to `.opencode/flujo-arquitectura.md`.

Setup preserves unrelated JSONC settings and comments. It sets `experimental.subagent_depth` to at least `4`, which the nested agent workflow needs.

Before reporting success, setup checks that the package plugins are active in a private OpenCode server. This check does not prove that Jira is authenticated or that a real assignment can complete.

## Connect Jira when you need it

Skip this step when you explicitly ask the agents to use local stories or documents only.

Use an existing Atlassian MCP connection named `jira` or `atlassian`. If you do not have one, run these commands from your project root:

```sh
opencode mcp add jira --url https://mcp.atlassian.com/v2/mcp
opencode mcp list
```

If the connection needs authentication, run `/mcps` in OpenCode. Select the server. Sign in. Confirm that the server appears as connected before requesting Jira data. See the [OpenCode MCP setup guide](https://opencode.ai/v2/docs/mcp-servers/) for connection options.

Keep a working connection under either supported name. The agents' permissions depend on those names. Setup rejects a known Atlassian endpoint under another alias, but it does not rename connections or authenticate them.

Do not store credentials or a `cloudId` in `.opencode/agent-settings.json`. OpenCode manages authentication, and the agents resolve the site through MCP.

## Set optional defaults

Leave `.opencode/agent-settings.json` unchanged to provide project details when an agent asks for them. To reuse defaults across assignments, edit that file:

- Set `proyecto.claveProyectoJira` to the Jira project key.
- Set `proyecto.repositorio` to the code workspace path.
- Set `proyecto.referencia` to the branch, tag, or commit that matters to your investigation.
- Set `proyecto.carpetasDocumentales` to the local document directories.
- Set `sesiones.carpetaRaiz` to a project-relative output directory. The default is `informes-agente/sesiones`.

Use [agent-settings.example.json](agent-settings.example.json) for the default structure and per-agent limits. Keep the existing key names. The [settings schema](tools/agent_settings.ts) validates their values.

For code investigations, install the `codegraph` CLI and prepare an index for the workspace you provide. The code reader does not build or update that index. Follow the [Codegraph query requirements](.apm/skills/consulta-codegraph/SKILL.md).

For document formats that require conversion, install [MarkItDown](https://github.com/microsoft/markitdown). Markdown and plain text need no converter. Follow the [document reading rules](.apm/skills/lectura-documental/SKILL.md) for supported conversions and their limits.

## Refine user stories

Select `planificador`. Explicitly request story refinement, replacing these sample keys with your own:

```text
Refine Jira stories APP-123 and APP-124.
Preserve the original acceptance criteria.
Identify unresolved decisions.
```

You can also supply a filter, a sprint, or a project scope. If the default Jira project is missing, `planificador` asks for its key and saves the confirmed value. A different project specified for one assignment applies to that assignment.

To work without Jira, attach your stories or provide their file paths and request refinement of those sources:

```text
Refine the stories in the files I attached. Use only these sources.
```

`planificador` preserves the originals and delegates drafts to `refinador`. When a question needs research, `refinador` delegates it to `investigador`, including questions about existing Jira requirements. New business decisions remain yours to make. Answer requests for missing sources, scope, or decisions before expecting the affected work to complete.

With saving enabled, inspect the returned paths for `Originales/`, refined stories, separate findings, and `sanity-check.md`. Corrections go into a new complete delivery, such as `entrega-02/`, without overwriting `entrega/`. Check that the review names the current version.

## Plan UI acceptance tests

Select `arquitecto`. Provide the paths to local, refined, reviewed stories. Identify the source version or confirm a label for the supplied content. Jira links can add context, but they do not replace the local story files.

Provide the test project path and any required code reference. For example:

```text
Plan UI acceptance tests for the reviewed local stories I attached.
Ask me for the test project path and code reference before analyzing the suite.
Identify tests to reuse, update, or create.
List any blockers.
```

Provide a knowledge directory if you have project conventions to add. Its absence alone does not block the analysis.

Let `arquitecto` delegate to `arquitecto-test`. Do not invoke that specialist directly. It reads the supplied test project and designs UI cases. Your team implements and runs the proposed tests. This step does not require Codegraph.

Inspect the returned `plan-implementacion.md` for coverage, reviewed cases, unresolved questions, and missing specialist capacity. Copy only approved, independent proposals into your task manager. Use the [architecture contract](flujo-arquitectura.md) to check the plan's scope and completion states.

## Investigate a specific question

Select `investigador`. Provide a concrete question. Include the code workspace, relevant reference, document directories, or Jira keys needed to answer it.

Confirm the scope when asked. `investigador` queries Jira directly, delegates implementation questions to `lector-codigo`, and delegates local document research to `lector-documentacion`. For a direct investigation, inspect `resumen-ejecutivo.md` for the answer and `informe-detallado.md` for evidence and limits.

Keep research scoped to the questions you need answered. Shared sources can support several questions, but each question retains its own result and missing evidence. If the prepared code workspace does not contain the relevant change, provide the required reference or corpus; the code reader does not switch branches or update its index. A missing source remains pending even when someone is assigned to retrieve it.

For a single Jira field, state the narrow request instead of asking for an investigation:

```text
Read Jira story APP-123 and return only its title.
```

`investigador`, `planificador`, and `arquitecto` handle this request before starting their full workflows.

## Inspect deliverables

Use the paths returned by the publishing tools. By default, saved files live under `informes-agente/sesiones/` in your host project. If saving is disabled or fails, read the content returned in chat and resolve the reported problem. Do not treat a claimed path as proof that a file was saved.

For refined stories and UI test proposals, check the review from `revisor` before treating the output as approved.

Consult the source for the output you need to check:

- Check `Originales/<ID>.md` with the [planner instructions](.apm/agents/planificador.agent.md) and [original publisher](tools/write_planning_originals.ts). Preserve the source text rather than applying the refined-story format.
- Check `<ID>.md`, `borrador.md`, `<ID>-incidencias.md`, and `incidencias-globales.md` with the [story format](.apm/skills/plantillas-entregables/references/historia.md), [acceptance criteria scenarios](.apm/skills/plantillas-entregables/references/criterios-aceptacion.md), [story criteria](.apm/skills/user-stories/SKILL.md), and [delivery publisher](tools/write_planning_deliverables.ts).
- Check specialist assignments with the [assignment format](.apm/skills/plantillas-entregables/references/encargo.md).
- Check technical blocks with the [task format](.apm/skills/plantillas-entregables/references/tarea.md).
- Check `borrador-tests.md` with the [UI case and matrix format](.apm/skills/plantillas-entregables/references/caso-test.md).
- Check `sanity-check.md` and `disputa.md` with the [review format](.apm/skills/plantillas-entregables/references/revision.md) and [review publisher](tools/write_review_documents.ts). Match the review to the exact delivery version.
- Check code `investigacion.md` with the [code reader instructions](.apm/agents/lector-codigo.agent.md) and [code report format](.apm/skills/consulta-codegraph/references/informe.md). Check document `investigacion.md` with the [document reader instructions](.apm/agents/lector-documentacion.agent.md).
- Check `conclusion.md` from delegated research with the [investigator instructions](.apm/agents/investigador.agent.md). For direct research reports, also consult the [report-pair publisher](tools/write_report_pair.ts).
- Check `plan-implementacion.md` and the handoff against the [architecture contract](flujo-arquitectura.md). Handoff content can remain in the response. It does not require a separate file.
- Use the generated `indice.md` to navigate the session. Consult [session_store.ts](tools/session_store.ts) for its publication and ownership checks.
- To create a glossary, request [domain-glossary](.apm/skills/domain-glossary/SKILL.md). Use its format for `Glosario.md`.
- To prepare, continue, close, or consult a meeting, explicitly request [meeting-coach](.apm/skills/meeting-coach/SKILL.md). Check its contract for `profile.md`, `prep.md`, `sources.md`, `outcome.md`, and `state.md`.

Use `domain-glossary` and `meeting-coach` with a host agent that has the required tools and write permissions. Loading a skill does not add permissions to this package's restricted agents.

### Retry or correct a publication

All five publishers accept an optional `operacion_id`. Updated agent flows assign it **before the first call** and retain it with the complete request in continuations and handoffs. Retry the same ID and request after an interruption or lost response, including after a location reload. The key is scoped to the verified root session, publishing session, and publisher type; it neither supplies identity nor grants access. Different content or metadata under that key is rejected. A deliberate producer correction uses a new ID and a complete new delivery. Planner originals remain publish-once; a new ID does not authorize overwriting reviewer reports either.

A confirmed result retains `guardado`, `rutas`, and `sesion`, and adds `operacion_id`, `artefacto_id`, and `hash_manifiesto`. The manifest hashes exact UTF-8 bytes and sorted session-relative file paths; registered reviewer reports are separate artifacts and do not alter the producer's hash. Verification detects changed producer bytes and unregistered files in a delivery directory. These records prove publication, not semantic approval. See the [publication and review rules](.apm/skills/operativa-comun/references/publicacion-revision.md) for the agent workflow.

If `indice.actualizado` is `false`, the delivery is already confirmed: retain it and retry the same operation to repair the index. A partial folder is not a confirmed delivery. Recovery reconciles prepared files under the session lock using file identity and hashes, not equal content alone. It requires hard links and verifiable filesystem identities on the same volume. Ambiguous ownership, including an interruption between creating a directory and saving its identity, produces an impediment rather than adopting or deleting it. An unfinished reservation must be resolved before a different operation can publish in that root.

Old literal calls remain valid. Without an ID each invocation remains a new attempt; the generated ID can be reused **if its response was received**, but cannot guarantee recovery of a lost response. With saving disabled the result remains exactly `guardado:false`, without new paths, control records, or recovery files. Existing files and narrative reviews remain unchanged and do not acquire inferred assignment IDs or approvals.

The first extension of a legacy `.control/<root-id>/state.json` preserves its exact bytes in `state.v0.json`; new control uses `schemaVersion: 1`, `artifacts`, and `operations` alongside the existing fields. Unknown versions are rejected without rewriting them. Keep the full control directory and its prepared payloads when backing up. Locks record host, PID, and a unique token: automatic recovery requires the same host and a demonstrably absent process; active, inaccessible, foreign-host, or unidentified owners are not removed by age. Recovered lock descriptors are retained for diagnosis. If recovery itself is interrupted or ownership cannot be proven, resolve it manually with assignments stopped rather than deleting locks blindly.

For rollback, finish or stop consumer assignments, retain a separate copy of the new control and **all** deliverables, and restore the previous package with its compatible control backup. Never run an old publisher against new control or delete new deliveries to make rollback fit. Deliveries created after the backup require manual reconciliation; the backup does not contain their records.

<a id="mapa-normativo-compartido"></a>

## Consult the shared rules

Use the installed skills by name rather than copying their rules into your project. In this repository, consult these sources:

- Read [consulta-jira](.apm/skills/consulta-jira/SKILL.md) for Jira selection, original retrieval, field queries, and evidence checks.
- Read [consulta-codegraph](.apm/skills/consulta-codegraph/SKILL.md) for code workspace, index, reference, and citation checks.
- Read [lectura-documental](.apm/skills/lectura-documental/SKILL.md) for document access and conversion.
- Load [operativa-comun](.apm/skills/operativa-comun/SKILL.md) for [source evidence](.apm/skills/operativa-comun/references/fuentes-evidencias.md), [configuration](.apm/skills/operativa-comun/references/configuracion.md), or [publication and review](.apm/skills/operativa-comun/references/publicacion-revision.md).
- Read [plantillas-entregables](.apm/skills/plantillas-entregables/SKILL.md) for output formats and [user-stories](.apm/skills/user-stories/SKILL.md) for story classification, writing, and acceptance criteria.

## Update an existing installation

Finish active assignments before updating. Close OpenCode. Closing the client does not stop the shared background service; stopping it affects every connected client. From the consuming project's root, run each command only after the previous one succeeds:

```sh
opencode service stop
apm update --yes --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
opencode service start
```

Reopen OpenCode. Start new sessions. Keep `.opencode/agent-settings.json` and `apm.lock.yaml`. Resolve reported customization conflicts rather than forcing replacement.

To continue an architecture assignment, provide the latest plan, exact deliverables, reviews, and handoff. Preserve source versions, decisions, assignment identifiers, available `sessionID` values, and consumed review attempts. A new session does not reset the same assignment's review limit.

<a id="migración-de-nombres"></a>

### Migrate older installations

If setup reports a plugin from an older installation, back up the named file outside both `.opencode/plugin/` and `.opencode/plugins/`. Move only that package-owned legacy file, then rerun setup. Leave unrelated plugins intact.

Use the current names from [.apm/agents/](.apm/agents/) instead of names prefixed with `agente-`. Setup migrates old settings keys and `especialistasPermitidos` values while preserving project settings and limits. If old and new keys conflict, resolve the reported values and rerun setup. See the [name migration checks](docs/names-migration-verification.md) for the mappings and compatibility details.

For an OpenCode V1 installation, migrate OpenCode before loading the updated plugins. Follow the [OpenCode V1-to-V2 migration guide](https://opencode.ai/v2/docs/migrate-v1).

## Diagnose setup or publication failures

If setup fails, resolve the reported dependency, plugin, settings, or alias error before starting an assignment. After fixing the problem, rerun setup from the host project root.

To repeat only the plugin activation check, run this command from that root:

```sh
node apm_modules/pablotecat/ai-assisted-planning/scripts/verify-opencode.mjs
```

This command uses a private server and leaves shared-service sessions intact. It checks plugin activation, not successful publication. After an update, restart the shared service and use a new session to check the returned publication result and saved file.

If an MCP catalog is empty just after a new session starts, confirm the connection with `opencode mcp list` and retry after it connects. Do not treat an empty startup catalog as proof that Jira is unavailable. For service and log checks, follow the [OpenCode troubleshooting guide](https://opencode.ai/v2/docs/troubleshooting).

The package's configuration and publishing tools are direct tools, not entries in the Code Mode catalog. An empty search there does not establish their absence. Distinguish a tool not yet called, a permission denial, an execution error, `guardado:false`, and a confirmed publication; see [tool interfaces and diagnostic evidence](.apm/skills/operativa-comun/references/configuracion.md#herramientas-y-autorizaciones). For rejected code-reader shell commands, follow the returned read-only alternative and [separate Git queries](.apm/skills/consulta-codegraph/SKILL.md#interfaz-de-consulta).

## Diagnose an execution

Use [session-diagnostics.mjs](scripts/session-diagnostics.mjs) to inspect an authorized session tree without exporting its conversation. Run it from the consuming project root, in a separate audit session. Replace the IDs and `START_MS`/`END_MS` with the actual session IDs and Unix milliseconds for the assignment:

```sh
node apm_modules/pablotecat/ai-assisted-planning/scripts/session-diagnostics.mjs --root ses_ROOT --from START_MS --to END_MS --audit-session ses_AUDIT --format markdown
```

The interval is `[from,to)`. The audit session and its descendants are excluded; it cannot be the diagnosed root. `--descendants all` is the default; use `none` or a comma-separated list of actual descendant IDs for a narrower selection. Repeat `--exclude-session ID` for other exclusions. The script emits only the report to stdout; `--format json` returns the full diagnostic data instead of the Markdown summary.

Live reads use `opencode api` discovery and authentication, then check the running server's `/openapi.json`. The script follows every session/message page, including archived children, deduplicates IDs, and keeps delegation separate from tool containment. Reads are not an atomic snapshot: prefer a finished assignment and keep the acquisition timestamps and version when comparing runs. `--page-size` accepts 1–200; lower it if a page exceeds the CLI's output buffer.

For an explicit server, add `--server URL` and use that server's existing CLI authentication context. Without this flag, the CLI can start the managed background service if none is available. For isolated checks, always use the URL returned by a private server; this script does not stop, restart, or reconfigure a service and does not read its database or credential files.

### Interpret coverage and units

- Every metric records a unit, coverage (`complete`, `partial`, or `unknown`), and provenance (`original-event`, `history-reconstruction`, or `agent-declaration`). Complete coverage refers to the selected history or supplied receipts, not proof that an external source was fully read. `null` means unavailable, not zero.
- Registered calls, internal operations, catalog searches, recovery requests, orchestration, and final operations are separate counts; these layers overlap and must not be added. Known container children replace the container recursively in the final count. A verified local `execute` remains one operation; unobserved expansion stays partial/unknown. None of these totals establishes an HTTP request count.
- `windowWall` is the requested window, not measured processing time. Tool execution and delegated waits use unions of intervals, clipped at the cutoff. `observedActivitySpan` is only the span of available tool/wait marks, not a reconstructed causal critical path. Concurrent assistant steps include provider waits and are not a count of active human assignments. Missing tool endpoints are censored and partial; a delay before execution has no inferred cause.
- Provider input/output/reasoning/cache tokens and reported USD stay separate. Usage from steps crossing the cutoff is not attributed to the window. `publisherArgumentCodeUnits` measures the UTF-16 length of JSON-serialized publisher arguments, including JSON syntax, not tokens, bytes, or saved document length. Declared reads, downloads, sources read, and characters remain separate, partial declarations.
- The V2 2.1.2 projected history does not expose internal Code Mode operations, the first provider event, delegated waits, or result notification/integration as dedicated fields. The adapter reports these absences rather than mining prompts, JavaScript, or prose. `firstProviderEvent` is the minimum available request-to-first-event delay; per-message values and result-delivery latencies are in JSON. A completed tool can still report a domain incident; a repeated prose mention does not create another incident.
- Output is constructed from permitted diagnostic fields: IDs, relationships, timestamps, roles, tool/model names, states, units, and counts. Prompts, titles, document arguments, file contents, headers, signed URLs, raw errors, and native/encrypted reasoning are not exported. Keep even sanitized IDs within the authorized audience.

### Replay a fixture or retained snapshot

From this source repository, this command is reproducible without a server or model:

```sh
node scripts/session-diagnostics.mjs --input test-support/session-diagnostics.json --root ses_root --from 1000 --to 1600 --audit-session ses_audit --format json
```

`--input` accepts a trusted JSON envelope `{ "schemaVersion": 1, "sessions": [...] }`. Each session uses the installed V2 projected shape plus its `messages` array. Optional `acquisition` records `version`, `source`, page counts and timestamps. This is an input snapshot, not a report previously emitted by the reducer. The script never saves raw history; arrange any retained input separately under your data-handling policy.

When independently retained receipts exist, optional `observations` supplies the missing boundaries. These are this script's input fields, **not native OpenCode fields**:

| Collection | Required identity and evidence |
|---|---|
| `operations` | `sessionID`, `messageID`, `id`, `name`, `time.created` and `provenance`; optional `parentID`, `layer` (`internal`, `catalog-search`, `recovery-request`, `orchestration`), `kind` (`container`, `local`), `expansion` (`complete`, `partial`, `unknown`), `time.ran`/`completed`, `status`. A receipt matching a registered ID annotates it rather than adding a call. |
| `incidents` | `sessionID`, `id`, `at`, `category` (`provider`, `permission`, `invocation`, `domain`, `unknown`), `provenance`, and `references` to existing session/message IDs; optional numeric `status` and same-session `retryOf`. Repeated incident IDs merge references; only explicit retry links merge attempts. |
| `timings` | `sessionID`, `id`, `kind`, `provenance`; `first-event` links a `messageID` and `firstEventAt`; `delegated-wait` links a direct `childSessionID` and `start`/`end`; `result-delivery` links that child and `resultAt`/`notifiedAt`/`integratedAt`. |
| `declarations` | `sessionID`, `id`, `at`, `metric` (`reads`, `downloads`, `sourcesRead`, `publisherCharacters`) and numeric `value`. Always exported as partial `agent-declaration`, never promoted to a receipt. |

Receipts must retain their real provenance; labeling an input `original-event` does not independently authenticate it. Domain errors are recognized automatically only from an explicit JSON tool result `{ "error": { "type": "domain", "status": 404 } }`; other result formats need a classified receipt. Permission/invocation types are recognized conservatively; unknown errors stay unknown. See the executable [diagnostic cases](session_diagnostics.test.ts) for nested containers, overlap, retries, partial data, and privacy checks.

For before/after comparisons, fix the case, source version, model, concurrency settings, interval boundaries and external-service conditions first. Retain sanitized outputs for each authorized repetition and report sample size and dispersion (for example median and range), separating external delays and missing fields. There is no comparable pre-change baseline supplied with this implementation; fixtures and imported transcripts do not replace one. Fewer calls alone establishes neither saved time nor improved quality.

## Contribute to the package

For changes to agents, skills, plugins, settings, or installation scripts, follow [AGENTS.md](AGENTS.md). It covers source ownership, runtime controls, consumer isolation, and repository checks.

For earlier results, consult the [verification reports](docs/). Use the versions and environments named in each report to judge whether its findings apply to your installation.

## View the workflow illustration

Open the [light illustration](docs/agentic-flow/index-light.html) or [dark illustration](docs/agentic-flow/index.html) in a browser. No server is required.

Treat both pages as illustrations, not evidence of installed capabilities. They include planned specialists, fictional counts, and example outputs. Read the [illustration controls and scope](docs/agentic-flow/README.md) before using them to explain the workflow.
