# Plan 3 — Plantillas de entregables

## Objetivo y condiciones de ejecución

Crear `plantillas-entregables` como skill de formatos, centrada en Historia y Tarea, y normalizar también Encargo de especialista, Revisión y Caso de Test. Mostrar el catálogo restante con la justificación de su ubicación.

Ejecuta esta actuación cuando la solicite el usuario, después del renombrado y la centralización. Comprueba los resultados en las fuentes vigentes: ocho agentes con nombres nuevos y reglas compartidas accesibles. Los archivos de planes anteriores pueden haberse eliminado.

Trabaja exclusivamente dentro de `ai-assisted-planning`; revisa el estado y diff y prepara las pruebas locales bajo `build/`. Aplica `writing-for-agents` a la skill, sus referencias y los punteros consumidores. Marca los pasos una vez verificados.

## Decisiones confirmadas

- `user-stories` conserva los criterios de clasificación, redacción y revisión de historias. `plantillas-entregables` define la estructura de entrega; ambas se conectan por referencias explícitas.
- Las instrucciones de plantillas se redactan en español. Los entregables conservan el idioma del encargo o de las fuentes conforme al rol productor.
- El formato es Markdown legible, con encabezados estables y metadatos mínimos. Las tablas se reservan principalmente para trazabilidad, cobertura y matrices.
- Cada plantilla distingue campos obligatorios y opcionales, datos confirmados, propuestas y pendientes. Los apartados contractualmente obligatorios conservarán una indicación explícita cuando estén vacíos.
- La plantilla de Tarea respeta la precisión disponible: Backend y Frontend siguen como capacidades pendientes y sus bloques siguen pendientes de descomposición cuando corresponda. Test conserva casos UI concretos.
- Los identificadores locales se distinguen de las claves reales del gestor. Cada tarea o caso pertenece a una sola historia padre.

## Catálogo actual y tratamiento previsto

El repositorio contiene requisitos de formato repartidos entre agentes, skills, contrato y herramientas; este catálogo reúne tanto plantillas explícitas como formatos exigidos.

| Entregable | Propietario o fuente actual | Tratamiento y beneficio |
|---|---|---|
| Original de historia en `Originales/` | Planificador, `write_planning_originals` | Conservar copia fiel con procedencia. Reestructurar el original como plantilla podría alterar su fidelidad. |
| Historia refinada y `borrador.md` | Planificador, Refinador, `user-stories` | Plantilla prioritaria común para facilitar integración y cotejo. |
| Bloque o tarea técnica | `flujo-arquitectura.md`, Arquitecto | Plantilla prioritaria para entrega manual al gestor y vínculo con historia y criterios. |
| Encargo a especialista | `flujo-arquitectura.md` | Extraer plantilla para hacer completo y verificable el intercambio entre agentes. |
| `sanity-check.md` y `disputa.md` | Revisor, `write_review_documents` | Extraer formato de revisión con rama de disputa y referencia a la versión exacta. |
| Caso de Test, matriz y `borrador-tests.md` | Arquitecto Test y contrato de arquitectura | Extraer plantilla de caso y estructura de su contenedor para revisar cobertura y reutilización. |
| Incidencias por historia y globales | Planificador, `write_planning_deliverables` | Mantener como acompañamiento de Historia, con campos breves para evidencia, impacto y decisión pendiente. |
| Investigación de código y documental | Lectores y reglas de evidencias | Registrar en el catálogo; conservar el formato de suficiencia específico. Extracción adicional solo si elimina repetición real. |
| `conclusion.md`, resumen ejecutivo e informe detallado | Investigador y `write_report_pair` | Registrar en el catálogo; diferenciar respuesta resumida, evidencia y límites. Evitar forzar tres documentos a consultas que solo requieren uno. |
| `plan-implementacion.md` | Arquitecto y contrato | Mantener estructura integrada y enlazar las plantillas de sus bloques, cobertura y revisión. |
| Handoff | Arquitecto, Test y contrato | Conservar los campos de continuidad y referencias a documentos; el contrato actual permite entregarlo en la respuesta. |
| `indice.md` | `tools/session_store.ts` | Mantener generación determinista en la herramienta. Documentar su función, sin duplicar su formato como receta de redacción. |
| Glosario | `domain-glossary` | Conservar su plantilla especializada junto a la skill que la produce. |
| `profile.md`, `prep.md`, `sources.md`, `outcome.md`, `state.md` | `meeting-coach` | Conservar sus formatos y ciclo de vida junto a la skill. Son artefactos de reunión con invariantes propios. |

## Estructura mínima acordada

### Historia

1. Identificador y título.
2. Actor o beneficiario, objetivo y valor.
3. Alcance y reglas funcionales.
4. Criterios de aceptación confirmados, con identificadores estables; propuestas de criterios en apartado diferenciado.
5. Fuentes y trazabilidad respecto al original: cada criterio original conserva destino o estado explícito.
6. Dependencias, decisiones y preguntas pendientes.

Conserva referencias y versión cuando el flujo las necesite. Expresa los datos desconocidos como pendientes, con su efecto y pregunta, en lugar de completar requisitos por suposición. Para divisiones, conserva la relación con la historia original y el valor de cada resultado independiente.

### Tarea

1. Identificador, título, tipo y especialidad.
2. Una historia padre y criterios relacionados.
3. Objetivo, alcance y propuesta técnica fundamentada.
4. Resultado esperado y forma de comprobarlo.
5. Evidencias y dependencias; historias relacionadas cuando aporten contexto.
6. Estado, bloqueos y referencia a la revisión exacta cuando corresponda.
7. Estimación fundamentada o pendiente cuando sea pertinente.

Señala si es un bloque pendiente de descomposición o una propuesta concreta. Los detalles técnicos, archivos o pasos se incluyen con evidencia suficiente. Un encargo pendiente de especialista conserva su tipo y estado de encargo.

### Encargo, revisión y caso de Test

- **Encargo:** identidad estable, especialidad, historia padre, fuentes y versiones, objetivo y fragmentos pertinentes, criterios, reglas transversales, alcance, decisiones, dependencias, dudas, límite e intentos consumidos y resultado requerido. Para Test añade proyecto, referencia solicitada, conocimiento disponible e historial.
- **Revisión:** dictamen, productor y encargo, entrega y versión exactas, intento si aplica, fuentes, cobertura comprobada y pendiente, hallazgos con evidencia, impacto y corrección, elementos aprobados o bloqueados y siguiente acción. La disputa conserva evidencia y desacuerdo sobre esa misma versión.
- **Caso de Test:** identidad e historia padre, acción reutilizar/actualizar/crear, objetivo y criterios, precondiciones y datos, pasos UI y resultados, encaje técnico, evidencias, dependencias, estado y revisión. Cada variante de matriz tiene identidad y resultado; `borrador-tests.md` conserva cobertura, bloqueos e historial.

## Archivos y áreas afectadas

- Nueva `.apm/skills/plantillas-entregables/SKILL.md` y sus referencias de formatos.
- Los productores y Revisor de `.apm/agents/`, incluidos sus permisos de skills.
- `.apm/skills/user-stories/` y las reglas compartidas para sustituir duplicaciones por punteros, respetando sus responsabilidades.
- `flujo-arquitectura.md`: contrato de alcance y estados, enlazado a los formatos extraídos.
- `README.md`: catálogo duradero de entregables y acceso a sus fuentes normativas.
- Herramientas de publicación y pruebas solo si existe una incompatibilidad demostrada con los formatos acordados.

## Ejecución

### 1. Contrastar formatos con los contratos y herramientas

- [x] Verifica el catálogo contra agentes, skills, contrato y herramientas vigentes después de las actuaciones anteriores.
- [x] Identifica por formato los campos obligatorios actuales y los opcionales. Conserva las obligaciones de fuentes, cobertura, versiones y revisión.
- [x] Comprueba los argumentos y nombres de archivo de las herramientas: los originales, historias e incidencias siguen siendo documentos distintos y las publicaciones siguen siendo versionadas.

**Resultado:** cada exigencia actual tiene destino y cada incorporación de formato se ajusta a las decisiones confirmadas.

### 2. Crear la skill y las referencias de formatos

- [x] Crea un `SKILL.md` breve con disparadores de redacción o revisión de entregables, elección del formato y criterios de finalización.
- [x] Usa una referencia por tipo prioritario: Historia, Tarea, Encargo, Revisión y Caso de Test. Agrupa en su referencia las variantes y contenedores estrechamente relacionados.
- [x] Incluye estructura copiable, campos obligatorios, opcionales y criterio de suficiencia documental. Separa las instrucciones al agente de la plantilla que aparecerá en el entregable.
- [x] Incluye ejemplos breves inequívocamente ficticios para los cinco formatos prioritarios. Muestra un dato pendiente y una propuesta diferenciada de un acuerdo.
- [ ] Reutiliza las reglas compartidas de evidencia, publicación y revisión mediante referencias con disparadores. Conserva la revisión de la versión exacta y los contadores en sus contratos.

**Resultado:** un agente puede elegir y aplicar solo la plantilla pertinente, y una persona distingue claramente contenido, evidencia y decisiones pendientes.

### 3. Conectar productores y revisión

- [x] Planificador y Refinador cargarán Historia al redactar o revisar un entregable, además de las ramas de `user-stories` que correspondan.
- [x] Arquitecto utilizará Encargo y Tarea; Arquitecto Test utilizará Caso de Test y su contenedor. Revisor consultará el formato aplicable junto con el encargo y sus fuentes.
- [x] Actualiza permisos para que cada consumidor pueda cargar la skill y leer sus referencias con el alcance necesario.
- [x] Sustituye las estructuras duplicadas de agentes y contrato por punteros, manteniendo junto al rol sus obligaciones de negocio y su condición de cierre.
- [x] Mantén nombres y argumentos de publicadores cuando ya admitan el Markdown necesario. Introduce cambios de herramienta únicamente para resolver incompatibilidades concretas verificadas.

**Resultado:** productores y Revisor utilizan el mismo contrato de formato, y las herramientas conservan sus garantías de publicación.

### 4. Publicar el catálogo y resolver el resto de formatos

- [x] Incorpora al `README.md` el catálogo completo, con ubicación normativa, propósito y consumidores. Distingue plantillas de texto, documentos fieles al original y salidas automáticas.
- [x] Confirma la ubicación de cada formato secundario siguiendo la tabla. Extrae un formato adicional solo cuando el análisis demuestre una duplicación o intercambio que lo justifique; registra el motivo en el catálogo.
- [x] Conserva el handoff en su contrato de continuidad y enlaza los campos compartidos, evitando exigir un archivo nuevo para un resultado que hoy se entrega en conversación.

**Resultado:** se conocen todos los formatos existentes y queda justificado cuáles comparten plantilla y cuáles permanecen especializados.

## Validación

- [x] Recorre los ejemplos de Historia, Tarea, Encargo, Revisión y Test con los criterios de sus contratos. Comprueba identificadores, fuentes, estados, propuestas y cobertura pendiente.
- [x] Revisa una historia dividida, un criterio propuesto, un bloque pendiente de descomposición, una revisión parcial y una matriz de Test. Cada caso debe conservar sus relaciones y límites.
- [x] Comprueba que un original sigue siendo fiel a la fuente y que el formato de entrega permite cotejar todos sus criterios.
- [x] Comprueba que `plan-implementacion.md` mantiene sus seis apartados contractuales y puede integrar tareas y casos sin perder bloqueos ni intentos de revisión.
- [x] Verifica instalación y lectura de referencias en un consumidor local. Ejecuta las pruebas existentes afectadas; ejecuta `node --test *.test.ts` si se han modificado permisos, distribución, publicadores o comprobaciones documentales.
- [x] Ejecuta `git diff --check`. Identifica como pendientes las validaciones obligatorias que requieran una herramienta ausente.

## Cierre y retirada de estas instrucciones

- [ ] Confirma que los cinco tipos prioritarios tienen formato aplicable, consumidores conectados y validación completa; el catálogo cubre también los secundarios.
- [ ] Comunica las ubicaciones definitivas, el alcance real de la validación y el reinicio de OpenCode tras la actualización.
- [ ] Elimina únicamente `docs/planes/03-plantillas-de-entregables.md`. Ante bloqueos, conserva este archivo con la siguiente acción. El siguiente trabajo es revisar y limpiar el conjunto con `writing-for-agents`.

## Estado de esta rama y siguiente acción de integración

Implementación del alcance de plantillas terminada sobre `15267b1`, con ocho agentes vigentes. La centralización del plan 2 se desarrolla en paralelo por decisión expresa: se enlazan sus tres destinos finales de `operativa-comun`, sin copias ni placeholders. El paso de reglas compartidas y el cierre definitivo quedan pendientes de verificar esas referencias tras el merge.

Evidencias y ubicaciones: [verificación de plantillas](../deliverable-templates-verification.md). Suite completa ejecutada: 25 pruebas, 22 aprobadas y 3 fallidas; una por esos destinos ausentes y dos probes APM existentes por fallos de staging (`WinError 206` y `WinError 3`). Comprobación final específica: 4 pruebas, 3 aprobadas y 1 fallida por los destinos del plan 2. APM local y carga/lectura real OpenCode de los cinco consumidores verificadas (13 lecturas de las cinco referencias). No se modifica `jira_access.test.ts`, propiedad del plan 2.

El padre debe integrar las reglas, resolver los solapamientos de agentes/README/contrato y los probes de instalación, repetir la suite y completar este checklist antes de retirar solo este plan. Comunicar al usuario las ubicaciones finales y el reinicio de OpenCode tras actualizar.
