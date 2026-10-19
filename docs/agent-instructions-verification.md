# Verificación de instrucciones de agentes

Plan 4 sobre base `e93cf08`, rama `work/plan-4-limpieza`. Fecha: **2026-10-19**. Revisados los ocho agentes, ocho skills y sus **18 referencias** distribuidas, contrato, catálogo, figura y evidencias históricas. Entorno observado: Windows, Node **24.18.0**, OpenCode **1.19.3**, APM **0.32.0**.

## Inventario y autoridad

| Grupo | Misión, entradas y ramas | Herramientas y salida; cierre |
|---|---|---|
| Investigador | Pregunta funcional; dato Jira puntual o investigación confirmada; coordina lectores | Jira de lectura, `investigator_defaults`, `agent_settings`, `task`; `conclusion.md` delegado o pareja de informes directos. Evidencia o pendiente por ámbito. Solo lee directamente las tres referencias operativas autorizadas. |
| Lector Código | Pregunta, workspace, referencia y alcance de implementación | Codegraph principal, lectura/Git de contraste; `investigacion.md` según `consulta-codegraph/references/informe.md`, suficiencia y guardado verificables. |
| Lector Documentación | Pregunta, Jira o raíces documentales; dato puntual, originales o investigación | Jira de lectura, archivos y MarkItDown a salida estándar; original literal separado o `investigacion.md` con citas, suficiencia y límites. |
| Planificador / Refinador | Historias Jira o fuentes explícitas; selección, originales, borradores, división y aceptación | Configuración propia, Jira de lectura, delegación y publicadores autorizados; historias e incidencias separadas. Todos los criterios trazados, acuerdos/propuestas distintos y versión revisada o bloqueo. |
| Arquitecto / Test | Historias locales identificadas y revisadas; encargos, casos UI, integración y continuación | Arquitecto coordina, consulta Jira como contexto y configura límite; Test lee solo su proyecto y metadatos Git, delega en Revisor. Casos/matrices revisados, plan de seis apartados, pendientes e historial. |
| Revisor | Entrega publicada del padre, encargo y fuentes; originales, historias, investigación o Test | Lectura, Jira sin perfil de usuario y `write_review_documents`; dictamen/disputa ligados a versión exacta, cobertura o pendiente por elemento. |
| `consulta-jira` / `consulta-codegraph` / `lectura-documental` | Dato/selección/originales/cotejo; código/indexación/referencia/informe; lectura directa/salida estándar/temporal | Normas de consulta sin añadir herramientas. Evidencia o límite; conversiones clasificadas y limpieza propia comprobada o fallo declarado. |
| `operativa-comun` | Fuentes, configuración o publicación/revisión | Tres referencias: `fuentes-evidencias.md`, `configuracion.md`, `publicacion-revision.md`. Esta última es la única norma de intentos de arquitectura. |
| `plantillas-entregables` / `user-stories` | Cinco formatos y contenedores; clasificación/redacción/revisión/confirmación/contexto | Cinco referencias de formato y cinco de contenido. Conservan criterio original, valor, autoridad humana, estimaciones del equipo y decisiones pendientes; cierre por rama. |
| `domain-glossary` / `meeting-coach` | Terminología documental; invocación manual de preparación/continuación/feedback/consulta | Herramientas del anfitrión, sin permisos añadidos. Glosario con definiciones, sinónimos y menciones; reuniones con cuatro referencias por operación/contrato/privacidad, estado vigente e historial cerrado inmutable. |

El contrato mantiene alcance, estados y seis campos de entrega integrada. Las plantillas definen formato y remiten directamente a publicación/revisión. README es índice e instalación, `docs/roadmap.md` contiene evolución futura y la figura es ILUSTRATIVA, con aviso junto a ambas cadenas de cada HTML. Las evidencias anteriores conservan cifras y fallos en su contexto temporal.

## Siete criterios por grupos revisados

| Grupo | Fuente única | Disparadores | Jerarquía | Co-localización | Finalización | Positivo y límites | Poda |
|---|---|---|---|---|---|---|---|
| Ocho agentes | Reglas/formatos por puntero | Rama puntual antes del flujo; refs exactas | Secuencia propia en el rol | Entradas, límites y cierre juntos | Etapas con resultado o impedimento | Solo lectura, shell y delegación conservados | Lector Código mueve informe y suficiencia a su skill |
| Cuatro skills de reglas y referencias | Un propietario por regla | Jira por finalidad, Codegraph por rol, lectura por medio, operativa por operación | Routers breves y referencias | Excepciones junto a norma | Evidencia, pendientes y guardado comprobables | Límites duros permanecen | Interfaz fuera de agentes; sin copias de configuración |
| Plantillas y cinco referencias | Una estructura por formato | Productor/tipo y norma directa | Router → formato → ejemplo ficticio | Caso/matriz/contenedor e historial agrupados | Cobertura completa aun parcial | Propuestas y aprobación diferenciadas | Retirada atribución duplicada de intentos al contrato |
| `user-stories` y cinco referencias | Contenido aquí; formato en Historia | Clasificar, redactar, revisar, confirmar, contexto | Ramas traducidas completas | Decisor, equipo, incertidumbre y comprobación junto a su caso | Cierre por paso preservado | Acuerdos humanos frente a sugerencias | Sin imponer plantilla narrativa ni INVEST como puntuación |
| Glosario y reuniones | Ingesta común; formatos propios | Términos o petición manual por operación | Glosario compacto; reuniones con router y refs | Autoridad/lifecycle/artefactos juntos; consentimiento junto a ingesta | Definición y cita por término; cierre por operación | Privacidad, consentimiento e historial cerrado preservados | Extraídas ramas de reuniones; chat solo resumen |
| Contrato, README, figura e historia | Contrato actual vs roadmap | Instalación, operación, continuidad y ejemplo | Puntos de entrada diferenciados | Estado y entrega juntos | Cobertura y handoff verificables | Capacidad pendiente explícita | Retirados flujos y copias externas de operación; historia señalada |

## Hallazgos y correcciones

- Contrato con proveedor y tres especialidades descritos como vigentes: trasladada la evolución a roadmap; operación actual Test UI y encargos pendientes explícitos. Permisos reservados a nombres futuros no equivalen a agentes distribuidos y se conservan intactos.
- Atribución residual de intentos al contrato en plantillas: norma directa única en `publicacion-revision.md`; Revisión solo representa el historial. Se conservan límites, fallos, consumo y continuidad.
- Lector Código extenso y punteros genéricos: informe/suficiencia extraídos a referencia distribuida de su skill; ocho agentes con referencias operativas precisas y cierres por etapa.
- Referencias de historias en inglés: traducción completa, incluido valor para comprador/operador, desarrollador como usuario real, horizontes, cortes de extremo a extremo, riesgos tempranos de interfaz, velocidad no transferible, investigación acotada y decisiones humanas. Ancla traducida actualizada.
- Reuniones sin router breve: cuatro referencias conservan operaciones, formatos, consentimiento, perfil optativo, estado vigente e inmutabilidad del historial cerrado. Invocación manual expresada como petición explícita y carga `skill`, sin atributo OpenCode inventado.
- Figura con capacidades previstas sin advertencia local: alcance ILUSTRATIVA junto a cada figura, fuente común y sincronización local, sin reconstrucción externa ni cambios de geometría.
- Informes históricos susceptibles de parecer actuales: alcance temporal visible en los cuatro informes, manteniendo fallos aislados del plan 3 y cierre conjunto correcto.

## Recorridos documentales

1. **Solo título:** Investigador/Planificador/Arquitecto/Lector Documentación → `consulta-jira`, dato puntual → `fields: ["summary"]`, literal y cierre anterior a configuración/delegación/publicación.
2. **Investigación:** Investigador → sus dos skills y tres referencias permitidas → Jira directo o lectores autorizados → Codegraph/informe o lectura documental → contraste → conclusión delegada o pareja de informes. Cada carencia tiene evidencia pendiente y efecto.
3. **Refinamiento:** Planificador → fuentes explícitas o selección/recuperación completa Jira → originales fieles → Refinador → `user-stories` y Historia → borrador trazado → entrega completa e incidencias → Revisor de esa versión y originales.
4. **Test:** Arquitecto → contrato instalado y Encargo → Test UI, proyecto propio en solo lectura → Caso/matriz/contenedor → publicación confirmada → Revisor y norma de intentos → integración de aprobados independientes, cobertura restante pendiente y bloqueos.
5. **Continuación:** plan/handoff e informes exactos → mismos IDs y `task_id` disponibles → norma de intentos, historial y fuentes actuales contrastados → nueva versión completa. Historial no verificable bloquea nuevas revisiones; la nueva sesión conserva contadores.
6. **Reunión/glosario:** glosario → lectura común → término/variante con cita original. Reunión manual → artefactos → operación → fuentes/consentimientos cuando corresponda → estado inequívoco o duda; cierre solo sin feedback pendiente, corrección posterior en nueva reunión enlazada.

Estos recorridos y la tabla son cotejo documental, no conversaciones ejecutadas por un modelo.

## Pruebas reales

Ejecutadas desde `build/worktree-plan-4`. Antes de la suite se comprobó su `build/tmp` existente y se asignaron `TEMP`, `TMP` y `TMPDIR` a esa ruta. Los consumidores aíslan HOME/USERPROFILE, AppData, XDG, OpenCode, APM y npm bajo su propio `build/`; no se leyó configuración global. Se mantuvieron los probes y límites de tiempo, sin omisiones ni reintentos automáticos añadidos.

| Comando | Resultado final y alcance |
|---|---|
| `node --test *.test.ts` | **25 correctas, 0 fallos, 0 canceladas, 0 omitidas**, 225921,0439 ms. Configuración, permisos reales, delegación, migración, originales, publicación y revisión exacta. |
| `node --test docs/agentic-flow/model.test.mjs` | **6 correctas, 0 fallos, 0 omitidas**, 196,2879 ms. Modelo, paquetes a 60 Hz, geometría y correspondencia de HTML/aviso. |
| `node docs/agentic-flow/sync-html.mjs` | Ambos HTML sincronizados con fuentes locales; estaciones y rutas comprobadas por el sincronizador. El primer ajuste detectó una tercera coincidencia de `<figure>` dentro del kit JS embebido: se acotó la sustitución al markup anterior al script. |
| `node build/verify-preservation.mjs` (comprobación auxiliar local, no distribuida) | Ocho frontmatters iguales a `e93cf08` salvo descripción; hashes del SVG real de ambos HTML idénticos a la base. Comparación acotada al markup y normalizada LF/CRLF. |
| `git diff --check` | Correcto, sin errores de espacios. |

La suite instala y actualiza copias locales con APM, ejecuta el instalador y verifica `skills.paths`, ocho skills cargadas y todos los enlaces de sus referencias desde los archivos instalados. El contrato instalado apunta a `../.agents/skills/`, incluida la nueva norma enlazada de publicación/revisión. OpenCode invoca realmente las dos skills y las tres lecturas permitidas del Investigador; comprueba autorizaciones/denegaciones de ocho roles y ambos alias Jira; carga plantillas en cinco consumidores y realiza **13 lecturas reales** que cubren sus cinco referencias. Se mantienen las rutas Win32 extendidas del probe de plantillas y las rutas cortas Jira.

### Incidencias de ejecución conservadas

1. Primera suite completa: **24 correctas, 1 cancelada por timeout, 0 fallos, 0 omitidas**, 579252,4468 ms. La actualización APM excedió el límite de 240000 ms (445551,6839 ms observados), con salida hasta colisiones. `node --test --test-name-pattern "actualización APM" jira_access.test.ts` pasó después: **1 correcta**, 72712,2212 ms totales.
2. Segunda suite: **24 correctas, 1 fallida, 0 canceladas, 0 omitidas**, 208398,7458 ms. El probe de plantillas recibió **WinError 5** al activar el staging local de APM. Ese probe había pasado en la primera ejecución. No se atribuye una causa no demostrada.
3. Tercera suite completa: **25/25 correctas** con los mismos probes y límites; actualización y plantillas pasan conjuntamente. Las incidencias anteriores quedan como limitación intermitente observada de las ejecuciones de CLI, sin bloqueo actual de las comprobaciones obligatorias.

Las búsquedas de identidades antiguas y flujos sustituidos solo conservan migración, compatibilidad e historia explícita. El diff de permisos, herramientas, estados, idioma de entregables y norma de intentos se cotejó con la base; no se modificaron herramientas ni permisos. Se retira únicamente el archivo del plan 4 tras su cierre.

## Revisión final de integración

Fecha: **2026-10-19**. Rama `integration/planes-2-3-4`, tras incorporar `1aca3ba` sobre `e93cf08`.

- Revisados el diff del plan 4, las cinco traducciones de `user-stories`, las cuatro ramas documentales de reuniones, el informe de Lector Código, los punteros de formatos, el contrato y el roadmap. Los permisos y controles se conservan.
- La comprobación del JavaScript embebido en los HTML falló por diferencias LF/CRLF al pasar del worktree a la integración. Se normalizan únicamente los finales de línea de la comparación, manteniendo el cotejo íntegro del contenido. `node --test docs/agentic-flow/model.test.mjs`: **6 correctas, 0 fallos, 0 omitidas**.
- La primera suite en integración terminó con **24 correctas y 1 fallida**: `EBUSY` al limpiar el consumidor temporal de actualización. Ejecuciones específicas posteriores mostraron `WinError 5` en la activación local de APM. Las comprobaciones con raíz Win32 extendida y sin descargas paralelas no resolvieron el problema; se descartaron esos ajustes. No se atribuye una causa no demostrada ni se añaden reintentos automáticos.
- Ejecución completa final, con los mismos probes y límites: `node --test *.test.ts`, **25 correctas, 0 fallos, 0 canceladas, 0 omitidas**, 251002,9638 ms. Actualización APM, preservación de personalizaciones, distribución, permisos OpenCode y lecturas de plantillas pasan conjuntamente.
- Configuración, consumidores y temporales de esta revisión permanecen dentro de `build/` del proyecto. Las incidencias intermitentes de CLI quedan registradas como observadas; no hay un bloqueo actual de las validaciones obligatorias.

## Alcance y continuidad

Completados los siete criterios y recorridos documentales, distribución local y pruebas reales requeridas. No se ejecutaron consultas Jira remotas, Codegraph real, conversiones MarkItDown, conversaciones LLM ni casos de Test de un proyecto de producto; esa aceptación conserva su alcance en los informes históricos y roadmap. El cambio textual de figura no ejecutó constructor externo, auditorías Anatomy ni una nueva comprobación de navegador. No se publicaron artefactos en servicios externos.

**Después de instalar o actualizar, cerrar y reiniciar OpenCode y abrir sesiones nuevas.** Para continuar un encargo aportar sus documentos y handoff con versiones, decisiones e intentos consumidos; las sesiones nuevas conservan esa continuidad.
