# Nombres y migración: verificación

Fecha: **2026-10-19**. Entorno: Windows, Node.js 24.18.0, OpenCode 1.19.3 y APM 0.32.0.

La nomenclatura operativa está en `.apm/agents/`, `agent-settings.example.json` y `tools/agent_settings.ts`. Las instrucciones de actualización y continuidad están en [README.md, Migración de nombres](../README.md#migración-de-nombres).

## Resultados ejecutados

| Comprobación | Resultado y alcance |
|---|---|
| `node --test *.test.ts` | **21 correctas, 0 fallos, 0 omitidas**. Incluye las CLI reales de APM y OpenCode. |
| `node --test docs/agentic-flow/model.test.mjs` | **6 correctas**: recorridos, geometría del modelo, paquetes a 60 Hz y correspondencia de ambos HTML con sus fuentes locales. |
| Navegador, ambos HTML | **2 comprobaciones correctas**, Playwright 1.56.1 con Microsoft Edge: nombres, etiquetas accesibles, selección de estaciones y conexiones, los 27 pasos y sus descripciones accesibles, salidas de 3 historias y 9 tareas, nombres de investigación sin solapamientos y consola sin errores. |
| Inspección visual | Revisadas las capturas completas clara y oscura, generadas bajo `build/`. Los nombres de los lectores se distribuyen en dos líneas para conservar su legibilidad. |
| Geometría física del HTML | Comparación con la revisión Git anterior: piezas, rutas y paquetes idénticos en ambos HTML; cambios locales de nombres, etiquetas e interacción embebida, sin ejecutar el constructor externo de Anatomy. |
| Referencias residuales y espacios | Revisadas las referencias antiguas; `git diff --check` sin errores. |

Los consumidores, temporales, configuración y cachés de las CLI se aislaron bajo `build/`. Antes de ejecutar las pruebas se verificó `build/tmp` y se dirigieron `TEMP`, `TMP` y `TMPDIR` allí. Cada consumidor de integración tiene sus propias rutas HOME/USERPROFILE, AppData, XDG, OpenCode, APM y npm. El catálogo remoto de modelos se desactiva en esas pruebas aisladas.

## Instalación y actualización

- Una instalación limpia mediante APM distribuye los nombres actuales. El instalador distribuido funciona desde el consumidor y conserva sus ajustes al repetirse.
- La actualización parte de una copia local con los ocho nombres anteriores. Se reinstala la copia actualizada y se ejecuta `apm update --yes --target opencode`: quedan únicamente los ocho nombres actuales del paquete en el consumidor sin personalizaciones.
- APM registra archivos, propiedad y hashes en `apm.lock.yaml` y gestiona su retirada. Se comprobó que conserva un agente antiguo modificado por el consumidor y comunica esa preservación; también conserva un `investigador.md` personalizado ante una colisión nueva. Estos avisos requieren resolver la identidad personalizada antes de usar el flujo.
- El instalador retira la copia conocida de `coordinator_defaults.ts` mediante un hash SHA-256 con finales de línea normalizados. Una copia personalizada se conserva con aviso. Una colisión de `investigator_defaults.ts` se comunica antes de copiar herramientas; el registro de instalación permite actualizar las copias propias en instalaciones posteriores.
- La configuración antigua migra **antes** de que OpenCode cargue el plugin con el esquema actual. Se comprobó la configuración efectiva del Investigador con un solo lector habilitado.
- Las pruebas de configuración cubren formato antiguo, canónico, mezcla equivalente, conflicto y resultado inválido. Conservan proyecto, rutas, referencia, límites personalizados, opciones de guardado y raíz de sesiones. Los conflictos y los errores de validación dejan el archivo intacto; una segunda migración conserva bytes y fecha de modificación.
- Las compatibilidades anteriores sin proyecto Jira, sin Arquitecto o sin Arquitecto Test siguen aplicando sus valores por defecto.
- Un registro histórico de sesión con identidad anterior, decisiones e intentos consumidos permanece idéntico después de actualizar y repetir el instalador.

Las pruebas APM usan **copias locales**. Para que APM lea sus cambios se reinstala la copia antes de ejecutar `update`. La descarga de esta revisión desde GitHub depende de su publicación; estas comprobaciones no afirman que los cambios locales estén publicados.

## Controles conservados

- Los ocho nombres actuales están sujetos al plugin, con independencia de su modo o de que otros agentes compartan un nombre breve. Los agentes ajenos mantienen su comportamiento, incluido un nombre personalizado con el prefijo anterior.
- La identidad real de la sesión prevalece sobre `subagent_type` al reanudar mediante `task_id`. Se comprueban la delegación documental, los lectores habilitados del Investigador y Arquitecto → Arquitecto Test → Revisor.
- Las herramientas conservan los gestores autorizados y el guardado exclusivo de datos de proyecto vacíos. Originales, entregas versionadas e informes de revisión mantienen propiedad y ausencia de sobrescrituras.
- Shell conserva las consultas acotadas de Codegraph/Git y MarkItDown, las consultas de metadatos de Test y el rechazo de ejecuciones y encadenamientos no permitidos.
- El motor real de permisos de OpenCode comprueba lecturas y denegaciones con ambos alias MCP sobre herramientas sintéticas. Lector Código y Arquitecto Test siguen sin Jira; Revisor sigue sin `atlassianUserInfo`. No se hicieron llamadas Jira ni ejecuciones con un modelo; su validación funcional mantiene el alcance pendiente descrito en [jira-access-verification.md](jira-access-verification.md).

## Referencias conservadas deliberadamente

| Ubicación | Motivo |
|---|---|
| Helpers de migración y sus pruebas | Reconocer configuraciones y herramientas anteriores y comprobar conflictos, retirada y preservación. |
| Apartado de actualización del README | Explicar el cambio desde los nombres instalados anteriormente. |
| Prueba del modelo | Rechazar que reaparezca la identidad anterior en los HTML vigentes. |
| «Coordinador» genérico en el contrato y agentes | Es la función de coordinar, principalmente del Arquitecto; no identifica al Investigador. |
| `informes-agente/sesiones` | Ubicación configurable de entregables, conservada como valor por defecto. |
| Evidencias y capturas del 17 de octubre | Son históricas y están identificadas como anteriores al renombrado. |

**Después de actualizar, cierra y reinicia OpenCode y abre sesiones nuevas.** Continúa con los documentos y el handoff anteriores, conservando decisiones e intentos consumidos. El siguiente plan centraliza reglas sobre estas identidades.
