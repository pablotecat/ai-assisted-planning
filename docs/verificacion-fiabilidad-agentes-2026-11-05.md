# Verificación de fiabilidad y reutilización — 2026-11-05

> **Actualización vigente:** continuación **77/78**; 14.5 verificada con los servicios reales autorizados, **14.1 no aceptada tras el único ensayo nuevo**, fallido por timeout. Véase [continuación autorizada](#continuación-autorizada-servicios-reales-y-ensayo-s14-renovado). La única raíz final de la continuación pasa **205/205**, sin acreditar 14.1. Se conserva el fallo y se detienen nuevos ensayos; commit del estado técnico autorizado, sin archivo OpenSpec ni push. Los apartados del cierre local anterior conservan sus resultados históricos.

## Resultado y alcance

Cierre local del cambio [mejorar-fiabilidad-y-reutilizacion-agentes](../openspec/changes/mejorar-fiabilidad-y-reutilizacion-agentes/tasks.md), sin archivo, push ni despliegue en el consumidor del usuario. **No es una aceptación integral del cambio.** Se han demostrado la lectura visual S09 y los dos casos S13; la campaña S14 agotó su plazo sin cerrar el primer turno. La validación actual de Jira y Codegraph reales sigue sin corpus autorizado.

**Seguimiento: 76/78.** Completadas 9.1, 13.4, 14.2, 14.3, 14.4 y 14.6 en esta continuación; únicamente **14.1 y 14.5 abiertas**. Regresión local **205/205**, sin convertirla en aceptación de la campaña con modelo fallida.

Rama `feat/fiabilidad-agentes-s07`, HEAD de referencia `08092a8`; las modificaciones continúan sin commit. Se conservan cambios previos, worktrees, diagnósticos y las tres exclusiones del usuario. No se reabren 9.4 ni el diagnóstico APM resuelto. Este documento registra resultados nuevos; no sustituye ni reescribe los informes históricos.

## Capas de evidencia y trazabilidad

La suite local, el motor OpenCode con proveedor programado, la conducta de un modelo real con fuentes sintéticas y los servicios reales son evidencias distintas. Una operación confirmada no aprueba contenido; un recibo de integración es una declaración del coordinador contrastable, no una prueba automática de comprensión.

| Mejora | Sesiones | Alcance acreditado y reserva |
|---|---|---|
| M01 | S03/S14 | Diagnóstico y reducción de las capturas actuales; sin comparación antes/después equivalente. |
| M02 | S07 | Contrato y casos de concurrencia ya aceptados; S14 conserva dos resultados integrados, no la campaña completa. |
| M03 | S04/S06 | Identidad, recuperación y sustitución acotadas; las variantes finales se detallan abajo. |
| M04 | S04/S12 | Respuesta perdida, consulta de efectos y selección efectiva; fallos de cuota/transporte inyectados, no caída real. |
| M05 | S02 | Corpus y reservas comprobables; sin ejecución actual de Codegraph real. |
| M06 | S08 | Captura y lectura completas implementadas y probadas; conducta entre preguntas aún pendiente en 14.1. |
| M07 | S05/S11 | Promoción y transformación exactas probadas localmente; no observadas en el ensayo S14. |
| M08 | S10 | Perfil, IDs, referencias y citas con rechazo íntegro; no aprobación semántica. |
| M09 | S01 | Shell acotado y alternativas sin ampliar permisos. |
| M10 | S05 | Revisión por entrega/hash y punteros por encargo; sin revisión observada en el ensayo S14. |
| M11 | S13 | Reglas efectivamente recibidas y preentrega con hijos activos; alternativas de guardado/acceso cubiertas técnicamente. |
| M12 | S02 | Separación entre requisito, inferencia, test escrito y ejecución observada. |
| M13 | S07 | Correlación e integración por ejecución; no se atribuye cierre del Refinador a los dos recibos S14. |
| M14 | S01 | Interfaz directa/Code Mode y estados de disponibilidad conservados. |
| M15 | S09 | PNG realmente presentado y descrito; barrera/lote y reutilización probados con fixtures, no elegidos por el modelo. |
| M16 | S02/S08 | Alcance y pendientes por pregunta; reutilización S08 entre preguntas con modelo continúa sin demostrar. |

Los cierres anteriores de S01–S08/S10–S12 se conservan con su evidencia y reservas en `tasks.md`; la regresión final no equivale a volver a ejecutar sus ensayos históricos.

## Conducta con modelo

Solo se utiliza `plainconcepts/glm-5-3` con esfuerzo `xhigh` en los ensayos de esta continuación. Los prompts expresan objetivos; las pruebas con proveedor programado no acreditan que el modelo elija sus llamadas.

### S09: lectura visual aceptada — 9.1

- Evidencia: `C:/Users/potero/AppData/Local/Temp/opencode/s09-model-EvnJCc/` y `build/verify-s09-continuation-visual.log`.
- Raíz `ses_e57daca72ffekf39D5DO9Y7Y4h`; respuesta `msg_1a82993ce001c9tnlKm2GIGtJt`. El PNG nativo realmente admitido tiene **3046 bytes**, SHA-256 `79cb8b4e8ff816239958f3cf16bdca240d57d72c7dcef2607ede1c40f98adccb`.
- El modelo identifica cuadrado rojo arriba izquierda, círculo azul arriba derecha, triángulo verde hacia arriba abajo izquierda y tres barras amarillas verticales abajo derecha. La aceptación compara la imagen capturada y toda la respuesta, no solo firma, dimensiones o HTTP 200.
- `acceptance-review.json` separado; originales y checklist intactos, manifiesto de fuentes coincidente y credencial intacta. Duración externa **343511,015 ms**.
- Límite: localización/descarga de una fuente sintética por el harness; no acredita descarga remota autónoma, decisión de barrera de lote ni lectura de un adjunto Jira real.

### S13: reglas y preentrega aceptadas — 13.4

- Evidencia: `C:/Users/potero/AppData/Local/Temp/opencode/s13-model-UbjM3y/`, `acceptance-evidence.json`, `acceptance-review.json` y `build/verify-s13-extended-model.log`.
- Raíz `ses_e55556f13ffeOSo5FJNFmIzh6g`; dos sesiones hijas recibieron realmente `operativa-comun` y leyeron las referencias completas de publicación/revisión y fuentes/evidencias en sus propios mensajes. Un nombre o hash compartido no se usa como prueba de lectura.
- La primera candidata automática `msg_1aab3ab9f001C1T2tGSiRatphv` **se rechaza como prueba temporal**: las preparaciones habían terminado. El `observed:true` histórico del driver no constituye aceptación.
- La aceptación usa la respuesta al mismo avance y la actualización posterior `msg_1aab512a60016G9X0PlG56weyO`, intervalo **1793865356090–1793865465289**, cubierto por ambas ejecuciones hijas activas. Conserva evidencia, impacto de lo no integrado y siguiente acción; no declara candidata completa.
- **29 dispatches** con modelo/esfuerzo cotejados, fuentes sin cambios durante el ensayo, credencial intacta y fixture cerrado; **880507,7334 ms** externos. El clasificador se corrigió después para exigir solapamiento nativo de todo el mensaje; regresión y consumidor privados **12/12**, sin repetir el ensayo.
- El caso dedicado autorizado no reemplaza el caso original de avance único a los 10 s. No acredita cierre del borrador, resumen tras guardado, alternativas no recorridas ni reutilización S08 entre preguntas.

### S14: campaña no aceptada — 14.1 pendiente

- Evidencia: `C:/Users/potero/AppData/Local/Temp/opencode/s14-model-rNssLa/`, `build/verify-s14-model.log`, `build/verify-s14-budget.json` y `build/verify-s14-partial-review.json`.
- Raíz `ses_e5520f917ffegt850ueDWX8MID`; **48 dispatches** cotejados como `glm-5-3/xhigh`. El plazo compartido de **900000 ms de flujo** se agota sin respuesta final del primer turno: `check:failed`, `stages:[]`. Duración externa **945702,7499 ms**, dentro de la ventana total de 1200000 ms.
- Se conservan árbol/historiales paginados completos (10 páginas, 0 duplicados; adquisición no atómica), estados, eventos, recuperaciones y recibos de captura. Manifiesto de fuentes intacto; interrupción propia efectiva, fixture cerrado y `activeCredentialUnchanged:true`.
- Cobertura parcial cotejada mecánicamente: dos conclusiones de Investigador confirmadas de **14187/10549 bytes**, con SHA-256 `626bb50d01c0eebff9c5ee659614ff21f431e9d6eff34d37031cafbed17022fd` y `6641e24d0d204fe0367131881908fdbf31268c2480f3813e25498cd5c9bdcd1b`; dos ejecuciones `integrado` contrastadas con llamadas, identidad, resultado y manifiesto. No es aprobación semántica de esas conclusiones.
- **No existen** publicación del Refinador, promoción, revisión exacta, corrección con nueva revisión ni segundo objetivo admitido. La pregunta posterior Q-GARANTIA tampoco se envía: **la conducta de reutilización S08 sigue pendiente**. No se divide la campaña ni se repite automáticamente.
- Saldo autorizado remanente: **573789,5167 ms** (~9 min 33,8 s). No es una autorización de reintento ni permite superar las cotas por ensayo.

## Variantes técnicas, instalación y reversión

Estas comprobaciones no consumen inferencias reales. Se usa el soporte existente de [consumidores privados](../test-support/opencode.mjs), sin tocar el servicio ni las credenciales compartidos.

**14.2 verificada:** las variantes siguientes y sus aserciones concretas pasaron en la raíz final, no solo el total agregado. Cotejo separado de 13 resultados pertinentes en `build/verify-s14-variants-review.json`.

| Variante | Prueba y comprobación concreta |
|---|---|
| Guardado desactivado | [session_publication.test.ts](../tests/session_publication.test.ts): cinco publicadores devuelven `guardado:false` antes/después de reload; control intacto y recuperación previa aún autorizada. [session_recovery.test.ts](../tests/session_recovery.test.ts): sin control oculto ni historial inventado. |
| Denegación | Consumidor de publicación: permiso `session_work` denegado realmente; pruebas de recuperación rechazan raíz, corpus, hermano, suplantación y promoción ajenos. |
| Antes de ejecutar / ejecución iniciada | [session_provider_recovery.test.ts](../tests/session_provider_recovery.test.ts): marcas inyectadas distinguen fases; ausencia de marcas conserva causa indeterminada y exige comprobar efectos. |
| Respuesta perdida y efecto único | Publicación instalada descarta un retorno exitoso y reintenta la misma operación desde otro mensaje antes/después de reload; mismas rutas/IDs/hash/bytes. S12 recupera por inventario exacto y conserva un solo artefacto. Es pérdida simulada, no corte real de red. |
| Sustitución tras publicación | Consumidor instalado recupera informe previo y subárbol del lector; mantiene productor original, pendiente `CA-2` e intentos consumidos **2**. Recuperación determinista rechaza reiniciar el contador o declarar completo con pendientes. |
| Commit e interrupciones | [session_store.test.ts](../tests/session_store.test.ts): fallos entre fases/archivos, índice y bloqueo abandonado; reconciliación única y rechazo seguro de destinos ajenos. |
| Actualización y reversión | [session_consumer_rollback.test.ts](https://github.com/pablotecat/ai-assisted-planning/blob/c439ab2d26457c914b4746f964489a32c95a6eeb/session_consumer_rollback.test.ts), dirigida **1/1** (`s14-rollback-cOy50T`): módulo anterior instalado publica literal; setup actual y transformación publican versión nueva; restaura archivos anteriores con su control compatible, conservando paquete/control/índice nuevos y todas las entregas. |
| Compatibilidad consumidora | JSONC/comentarios, dependencias ajenas, ajustes, agentes personalizados y conflictos legacy mantienen sus comprobaciones de instalación. No se ejecuta un publicador anterior contra control nuevo ni se reconcilian automáticamente entregas posteriores. |
| Driver S14 | [session_integration_model_driver.test.ts](https://github.com/pablotecat/ai-assisted-planning/blob/c439ab2d26457c914b4746f964489a32c95a6eeb/session_integration_model_driver.test.ts), dirigidas **4/4**: consentimiento/cotas, corrección única, frontera nativa entre turnos y captura/limpieza al faltar publicación. No aprueba campaña por fixture. |

La exportación de HEAD usada en la reversión solo se materializa en un consumidor temporal; no restaura ni reintegra entregas antiguas en este repositorio. El consumidor del usuario no se ha actualizado. La reversión real exige detener sus encargos y seguir el [procedimiento de instalación y respaldo](../README.md).

## Métricas S03 — 14.4

Reducción con [reduceDiagnostics/formatDiagnostics](../scripts/session-diagnostics.mjs) sobre las capturas conservadas, sin nuevas consultas al servicio. Salidas JSON/Markdown y suplementos locales: `build/verify-s14-metrics-s13.*`, `build/verify-s14-metrics-s14.*` y `build/verify-s14-metrics-<s13|s14>-supplement.json`. No exportan prompts, argumentos, contenido documental ni razonamiento. La sesión auditora no pertenece a ninguno de los árboles privados seleccionados.

| Medida | S13 `UbjM3y` | S14 `rNssLa` | Cobertura / interpretación |
|---|---:|---:|---|
| Intervalo desde admisión hasta inicio de captura (ms Unix) | [1793864667436,1793865496223) | [1793868105479,1793869005442) | Fronteras explícitas; no incluye preparación/limpieza externas. |
| Ventana de observación (ms) | 828787 | 899963 | Reloj reconstruido; no se suma a otros tiempos. |
| Sesiones / mensajes en intervalo | 3 / 37 | 3 / 61 | Árbol e historial paginados completos; no atómicos. |
| Herramientas registradas | 40 | 75 | Identidades nativas distintas. |
| Contenedores con expansión desconocida | 5 | 7 | No se reconstruyen operaciones internas analizando JavaScript. |
| Orquestación observada | 4 | 4 | Subconjunto de herramientas registradas; no añadir al total. |
| Operaciones finales conocidas | 35 | 68 | Parciales; no incluyen las hijas desconocidas. |
| Pico de herramientas / pasos de asistente | 5 / 3 | 8 / 3 | Herramientas observadas; pasos parciales al corte. No es límite global de investigadores. |
| Unión de ejecución de herramientas (ms) | 158687 | 78879 | Intervalos solapados unidos, no sumados. |
| Tramo de actividad observada (ms) | 804972 | 875444 | Parcial; **no es camino crítico completo** del encargo. |
| Incidentes reconocidos por S03 | 0 | 4 | Cobertura parcial; categorías S14 indeterminadas, sin códigos HTTP inferidos. Cero reconocido no significa ausencia de errores internos. |
| Recuperaciones de fuente sintética completadas | 17 | 20 | Recibos del fixture, separados de solicitudes HTTP y herramientas exteriores. |
| Argumentos JSON de publicadores (unidades UTF-16) | No determinados | 28224 | Parciales, solo argumentos directos capturados; no son tokens ni bytes publicados. |
| Tokens entrada / salida | 352659 / 11070 | 888902 / 34736 | Sumas parciales de pasos completados dentro del intervalo. |
| Tokens de caché leída | 408768 | 1518592 | Contador del proveedor separado; no sumado a entrada como coste. |
| Publicaciones confirmadas / revisiones estructuradas | 0 / 0 | 2 / 0 | En S14 solo Investigadores; ninguna promoción o transformación. |

**Repeticiones observadas:** S13 recupera issue/comentarios de APP-1 **4/4**, APP-2 **3/2**, APP-3 **2/2**; S14 recupera issue APP-1 **10** veces y las páginas `comments:0`/`comments:2` **5/5** veces. Se cuentan por nombre/componente/sesión de los recibos, no como reintentos injustificados deducidos automáticamente ni como recuperaciones evitadas. No se ha observado una segunda pregunta S14.

**Datos ausentes:** operaciones internas de Code Mode, búsquedas de catálogo internas, total HTTP, primer evento del proveedor, espera delegada y latencias dedicadas de notificación/integración no están acreditados por esta entrada S03. Los ceros de capas sin recibos tienen cobertura parcial, no acreditan cero operaciones. Coste USD y tokens de razonamiento no determinados. No se atribuye el resto de la ventana a disco, red o proveedor.

**Comparabilidad:** una muestra por escenario, objetivos/corpus diferentes y ninguna línea base antes/después equivalente autorizada; no hay mediana, dispersión ni porcentaje de mejora calculables. S13 y S14 no se comparan entre sí como antes/después. No hay camino crítico hasta una entrega raíz completada: S13 se corta tras la preentrega y S14 agota su ventana. Tampoco hay corrección mecánica completada por el modelo en S14. Las sustituciones y rechazos del validador están cubiertos por pruebas técnicas; no se presentan como una mejora de conducta medida. Las uniones, tramos, esperas y duración externa se solapan y **no se suman**.

## Fallos conservados y servicios pendientes

- Los ensayos previos S09/S13 y sus fallos de esfuerzo, vigencia de OAuth, espera, captura y escenarios no observados permanecen en `tasks.md`, `build/` y sus consumidores privados. La aceptación posterior no borra esos fallos ni los transforma en éxitos retrospectivos.
- Se conserva el falso positivo temporal del clasificador S13 y su corrección dirigida. Los cuatro incidentes S03 de S14 no se convierten en cuatro errores de transporte ni se oculta el timeout final como una ejecución sin errores.
- **Jira real:** no ejecutado en esta continuación. El usuario elige expresamente «Sin corpus real ahora»; no hay sitio/claves autorizados para 14.5.
- **Codegraph real:** no ejecutado; tampoco hay workspace/referencia reales autorizados para 14.5. Los fixtures de corpus y fuentes no lo sustituyen.
- **Modelos/adjuntos:** S09/S13 sí tienen conducta real del modelo con fuentes sintéticas; S14 es una ejecución real fallida con cobertura parcial. Ninguno valida un servicio Jira, Codegraph o adjunto remoto real actual.

## Comprobaciones finales

Se ejecutó **una sola** suite raíz `node --test --test-concurrency=2 *.test.ts`: **205/205 correctas, 0 fallos, 0 canceladas, 0 omitidas y 0 todo**, **647148,3689 ms** de Node (**647275,9355 ms** externos). Log original `build/verify-s14-root-final.log`, resultado `build/verify-s14-root-final-result.json`. Los **129 archivos** del manifiesto SHA-256 previo de código/reglas/pruebas permanecen idénticos después: `build/verify-s14-root-source-manifest.json`.

La raíz incluye permisos efectivos bajo ambos alias Jira, límites de lectores/Test, instalación/actualización APM, conflictos legacy, publicación con reload real, recuperación y guardado desactivado. Consumidores de esta ejecución: S12 `provider-recovery-R0yDMU`, reversión `s14-rollback-RTLc5P`, S13 `s13-native-XTTl2E`, S14 `s14-native-6dK2Dh`. No consume nuevos ensayos con modelo ni valida servicios remotos reales.

Después de la raíz, comprobación documental exigida por AGENTS.md: `node --test --test-name-pattern 'formatos y catálogo|consumidores comparten|plan integrado' plantillas_entregables.test.ts`, **3/3**, sin fallos/cancelaciones/omisiones, `build/verify-s14-docs-final.log`. Enlaces locales del informe y `tasks.md` comprobados; OpenSpec estricto válido sin incidencias y seguimiento refrescado a **76/78**. `git diff --check` correcto, con avisos de normalización LF/CRLF y sin errores de whitespace. Se verifican de nuevo enlaces/validación/diff tras el registro final, no otra raíz por estas ediciones documentales.

Dos comprobaciones auxiliares del log fallaron por codificación de caracteres del canal PowerShell, no por regresiones. Se conserva el log UTF-16 original; `build/verify-s14-root-final-utf8.log` es una vista derivada que revierte la decodificación OEM437 de la salida UTF-8. El cotejo final lee nombres desde los archivos fuente y pasa sin repetir la suite. Los fallos de ensayos y tests dirigidos anteriores siguen documentados; no quedan fallos ni omisiones en esta raíz.

Entorno de referencia: Node **26.13.0**, OpenCode y `@opencode/plugin` **2.1.2**, APM **0.35.0**, Windows. Temporales bajo `C:/Users/potero/AppData/Local/Temp/opencode`. Sin cambios de dependencias, nuevos agentes/frentes o políticas automáticas de modelo.

El usuario elige **«Solo repositorio»** para este informe: no se sube a Atlassian Artifacts ni se publican capturas privadas.

## Continuación permitida

Mantener **14.1 y 14.5 abiertas**, sin rebajar requisitos ni archivar el cambio. Completar 14.1 exige otra decisión expresa de ensayo y su aceptación desde capturas; completar 14.5 exige corpus/acceso reales expresamente autorizados. El saldo temporal por sí solo no autoriza reintentar. La entrega local y sus verificaciones no se presentan como mejora general de rendimiento ni como integración total aceptada.

## Continuación autorizada: servicios reales y ensayo S14 renovado

Resultados nuevos de la continuación; no sustituyen el timeout S14 ni las aceptaciones S09/S13 anteriores. El usuario autoriza Jira **ES-1374**, Codegraph **`C:/PlainConcepts/PROYECTOS/OCA/repo/espidi`**, un ensayo nuevo `plainconcepts/glm-5-3/xhigh`, commit y archivo, sin push. Se mantienen todas las exclusiones, worktrees y capturas, sin nuevos agentes, frentes, modelos o dependencias. Al fallar 14.1 se conserva el estado técnico y su fallo, pero no se archiva un cambio incompleto.

### 14.5: servicios reales verificados con alcance y reservas

- **Jira actual:** lectura real `jira.getJiraIssue`, `view:evidence`, HTML, de [ES-1374](https://ocaglobal.atlassian.net/browse/ES-1374), ID `469724`, estado `Pendiente de prod.`, actualización `2026-11-04T13:48:16.924+0100`. Descripción y campos personalizados recibidos, sin inferir campos vacíos por omisión. `listJiraIssueComments` devuelve **3/3** comentarios en una página, `startAt:0`, `isLast:true`: `1125253` restringe permisos a Administrador/Director; `1153487` mantiene pendiente notificaciones y `1159589`, posterior, comunica que no se necesitan por el momento. Se conservan orden/alcance de las fuentes, sin extrapolar decisiones a otras historias. Ninguna escritura ni apertura de claves vinculadas.
- **Codegraph actual:** CLI **1.6.0**, workspace e índice coincidentes, `index.state:complete`, **1936 archivos / 19369 nodos / 83851 aristas**, cero cambios/refs pendientes, `worktreeMismatch:null`, sin reindex recomendado; último índice `2026-10-28T11:39:34.939Z`. Git consultado por separado con `workdir` explícito: **`release/sprint-38`**, **`7b9d1f209bc62f9f931e763c8ee6968f92b25c30`**, solo `.codegraph/` no versionado. `explore/query` recuperan símbolos/fuentes reales; `NonConformityController.cs:80–97` (`Close`) se coteja también con lectura directa del workspace.
- **Reserva de corpus:** ES-1374 tiene etiqueta `release-sprint-39`; no se demuestra que ese evolutivo pertenezca al corpus sprint 38 autorizado. Presencia/ausencia funcional **NO DETERMINADA**, sin convertir búsquedas negativas ni el estado Jira en prueba de implementación. No se cambian ramas, actualiza índice, ejecutan builds/tests ni toca el consumidor.
- **Separación de impedimentos:** estas invocaciones acreditan acceso y consulta actual de ambos servicios, no un refinamiento real de la historia ni la conducta S14. No se recuperan/presentan adjuntos remotos; no se declara ausencia de adjuntos porque la vista no los enumere. S09/S13 conservan su alcance sintético, sin repetirlas. El bloqueo de vigencia del modelo descrito abajo no se atribuye a Jira o Codegraph.

Registro derivado local: `build/verify-s14-continuation-live-services.json` y respuestas originales de herramientas de esta sesión. El registro no se presenta como bytes HTTP ni como un original completo transferido sin retranscripción. **14.5 completa; seguimiento 77/78.**

### Driver, acceso y ensayo único no aceptado — 14.1 abierta

Comprobado primero el driver sin modificar: **4/4**, `s14-native-lcagDg`, **46963,1414 ms**. El usuario renueva tiempo («todo el tiempo necesario»); cambio mínimo y exclusivo de S14: límites explícitos máximos **5400000/6000000 ms**, presupuesto efectivo en `summary.json`. Dirigidas renovadas **4/4**, `s14-native-eW0TOO`, **38038,8742 ms**. Logs `build/verify-s14-continuation-driver.log` y `build/verify-s14-renewed-driver.log`; no consumen inferencias reales ni cambian prompts, criterios, S09/S13, captura o limpieza.

Antes de iniciar el modelo, una lectura exclusiva de metadata observa **87056 ms** de vigencia: insuficiente, sin lanzar ensayo ni renovar la credencial. El usuario renueva manualmente y confirma continuar. La segunda lectura observa **2855333 ms**, por lo que el ensayo efectivo usa **2400000 ms de flujo / 2700000 ms totales** dentro de esa vigencia, no los máximos de 90/100 min. La transferencia al servidor privado es en memoria y sin refresh; no hay cambios del agente al servicio o credenciales compartidos. Metadata sin secretos en `build/verify-s14-{continuation,renewed}-credential-metadata.json`.

El único ensayo nuevo **falla al agotar 2400000 ms de flujo**, durante una observación nativa (`The operation was aborted due to timeout`); duración externa **2444876,7308 ms**, dentro de 2700000. Evidencia `C:/Users/potero/AppData/Local/Temp/opencode/s14-model-xQ9PSl/`, raíz `ses_e52b00310ffenTCEA73QXsX19g`, log `build/verify-s14-continuation-model.log` y resultado externo `build/verify-s14-continuation-budget.json`. `check:failed`, `stages:[]`; solo se admite el primer objetivo, inbox `msg_1ad4ffcfc001K6k8a5VJz6G7ql`. El primer objetivo no cierra ante el driver con su revisión guardada; promoción, corrección y pregunta posterior no se envían. **14.1 sigue pendiente**, sin reintento ni archivo. La causa observada no se atribuye a cuota, fallo Jira/Codegraph, disco o transporte real no demostrado.

**Cobertura parcial cotejada desde capturas, sin aceptación semántica:**

| Evidencia | Resultado observado |
|---|---|
| Captura nativa | Cuatro sesiones, árbol/historiales completos, **13 páginas, 0 duplicados**, no atómica; **65 dispatches glm-5-3/xhigh**, sin fallback. |
| Investigaciones | Dos ejecuciones `integrado`, cotejadas con sus llamadas nativas y publicaciones. Conclusiones de **7110/7560 bytes**, SHA-256 `ba6920c4d3af9cf87128b5d259269a42cec221bc1e808e38c9ddcc250a777df5` / `2af811b07c0df9dd5d70983562ef2a43b74e9174fff611eeb0aad9ef00ab5ff6`. |
| Borrador | `01-refinador/03-borrador.md`, **21151 bytes**, artefacto `f2b6d58c-9126-4a35-afef-0526ff1aaab9`, SHA-256 `204ee8c314a3b288333e3dd24899ecddc16e412a683953f455bb0366535ef9db`; manifiesto `bfa63caf2749e2fac8623539878e9ed67cc355e612958b0c9e1198de83ac382f`. Bytes y rutas cotejados; no se aprueba por superar el perfil mecánico. |
| Originales sintéticos | Transferencia en el mismo execute y cobertura completa de issue/ambas páginas de comentarios comprobadas en **9 instantáneas**; **22 recuperaciones observadas**, no estimadas. No hay pregunta posterior: no se acredita reutilización S08 entre preguntas ni ahorro. |
| Revisión | Revisor nativo creado; `write_review_documents` aún en **streaming**, sin operación confirmada. **0 revisiones guardadas**. Una llamada empezada no equivale a dictamen recibido. |
| Errores | **Seis herramientas con error** conservadas: tres rechazos de publicación y tres de `session_work`. La publicación posterior no borra esos errores ni demuestra una campaña sin fallos. |
| Objetivos no recorridos | Ninguna promoción completa con revisión exacta, corrección con nueva revisión ni Q-GARANTIA. Su ausencia impide aceptar 14.1. |

`summary.json` y todas las capturas permanecen intactos; el dictamen separado `acceptance-review.json` es **`not_accepted`**. Cotejo local adicional `build/verify-s14-continuation-evidence-review.json`, sin otra inferencia ni consulta al servicio. `activeCredentialUnchanged:true` obtenido después; el `unknown` genérico de `supervision-failure.json` no sustituye esa comprobación efectiva. `interrupt.interrupted:false` corresponde al padre idle y **no acredita interrupción nativa de hijos**; `withServer` termina su servidor privado y los procesos propios del driver ya no existen. Control posterior idéntico a la captura, sin publicaciones tardías. No se toca el servicio compartido.

### Regresión final única de la continuación

`node --test --test-concurrency=2 *.test.ts`: **205/205**, 0 fallos, cancelaciones, omisiones y todo; **547132,6838 ms** de Node / **547268,3768 ms** externos. Log y resultado nuevos: `build/verify-s14-continuation-root-final.log` y `build/verify-s14-continuation-root-final-result.json`, sin sobrescribir los del cierre anterior. Solo driver S14 y su test difieren de las fuentes de la raíz previa. **129 archivos de fuente** y **29 archivos excluidos** coinciden por SHA-256 antes/después (`build/verify-s14-continuation-integrity.json`). La suite incluye los consumidores privados, permisos, instalación, reversión y publicación con reload existentes, sin nuevas inferencias reales. No acredita conducta integrada por sí sola ni se repite por el cierre documental.

`git diff --check` correcto, con avisos de normalización LF/CRLF y sin errores de whitespace. Un lector auxiliar del manifiesto histórico falló al encontrar BOM UTF-8; se corrigió solo su decodificación y se conservaron bytes históricos, sin repetir suite ni cambiar sus aserciones. Ninguna regresión local observada; el ensayo de modelo se valora aparte.

### Cierre parcial y continuación detenida

Comprobaciones documentales finales de AGENTS.md **3/3**, 0 fallos/cancelaciones/omisiones, **227,2036 ms** (`build/verify-s14-continuation-docs-final.log`). Enlaces locales del informe, tareas y diseño **11/7/1** correctos; OpenSpec estricto válido con **0 incidencias** y seguimiento **77/78**, únicamente 14.1 pendiente. `git diff --check` y los hashes de fuentes/exclusiones se comprueban tras este registro. No se vuelve a ejecutar la suite raíz ni ningún ensayo con modelo.

Se conserva la implementación y el fallo en el **commit autorizado de la rama `feat/fiabilidad-agentes-s07`**, cuyo identificador se entrega en el cierre de la conversación. **Sin archivo OpenSpec, push, subida a Atlassian ni despliegue en el consumidor del usuario.** Se mantienen las tres exclusiones, worktrees, diagnósticos y capturas. No se relajan requisitos ni se aprueba contenido por sus hashes o una suite verde. Otro ensayo o una corrección seguida de otra prueba necesita una nueva decisión expresa; esta continuación se detiene antes de reintentar.
