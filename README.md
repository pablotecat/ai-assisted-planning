# Planificación asistida por agentes

Agentes para investigar código y documentación local, refinar historias desde Jira o fuentes aportadas por el usuario, preparar su planificación técnica y revisar las entregas.

| Agente | Responsabilidad |
|---|---|
| `lector-codigo` | Investiga un workspace indexado con Codegraph. |
| `lector-documentacion` | Investiga historias Jira y documentos locales y cita sus fuentes. |
| `investigador` | Consulta Jira directamente y contrasta investigación de código y documentación. |
| `planificador` | Copia requisitos, coordina refinadores y publica historias. |
| `refinador` | Redacta borradores trazables por historia. |
| `arquitecto` | Lee historias locales revisadas, prepara encargos técnicos e integra bloques y bloqueos. |
| `arquitecto-test` | Diseña casos funcionales UI y cambios en tests relacionados; lo invoca el arquitecto. |
| `revisor` | Revisa versiones publicadas y documenta hallazgos. |

## Explorar el flujo

**Figura ILUSTRATIVA:** abre la [versión clara](docs/agentic-flow/index-light.html) o [la oscura](docs/agentic-flow/index.html). Las dos cadenas muestran el recorrido visual **ideas → Historias Refinadas → tareas**, incluidas capacidades previstas. Hoy están disponibles investigación, refinamiento, Arquitecto y Test UI con Revisor común y publicación versionada. Backend, Frontend y proveedor están pendientes; Test lee directamente su proyecto en solo lectura. Las cantidades y salidas son ficticias. [Controles y alcance](docs/agentic-flow/README.md) · [Evolución futura](docs/roadmap.md).

## Instalación en OpenCode

Necesitas [OpenCode](https://opencode.ai/docs/), [APM](https://microsoft.github.io/apm/getting-started/installation/), [Node.js 24 o posterior](https://nodejs.org/en/download) y [Git](https://git-scm.com/downloads) (APM lo utiliza para descargar paquetes). Abre una terminal en la **carpeta raíz del proyecto** donde usarás los agentes, no en `.opencode/`, y ejecuta estos dos comandos:

```sh
apm install pablotecat/ai-assisted-planning --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
```

APM instala los agentes en `.opencode/agents/` y las skills con sus referencias en `.agents/skills/`. El segundo comando registra esa carpeta en `skills.paths` conservando las rutas previas y configura plugins, herramientas, contrato de arquitectura y dependencias npm para OpenCode; no necesitas descargar este repositorio. Después abre o reinicia OpenCode en esa misma carpeta y llama a `planificador` o `arquitecto` según el flujo.

**Actualizar:** desde la misma carpeta, ejecuta:

```sh
apm update --yes --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
```

Tus ajustes se conservan en `.opencode/agent-settings.json`. Puedes dejar ese archivo como está: el agente pedirá la clave del proyecto Jira o las rutas de código y documentos cuando las necesite.

### Migración de nombres

La actualización sustituye `agente-coordinador` por `investigador`, `agente-codigo` por `lector-codigo`, `agente-documentacion` por `lector-documentacion` y `agente-refinamiento` por `refinador`. Planificador, Arquitecto, Arquitecto Test y Revisor pierden el prefijo `agente-`. La herramienta `coordinator_defaults` pasa a `investigator_defaults`.

El instalador migra una sola vez las claves `coordinador`, `codigo`, `documentacion` y `refinamiento` de `agentes` a sus nombres actuales y los valores de `especialistasPermitidos`. Conserva proyecto, límites, guardado y `sesiones.carpetaRaiz`, incluido su valor por defecto `informes-agente/sesiones`. Las configuraciones anteriores sin proyecto Jira o sin ajustes de arquitectura mantienen sus valores por defecto compatibles.

Si coexisten una clave antigua y la nueva, se aceptan valores equivalentes. Un conflicto identifica las dos claves y sus valores, detiene la instalación y deja intacto `agent-settings.json`: conserva el valor confirmado y repite el segundo comando. El resultado completo se valida antes de la sustitución atómica; repetir la instalación no reescribe una configuración ya canónica.

APM gestiona la retirada de sus agentes mediante la propiedad y los hashes de `apm.lock.yaml`. Conserva ese registro y atiende los avisos de colisiones antes de usar los agentes; no fuerces la sustitución de archivos personalizados. El instalador retira la herramienta antigua solo si coincide con la copia distribuida conocida; conserva las personalizadas y comunica las colisiones de `investigator_defaults.ts`. Su registro de instalación está en `.opencode/ai-assisted-planning-install.json`.

**Cierra y reinicia OpenCode y abre sesiones nuevas después de actualizar.** Los informes, carpetas y registros históricos conservan sus nombres y contenido. Para continuar un encargo, aporta sus documentos anteriores y su handoff: conserva decisiones, versiones e intentos de revisión consumidos; una sesión nueva no reinicia esos contadores. [Evidencias de instalación y migración](docs/names-migration-verification.md).

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

OpenCode forma los nombres `<alias>_<herramienta>`. Los permisos efectivos de cada rol están en `.apm/agents/`; la norma de consulta, catálogo, sitio, ARI y campos está en [consulta-jira](.apm/skills/consulta-jira/SKILL.md). Las regresiones contrastan ambos alias con el motor real de OpenCode.

En los agentes, las denegaciones amplias preceden a las excepciones: OpenCode aplica la **última regla coincidente**. Conserva ese orden al personalizar permisos. La documentación del servidor no demuestra qué catálogo publica una conexión concreta.

La instalación y actualización conservan el alias elegido: APM distribuye los permisos de `.apm/agents/`; `setup-opencode.mjs` consulta la configuración efectiva de OpenCode, incluidos los ajustes globales y JSONC, rechaza un endpoint Atlassian conocido bajo un alias distinto y avisa si Jira sigue pendiente. No renombra conexiones ni autentica automáticamente. Una instalación de componentes no equivale a una conexión Jira comprobada. Cierra y reinicia OpenCode después de instalar o actualizar agentes.

El acceso Jira del Investigador es independiente de `agentes.investigador.especialistasPermitidos`, que limita sus delegaciones a `lector-codigo` y `lector-documentacion`. Solo Investigador y Lector Documentación pueden invocar a `lector-documentacion`. Las fuentes vigentes de los ocho agentes son `.apm/agents/`; permisos, plugin y herramientas del paquete definen sus controles efectivos.

## Mapa normativo compartido

Las fuentes siguientes definen cada norma una sola vez. Los agentes conservan misión, enrutado, secuencia y criterios de cierre; los formatos están en sus referencias del catálogo. En el consumidor se cargan las skills por nombre y los enlaces relativos se resuelven desde el archivo instalado.

| Propietario normativo | Consumidores | Disparador y cierre verificable |
|---|---|---|
| [consulta-jira](.apm/skills/consulta-jira/SKILL.md) | Investigador, Lector Documentación, Planificador, Refinador, Arquitecto, Revisor | Dato puntual → dato y cierre; selección → historias identificadas; originales → contenido íntegro o límites; investigación/cotejo → evidencia o pendiente por afirmación. |
| [consulta-codegraph](.apm/skills/consulta-codegraph/SKILL.md) | Lector Código | Investigación de implementación → workspace, índice, referencia y citas comprobados, o `INSUFICIENTE` con acción concreta. Test conserva su lectura directa acotada. |
| [lectura-documental](.apm/skills/lectura-documental/SKILL.md) | Lector Documentación, `domain-glossary`, `meeting-coach` | Archivos locales → lectura directa o conversión clasificada; salida estándar para el lector, temporal y limpieza para glosario/reuniones. Consentimientos de reuniones en su propia skill. |
| [fuentes-evidencias.md](.apm/skills/operativa-comun/references/fuentes-evidencias.md) | Ocho agentes, glosario y reuniones | Uso de fuentes → afirmaciones localizables, hechos/inferencias separados y cobertura pendiente explícita. |
| [configuracion.md](.apm/skills/operativa-comun/references/configuracion.md) | Investigador, lectores, Planificador, Refinador y Arquitecto, según sus herramientas | Valores por defecto, límites o guardado → datos resueltos o pendientes; solo gestores autorizados completan vacíos confirmados. |
| [publicacion-revision.md](.apm/skills/operativa-comun/references/publicacion-revision.md) | Ocho agentes | Publicar/revisar → contenido, guardado y revisión de versión exacta verificables; cómputo de intentos solo en arquitectura. |

Las tres últimas referencias se alcanzan cargando [operativa-comun](.apm/skills/operativa-comun/SKILL.md) y leyendo solo la rama activa. Investigador tiene lectura únicamente de esas tres referencias instaladas, además de la carga de sus dos skills; la lectura general de código y documentación sigue delegada. Las validaciones de herramientas y permisos siguen siendo la autoridad ejecutable, no una copia documental que haya que retirar. [Evidencia de distribución y permisos](docs/shared-rules-verification.md).

Las ocho skills distribuidas se completan con [user-stories](.apm/skills/user-stories/SKILL.md) (clasificación, redacción, revisión y aceptación), [plantillas-entregables](.apm/skills/plantillas-entregables/SKILL.md) (cinco formatos), [domain-glossary](.apm/skills/domain-glossary/SKILL.md) (terminología con sinónimos y citas) y [meeting-coach](.apm/skills/meeting-coach/SKILL.md) (invocación manual: pide expresamente `meeting-coach` y preparar, continuar, cerrar o consultar). Las dos últimas dependen de las herramientas autorizadas del agente anfitrión: una skill no añade permisos de escritura a los ocho agentes restringidos.

## Uso

**Consulta puntual:** «Lee la historia Jira ES-1228 y dime su título, no hagas nada más que decirme su título» activa la rama de dato puntual de `consulta-jira`. Investigador, Planificador, Arquitecto y Lector Documentación la enrutan antes del trabajo completo.

**Refinamiento explícito:** `planificador` busca directamente en Jira las historias del proyecto configurado en `proyecto.claveProyectoJira` de `.opencode/agent-settings.json`. Si está vacío, pide la clave del proyecto al usuario y la guarda para futuros encargos. Puedes indicar claves de historias, un filtro o un sprint para acotar la revisión; un proyecto distinto indicado para un encargo se usa en ese encargo. Las configuraciones anteriores sin este campo se leen como proyecto pendiente de indicar. El planificador recupera el contenido íntegro, publica los originales y delega el refinamiento.

También puedes aportar texto, archivos u otro formato y pedir explícitamente que revise esas historias: esa petición tiene prioridad y puede ejecutarse sin configurar Jira. El planificador conserva copias en `Originales/`, delega borradores, publica historias e incidencias en `entrega/` y pide al revisor un `sanity-check.md` de esa versión. Las correcciones se publican en `entrega-02/`, etc. Los entregables se guardan en `sesiones.carpetaRaiz` bajo la raíz del proyecto anfitrión (por defecto `informes-agente/sesiones/`). Puedes invocar directamente al investigador o a los especialistas para consultas independientes.

Para el flujo complementario, selecciona `arquitecto` y facilita rutas de historias locales refinadas y revisadas. Conserva los identificadores de las historias; si no los tienen, asigna etiquetas locales estables. Para Test aporta la ruta de su proyecto y la referencia de código que importe. La carpeta de conocimiento opcional es complementaria y de solo lectura; su ausencia por sí sola no bloquea el análisis. Una carencia indispensable deja pendiente solo el trabajo afectado.

El contrato está en [flujo-arquitectura.md](./flujo-arquitectura.md), instalado también en `.opencode/flujo-arquitectura.md` del proyecto anfitrión. `arquitecto` es el punto de entrada; delega en `arquitecto-test` y publica un `plan-implementacion.md` versionado con cobertura, casos revisados, pendientes y bloqueos. El especialista lee directamente el proyecto de Test y diseña únicamente casos UI: reutiliza o actualiza los relacionados con la historia, propone nuevos casos y matrices fundamentadas, e indica su encaje técnico. Las mejoras de código o de la suite requieren una petición concreta de la historia. Backend, Frontend y el proveedor siguen pendientes; el plan integrado conserva la cobertura global parcial. Los borradores se destinan a la creación manual de subtareas y tests en el gestor elegido, incluido Jira. Estos archivos se generan al ejecutar el flujo con historias concretas; no son documentos precreados en este repositorio.

Los campos de configuración y sus valores iniciales están en `agent-settings.example.json`; las compatibilidades se validan en `tools/agent_settings.ts`. Para continuar arquitectura aporta el último plan y su handoff, aplicando la rama de intentos de `publicacion-revision.md` a los mismos encargos.

`tools/session_store.ts` asigna carpetas según la sesión verificada por `plugin/agent-session.ts`, rechaza archivos ajenos y no sobrescribe publicaciones. El adaptador de OpenCode proporciona la identidad de cada llamada; una integración nueva necesitará su propio adaptador y fuentes documentadas.

Para ejecutar las comprobaciones: `node --test *.test.ts` (Node.js 24 o posterior).

## Catálogo de entregables

[plantillas-entregables](.apm/skills/plantillas-entregables/SKILL.md) es la fuente de estructura Markdown de los cinco formatos prioritarios y sus contenedores. Los productores y Revisor cargan la referencia de la rama correspondiente. Las instrucciones están en español; el entregable conserva el idioma que determine el encargo o el rol. [user-stories](.apm/skills/user-stories/SKILL.md) conserva los criterios de clasificación, redacción, división y aceptación; el [contrato de arquitectura](flujo-arquitectura.md) conserva alcance, estados y continuidad. APM distribuye las skills y sus referencias: ábrelas desde la ubicación instalada, sin copiar las reglas al proyecto.

| Entregable | Fuente normativa de formato y mecanismo | Propósito y consumidores; motivo de ubicación |
|---|---|---|
| Original de historia en `Originales/<ID>.md` | [Planificador](.apm/agents/planificador.agent.md), [write_planning_originals](tools/write_planning_originals.ts) | Copia fiel con procedencia para Refinador y Revisor. Documento de fuente: se preserva literal, sin reestructurarlo como historia refinada. |
| Historia refinada `<ID>.md` y `borrador.md` | [Historia](.apm/skills/plantillas-entregables/references/historia.md), [user-stories](.apm/skills/user-stories/SKILL.md) para contenido | Plantilla común de Planificador/Refinador y cotejo por Revisor; conserva criterios originales, divisiones, propuestas y preguntas. |
| Bloque o tarea técnica | [Tarea](.apm/skills/plantillas-entregables/references/tarea.md), alcance en [contrato](flujo-arquitectura.md) | Arquitecto integra por una historia padre para copia manual al gestor. Backend/Frontend siguen pendientes y sus bloques no simulan descomposición ni análisis realizado. |
| Encargo a especialista | [Encargo](.apm/skills/plantillas-entregables/references/encargo.md) | Intercambio verificable entre Arquitecto, especialista y Revisor; incluye la rama Test y paquetes pendientes de capacidad. |
| `sanity-check.md` y `disputa.md` (con prefijo cuando corresponda) | [Revisión](.apm/skills/plantillas-entregables/references/revision.md), [write_review_documents](tools/write_review_documents.ts) asigna nombres | Revisor y productor comparten dictamen, desacuerdo e historial ligados a la versión exacta; no trasladan aprobaciones a correcciones. |
| Caso de Test, matriz y `borrador-tests.md` | [Caso de Test](.apm/skills/plantillas-entregables/references/caso-test.md), alcance en [contrato](flujo-arquitectura.md) | Arquitecto Test, Revisor y Arquitecto: casos UI concretos, variantes identificadas, reutilización/actualización/creación, cobertura y bloqueos. Contenedor junto a sus casos para evitar contratos divergentes. |
| `<ID>-incidencias.md` e `incidencias-globales.md` | [Historia — incidencias](.apm/skills/plantillas-entregables/references/historia.md#incidencias-y-contenedores), [write_planning_deliverables](tools/write_planning_deliverables.ts) | Acompañan las historias de Planificador como documentos distintos, con evidencia, impacto y decisión pendiente; el informe global recoge conflictos entre historias. Se mantienen junto a Historia por su ciclo de publicación común. |
| Investigación de código `investigacion.md` | [Lector Código — secuencia](.apm/agents/lector-codigo.agent.md), [informe y suficiencia](.apm/skills/consulta-codegraph/references/informe.md) | Investigador, Revisor y solicitante reciben respuesta, estado, alcance, hallazgos, recorrido, variantes y límites. Formato especializado junto a la consulta de código. |
| Investigación documental `investigacion.md` | [Lector Documentación — investigación completa](.apm/agents/lector-documentacion.agent.md), [fuentes y evidencias](.apm/skills/operativa-comun/references/fuentes-evidencias.md) | Investigador, Revisor y solicitante reciben respuesta, hallazgos citados e incertidumbres con suficiencia. La recuperación íntegra de originales conserva el literal separado del análisis. No se extrae otra plantilla sin duplicación demostrada. |
| `conclusion.md`, `resumen-ejecutivo.md` e `informe-detallado.md` | [Investigador](.apm/agents/investigador.agent.md), [write_report_pair](tools/write_report_pair.ts) | Refinador o solicitante: conclusión delegada o pareja de informes en consulta directa. El resumen responde; el informe conserva evidencias y límites. Son ramas distintas, no una obligación de producir tres archivos por consulta. |
| `plan-implementacion.md` | [Contrato — entrega integrada](flujo-arquitectura.md#entrega-integrada-plan-implementacionmd), bloques según Tarea/Caso de Test | Arquitecto integra para usuario/equipo los seis apartados contractuales; mantiene cobertura parcial, pendientes de capacidad y bloqueos. Su estructura global permanece en el contrato, no se añade una sexta plantilla. |
| Handoff | [Contrato — fase y continuación](flujo-arquitectura.md#fase-vigente-y-continuación), [historial de Revisión](.apm/skills/plantillas-entregables/references/revision.md#historial-compartido) | Arquitecto, Test y siguiente sesión preservan versión, decisiones, encargos/`task_id`, intentos, bloqueos y siguiente acción. Se entrega en la respuesta; no exige archivo nuevo. |
| `indice.md` | [session_store](tools/session_store.ts) | Salida automática determinista de navegación de sesión, fuentes, decisiones y entregas. La herramienta conserva el formato; los agentes no redactan ni duplican su receta. |
| Glosario (`Glosario.md` por defecto) | [domain-glossary — formato de salida](.apm/skills/domain-glossary/SKILL.md) | Solicitante: términos, definiciones, variantes documentales y menciones. Plantilla especializada junto a su productor por sus invariantes de orden, ausencia de tablas y trazabilidad. |
| `profile.md`, `prep.md`, `sources.md`, `outcome.md`, `state.md` | [meeting-coach — router](.apm/skills/meeting-coach/SKILL.md), [artefactos y autoridad](.apm/skills/meeting-coach/references/artefactos.md) | Solicitante y futuras reuniones: perfil opcional, preparación, fuentes, feedback y estado vigente. Formatos y lifecycle privado co-localizados; preparación, cierre y consentimientos se leen según operación. |

Las reglas operativas compartidas se consultan al [citar evidencia](.apm/skills/operativa-comun/references/fuentes-evidencias.md), [resolver configuración](.apm/skills/operativa-comun/references/configuracion.md) o [publicar/revisar](.apm/skills/operativa-comun/references/publicacion-revision.md). Los publicadores aceptan el Markdown de estas plantillas sin cambios de argumentos: originales, historias e incidencias permanecen separados y las correcciones se publican como versiones completas.

Las [evidencias de plantillas](docs/deliverable-templates-verification.md) registran el cotejo documental y la validación conjunta con las reglas compartidas.

La [verificación de instrucciones](docs/agent-instructions-verification.md) registra la revisión de los ocho agentes, ocho skills y referencias, sus recorridos y las pruebas ejecutadas. Los informes anteriores conservan su alcance temporal; las previsiones están únicamente en [roadmap](docs/roadmap.md).

Las regresiones Jira verifican permisos con la CLI real de OpenCode y distribución con APM en consumidores temporales; requieren ambas CLI en `PATH`. Consulta el [alcance de las pruebas y la validación funcional pendiente con Jira](docs/jira-access-verification.md).
