# Design

## Context

Ver `proposal.md` para motivación y las siete specs para comportamiento exigido. La revisión se basa en las fuentes actuales, no en copias instaladas de un consumidor:

| Evidencia comprobada | Consecuencia de diseño |
|---|---|
| `plugin/agent-session.ts` registra diez herramientas con `codemode:false` y resolvedor ligado a la instancia | M14 empieza corrigiendo el uso de la interfaz; no requiere otro registro de herramientas. |
| `tools/session_store.ts` conserva carpetas, listas de entregas y textos de fuentes/decisiones; no hay identidad de operación ni registro de ejecuciones | Añadir datos al control existente, sin reemplazar su estructura de carpetas. |
| `publishSession` numera cada llamada y puede revertir archivos si falla la generación del índice | Separar commit de publicación y proyección del índice para poder reconocer respuestas perdidas y recuperar interrupciones. |
| `publishReview` adjunta informes al archivo o carpeta exactos pero no registra dictamen estructurado | Ampliar el mismo publicador; no inferir aprobación mediante búsqueda de palabras en Markdown. |
| El Investigador solo puede leer directamente tres referencias operativas | Reutilización exige una herramienta acotada de artefactos; dar una ruta no basta. |
| Refinador ya pide confirmación y paralelismo, pero su cierre admite consultas pendientes identificadas | Cambiar el criterio de cierre y verificar conducta/eventos, no añadir otra exhortación al paralelismo. |
| `consulta-codegraph` y fuentes/evidencias ya verifican corpus y distinguen lectura de tests de ejecución | Refinar sus propietarios; no duplicar reglas en todos los roles. |
| Los defaults son diez refinadores y dos consultas por refinador | Medir hasta veinte investigadores potenciales más lectores; no introducir un límite global sin decisión posterior. |
| `session_publication.test.ts` ya tiene consumidor instalado y recarga de location real | Extender ese recorrido y `test-support/opencode.mjs`; no crear infraestructura de integración paralela. |
| La norma y una comprobación de `jira_access.test.ts` exigen devolver siempre contenido | S13 debe cambiar explícitamente ambos consumidores de esa norma, no introducir una excepción aislada en un rol. |

Versiones comprobadas durante la revisión: OpenCode 2.1.2, `@opencode/plugin` 2.1.2 y Node 24.18.0. No se ha ejecutado en esta planificación una conversación de validación V2, lectura real de adjuntos ni reexportación de las sesiones históricas. Los resultados históricos, incluidos los de V1, no acreditan esas conductas en V2.

## Goals / Non-Goals

**Goals:**

- Cada sesión de implementación produce una capacidad utilizable y compatible sin esperar a todas las demás.
- Cambiar una sola vez las fronteras compartidas: identidad/commit en S04; consumo de esa identidad en las sesiones posteriores.
- Separar almacenamiento, correlación, acceso y revisión; no convertir un archivo guardado o una notificación en prueba de integración semántica.
- Hacer explícitas diferencias entre evidencia observada, metadatos declarados y comportamiento pendiente de validación.

**Non-Goals:**

- No crear scheduler, bus de eventos, base de datos, ORM, framework de agentes, API HTTP propia ni nuevo servicio.
- No implementar Backend, Frontend o proveedor del roadmap; no alterar el alcance UI de Test.
- No modificar automáticamente modelos, credenciales, política global de reintentos, defaults de concurrencia o configuración ajena.
- No permitir al Investigador inspección general de documentos locales/código ni al Lector Código ejecutar builds o tests.
- No hacer OCR propio, instalar visores por defecto ni diseñar parsers semánticos generales.
- No reescribir el documento de ideas ni informes históricos. Este diseño y sus tareas son la planificación vigente de este cambio.

## Decisions

### D01. Extensiones pequeñas en los propietarios existentes

Se conservan publicadores, nombres españoles, resolvedor por instancia y rutas de salida. Las reglas detalladas permanecen en las referencias de sus skills; los roles solo indican rama, secuencia y cierre. Puede añadirse una referencia de delegación dentro de `operativa-comun` si reúne reglas realmente compartidas; no una skill genérica nueva.

El primer paso de cada sesión es comprobar su diff contra la versión de trabajo y leer los propietarios nombrados en `tasks.md`, no volver a explorar todo el repositorio. Extraer un helper solo cuando tenga consumidores reales; no reorganizar `session_store.ts` entero para preparar futuras sesiones.

Alternativa descartada: reemplazar el plugin o introducir una capa común de orquestación. Cambiaría permisos, publicación y coordinación a la vez y haría difícil aislar regresiones.

### D02. Un registro aditivo sobre `.control`

S04 añade versión de esquema, manifiestos de artefactos y operaciones al estado actual. S05 añade revisiones; S06, trabajo; S08, referencias de instantáneas. Se conservan las claves y rutas actuales mientras los nuevos datos se adoptan incrementalmente.

| Registro | Datos mínimos y autoridad |
|---|---|
| Artefacto | ID opaco, raíz/encargo, productor y sesión verificados, archivos relativos, hashes, hash del manifiesto, versión anterior y origen. |
| Operación | Tipo, identidad lógica, productor, digest de petición, destino reservado, fase de commit y resultado confirmado. |
| Revisión | Artefacto/hash, sesión real del Revisor, ruta del informe, dictamen explícito y elementos aprobados/pendientes/bloqueados. |
| Trabajo | ID local del encargo, relación con encargo padre, pregunta/criterios, corpus/referencia, responsable, sesiones/turnos reales disponibles, estado, resultados, pendientes y siguiente acción. |
| Instantánea | Artefacto original, fuente y versión/hash, cobertura de campos/páginas, recuperación, visibilidad y vista derivada opcional. |

Los IDs de encargo son propios del paquete; no se presentan como IDs de OpenCode. Cuando el runtime no exponga una frontera de turno suficiente se conserva esa ausencia; no se inventa. Las decisiones y fuentes narrativas del índice no se truncan y reutilizan como si fueran un registro completo: permanecen como información histórica separada.

Las sesiones pueden contener varios encargos. Por ello el aislamiento no se reduce a compartir sesión raíz: un artefacto necesita pertenecer al encargo/corpus autorizado o una reutilización expresamente autorizada y comprobada.

Alternativa descartada: migrar primero todo el historial o usar un event store genérico. Los registros antiguos se leen con defaults seguros; sus revisiones no se vuelven aprobaciones estructuradas por inferencia.

### D03. Operación idempotente distinta de versión

Los publicadores admiten metadatos nuevos opcionales, en español y sin retirar los argumentos existentes. El identificador lógico de operación se mantiene entre reintentos; NO se calcula únicamente con el `messageID` o call ID, que pueden cambiar al repetir. El contexto runtime verifica productor y sesión; el modelo no puede declararlos mediante argumentos.

La clave se acota a raíz, sesión productora, tipo de publicación e ID lógico. Su digest usa la petición normalizada en estructura, pero preserva exactamente los bytes UTF-8 del contenido. Misma clave y digest devuelven el resultado anterior; misma clave y otro digest se rechazan. Una corrección deliberada obtiene otra clave y conserva versión anterior.

Un sustituto no suplanta la sesión productora anterior: consulta la publicación existente mediante acceso autorizado y publica solo su trabajo nuevo con identidad propia. Los llamadores antiguos sin ID lógico conservan su contrato anterior; los flujos actualizados deben suministrarlo para obtener garantía de reintento entre turnos.

Commit bajo el bloqueo existente:

1. Verificar identidad, permisos, guardado, petición y contenido completo antes de tocar destinos.
2. Persistir descriptor de operación preparada, destino reservado y hashes esperados.
3. Materializar únicamente archivos propios preparados; marcar confirmada la operación junto al registro de artefacto cuando estén completos.
4. Generar/reparar `indice.md` como proyección. Su fallo no elimina una publicación ya confirmada; se comunica y el reintento puede reparar el índice.
5. Tras interrupción, contrastar descriptor y archivos. Finalizar una materialización verificable o declarar impedimento; no borrar ni adoptar destinos ajenos o de contenido distinto.

Los archivos individuales conservan sus nombres versionados actuales. Para conjuntos sin carpeta común se usa preparación y reconciliación por operación; no se finge atomicidad de múltiples renames. Solo el registro confirmado acredita entrega completa. Probar también interrupciones entre archivos y un bloqueo abandonado: recuperar automáticamente solo cuando se pueda demostrar que su propietario ya no está activo; en caso contrario informar impedimento, sin desactivar exclusión mutua.

Alternativa descartada: deduplicar por hash de contenido únicamente. Dos correcciones deliberadas podrían tener iguales bytes y seguir siendo entregas distintas; el hash tampoco identifica la intención del reintento.

### D04. Identidad del productor y dictamen por versión

El manifiesto contiene solo archivos del productor, ordenados por nombre relativo, con hashes de bytes. Su hash no incluye `sanity-check.md`, `disputa.md` ni sus variantes versionadas. Se detectan cambios externos o archivos de productor no registrados; no se ignoran para conservar artificialmente el hash.

`write_review_documents` admite, además del informe actual, dictamen estructurado opcional con entrega/hash y alcance. El runtime verifica Revisor delegado por el productor y solo registra estado después de guardar el informe. En el flujo actualizado el Revisor debe aportar ese dictamen; una llamada antigua sigue guardando su informe sin generar aprobación estructurada.

Última publicada y última revisada son punteros separados por productor/encargo. Última aprobada globalmente requiere dictamen favorable completo; un dictamen parcial conserva elementos aprobados, sin convertirse en aprobación global. El estado global de arquitectura sigue requiriendo integración y dependencias según su contrato: el publicador no lo decide.

Promoción de S05: añadir una alternativa de origen registrado/hash por archivo a los publicadores de entregas, mutuamente excluyente con contenido literal para ese archivo. Una entrega del Planificador enumera todos sus archivos; no se promueve `borrador.md` como historia final sin comprobar su formato. No se añade un publicador alternativo que eluda controles.

Alternativas descartadas: hash recursivo de la carpeta después de adjuntar la revisión; extraer dictamen leyendo palabras como «aprobado»; copiar automáticamente aprobación al promover iguales bytes.

### D05. Herramientas acotadas en lugar de permisos amplios

Nombres de herramientas propuestos, no firmas disponibles hoy:

- `session_work`, fuente prevista `tools/session_work.ts`: registrar/consultar el trabajo del encargo y sus transiciones autorizadas. No ejecuta delegaciones ni permite elegir otra raíz de proyecto.
- `session_artifacts`, fuente prevista `tools/session_artifacts.ts`: listar y leer artefactos registrados por ID, archivo y cursor; no recibe rutas arbitrarias. Se registra como herramienta directa, accesible también a lectores sin Code Mode.
- `capture_agent_source` en S08, fuente prevista `tools/capture_agent_source.ts`: capturar el resultado original y metadatos de una fuente por la interfaz Code Mode para no reemitirlos a través del modelo. No es un proxy HTTP ni un ejecutor de operaciones remotas.

Son herramientas de fronteras distintas, no un framework: todas reutilizan la identidad, permisos, almacenamiento y comprobaciones de rutas existentes. El registro de nuevas herramientas obliga a actualizar la aserción actual de «diez herramientas», comprobando nombres y autorizaciones, no solo aumentando un número.

Matriz mínima de acceso:

| Consumidor | Acceso permitido dentro del encargo autorizado |
|---|---|
| Productor | Sus artefactos y resultados de delegaciones asignadas, con el corpus comprobado. |
| Coordinador | Inventario y resultados de sus encargos; puede transferir al sustituto autorizado el trabajo pendiente sin cambiar autoría. |
| Investigador | Conclusiones delegadas y originales Jira que ya puede consultar. No código crudo ni documentos locales por el simple hecho de haberlos registrado: siguen pasando por lectores. |
| Lectores | Artefactos recibidos y fuentes de su corpus permitido, sin ampliar raíces ni especialidad. |
| Revisor | Entrega exacta del padre y fuentes pertinentes accesibles; solo él escribe el dictamen. |

El alcance se deriva del árbol verificado y de la asignación del trabajo; un ID o un campo de destinatario aportado por el modelo no amplían permisos. Se prueban explícitamente hermanos no asignados, otras raíces, symlinks, corpus distinto y suplantación de productor/Revisor.

Con guardado desactivado no se crean archivos nuevos de control, instantáneas ni binarios para simular recuperación persistente. Se utiliza el contexto recibido; leer un artefacto anterior solo es posible si sigue autorizado. Esto no cambia la persistencia nativa de conversaciones de OpenCode.

### D06. Estado observable y recibo de integración, sin scheduler

S06 registra inventario y permite recuperar resultados. S07 añade la coordinación sobre primitivas nativas de subagentes, espera y notificación. Se mantienen los límites por rol; no se impone un nuevo máximo agregado.

```text
sin_confirmar --> en_cola/en_curso --> resultado_disponible --> integrado
       |                  |
       +------------------+--> impedimento_concreto
```

`PENDIENTE_CONFIRMACION` solo prepara. Confirmar un encargo se vincula a pregunta/corpus/referencia y a la misma sesión; las confirmaciones independientes listas se envían concurrentemente dentro del límite. El trabajo se agrupa por fuentes y alcance cuando corresponda.

El recibo de integración asocia encargo, ejecución e identidad/hash del resultado con el coordinador. Es una declaración del coordinador contrastable por el Revisor, no una prueba automática de comprensión del texto. Eventos nativos y estados declarados conservan su procedencia.

Para la candidata actualizada, el publicador verifica el estado de trabajos requeridos cuando recibe identidad del encargo. Un borrador o parcial explícito conserva propósito y dependencias activas; no permite marcar todo el encargo completado. Los llamadores anteriores sin registro no adquieren una garantía ficticia: mantienen el contrato previo y el diagnóstico indica cobertura limitada.

La prueba de contrato nativa verifica exactamente cuándo vuelve una delegación, cómo se identifica el turno y qué significa esperar a una sesión. Estar idle o haber recibido una respuesta no implica que la pregunta esté investigada. Se utiliza la capacidad nativa documentada; no se añade polling ni se reanuda a un hijo para pedir un resultado que ya existe.

### D07. Diagnóstico independiente y mínimo desde el principio

`scripts/session-diagnostics.mjs` separa adquisición de datos y reducción determinista para fixtures. Emite a stdout JSON o Markdown; no exporta contenido conversacional como supuesto diagnóstico. El cliente/API y autenticación se reutilizan según la versión instalada y su OpenAPI, sin leer base de datos, credenciales ni construir puertos compartidos.

S03 cubre árbol, páginas, turnos, conteos por capa, intervalos y privacidad usando solo lo observable. Si faltan operaciones internas de execute se informa expansión desconocida; analizar JavaScript no reconstruye un conteo exacto de ejecución. La adquisición no es una dependencia dura de publicación, fuentes o coordinación.

S12 utiliza esas métricas para informes/alertas opt-in de actividad. Los umbrales se reciben de un acuerdo o de mediciones; no se instala un watcher permanente ni se elige un timeout universal. Se distingue progreso de herramientas, hijos activos y silencio anterior al primer evento.

Los campos exportados se permiten expresamente: IDs opacos, relaciones, marcas temporales, nombres de herramientas/roles, modelos, estados, unidades y conteos. Títulos, prompts, argumentos, contenidos, headers, URLs firmadas y cargas nativas no se vuelcan. El JSON conserva cobertura y origen de cada métrica.

Alternativa descartada: instrumentar toda operación interna antes de mejorar cualquier regla. Es costoso, no garantiza visibilidad retrospectiva y bloquearía correcciones independientes.

### D08. Instantáneas completas capturadas una vez

S08 conserva cada respuesta original por página o componente con manifiesto de campos/páginas y pendientes. La completitud se refiere al original exigido o al alcance de la pregunta, no al tamaño de una respuesta compacta. Fecha de actualización no sustituye al hash del contenido ni garantiza una transacción entre páginas: un cambio observado durante recuperación obliga a reserva o nueva comprobación, sin sobrescribir la instantánea anterior.

Para Jira en Code Mode, el resultado se pasa directamente desde la llamada autorizada a `capture_agent_source` en el mismo código, sin síntesis ni retranscripción del modelo. Se preserva la representación recibida: texto literal sin cambios u objeto serializado determinísticamente, identificando cuál de los dos se obtuvo. No se afirman bytes HTTP originales cuando la herramienta ya devolvió un objeto. La procedencia declarada por quien captura se mantiene distinta de un recibo nativo observable.

Un formato inesperado se preserva y diagnostica; no se prueba extracción de campos al azar ni se repite descubrimiento remoto para corregir un fallo local. El capturador aplica guardado y límites del rol y no puede ampliar la audiencia ni el corpus.

`session_artifacts` permite lectura paginada con cursores y localizadores de fragmento. Se prioriza esa lectura sin pérdidas; una vista derivada solo se genera para formatos conocidos y mantiene mapa al original. Así una línea HTML larga no obliga a recortar o sustituir el origen. No se añade un conversor universal.

La vigencia se comprueba contra identidad y alcance de pregunta, criterios, corpus y referencia. Se reutilizan originales, no conclusiones como si fueran aprobación. El Revisor puede cotejar la misma instantánea íntegra con independencia.

### D09. Adjuntos con prueba de extremo a extremo y salida acotada

S09 comienza con un PNG sintético representativo cuyo contenido sea comprobable. Valida localizar, obtener, descargar, presentar al modelo y lectura con evidencia de contenido; HTTP 200 y dimensiones no son prueba visual.

Se usa primero el mecanismo nativo de archivos/media del runtime instalado y lectores autorizados. Si hay que guardar binarios, se añade una ruta interna de instantáneas con destinos derivados del registro y guardado activo; no se relaja la regla `.md` de los publicadores de entregas ni se permite escribir rutas arbitrarias.

No se presupone que fetch dentro de Code Mode sea un Response estándar. La alternativa binaria se prueba una vez antes del lote. Si el mecanismo nativo no presenta el archivo, la etapa queda bloqueada y se solicita la capacidad mínima: no se construye OCR ni se instala otro servicio como salida automática. El resto de las sesiones no depende del éxito de un visor concreto.

### D10. Validación por perfil y transformaciones después

S10 añade una utilidad pura compartida por publicadores. El perfil de formato y los vínculos de fuente son explícitos. Los flujos actualizados de Historia lo suministran; documentos genéricos o antiguos conservan sus comprobaciones previas y una cobertura de validación no determinada, no aprobación implícita.

Las verificaciones bloqueantes se limitan a estructura declarada, IDs/cobertura verificable, referencias a archivos/versión y citas vinculadas a fragmento/hash. La normalización inicial permite finales CRLF/LF y delimitadores de cita Markdown externos; no cambia palabras, acentos, puntuación interna ni erratas del original. Los recuentos salen del conjunto de IDs. Las ambigüedades funcionales son alertas para el Revisor.

S11 añade sustituciones exactas y extracción de secciones con delimitación estable y única, sobre hash esperado. No ofrece regex arbitrarias ni selección semántica por título aproximado. Toda transformación se realiza en memoria y se valida el conjunto completo antes de pasar al commit de S04. Se conserva el manifiesto de archivos; no se publican parches como entregables.

Alternativa descartada: integrar primero corrección semántica y parser Markdown universal en el publicador. Un validador así duplicaría al Revisor y rompería documentos históricos.

### D11. Recuperación de proveedor y respuestas concisas como consumidores

S12 consulta modelo efectivo en la sesión afectada mediante capacidades nativas verificadas. Un cambio se realiza solo por un canal ya autorizado para esa sesión; si el rol carece de él se pide al usuario, sin añadir un proxy general de cambio de modelos. Se comprueba el efecto antes de reanudar y se respeta el restablecimiento conocido de cuota. No se altera la política global de reintentos.

S13 cambia la norma compartida de respuesta posterior a publicación y sus comprobaciones documentales. Resumir exige guardado confirmado y acceso efectivo al contenido completo por el receptor. Si falta acceso, se transmite íntegro por una vía permitida o se declara el impedimento; si el usuario pide contenido completo se devuelve. Se mantienen versiones, evidencia, impacto, pendientes y siguiente acción.

Las referencias ya condicionales se conservan; no se introduce inyección normativa o esfuerzo de modelo nuevo. Esas optimizaciones quedan fuera de implementación automática y solo se reconsideran con evidencia posterior y autorización.

### D12. Sesiones pequeñas y dependencias de capacidad, no referencias circulares

Las sesiones son unidades de implementación y handoff, no estimaciones temporales ni nuevos agentes. El orden siguiente es el recomendado en un único workspace. Pueden pausarse tras un cierre; no se empieza una sesión si sus dependencias duras no están verificadas. Compartir archivo no convierte dos sesiones en seguras para edición simultánea.

| Sesión | Grupo y resultado | Dependencias duras | M cubiertas |
|---|---|---|---|
| S01 | Interfaz de herramientas y shell con diagnóstico preciso | Ninguna | M14, M09 |
| S02 | Evidencia, corpus y exploración por pregunta en sus propietarios | Ninguna | M05, M12, M16 base |
| S03 | Diagnóstico reproducible y línea base disponible | Ninguna | M01 |
| S04 | Manifiestos y commit idempotente, manteniendo contratos anteriores | Ninguna | M03 base, garantía de M04/M07/M10 |
| S05 | Promoción de archivos completos y revisión/indexado por versión | S04 | M07 completa sin cambios, M10 |
| S06 | Registro mínimo de trabajo y lectura acotada para recuperación | S04 | M03 |
| S07 | Confirmación concurrente y resultados integrados antes del cierre | S01, S06 | M02, M13 |
| S08 | Captura, lectura y reutilización de instantáneas completas | S02, S06 | M06, M16 reutilización |
| S09 | Adjuntos: una lectura real antes del lote | S01, S08 | M15 |
| S10 | Validación mecánica por perfil, IDs y fuentes vinculadas | S08 | M08 |
| S11 | Sustituciones y extracción exactas sobre promoción existente | S05, S10 | M07 transformaciones |
| S12 | Recuperación de cuota/transporte y alertas informativas | S03, S07 | M04 |
| S13 | Respuestas concisas e instrucciones por rama con acceso real | S07, S08 | M11 |
| S14 | Campaña integrada, comparación e instalación consumidora | S09, S11, S12, S13 | Evaluación M01–M16 |

```text
Independientes: S01, S02, S03, S04

S04       --> S05
S04       --> S06
S01 + S06 --> S07
S02 + S06 --> S08
S01 + S08 --> S09
S08       --> S10
S05 + S10 --> S11
S03 + S07 --> S12
S07 + S08 --> S13

S09 + S11 + S12 + S13 --> S14
```

La tabla es la autoridad del DAG; el diagrama resume las rutas principales. No hay dependencia S05 de S10, S01/S02 de M03, ni S07 de todo el diagnóstico. S03 permite observar coste, pero su bloqueo de acceso al servicio no bloquea las pruebas deterministas de otras sesiones.

Trazabilidad completa de las ideas:

| Mejora | Sesiones de implementación | Evidencia de cierre principal |
|---|---|---|
| M01 | S03, S14 | Fixtures paginados/anidados, privacidad y comparación con reservas. |
| M02 | S07 | Eventos de dos investigaciones solapadas con límite dos y secuenciales con uno. |
| M03 | S04, S06 | Recuperación tras publicar sin repetir trabajo, identidad/corpus/intentos conservados. |
| M04 | S04, S12 | Respuesta perdida sin duplicado y modelo efectivo del hijo con autorización. |
| M05 | S02 | Corpus previo y cambios de índice no producen ausencia funcional falsa. |
| M06 | S08 | Original íntegro accesible reutilizado entre agentes sin otra recuperación. |
| M07 | S05, S11 | Promoción sin reemisión y corrección exacta como nueva entrega completa. |
| M08 | S10 | IDs, citas alteradas y errata original comprobados de forma determinista. |
| M09 | S01 | Formas shell permitidas y rechazos con alternativa, sin ampliar permisos. |
| M10 | S05 | Revisiones tardías/parciales no aprueban otra versión y el índice es coherente. |
| M11 | S13 | Resumen con acceso y alternativa íntegra cuando falla guardado o acceso. |
| M12 | S02 | Test leído, resultado observado y requisito documental separados. |
| M13 | S07 | Resultado integrado una vez; hijo activo y notificación tardía no cierran otra ejecución. |
| M14 | S01 | Herramienta directa usada fuera del catálogo y estado no invocada distinto de fallo. |
| M15 | S09 | Adjunto leído de extremo a extremo o bloqueo de etapa explícito, sin lote de fallos repetidos. |
| M16 | S02, S08 | Cada ampliación responde a una pregunta y reutiliza fuentes comunes con pendientes separados. |

## Risks / Trade-offs

- [Crecimiento del control de sesión] -> Añadir solo los registros de la sesión implementada; blobs fuera del JSON y referenciados por hash. No crear un catálogo global entre proyectos.
- [Más metadatos que conducta efectiva] -> Separar aserciones de contenido, pruebas runtime y conversaciones con modelo; un recibo de integración no valida semántica por sí solo.
- [Crash con bloqueo abandonado] -> Comprobar propietario activo antes de recuperar; si no se puede verificar, devolver impedimento en vez de quitar el bloqueo por antigüedad.
- [Captura incompleta o no atómica de fuentes] -> Registrar campos, páginas, versión y procedencia; reservar la conclusión si cambia la fuente durante la lectura.
- [Permisos ampliados indirectamente por el registro] -> Comprobar encargo, rol, corpus, archivo y destinatario en cada acceso; no aceptar rutas ni etiquetas de visibilidad como autorización.
- [Concurrencia incrementa cuota] -> Conservar límites configurados y medir el agregado; cualquier límite global o cambio de modelos requiere otra decisión.
- [Compatibilidad frente a garantías nuevas] -> Metadatos opcionales conservan consumidores antiguos; se informa qué garantías no están disponibles para ellos y los flujos actualizados adoptan los nuevos campos.
- [Adjuntos no presentables en un runtime] -> Bloquear solo esa etapa y no declarar lectura; no prometer que toda imagen funcionará ni crear OCR como fallback implícito.

## Migration Plan

1. Implementar y verificar por sesiones. Cada una mantiene instalable el paquete y no reescribe copias instaladas como fuente.
2. S04 incorpora lectura compatible del estado anterior y extensión aditiva al guardar. No modifica originales, versiones ni informes históricos; la importación de un artefacto anterior calcula identidad solo tras verificar propietario y archivos, y no inventa fecha de publicación, encargo ni aprobación.
3. El primer guardado con datos nuevos preserva una copia verificable del control anterior. Una raíz con versión futura desconocida debe rechazarse con diagnóstico, no reescribirse descartando campos.
4. Probar instalación y actualización en consumidor separado, incluyendo comentarios JSONC, personalizaciones, dependencias y conflictos legacy. Las nuevas herramientas se registran en el mismo plugin; no reaparece un registrador independiente ni el directorio singular `plugin/` instalado.
5. No cambiar `agent-settings.json` por defecto. Si una necesidad real obliga a añadir una clave, detener esa ampliación y revisar juntos esquema, ejemplo y migración; no introducirla silenciosamente dentro de una tarea de diagnóstico.
6. Para despliegue real, esperar a que terminen los encargos y seguir README. Las pruebas usan servidor privado y configuración aislada; no paran ni reinician el servicio compartido del usuario.
7. Reversión: detener encargos del consumidor, restaurar el paquete anterior y su copia de control compatible, conservando aparte el estado nuevo y todos los entregables nuevos. Nunca ejecutar herramientas antiguas contra un control nuevo suponiendo compatibilidad ni borrar publicaciones para volver atrás. Documentar la recuperación manual necesaria si hay entregas posteriores a la copia.

## Validation Strategy

- **Determinista:** contadores, intervalos con reloj simulado, digests, manifiestos, transiciones, acceso, normalización y transformaciones. Usar fixtures sintéticos o anonimizados; ninguna clave histórica privada es requisito de los tests.
- **Motor real sin LLM:** consumidor instalado, herramientas efectivas directas/Code Mode, permisos Jira bajo ambos alias, lectura acotada, publicación antes/después de reload, reintento y estado persistido. Reutilizar `test-support/opencode.mjs`.
- **Conducta con modelo:** casos de herramienta directa, dos investigaciones independientes, respuesta tardía, original reutilizado, PNG legible y respuesta concisa con fallback. El prompt de entrada expresa el objetivo, no dicta la secuencia que se pretende acreditar. Un fixture programado que ejecuta llamadas concurrentes no demuestra que el agente las elija.
- **Servicios reales:** Jira y Codegraph se validan solo con fuente y acceso autorizados. Si faltan, registrar el pendiente; no elevar pruebas sintéticas a validación real.
- **Por sesión con cambio de comportamiento/runtime:** ejecutar `node --test *.test.ts` y `git diff --check`; añadir los casos a las pruebas existentes cuando encajen. Para nuevas unidades acotadas pueden añadirse tests raíz específicos; no introducir un segundo runner.
- **Comparación:** fijar casos y condiciones antes de S01/S02 cuando se disponga de datos, conservando trazas sanitizadas para reducirlas con S03. Si no hay línea base comparable, no recrearla como si fuera histórica: informar resultados posteriores y limitación. Comparar camino crítico, concurrencia, llamadas por capa, repeticiones, caracteres publicados y errores mecánicos sin sumar tiempos solapados.
- **Handoff:** cada sesión deja tareas marcadas solo si están verificadas, contratos/campos incorporados, pruebas y límites reales, y siguiente sesión habilitada. El registro de resultados final se publica como documento nuevo; no se actualizan informes históricos para aparentar nuevas verificaciones.
