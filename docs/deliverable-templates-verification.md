# Verificación de plantillas de entregables

> **Evidencia histórica del plan 3 y su integración, 19 de octubre de 2026.** Los fallos aislados se cerraron en la ejecución conjunta de abajo: no son bloqueos actuales. Para la posterior limpieza y las ubicaciones normativas definitivas consulta [verificación de instrucciones](agent-instructions-verification.md).

## Alcance

La fuente de formato es `.apm/skills/plantillas-entregables/SKILL.md`, con cinco referencias: `historia.md`, `tarea.md`, `encargo.md`, `revision.md` y `caso-test.md`. El catálogo está en el README. En la integración, el contrato retuvo los seis apartados y los estados; la norma de intentos quedó en `operativa-comun/references/publicacion-revision.md`, alcanzable desde el contrato.

Los productores conectados son Planificador, Refinador, Arquitecto y Arquitecto Test, junto al Revisor común. `user-stories` conserva la clasificación y calidad funcional y enlaza Historia; Revisor puede cargar ambas skills. Los otros tres productores conservan sus formatos de investigación, catalogados con sus fuentes. `domain-glossary` y `meeting-coach` mantienen sus formatos especializados.

## Cotejo documental

- Historia: los criterios confirmados y propuestos están separados. El ejemplo ficticio reparte CA-1 y CA-2 entre LOCAL-H1-A y LOCAL-H1-B y conserva origen, destino, valor independiente y decisión de división pendiente. El dato desconocido tiene efecto y pregunta.
- Originales: el literal no pasa por la plantilla de historia refinada. `write_planning_originals` acepta contenido íntegro separado; `write_planning_deliverables` mantiene historia, incidencias por historia e informe global como documentos distintos. Sus argumentos y garantías no requieren cambios.
- Tarea: una sola historia padre y otras relacionadas, identidad local frente a clave real, evidencia disponible y estimación pendiente. El bloque Backend del ejemplo permanece pendiente de descomposición y fuera de los borradores listos para copiar; Backend, Frontend y proveedor siguen pendientes de capacidad.
- Encargo: fuentes/versiones, fragmentos, criterios, reglas, alcance, decisiones, dependencias, dudas y resultado, más límite e historial. La rama Test añade proyecto, referencia declarada/comprobada, conocimiento e historial anterior.
- Revisión: el ejemplo parcial identifica v1/intento 1 y v2/intento 2, conserva 2 de 3 consumidos y no atribuye aprobación a PC-1. La disputa se adjunta a la misma versión. El historial compartido representa solicitudes, resultados y rutas, sin convertir el publicador en contador.
- Test: el ejemplo actualiza un caso existente, diferencia recursos observados y propuestos y muestra variantes UI-1-V1/V2 con datos y resultados acordados. La lectura de suite no acredita ejecución. El contenedor contabiliza también criterios sin caso y bloqueos.
- Plan integrado: conserva los seis apartados, secciones vacías explícitas, cobertura total contabilizada aunque sea parcial, paquetes pendientes e historial para continuidad. Handoff en la respuesta, sin nuevo archivo obligatorio.

## Pruebas reproducibles

`plantillas_entregables.test.ts` verifica enlaces/anclas, rutas y permisos de consumidores, catálogo de fuentes, seis apartados y continuidad; instala una copia local mediante APM y usa `opencode debug agent` para invocar realmente `skill` en los cinco consumidores y realizar 13 lecturas que cubren las cinco referencias. Los ejemplos son ficticios y se revisan como contratos documentales, no como evidencia de ejecución de producto.

Ejecutar con Node 24 o posterior y CLI APM/OpenCode disponibles. Preparar `build/tmp` y dirigir `TEMP`, `TMP`, `TMPDIR`, configuración y cachés a `build/` antes de `node --test *.test.ts`. Los probes usan el aislamiento de `jira_access.test.ts`, sin configuración global ni servicios externos.

## Dependencia inicial de integración — resuelta

Los planes 2 y 3 se implementaron en ramas paralelas. La rama de plantillas enlazó los destinos acordados del plan 2, sin duplicar sus reglas:

- `.apm/skills/operativa-comun/references/fuentes-evidencias.md`
- `.apm/skills/operativa-comun/references/configuracion.md`
- `.apm/skills/operativa-comun/references/publicacion-revision.md`

La integración incorpora los tres destinos y comprueba los enlaces desde el paquete y desde el consumidor instalado. Los resultados previos de la rama aislada se conservan a continuación como historial, no como bloqueos actuales.

## Resultados de la rama aislada — anteriores a la integración

- Entorno: Node **24.18.0**, OpenCode **1.19.3**, APM **0.32.0**. Temporales, perfiles, configuración y cachés aislados bajo `build/` del worktree.
- `node --test *.test.ts`: **25 pruebas, 22 aprobadas, 3 fallidas, 0 omitidas**. Pasan configuración, permisos reales Jira/OpenCode, delegación, migración, originales fieles, publicación versionada y revisión exacta. Fallos:
  1. Punteros de plantillas: faltan únicamente los tres destinos `operativa-comun` listados arriba; dependencia explícita del plan 2.
  2. `jira_access.test.ts:56`, actualización APM: falla el staging con **WinError 206**, ruta demasiado larga bajo `build/tmp/names-upgrade-…`.
  3. `jira_access.test.ts:239`, distribución APM: falla el staging con **WinError 3** bajo `build/tmp/opencode/jira-install-…`; la CLI solo informa de ruta no encontrada. No se ha atribuido otra causa sin evidencia.
- Comprobación final específica, `node --test plantillas_entregables.test.ts`: **4 pruebas, 3 aprobadas, 1 fallida, 0 omitidas**. Solo falla la dependencia de punteros del plan 2. El probe APM/OpenCode pasa con las 13 lecturas finales.
- El probe nuevo usa `apm install … --target opencode --no-policy --root <ruta Win32 extendida del consumidor>`: evita el límite MAX_PATH sin salir del worktree. APM instala en `.agents/skills/plantillas-entregables` y reescribe los enlaces existentes entre skills hacia `apm_modules`; se comprueba el contenido preservado y la resolución de esos enlaces. El aislamiento desactiva la autodetección externa y declara explícitamente solo la ruta local de skills recién instalada en `skills.paths`.
- `jira_access.test.ts` y el instalador permanecen a cargo del plan 2. Antes del cierre, su propietario debe resolver los dos probes de staging y repetir la suite integrada; el probe nuevo acredita instalación y carga de plantillas, no sustituye esas pruebas de actualización.
- `git diff --check`: sin errores de espacios. Los avisos de conversión LF/CRLF son informativos de Git.

## Integración y cierre

Fecha: **2026-10-19**. Rama `integration/planes-2-3-4`, con los commits de ambos planes integrados y revisados.

- Resueltos los solapamientos de los cinco agentes, el catálogo y el contrato; cada bloque de permisos `skill` conserva las reglas y plantillas autorizadas en una sola entrada YAML.
- Adaptadas las comprobaciones al propietario normativo de los intentos y al acceso de plantillas; eliminada la excepción que omitía verificar enlaces a `operativa-comun` en el consumidor.
- Normalizada la comparación LF/CRLF de contenido instalado. Los probes de APM existentes usan las rutas cortas del plan 2 y completan instalación, migración y actualización.
- Corregidos y comprobados los enlaces del contrato instalado: desde `.opencode/flujo-arquitectura.md` apuntan a `../.agents/skills/`, donde APM distribuye los formatos.
- `node --test *.test.ts`: **25 correctas, 0 fallos, 0 omitidas**. Incluye las CLI reales APM/OpenCode, los ocho roles, ambos alias Jira, las cinco cargas de plantillas y las 13 lecturas de sus referencias.
- Comprobaciones específicas previas: `node --test plantillas_entregables.test.ts` (**4 correctas**) y `node --test --test-name-pattern "distribución APM" jira_access.test.ts` (**1 correcta**).
- Temporales, perfiles y cachés dentro de `build/`; `git diff --check` sin errores. El cotejo de ejemplos y recorridos es documental; no acredita conversaciones LLM, consultas Jira remotas ni ejecución de los casos de Test propuestos.

Sin bloqueos de cierre del plan 3; se retira su archivo de ejecución. Tras la actualización del consumidor, cerrar y reiniciar OpenCode y abrir sesiones nuevas, aportando documentos e historial para continuar los encargos.
