# Planificación asistida por agentes

Agentes para investigar código y documentación local, refinar historias desde Jira o fuentes aportadas por el usuario, preparar su planificación técnica y revisar las entregas.

| Agente | Responsabilidad |
|---|---|
| `agente-codigo` | Investiga un workspace indexado con Codegraph. |
| `agente-documentacion` | Investiga historias Jira y documentos locales y cita sus fuentes. |
| `agente-coordinador` | Consulta Jira directamente y contrasta investigación de código y documentación. |
| `agente-planificador` | Copia requisitos, coordina refinadores y publica historias. |
| `agente-refinamiento` | Redacta borradores trazables por historia. |
| `agente-arquitecto` | Lee historias locales revisadas, prepara encargos técnicos e integra bloques y bloqueos. |
| `agente-arquitecto-test` | Diseña casos funcionales UI y cambios en tests relacionados; lo invoca el arquitecto. |
| `agente-revisor` | Revisa versiones publicadas y documenta hallazgos. |

## Explorar el flujo

Abre la [figura interactiva en tema claro](docs/agentic-flow/index-light.html) o [en tema oscuro](docs/agentic-flow/index.html): dos cadenas de montaje muestran el recorrido funcional **ideas → Historias Refinadas → tareas**, con consultas a Fuente de Verdad, reparto por especialidad, suministro de código y revisiones. [Controles y construcción](docs/agentic-flow/README.md).

## Instalación en OpenCode

Necesitas [OpenCode](https://opencode.ai/docs/), [APM](https://microsoft.github.io/apm/getting-started/installation/), [Node.js 24 o posterior](https://nodejs.org/en/download) y [Git](https://git-scm.com/downloads) (APM lo utiliza para descargar paquetes). Abre una terminal en la **carpeta raíz del proyecto** donde usarás los agentes, no en `.opencode/`, y ejecuta estos dos comandos:

```sh
apm install pablotecat/ai-assisted-planning --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
```

APM instala los agentes y skills. El segundo comando configura sus plugins, herramientas, contrato de arquitectura y dependencias npm para OpenCode; no necesitas descargar este repositorio. Después abre o reinicia OpenCode en esa misma carpeta y llama a `agente-planificador` o `agente-arquitecto` según el flujo.

**Actualizar:** desde la misma carpeta, ejecuta:

```sh
apm update --yes --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
```

Tus ajustes se conservan en `.opencode/agent-settings.json`. Puedes dejar ese archivo como está: el agente pedirá la clave del proyecto Jira o las rutas de código y documentos cuando las necesite.

Para consultas de código, instala Codegraph e indexa el proyecto. Para convertir otros formatos de documentos, instala MarkItDown.

### Conexión Jira y alias MCP

Conecta y autentica [Atlassian MCP](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/) en [OpenCode](https://opencode.ai/docs/mcp-servers/) con **`jira` o `atlassian`**. Ambos alias están admitidos; basta uno. Por ejemplo, combina este bloque con tu `opencode.json` existente:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jira": {
      "type": "remote",
      "url": "https://mcp.atlassian.com/v2/mcp",
      "enabled": true
    }
  }
}
```

Ejecuta `opencode mcp auth jira` (o `opencode mcp auth atlassian`) y `opencode mcp list`: el servidor debe aparecer conectado. Conserva una conexión existente funcional con cualquiera de los dos alias. La autenticación y el sitio se resuelven en OpenCode; `agent-settings.json` guarda la clave del proyecto, no las credenciales ni el `cloudId`.

OpenCode forma los nombres `<alias>_<herramienta>`. Coordinador, Planificador, Arquitecto, Refinamiento, Documentación y Revisor deniegan por defecto y permiten, para ambos alias, las familias de lectura `get*`, `list*`, `search*`, `lookup*` y la operación exacta `fetch`. Esto incluye `search` y `searchJiraIssuesUsingJql`; `fetch` requiere un identificador **ARI** recuperado de una fuente verificada, no una clave como `ES-1228`. Los cinco primeros también admiten `atlassianUserInfo`; el Revisor no lo necesita. Código y Arquitecto Test mantienen su contrato sin acceso Jira.

Los permisos de `discover` y `executeRead` mantienen compatibilidad con servidores que publican ese catálogo diferido. Son opcionales: usa solo las herramientas que publique tu conexión. El catálogo depende de la versión y de las políticas del servidor; la documentación de Atlassian describe las capacidades, pero no demuestra las disponibles en tu sesión. Las creaciones, ediciones, comentarios, transiciones, registro de trabajo, `executeWrite` y `executeDestructive` siguen denegados. En los agentes, las denegaciones amplias preceden a las excepciones: OpenCode aplica la **última regla coincidente**. No añadas un permiso general `jira_*: allow` ni `atlassian_*: allow`.

La instalación y actualización conservan el alias elegido: APM distribuye los permisos de `.apm/agents/`; `setup-opencode.mjs` consulta la configuración efectiva de OpenCode, incluidos los ajustes globales y JSONC, rechaza un endpoint Atlassian conocido bajo un alias distinto y avisa si Jira sigue pendiente. No renombra conexiones ni autentica automáticamente. Una instalación de componentes no equivale a una conexión Jira comprobada. Cierra y reinicia OpenCode después de instalar o actualizar agentes.

El acceso Jira del Coordinador es independiente de `agentes.coordinador.especialistasPermitidos`, que limita sus delegaciones. Solo Coordinador y Documentación pueden invocar a `agente-documentacion`. Las fuentes vigentes de agentes son `.apm/agents/`; las copias externas `agents-old/` y `old/` y los antiguos prompts de recreación son históricos y no forman parte de esta distribución. En particular, la antigua prohibición de que el Coordinador consulte Jira no pertenece al contrato actual.

Coordinador, Planificador y Arquitecto comparten `agent_settings`: pueden leer el JSON y completar, tras confirmación, los campos vacíos `proyecto.claveProyectoJira`, `proyecto.repositorio`, `proyecto.referencia` y `proyecto.carpetasDocumentales`. El guardado conserva los valores ya informados. Las herramientas específicas son exclusivas de su agente:

| Agente | Herramienta propia | Ajustes en `.opencode/agent-settings.json` |
|---|---|---|
| Coordinador | `coordinator_defaults` | `agentes.coordinador` |
| Planificador | `planning_settings` | `agentes.planificador` |
| Arquitecto | `architecture_settings` | `agentes.arquitecto` |

## Uso

**Consulta puntual:** «Lee la historia Jira ES-1228 y dime su título, no hagas nada más que decirme su título» consulta únicamente `summary` y devuelve su valor literal. La clave delimita la lectura, sin seleccionar proyecto o sprint ni configurar valores por defecto. Se reutilizan el sitio y `cloudId` verificados; solo se pide la información de acceso indispensable que falte. La consulta termina con la respuesta, sin refinamiento, originales, publicaciones, revisión ni escrituras de configuración. Coordinador, Arquitecto y Documentación aplican la misma proporcionalidad para consultas compatibles con su rol.

**Refinamiento explícito:** `agente-planificador` busca directamente en Jira las historias del proyecto configurado en `proyecto.claveProyectoJira` de `.opencode/agent-settings.json`. Si está vacío, pide la clave del proyecto al usuario y la guarda para futuros encargos. Puedes indicar claves de historias, un filtro o un sprint para acotar la revisión; un proyecto distinto indicado para un encargo se usa en ese encargo. Las configuraciones anteriores sin este campo se leen como proyecto pendiente de indicar. El planificador recupera el contenido íntegro, publica los originales y delega el refinamiento.

También puedes aportar texto, archivos u otro formato y pedir explícitamente que revise esas historias: esa petición tiene prioridad y puede ejecutarse sin configurar Jira. El planificador conserva copias en `Originales/`, delega borradores, publica historias e incidencias en `entrega/` y pide al revisor un `sanity-check.md` de esa versión. Las correcciones se publican en `entrega-02/`, etc. Los entregables se guardan en `sesiones.carpetaRaiz` bajo la raíz del proyecto anfitrión (por defecto `informes-agente/sesiones/`). Puedes invocar directamente al coordinador o a los especialistas para consultas independientes.

Para el flujo complementario, selecciona `agente-arquitecto` y facilita rutas de historias locales refinadas y revisadas. Conserva los identificadores de las historias; si no los tienen, asigna etiquetas locales estables. Para Test, aporta también la ruta de su proyecto y la referencia de código que deba analizarse cuando importe. Puedes indicar una carpeta de conocimiento con convenciones, nomenclatura, buenas prácticas y peculiaridades del proyecto: en esta iteración es complementaria, se consulta en solo lectura y su ausencia no bloquea por sí sola el análisis. Si falta una información indispensable, queda pendiente el trabajo afectado. Su escritura se definirá más adelante.

El contrato está en [flujo-arquitectura.md](./flujo-arquitectura.md), instalado también en `.opencode/flujo-arquitectura.md` del proyecto anfitrión. `agente-arquitecto` es el punto de entrada; delega en `agente-arquitecto-test` y publica un `plan-implementacion.md` versionado con cobertura, casos revisados, pendientes y bloqueos. El especialista lee directamente el proyecto de Test y diseña únicamente casos UI: reutiliza o actualiza los relacionados con la historia, propone nuevos casos y matrices fundamentadas, e indica su encaje técnico. Las mejoras de código o de la suite requieren una petición concreta de la historia. Backend, Frontend y el proveedor siguen pendientes; el plan integrado conserva la cobertura global parcial. Los borradores se destinan a la creación manual de subtareas y tests en el gestor elegido, incluido Jira. Estos archivos se generan al ejecutar el flujo con historias concretas; no son documentos precreados en este repositorio.

`agentes.arquitecto.maxIntentosRevision` configura las revisiones totales por entrega de especialista, incluida la inicial (por defecto 3); `guardarEntregablesEnSesion` controla su publicación. Las configuraciones anteriores sin el bloque `arquitecto` se leen con los valores por defecto sin reescribirlas. Para continuar un encargo, aporta el último plan y su handoff: conservan versiones, identificadores e intentos consumidos.

`agentes["arquitecto-test"].guardarEntregablesEnSesion` controla la publicación de Test (por defecto `true`, también para configuraciones anteriores). Cada versión de `borrador-tests.md` se revisa mediante el revisor común, con el informe guardado junto al archivo exacto. Si se desactiva el guardado de Test o del revisor, o falla una publicación, se devuelve el borrador con un bloqueo de revisión. Una solicitud de revisión enviada consume un intento aunque falle; el historial documental conserva entregas, informes, resultados y contadores. El límite es una regla del flujo, no un contador automático del publicador.

`tools/session_store.ts` asigna carpetas según la sesión verificada por `plugin/agent-session.ts`, rechaza archivos ajenos y no sobrescribe publicaciones. El adaptador de OpenCode proporciona la identidad de cada llamada; una integración nueva necesitará su propio adaptador y fuentes documentadas.

Para ejecutar las comprobaciones: `node --test *.test.ts` (Node.js 24 o posterior).

Las regresiones Jira verifican permisos con la CLI real de OpenCode y distribución con APM en consumidores temporales; requieren ambas CLI en `PATH`. Consulta el [alcance de las pruebas y la validación funcional pendiente con Jira](docs/jira-access-verification.md).
