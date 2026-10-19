# Acceso Jira: verificación de la corrección

Fecha: 2026-10-17. Entorno: Windows, Node.js 24.18.0, OpenCode 1.19.3 y APM 0.32.0.

El contrato siguiente utiliza los nombres actuales. Los resultados fechados de esta página son evidencia histórica del 17 de octubre; la nueva comprobación del renombrado y la migración está en [names-migration-verification.md](names-migration-verification.md).

## Contrato aplicado

- Alias MCP admitidos: `jira` y `atlassian`, con las mismas excepciones de lectura. Las reglas amplias de denegación preceden a las excepciones. Lector Código y Arquitecto Test conservan su contrato sin acceso Jira; Revisor conserva su alcance sin `atlassianUserInfo`.
- Planificador, Investigador, Arquitecto y Lector Documentación atienden primero las consultas puntuales compatibles con su rol. «Solo el título» lee `fields: ["summary"]` y devuelve su valor literal. El flujo completo mantiene originales, delegación, publicación y revisión según su contrato.
- APM distribuye `.apm/agents/` y los scripts del paquete. El instalador verifica los alias sobre la configuración efectiva, incluidos los ajustes globales JSONC. El plugin de sesión no necesita modificar prefijos MCP.
- Las copias externas `agents-old/` y `old/`, que contienen la antigua prohibición de acceso Jira del rol de investigación, son históricas y no forman parte de este paquete.

## Comprobaciones ejecutadas

```sh
node --test *.test.ts
git diff --check
```

Resultado: **16 pruebas correctas, 0 fallos y 0 omitidas**; comprobación de espacios correcta. Las pruebas de integración requieren las CLI `opencode` y `apm` en `PATH`; si faltan, se identifican como omitidas, no como verificaciones superadas.

| Comprobación | Tipo y alcance real | Resultado |
|---|---|---|
| Lecturas con ambos alias en los seis agentes | Motor real: `opencode debug agent` carga los agentes y aplica `Permission.disabled`; una herramienta sintética llama a `context.ask`, resuelto por `Permission.evaluate` de OpenCode. | Correcto. Incluye `search`, JQL, `fetch`, metadatos, comentarios, transiciones y worklogs de lectura, y las operaciones opcionales de catálogo. |
| Creación, edición, comentarios, transiciones, worklogs y eliminación; `executeWrite`, `executeDestructive` y operaciones desconocidas | Motor real sobre nombres sintéticos de herramientas; se comprueba visibilidad y autorización. | Denegados. No se ejecuta ninguna escritura Jira. |
| Código, Arquitecto Test y perfil de usuario del Revisor | Motor real sobre las definiciones mantenidas. | Sin ampliación de permisos. |
| Rama puntual y flujo de refinamiento conservado | Comprobación estática de instrucciones. | Correcto. No demuestra por sí sola las decisiones de un modelo durante una conversación. |
| Instalación y conservación de ajustes | APM real instala en un consumidor temporal una copia con permisos anteriores. Se reinstala la copia corregida y se ejecuta `apm update --yes --target opencode`; después se ejecuta el instalador distribuido. | Permisos y orden de reglas coinciden con las fuentes, se conservan las instrucciones y `agent-settings.json`, y se detecta una conexión global JSONC. |
| Alias no admitido y ausencia de Jira | Prueba del verificador usado por el instalador y ejecución del instalador sin Jira. | Rechazo del endpoint Atlassian bajo otro alias y aviso explícito de Jira pendiente. |
| Publicadores, originales, versiones, revisiones y restricciones de delegación | Pruebas existentes de herramientas y adaptador de sesión. | Correcto. No equivale a ejecutar un refinamiento completo con un modelo. |

La prueba APM usa **copias locales**: `apm update` no vuelve a leer los cambios de una copia local sin referencia Git, por lo que primero se reinstala la copia corregida. Se verifica que la actualización posterior conserva el contrato; la descarga de una revisión nueva desde GitHub queda pendiente de publicar esa revisión. La prueba no afirma que estos cambios locales estén ya disponibles para consumidores remotos.

## Evidencia del motor y del catálogo

En el código de [OpenCode 1.19.3, catálogo MCP](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/mcp/catalog.ts), `toolName` concatena el alias saneado, `_` y el nombre de herramienta saneado. El [motor de permisos](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/permission/index.ts) usa `findLast`: prevalece la última regla coincidente. Las pruebas invocan esa CLI, no una reimplementación local de sus comodines.

El [catálogo documentado por Atlassian](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/) confirma operaciones de lectura y las capacidades opcionales `discover` y `executeRead` de v2. [Rovo search y fetch](https://support.atlassian.com/atlassian-ai-gateway/docs/use-rovo-search-and-fetch-in-the-atlassian-remote-mcp-server/) documenta la búsqueda y recuperación. Esto no identifica el catálogo efectivo de una conexión aún no configurada: las herramientas y sus esquemas deben verificarse en la sesión conectada. `fetch` utiliza un ARI verificado; para una clave y un campo concreto se prefiere `getJiraIssue`.

## Pruebas funcionales pendientes con Jira

En este entorno, `opencode mcp list` solo mostró `ado` conectado. No se pudo consultar ES-1228 ni verificar una respuesta del planificador contra Jira real. Tampoco se ejecutó un refinamiento completo con un modelo.

Para completar la aceptación:

1. Instala las fuentes corregidas en el proyecto consumidor. Conecta Atlassian MCP con `jira` o `atlassian`, autentica con `opencode mcp auth <alias>` y comprueba `opencode mcp list`.
2. **Cierra y reinicia OpenCode.** Comprueba el catálogo realmente publicado y sus esquemas. Solo utiliza `discover` o `executeRead` si están publicados; no se requieren para una lectura directa si existe `getJiraIssue`.
3. Selecciona el planificador instalado y pide: «Lee la historia Jira ES-1228 y dime su título, no hagas nada más que decirme su título». Si no es accesible, usa una historia equivalente accesible. Comprueba el título actual contra la fuente, la lectura de `summary` y una respuesta final formada únicamente por ese valor. El rastro de herramientas debe terminar sin refinadores, originales, entregables, revisiones ni escrituras de configuración. Una clave explícita debe funcionar aunque el proyecto por defecto esté vacío.
4. Con sitio y `cloudId` ya verificados, repite la consulta para comprobar su reutilización. Repite la lectura con el otro alias si se valida una instalación con ese alias.
5. Pide explícitamente refinar una historia del alcance acordado, con guardado activo. Comprueba la copia fiel en `Originales/`, la delegación al refinador, la entrega publicada y el informe del revisor para esa versión exacta. Una corrección debe publicar una nueva versión y revisarse otra vez.

Registra alias, versión, historia consultada, resultado y rastro de herramientas antes de considerar superadas estas comprobaciones funcionales.
