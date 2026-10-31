# Proposal

## Why

El flujo actual puede repetir investigaciones y documentos, confundir herramientas no invocadas con herramientas indisponibles y cerrar entregas antes de integrar resultados. Las mejoras M01–M16 de `docs/planes/plan-mejora-agentes-tools-skills.md` necesitan una secuencia ejecutable que resuelva esas causas sin introducir otro orquestador ni condicionar cada corrección a una refactorización global.

## What Changes

- Corregir resolución de herramientas, diagnósticos de permisos y formas de shell en sus propietarios actuales; conservar la rama Jira puntual sin configuración o publicación innecesarias.
- Precisar evidencia, comprobación del corpus y condiciones de expansión/parada por pregunta, aprovechando las reglas existentes en lugar de duplicarlas.
- Incorporar diagnóstico reproducible con conteos por capa, tiempos no sumables cuando se solapan, procedencia y exportación sin contenido sensible.
- Extender incrementalmente el control de sesiones con identidad de artefactos, publicaciones idempotentes, revisiones por versión y recuperación de encargos. Una respuesta perdida no debe crear otra entrega; una corrección explícita sí.
- Coordinar confirmaciones concurrentes e integración de la ejecución correcta mediante capacidades nativas de OpenCode V2. Conservar límites locales; medir concurrencia agregada sin imponer un nuevo límite global.
- Reutilizar instantáneas completas mediante acceso a artefactos registrados, acotado por rol, encargo y corpus; verificar lectura de un adjunto antes de procesar su lote.
- Publicar desde artefactos completos, incorporar después validación mecánica y transformaciones exactas, y mantener revisión semántica independiente.
- Cambiar deliberadamente la respuesta posterior a un guardado confirmado: resumen y rutas accesibles, con contenido completo si se solicita o si el guardado/acceso falla. No se eliminan fuentes, hallazgos ni pendientes.
- Organizar la implementación en 14 sesiones con entradas, dependencias duras, exclusiones, pruebas y handoff. M01 y M03 se entregan por partes útiles, no como prerrequisitos universales.

## Capabilities

### New Capabilities

No hay specs principales previas. Estas capacidades registran el comportamiento objetivo; no afirman que todas sus partes sean nuevas respecto del código actual.

- `operacion-acotada-agentes`: interfaz efectiva de herramientas, shell permitido, corpus verificable y evidencia proporcional por pregunta (M05, M09, M12, M14, M16).
- `diagnostico-ejecuciones`: métricas trazables, privacidad y observación de actividad y costes sin doble cómputo (M01).
- `continuidad-investigaciones`: recuperación, correlación de ejecuciones, confirmación paralela, integración y fallos de proveedor (M02, M03, M04, M13).
- `publicacion-y-revision`: identidad e idempotencia de entregas, promoción y transformación de artefactos, dictamen por versión (M07, M10 y base de M03/M04).
- `evidencia-reutilizable`: instantáneas completas, acceso acotado, vigencia y lectura efectiva de adjuntos (M06, M15).
- `validacion-mecanica-entregables`: comprobaciones estructurales, cobertura de IDs y citas literales sin aprobación semántica (M08).
- `contexto-proporcional`: instrucciones por rama y respuestas concisas con acceso real al contenido completo (M11).

### Modified Capabilities

Ninguna: el inventario principal de OpenSpec está vacío.

## Impact

- Fuentes afectadas durante la futura implementación: `.apm/agents/`, referencias de `.apm/skills/`, `plugin/agent-session.ts`, `tools/session_store.ts`, publicadores y adaptador de identidad; diagnóstico bajo `scripts/` y pruebas raíz.
- Mantener firmas literales y nombres españoles existentes; añadir modalidades/metadatos compatibles. Los dictámenes antiguos no se reinterpretan como aprobaciones estructuradas.
- Reutilizar el control `.control`, el registro de herramientas del plugin y los fixtures consumidores existentes. No añadir framework, base de datos, scheduler, servicio compartido ni dependencia por anticipación.
- Jira continúa en solo lectura bajo ambos alias. No cambiar automáticamente modelos, cuotas, política global de reintentos, límites configurados, originales ni ajustes ajenos.
- La propuesta incluye permisos únicamente para herramientas acotadas de registro/artefactos; no propone lectura general del filesystem para el Investigador. Su activación debe acompañarse de controles runtime y pruebas reales de permisos.
- Este cambio crea solo planificación. La implementación posterior requiere `/opsx-apply`; el documento original y los informes históricos quedan intactos.
