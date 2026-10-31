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

## Contribute to the package

For changes to agents, skills, plugins, settings, or installation scripts, follow [AGENTS.md](AGENTS.md). It covers source ownership, runtime controls, consumer isolation, and repository checks.

For earlier results, consult the [verification reports](docs/). Use the versions and environments named in each report to judge whether its findings apply to your installation.

## View the workflow illustration

Open the [light illustration](docs/agentic-flow/index-light.html) or [dark illustration](docs/agentic-flow/index.html) in a browser. No server is required.

Treat both pages as illustrations, not evidence of installed capabilities. They include planned specialists, fictional counts, and example outputs. Read the [illustration controls and scope](docs/agentic-flow/README.md) before using them to explain the workflow.
