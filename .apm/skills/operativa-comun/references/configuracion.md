# Configuración

## Lectura proporcional y precedencia

El encargo explícito prevalece sobre valores por defecto. Lee configuración solo cuando la rama necesite proyecto, rutas, referencia, límites o guardado; una consulta puntual de una historia conocida se resuelve según [consulta Jira](../../consulta-jira/SKILL.md), sin cargar configuración ni escribirla.

En flujos completos combina los datos confirmados con los indicados para el encargo y pide solo los indispensables que falten. Un proyecto o referencia distintos para un encargo no sustituyen automáticamente los valores persistentes. Respeta límites y opciones de guardado devueltos por las herramientas; si falla una configuración indispensable, comunica el bloqueo afectado.

## Herramientas y autorizaciones

- `agent_settings(action: "read")`: Investigador, Planificador, Arquitecto, Refinador, Lector Código y Lector Documentación.
- `agent_settings(action: "saveMissing", values: {...})`: solo Investigador, Planificador y Arquitecto, tras confirmación, para `claveProyectoJira`, `repositorio`, `referencia` y `carpetasDocumentales` vacíos. Comprueba el valor devuelto; conserva campos ya informados.
- `investigator_defaults(action: "read")` y `investigator_defaults(action: "saveMissing", values: {...})`: solo Investigador; resuelven `WORKSPACE`, `REFERENCIA_SOLICITADA`, `LOCAL_DOCUMENT_ROOTS`, especialistas permitidos, repreguntas y guardado. Guarda únicamente valores nuevos confirmados.
- `planning_settings()`: solo Planificador; proyecto Jira, paralelismo y guardado propios.
- `refinement_settings()`: solo Refinador; consultas simultáneas y guardado propios.
- `architecture_settings()`: solo Arquitecto; `MAX_INTENTOS_REVISION` y guardado propios.

Arquitecto Test recibe límite e historial del Arquitecto; Revisor recibe encargo y versión. Ambos carecen de `agent_settings`. Su guardado lo comprueba su publicador autorizado. La configuración no concede nuevas herramientas: permisos y validaciones de código conservan estas autorizaciones.
