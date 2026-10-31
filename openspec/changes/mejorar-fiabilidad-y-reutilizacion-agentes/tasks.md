# Tasks

## Guía de ejecución por sesiones

Cada grupo numerado corresponde a una sesión S01–S14. El orden es recomendado, no una cadena de dependencias artificial: se puede elegir otra sesión con sus dependencias duras verificadas. No editar simultáneamente propietarios compartidos. Consultar `design.md`, D12, para el DAG y la trazabilidad M01–M16.

Al empezar, leer solo la spec de la sesión, las decisiones de diseño indicadas y los propietarios listados; contrastar cambios locales sin revertirlos. No repetir una exploración global ni rehacer capacidades ya verificadas. Los nombres de herramientas nuevas del diseño son propuestas del paquete, no firmas actuales de OpenCode.

**Cierre común:** no marcar una tarea por buscar palabras en Markdown. Cada casilla indica su comprobación; cada sesión añade tests y documentación en ese momento y termina con suite raíz, diff y handoff. El handoff identifica tareas completadas/bloqueadas, contratos introducidos, comandos/resultados, límites y siguiente sesión habilitada. No requiere otro archivo narrativo por sesión.

Pruebas consumidoras: usar configuración y servidor privados según `test-support/opencode.mjs`, con temporales bajo `C:\Users\potero\AppData\Local\Temp\opencode` o un equivalente aislado autorizado. No tocar servicio compartido ni credenciales del usuario. Las conversaciones con modelo y servicios reales usan solo acceso y presupuesto autorizados; si falta, sus tareas permanecen pendientes con impedimento, sin sustituirlas por una aserción estática.

## 1. S01 — Interfaz efectiva y shell permitido

**Dependencias duras:** ninguna. **Cobertura:** M14, M09. **Leer:** spec `operacion-acotada-agentes`; D01; referencias de configuración/publicación, `consulta-jira`, `consulta-codegraph`, Lector Código, plugin, `agent_session.test.ts`, `jira_access.test.ts`. **Fuera:** registro de trabajo, fuentes compartidas y nuevos permisos generales.

- [x] 1.1 Precisar en las referencias dueñas cómo resolver herramienta directa frente a Code Mode y distinguir declarada/no invocada, inventario parcial, denegada, error, guardado desactivado y publicada; verificar que los ejemplos usan las firmas reales y no exigen escrituras de prueba.
- [x] 1.2 Documentar y hacer comprobables las consultas separadas de rama, commit y estado con directorio de trabajo explícito; mejorar el rechazo de shell con alternativa permitida cuando exista, verificando en `agent_session.test.ts` rutas con espacios, separadores, redirecciones y acciones destructivas sin relajar la allowlist.
- [x] 1.3 Añadir en el consumidor privado una comprobación de herramienta directa ausente de Code Mode y de denegación/error real; verificar que la herramienta se usa por su interfaz correcta y que no se informa una publicación no intentada como fallida.
- [ ] 1.4 Validar con modelo un encargo sintético que necesite configuración y publicación y otro de solo título; comprobar llamadas reales y salida, sin dictar en el prompt la interfaz que se pretende acreditar.
- [x] 1.5 Actualizar únicamente los punteros de rol y ayuda de uso necesarios, ejecutar `node --test *.test.ts` y `git diff --check`, y entregar handoff con diferencias entre comprobación documental, motor real y conducta con modelo.

## 2. S02 — Corpus, evidencia y parada por pregunta

**Dependencias duras:** ninguna. **Cobertura:** M05, M12, base de M16. **Leer:** spec `operacion-acotada-agentes`; D01; fuentes/evidencias, consulta/informe Codegraph, consulta Jira y roles consumidores. **Fuera:** caché global, capturador de fuentes y presupuestos numéricos nuevos.

- [x] 2.1 Afinar la comprobación y reutilización de corpus en `consulta-codegraph` y su informe, verificando con fixtures corpus anterior al cambio, referencia no demostrada, árbol modificado y cero pendientes con avisos relevantes; conservar ausencia funcional como no determinada cuando proceda.
- [x] 2.2 Precisar clases de evidencia y conflictos en `fuentes-evidencias.md`, verificando con casos anonimizados test leído sin ejecutar, mecanismo de versionado sin error HTTP observado, excepción específica frente a comentario general y mínimo/máximo de retención sin precedencia acordada.
- [x] 2.3 Incorporar el registro proporcional por pregunta y reglas de expansión/parada en sus referencias dueñas, verificando una duda concreta que no abre auditoría general ni consulta enlaces remotos de todas las historias.
- [ ] 2.4 Probar con modelo un caso de fuente decisiva pendiente y dos preguntas con fuentes comunes; comprobar que se preservan sus pendientes y que asignar responsable humano no declara completada la recuperación pendiente.
- [x] 2.5 Actualizar los punteros de lectores/coordinadores sin duplicar reglas, ejecutar suite raíz y diff, y entregar handoff con validación real de Codegraph separada de fixtures y de la comprobación documental.

## 3. S03 — Diagnóstico independiente y línea base

**Dependencias duras:** ninguna. **Cobertura:** M01. **Leer:** spec `diagnostico-ejecuciones`; D07; `package.json`, tipos instalados V2, documentación V2 de API/troubleshooting y soporte de consumidores. **Fuera:** nuevo servicio, lectura de base de datos e instrumentación invasiva de toda operación interna.

- [ ] 3.1 Contrastar específicamente paginación, mensajes, sesiones hijas y marcas temporales con el contrato V2 instalado en un servidor privado; verificar qué campos existen mediante una prueba del adaptador y declarar los ausentes, sin inventar rutas o IDs.
- [ ] 3.2 Crear `scripts/session-diagnostics.mjs` con adquisición separada del cálculo y selección de raíz, descendientes e intervalo; verificar JSON/Markdown, todas las páginas, deduplicación y exclusión de la auditoría mediante fixtures reproducibles.
- [ ] 3.3 Implementar conteos por capa y expansión recursiva de contenedores, verificando execute con tres hijas, parallel anidado, execute local, hijas desconocidas y 404 de dominio propagado sin multiplicar incidentes ni inferir HTTP.
- [ ] 3.4 Implementar métricas temporales, tokens/unidades y procedencia, verificando con reloj simulado esperas solapadas, cierre del intervalo, primer evento ausente y datos autodeclarados parciales.
- [ ] 3.5 Aplicar exportación por lista de campos permitidos, verificando que un fixture con prompts, argumentos documentales, headers, URLs firmadas y razonamiento cifrado no los expone en JSON ni Markdown.
- [ ] 3.6 Documentar el comando real y sus reservas en README, fijar casos y obtener una línea base autorizada cuando exista; verificar que se registran versión, condiciones y dispersión o ausencia de datos comparables, ejecutar suite raíz/diff y entregar handoff sin porcentajes prometidos.

## 4. S04 — Manifiestos y publicación idempotente

**Dependencias duras:** ninguna. **Cobertura:** base de M03 y garantías de M04/M07/M10. **Leer:** spec `publicacion-y-revision`; D02–D04; `session_store.ts`, todos los publicadores, `define_tool.ts`, `identity.ts`, plugin y pruebas de publicación. **Fuera:** orquestación, snapshots y dictamen estructurado de S05.

- [ ] 4.1 Añadir lectura compatible del control anterior y registros aditivos de artefactos/operaciones con copia de control previa, verificando fixtures antiguos, versión futura desconocida y conservación de rutas y archivos sin inferir encargo o aprobación histórica.
- [ ] 4.2 Incorporar manifiesto determinista de archivos del productor y hashes de bytes, verificando orden independiente, contenido cambiado y exclusión de revisiones sin ignorar modificaciones externas o archivos no registrados.
- [ ] 4.3 Añadir identidad lógica opcional a los publicadores conservando sus argumentos actuales y autoría runtime, y hacer que los flujos actualizados conserven y reenvíen esa identidad; verificar misma clave/digest con mismo resultado, clave con contenido distinto rechazada y corrección con clave nueva como otra entrega completa.
- [ ] 4.4 Separar preparación, materialización, confirmación y proyección del índice en `session_store.ts`; verificar fallos inyectados entre fases/archivos y fallo del índice sin borrar publicaciones ya confirmadas ni adoptar destinos ajenos.
- [ ] 4.5 Verificar exclusión mutua y recuperación de bloqueo abandonado con dos reintentos concurrentes y proceso interrumpido; comprobar resultado único y rechazo seguro cuando no se pueda demostrar que el propietario del bloqueo dejó de estar activo.
- [ ] 4.6 Ampliar `session_publication.test.ts` para pérdida de respuesta y reintento antes/después de recargar el location; verificar mismas rutas/hash, resolvedor por instancia, guardado:false y llamadas literales antiguas.
- [ ] 4.7 Documentar identidad de operación, corrección y límites legacy en publicación/revisión y README, ejecutar suite raíz/diff y entregar los campos reales incorporados para que S05/S06 los reutilicen sin rediseñar el commit.

## 5. S05 — Promoción completa y revisión por versión

**Dependencias duras:** S04. **Cobertura:** M07 sin cambios, M10. **Leer:** spec `publicacion-y-revision`; D04; publicadores, norma de publicación/revisión, formato de revisión, Planificador/Revisor y contrato de arquitectura. **Fuera:** sustituciones, extracción y validador completo M08.

- [ ] 5.1 Añadir modalidad de origen registrado/hash por archivo a los publicadores de entregas, verificando exclusión con contenido literal, promoción de bytes idénticos sin reemisión y conservación de todos los archivos de la entrega del Planificador.
- [ ] 5.2 Verificar autoría y acceso del origen mediante el registro S04 y árbol permitido, con tests de hash incorrecto, artefacto ajeno, ruta enlazada y productor distinto; comprobar que no se hereda aprobación ni se cambia la propiedad del origen.
- [ ] 5.3 Ampliar `write_review_documents` con dictamen estructurado opcional y vínculo entrega/hash, verificando que solo el Revisor autorizado puede registrarlo después de guardar el informe y que la llamada narrativa anterior sigue admitida sin aprobación inferida.
- [ ] 5.4 Registrar versiones anteriores, última publicada/revisada/aprobada completa y resultados parciales, verificando revisión tardía de v1 tras publicar v2, aprobación parcial, fallo y guardado desactivado del Revisor.
- [ ] 5.5 Generar el índice desde esos registros con rutas relativas verificables, comprobando hash del productor estable tras revisión y todos los enlaces a entregas e informes existentes, sin convertir aprobación de publicación en integración global de arquitectura.
- [ ] 5.6 Actualizar formatos/norma y roles consumidores con las modalidades reales, ampliar regresión instalada con reload, ejecutar suite raíz/diff y entregar handoff que confirme que S05 no depende de M08 ni de transformaciones.

## 6. S06 — Registro mínimo y lectura acotada para recuperación

**Dependencias duras:** S04. **Cobertura:** M03. **Leer:** specs `continuidad-investigaciones` y `evidencia-reutilizable`; D02, D05–D06; roles, identidad, plugin, publicadores y pruebas de permisos. **Fuera:** scheduler, nueva política de modelos y acceso general a documentos del Investigador.

- [ ] 6.1 Añadir registro mínimo de encargos, preguntas/criterios, responsables, corpus, referencia, resultados y pendientes; verificar varios encargos en una sesión, IDs locales frente a IDs reales y rechazo de asociaciones no verificables.
- [ ] 6.2 Registrar `session_work` y `session_artifacts` con contratos acotados y validación runtime, verificando nombres, interfaces y permisos efectivos en consumidor instalado; actualizar las pruebas que hoy esperan exactamente diez herramientas.
- [ ] 6.3 Implementar inventario y lectura paginada por ID/archivo/cursor sin rutas arbitrarias; verificar matriz D05, hermanos no asignados, otra raíz/corpus, symlinks y ausencia de acceso del Investigador a código crudo o documentos locales.
- [ ] 6.4 Incorporar recuperación antes de sustituir en Planificador/Refinador y referencias compartidas, verificando un fallo tras publicación que reutiliza artefacto y conserva fuentes, decisiones, IDs e intentos, sin suplantar al productor anterior ni repetir trabajo completo.
- [ ] 6.5 Probar resultados parciales y guardado desactivado, verificando que no se crea persistencia oculta, no se inventan rutas y una continuidad sin historial verificable no reinicia intentos de arquitectura.
- [ ] 6.6 Actualizar ayuda de las dos herramientas y punteros de rol, comprobar ambos alias Jira y restricciones de Test sin relajación, ejecutar suite raíz/diff y entregar contrato de acceso para S07/S08.

## 7. S07 — Confirmación paralela e integración de resultados

**Dependencias duras:** S01, S06. **Cobertura:** M02, M13. **Leer:** spec `continuidad-investigaciones`; D06; Refinador, Investigador, Planificador, registro y contrato nativo V2 de delegación/espera/eventos. **Fuera:** polling, reanudaciones para pedir resultados existentes y un límite global de concurrencia nuevo.

- [ ] 7.1 Añadir una prueba de contrato en servidor privado que observe retorno de delegación y continuación, identidad del turno y espera/notificación nativa; verificar que idle o retorno de llamada no se usan como prueba de investigación terminada.
- [ ] 7.2 Registrar confirmaciones y estados por encargo/ejecución con procedencia, verificando transiciones repetidas, notificaciones tardías y duplicadas sin completar otra ejecución ni aceptar PENDIENTE_CONFIRMACION como resultado.
- [ ] 7.3 Actualizar el protocolo compartido y su enrutado para confirmar concurrentemente las consultas independientes validadas, verificando mediante eventos límite dos con solapamiento, límite uno secuencial y corpus incorrecto que bloquea solo su consulta.
- [ ] 7.4 Incorporar recibo de integración y comprobación de trabajos requeridos al publicar candidata actualizada; verificar dos resultados de distinta duración integrados una vez y rechazo de cierre completo con hijo requerido activo, manteniendo parcial explícito con propósito y efecto.
- [ ] 7.5 Validar el flujo con modelo sin ordenar en el prompt que paralelice o espere, comprobando confirmaciones, sesiones, resultados y publicación; distinguir esa evidencia de un fixture programado que ya ejecuta llamadas concurrentes.
- [ ] 7.6 Corregir criterios de cierre de coordinadores y referencia de delegación sin duplicar reglas, ejecutar suite raíz/diff y entregar handoff con semántica nativa realmente comprobada y concurrencia agregada observada.

## 8. S08 — Capturar y reutilizar fuentes completas

**Dependencias duras:** S02, S06. **Cobertura:** M06 y reutilización de M16. **Leer:** spec `evidencia-reutilizable`; D05, D08; consulta Jira, fuentes/evidencias, acceso de artefactos y pruebas de permisos/publicación. **Fuera:** repositorio global de conocimiento y conversor universal de formatos.

- [ ] 8.1 Registrar `capture_agent_source` en Code Mode con identidad y guardado del rol, verificando transferencia directa de un resultado de lectura a captura en el mismo código sin retranscripción del modelo, sin convertirse en proxy HTTP ni admitir rutas de destino.
- [ ] 8.2 Guardar originales y manifiestos de fuente, corpus, recuperación, versión/hash y cobertura por campos/páginas, verificando texto literal y objetos serializados determinísticamente, comentarios paginados, campos personalizados y cambio de versión durante recuperación.
- [ ] 8.3 Extender lectura por cursor/localizador y vistas derivadas solo de formatos conocidos, verificando HTML de más de 2000 caracteres en una línea con tablas, menciones y numeración recuperables y original intacto; un envoltorio desconocido produce diagnóstico, no undefined interpretado como ausencia.
- [ ] 8.4 Incorporar búsqueda de evidencia vigente antes de consultar/delegar y transmisión de originales accesibles, verificando dos preguntas con recorrido común y pendientes separados, repetición justificada por cambio de alcance y rechazo por visibilidad/corpus incompatibles.
- [ ] 8.5 Verificar independencia del Revisor usando la misma instantánea completa y una entrega nueva, comprobando acceso real, conservación del cotejo anterior válido y ausencia de aprobación heredada; mantener enrutado de documentación/código local por sus especialistas.
- [ ] 8.6 Actualizar consulta Jira, fuentes/evidencias y consumidores con contratos efectivos, probar captura desactivada y ambos alias en consumidor privado, ejecutar suite raíz/diff y entregar handoff con recuperaciones evitadas observadas, no estimadas.

## 9. S09 — Un adjunto leído antes del lote

**Dependencias duras:** S01, S08. **Cobertura:** M15. **Leer:** spec `evidencia-reutilizable`; D09; lectura documental, Investigador/Lector Documentación, contrato binario/media V2 y almacenamiento de instantáneas. **Fuera:** OCR propio, servicios nuevos y permisos arbitrarios de escritura.

- [ ] 9.1 Crear un fixture PNG sintético comprobable y probar las cinco etapas con el mecanismo nativo autorizado, verificando contenido realmente presentado y respuesta visual, no solo HTTP 200, firma o dimensiones; si falta una etapa mantener pendiente la comprobación visual con su impedimento.
- [ ] 9.2 Incorporar la barrera de prueba representativa antes del lote y la corrección de método una sola vez, verificando un runtime simulado sin arrayBuffer y que el mismo fallo no se repite para los otros archivos.
- [ ] 9.3 Integrar reutilización de binario/localizador válido y causas de nueva descarga, verificando copia accesible, URL caducada sin copia, permisos y guardado desactivado sin archivos ocultos.
- [ ] 9.4 Añadir únicamente el adaptador mínimo si el mecanismo nativo requiere unir capacidades ya disponibles, verificando que presenta el archivo y usa destinos internos registrados; si no existe capacidad compatible, informar el bloqueo sin construir OCR ni relajar publicadores Markdown.
- [ ] 9.5 Documentar etapas y límites en lectura documental y roles, ejecutar tests de método/lote más suite raíz/diff y entregar handoff que distinga control implementado de lectura visual V2 realmente verificada; no marcar la prueba visual si solo se diagnosticó su bloqueo.

## 10. S10 — Validación mecánica por perfil y fuente

**Dependencias duras:** S08. **Cobertura:** M08. **Leer:** spec `validacion-mecanica-entregables`; D10; Historia/criterios de aceptación, `user-stories`, publicación/revisión y publicadores. **Fuera:** análisis semántico automático y bloqueo universal de documentos legacy.

- [ ] 10.1 Añadir una utilidad pura de validación y perfil explícito para el formato vigente de Historia/incidencias, verificando apartados, espacios de IDs confirmados/propuestos y mantenimiento de llamadas genéricas anteriores sin perfil.
- [ ] 10.2 Comprobar IDs únicos, cobertura original, destinos y referencias a archivos/versión con fuentes vinculadas, verificando criterios repartidos o pendientes, referencia inconsistente a OR-13 como alerta y nueve incidencias con recuento generado de nueve.
- [ ] 10.3 Implementar cotejo literal por fragmento y hash con normalización D10, verificando eliminararan/eliminaran, distintos de/diferentes de, conservación de presevar y CRLF/LF sin equivalencia semántica implícita.
- [ ] 10.4 Aplicar comprobaciones al contenido completo materializado por argumentos literales y promoción cuando esta modalidad esté disponible, verificando rechazo antes del commit, no creación parcial y reporte separado de errores, alertas y comprobaciones pendientes.
- [ ] 10.5 Actualizar formatos y publicadores para que los flujos nuevos suministren perfil/vínculos sin cambiar el cuerpo funcional de la historia ni mover evidencia desde incidencias, ejecutar suite raíz/diff y entregar ejemplos válidos y fallidos para S11.

## 11. S11 — Correcciones y extracción sin regeneración

**Dependencias duras:** S05, S10. **Cobertura:** transformaciones M07. **Leer:** specs `publicacion-y-revision` y `validacion-mecanica-entregables`; D10; modalidades de origen de S05 y validador S10. **Fuera:** regex arbitrarias, búsqueda semántica de secciones y parches como entregables finales.

- [ ] 11.1 Añadir sustituciones con texto anterior/nuevo y cantidad esperada de coincidencias, verificando una palabra corregida, cero o múltiples coincidencias, hash incorrecto y encadenamiento determinista sobre una copia del origen.
- [ ] 11.2 Añadir extracción de secciones con delimitación estable y única, verificando sección inexistente, duplicada y versión distinta sin selección heurística ni cambios al original.
- [ ] 11.3 Materializar y validar en memoria la entrega nueva completa antes del commit S04, verificando conservación de archivos restantes y rechazo total si una transformación rompe IDs, referencias o citas.
- [ ] 11.4 Probar reintento idempotente de transformación y nueva corrección deliberada, verificando resultado único, procedencia del origen y revisión propia pendiente de cada versión nueva.
- [ ] 11.5 Documentar argumentos reales y límites junto a sus publicadores/formatos, ejecutar suite raíz/diff y entregar handoff con caracteres enviados al publicador frente a la vía literal, sin atribuir ahorro temporal no medido.

## 12. S12 — Cuota, transporte y actividad de la sesión correcta

**Dependencias duras:** S03, S07. **Cobertura:** M04. **Leer:** spec `continuidad-investigaciones`; D07, D11; adaptador V2, plugin, registro y diagnóstico. **Fuera:** fallback automático de modelos, política global de reintentos y watcher permanente.

- [ ] 12.1 Exponer consulta acotada del modelo efectivo de la sesión afectada mediante el canal nativo permitido, verificando padre cambiado/hijo sin cambiar y que no se inspeccionan sesiones fuera del encargo.
- [ ] 12.2 Incorporar recuperación de cuota con restablecimiento conocido y cambio solo por canal autorizado, verificando espera informada, negativa sin autorización y comprobación del modelo después de un cambio dirigido; no crear otro hijo para eludir cuota.
- [ ] 12.3 Correlacionar interrupción anterior a ejecución, iniciada y completada con respuesta perdida, verificando recuperación S04/S06 antes de repetir y causa indeterminada cuando faltan marcas.
- [ ] 12.4 Añadir diagnóstico/alertas informativas opt-in con umbral medido o acordado, verificando con reloj simulado silencio sin primer evento, herramienta lenta con progreso e hijos activos, sin cancelación ni cambio de modelo automático.
- [ ] 12.5 Actualizar instrucciones de recuperación y ayuda del diagnóstico con contratos V2 comprobados, ejecutar suite raíz/diff y entregar handoff que separe fallos inyectados de transporte/cuota realmente observados.

## 13. S13 — Menos contexto y respuestas completas accesibles

**Dependencias duras:** S07, S08. **Cobertura:** M11. **Leer:** spec `contexto-proporcional`; D11; `operativa-comun`, ramas de skills, roles consumidores, README y comprobaciones documentales en `jira_access.test.ts`. **Fuera:** nueva skill genérica, inyección normativa y cambios de esfuerzo/modelos.

- [ ] 13.1 Revisar únicamente ramas activas y duplicaciones normativas comprobadas, verificando que una consulta puntual no carga el flujo completo y que la reutilización en sesión exige lectura íntegra vigente.
- [ ] 13.2 Cambiar la norma compartida de respuesta tras guardado confirmado y accesible, verificando resultado, rutas, versión/revisión y pendientes sin reemitir documentos, y contenido íntegro cuando el usuario lo solicita.
- [ ] 13.3 Mantener alternativa íntegra con guardado desactivado/fallido o receptor sin acceso, verificando que una ruta o hash no sustituyen contenido recibido y que no se eluden permisos para resumir.
- [ ] 13.4 Probar con modelo una delegación nueva con reglas efectivamente accesibles y una preentrega con hijo activo, verificando que resumen no oculta evidencia/impacto/siguiente acción ni se presenta como candidata completa.
- [ ] 13.5 Actualizar las aserciones que exigen siempre contenido y la ayuda de README/roles en coherencia, ejecutar suite raíz/diff y entregar comparación de contexto/generación disponible sin introducir políticas de modelos no autorizadas.

## 14. S14 — Integración, evaluación y entrega consumidora

**Dependencias duras:** S09, S11, S12, S13 y sus dependencias transitivas. **Cobertura:** evaluación de M01–M16. **Leer:** siete specs, handoffs S01–S13 y `design.md`, estrategia de validación/migración. **Fuera:** compensar aquí tests o documentación que una sesión anterior debía entregar.

- [ ] 14.1 Ejecutar campaña sintética integrada de configuración, originales, confirmación concurrente, resultados integrados, promoción, revisión exacta y corrección con nueva revisión; verificar rutas/hash, fuentes completas y todos los criterios sin aprobar contenido por validación mecánica.
- [ ] 14.2 Ejecutar variantes integradas de guardado desactivado, denegación, fallo antes de ejecutar, respuesta perdida, reload y sustitución posterior a publicación; verificar efectos únicos, pendientes intactos e intentos de arquitectura conservados.
- [ ] 14.3 Comprobar en consumidor instalado la convivencia de contratos anteriores/nuevos y actualización/reversión documentadas, verificando JSONC, dependencias, personalizaciones y conflictos legacy preservados, sin reiniciar el servicio compartido ni eliminar entregas nuevas.
- [ ] 14.4 Reducir con S03 los casos comparables antes/después y registrar camino crítico, concurrencia, conteos por capa, errores, repeticiones, caracteres/versiones y correcciones mecánicas; verificar procedencia, dispersión, ausencia de datos y exclusión de tiempos solapados.
- [ ] 14.5 Validar Jira y Codegraph reales solo con corpus/acceso autorizados y registrar por separado cualquier impedimento de esos servicios, modelos o adjuntos; verificar que no se presenta evidencia sintética ni histórica como ejecución real actual.
- [ ] 14.6 Ejecutar suite raíz y diff finales, publicar un informe nuevo de verificación en `docs/` con alcance por M/sesión, pruebas reales/fallos/omisiones, instalación, reversión y pendientes; verificar enlaces y catálogo sin modificar informes históricos ni prometer mejoras no medidas.

## Workflow follow-up

- Revisar los artefactos antes de implementar. Empezar solo mediante solicitud nueva y explícita de `/opsx-apply`, indicando la sesión deseada si se quiere limitar esa ejecución.
- Una sesión bloqueada no autoriza ampliar permisos, corpus, modelo o dependencias. Registrar la decisión pendiente y continuar únicamente trabajo independiente autorizado.
- Archivar el cambio mediante el flujo de archivo cuando implementación y verificaciones aplicables estén completas; no archivar como parte de la propuesta ni de estas tareas de implementación.

## Handoff S01–S02 — 2026-10-31

- **Rama:** `feat/fiabilidad-agentes-s01-s02`. Solo estas sesiones; sin despliegue en el consumidor del usuario ni cambios a configuración, modelos, credenciales originales o servicio compartidos. Aplicado `writing-for-agents` a los propietarios normativos y sus punteros.
- **S01:** interfaz directa frente a Code Mode y seis estados de diagnóstico en configuración; publicación enlaza esa norma. Shell ofrece consultas independientes con `workdir` y mantiene los rechazos; `git branch --show-current` se acepta únicamente sin argumentos adicionales. No se añaden herramientas ni firmas públicas. El probe de pruebas añade inventario `codeModeTools` y captura opt-in de errores, fuera de la distribución.
- **S02:** comprobación, reutilización e invalidación del corpus en consulta Codegraph e informe; clases de evidencia, excepciones, conflictos y registro/expansión/parada por pregunta en fuentes/evidencias. Jira y roles apuntan a esas reglas; los seis frontmatters modificados conservan exactamente permisos y metadatos anteriores.
- **Fixtures y cotejo documental:** `test-support/operation-cases.json` conserva cuatro casos de corpus, cuatro de evidencia/conflictos y dos de alcance por pregunta. Se contrastaron sus resultados esperados con las referencias dueñas: corpus previo o referencia no demostrada no acreditan ausencia; árbol cambiado invalida reutilización; avisos relevantes conservan reserva incluso con cero pendientes; test leído no acredita ejecución; RowVersion no acredita HTTP; excepción y límites de retención se conservan sin arbitraje; una duda no amplía a veinte historias; fuentes comunes no fusionan pendientes. Esto es revisión del contrato, no conducta ejecutada de un agente.
- **Fixtures locales ejecutados:** cuatro repositorios Git sintéticos bajo `C:\Users\potero\AppData\Local\Temp\opencode\operation-model-mz6wOq\consumer`; comprobados estado del árbol, referencia `feature-v2` ausente y estados sintéticos de índice con/sin avisos. Los datos Codegraph son fixtures, no una ejecución de Codegraph real.
- **Motor real sin modelo:** registro instalado con herramientas directas excluidas por su opción efectiva de Code Mode; consulta directa de configuración, ausencia de efectos de publicación al consultar, denegación de permiso, error de rol y nombre de archivo rechazado. Los cinco publicadores guardan contenido verificable antes y después de recargar el location, con resolvedor por instancia. Esta evidencia no acredita la elección de interfaz por un modelo ni una búsqueda ejecutada dentro de Code Mode.
- **Verificaciones finales:** `node --test *.test.ts`: **34 correctas, 0 fallos, 0 canceladas y 0 omitidas**, 192566,355 ms; temporales `TEMP`, `TMP` y `TMPDIR` bajo el directorio aprobado `C:\Users\potero\AppData\Local\Temp\opencode`. Node **26.13.0**, OpenCode **2.1.2**, APM **0.32.0**. Incluye instalación/actualización consumidora, personalizaciones, enlaces, catálogo, contrato de arquitectura y permisos de ambos alias Jira. Validación estricta de OpenSpec y `git diff --check` correctos. Comprobación documental dirigida: **6/6**.
- **Incidencias corregidas durante las pruebas:** el test de shell pasó de rojo a verde al añadir la alternativa; un primer probe intentó invocar `execute` desde un registro que no lo expone y se corrigió para inspeccionar sus metadatos efectivos; la primera suite raíz dio 29/33 por un enlace relativo nuevo incorrecto, corregido antes de la suite final. Un ensayo auxiliar de fixtures falló por comillas de PowerShell y pasó al enviar el código por stdin.
- **Modelo pendiente:** el intento autorizado no encontró `openai/gpt-6.1-sol` en el inventario del runtime aislado y se detuvo antes de enviar cualquiera de los cuatro casos; no acredita indisponibilidad en la sesión habitual ni comportamiento de los agentes. La copia temporal de credencial se eliminó y se comprobó el hash intacto del original. El usuario decidió continuar sin modelo: **1.4 y 2.4 siguen abiertas**, no omitidas por el runner ni consideradas aprobadas. El driver y plugin experimentales quedan como diagnósticos locales en `build/verify-operation.mjs` y `build/operation-fixture/`, sin distribuir ni dar por validado su recorrido con modelo.
- **Límites y continuación:** sin consultas a Jira remoto, Codegraph real ni comparación temporal antes/después; ninguna mejora porcentual afirmada. S01 y S02 no se consideran totalmente verificadas hasta resolver sus pruebas con modelo. S03 y S04 siguen siendo independientes; las dependencias duras de S07/S08 no se dan por satisfechas con estas verificaciones parciales. No se inicia otra sesión ni se archiva este cambio.
