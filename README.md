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

Para consultar Jira, conecta y autentica [Atlassian MCP](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/) en [OpenCode](https://opencode.ai/docs/mcp-servers/) con el nombre `atlassian`. Coordinador, Arquitecto, Refinamiento, Documentación y Revisor tienen permisos `atlassian_get*`, `atlassian_list*`, `atlassian_search*`, `atlassian_lookup*`, `atlassian_discover` y `atlassian_executeRead` para consultas directas de solo lectura. El acceso directo del Coordinador y del Arquitecto es independiente de `agentes.coordinador.especialistasPermitidos`, que limita las delegaciones. El Planificador encarga sus consultas Jira a Documentación. La conexión y autenticación se configuran en OpenCode; `agent-settings.json` conserva la clave del proyecto.

Coordinador, Planificador y Arquitecto comparten `agent_settings`: pueden leer el JSON y completar, tras confirmación, los campos vacíos `proyecto.claveProyectoJira`, `proyecto.repositorio`, `proyecto.referencia` y `proyecto.carpetasDocumentales`. El guardado conserva los valores ya informados. Las herramientas específicas son exclusivas de su agente:

| Agente | Herramienta propia | Ajustes en `.opencode/agent-settings.json` |
|---|---|---|
| Coordinador | `coordinator_defaults` | `agentes.coordinador` |
| Planificador | `planning_settings` | `agentes.planificador` |
| Arquitecto | `architecture_settings` | `agentes.arquitecto` |

## Uso

Por defecto, `agente-planificador` encarga a Documentación buscar las historias en el proyecto Jira configurado en `proyecto.claveProyectoJira` de `.opencode/agent-settings.json`. Si está vacío, pide la clave del proyecto al usuario y la guarda para futuros encargos. Puedes indicar claves de historias, un filtro o un sprint para acotar la revisión; un proyecto distinto indicado para un encargo se usa en ese encargo. Las configuraciones anteriores sin este campo se leen como proyecto pendiente de indicar. Documentación recupera el contenido íntegro antes de que el planificador publique los originales y delegue el refinamiento.

También puedes aportar texto, archivos u otro formato y pedir explícitamente que revise esas historias: esa petición tiene prioridad y puede ejecutarse sin configurar Jira. El planificador conserva copias en `Originales/`, delega borradores, publica historias e incidencias en `entrega/` y pide al revisor un `sanity-check.md` de esa versión. Las correcciones se publican en `entrega-02/`, etc. Los entregables se guardan en `sesiones.carpetaRaiz` bajo la raíz del proyecto anfitrión (por defecto `informes-agente/sesiones/`). Puedes invocar directamente al coordinador o a los especialistas para consultas independientes.

Para el flujo complementario, selecciona `agente-arquitecto` y facilita rutas de historias locales refinadas y revisadas. Conserva los identificadores de las historias; si no los tienen, asigna etiquetas locales estables. Para Test, aporta también la ruta de su proyecto y la referencia de código que deba analizarse cuando importe. Puedes indicar una carpeta de conocimiento con convenciones, nomenclatura, buenas prácticas y peculiaridades del proyecto: en esta iteración es complementaria, se consulta en solo lectura y su ausencia no bloquea por sí sola el análisis. Si falta una información indispensable, queda pendiente el trabajo afectado. Su escritura se definirá más adelante.

El contrato está en [flujo-arquitectura.md](./flujo-arquitectura.md), instalado también en `.opencode/flujo-arquitectura.md` del proyecto anfitrión. `agente-arquitecto` es el punto de entrada; delega en `agente-arquitecto-test` y publica un `plan-implementacion.md` versionado con cobertura, casos revisados, pendientes y bloqueos. El especialista lee directamente el proyecto de Test y diseña únicamente casos UI: reutiliza o actualiza los relacionados con la historia, propone nuevos casos y matrices fundamentadas, e indica su encaje técnico. Las mejoras de código o de la suite requieren una petición concreta de la historia. Backend, Frontend y el proveedor siguen pendientes; el plan integrado conserva la cobertura global parcial. Los borradores se destinan a la creación manual de subtareas y tests en el gestor elegido, incluido Jira. Estos archivos se generan al ejecutar el flujo con historias concretas; no son documentos precreados en este repositorio.

`agentes.arquitecto.maxIntentosRevision` configura las revisiones totales por entrega de especialista, incluida la inicial (por defecto 3); `guardarEntregablesEnSesion` controla su publicación. Las configuraciones anteriores sin el bloque `arquitecto` se leen con los valores por defecto sin reescribirlas. Para continuar un encargo, aporta el último plan y su handoff: conservan versiones, identificadores e intentos consumidos.

`agentes["arquitecto-test"].guardarEntregablesEnSesion` controla la publicación de Test (por defecto `true`, también para configuraciones anteriores). Cada versión de `borrador-tests.md` se revisa mediante el revisor común, con el informe guardado junto al archivo exacto. Si se desactiva el guardado de Test o del revisor, o falla una publicación, se devuelve el borrador con un bloqueo de revisión. Una solicitud de revisión enviada consume un intento aunque falle; el historial documental conserva entregas, informes, resultados y contadores. El límite es una regla del flujo, no un contador automático del publicador.

`tools/session_store.ts` asigna carpetas según la sesión verificada por `plugin/agent-session.ts`, rechaza archivos ajenos y no sobrescribe publicaciones. El adaptador de OpenCode proporciona la identidad de cada llamada; una integración nueva necesitará su propio adaptador y fuentes documentadas.

Para ejecutar las comprobaciones: `node --test *.test.ts` (Node.js 24 o posterior).
