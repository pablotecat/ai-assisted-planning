# Contrato del flujo de arquitectura — V1

## Propósito y alcance

Convertir historias refinadas y revisadas en borradores de bloques de trabajo Backend, Frontend y Test. El usuario crea manualmente las subtareas y tests en su gestor de tareas, incluido Jira si lo utiliza. Cada bloque pertenece a una sola historia padre; otras historias pueden citarse como relacionadas. Backend y Frontend entregarán bloques que el equipo todavía deberá descomponer; Test entrega casos concretos con su encaje técnico. La precisión de tareas y estimaciones se afinará mediante iteraciones; las estimaciones sin fundamento quedan pendientes.

La fuente oficial V1 es una versión identificada de los archivos locales recibidos. Se conservan los identificadores originales; si faltan, se asignan identificadores locales estables. No se requieren claves Jira. Si una fuente no tiene versión, el usuario confirma una etiqueta para el contenido recibido; en continuaciones se contrasta de nuevo el archivo. `arquitecto` puede consultar Jira directamente en solo lectura como contexto funcional complementario, con citas y alcance explícitos. La entrada oficial desde gestores de tareas y la publicación automática quedan para fases posteriores. El flujo toma decisiones técnicas; las contradicciones funcionales y las cuestiones sin resolver se comunican al usuario a través de `arquitecto`.

## Responsabilidades y recorrido

1. `arquitecto` lee las historias del encargo, mantiene la visión global, identifica trabajo compartido y prepara encargos acotados por historia y especialidad.
2. Los arquitectos Backend, Frontend y Test reciben los criterios y reglas relevantes, no el conjunto completo de historias por defecto. El mecanismo previsto de acceso al código es el proveedor. En la iteración vigente, Test accede directamente y en solo lectura al proyecto de Test indicado en el encargo; esta vía temporal permite perfilarlo mientras se implementa el proveedor.
3. El proveedor facilita a cada especialista acceso a todo el código de su propia área. Backend no recibe código Frontend; Frontend no recibe los tests E2E. Cada área, incluida Test, mantiene su ámbito. Las necesidades entre áreas se resuelven con datos concretos y trazables, como un endpoint o su contrato, en lugar de exponer el código de la otra área.
4. Cada especialista publica y revisa sus borradores según «Revisión y estados», corrige los hallazgos y devuelve al coordinador bloques aprobados y bloqueos. El revisor es común a los agentes productores y recibe el encargo y las fuentes pertinentes al tipo de entrega.
5. `arquitecto` verifica cobertura y coherencia global, evita duplicaciones y entrega lo aprobado e independiente junto con todos los bloqueos para resolución.

El coordinador no reemplaza el análisis técnico ni la revisión cuando falta una capacidad. Test se invoca exclusivamente desde `arquitecto`; sus cuestiones se devuelven al coordinador para resolución. La configuración de permisos y publicación de cada nuevo especialista y del proveedor se incorporará al crearlos.

## Revisión y estados

Antes de publicar, revisar o reanudar un encargo, carga `operativa-comun` y lee `references/publicacion-revision.md`, incluida «Intentos — solo flujo de arquitectura»: es la definición normativa de guardado, versión exacta, cómputo, historial, agotamiento y fallos. Arquitecto valida y transmite `MAX_INTENTOS_REVISION`, obtenido de `architecture_settings()`, y Test lo aplica por encargo; Revisor registra el número recibido y verifica la versión. Una revisión no verificable deja bloqueado el trabajo afectado. Los casos aprobados independientes pueden continuar tras la comprobación global.

Estados de seguimiento: **pendiente** (trabajo o capacidad aún por completar), **en curso**, **aprobado** (revisión favorable y comprobación global, con dependencias necesarias resueltas), **bloqueado** (requiere resolver un impedimento) y **no aplica** (justificación explícita). Cada criterio debe tener un estado verificable; no se declara cobertura completa por omisión. Una historia sin criterios verificables se registra como bloqueada, con la información que falta.

## Encargo mínimo para un especialista

Al preparar o continuar una delegación, carga `plantillas-entregables` y aplica [Encargo](.apm/skills/plantillas-entregables/references/encargo.md), incluida su rama Test cuando corresponda. Esa referencia es la fuente normativa de los campos del paquete; este contrato mantiene el alcance, los estados y el consumo de revisiones. Las referencias de formato de este documento viven en `.apm/skills/plantillas-entregables/` en el paquete y se consultan desde la ubicación de la skill instalada por APM en el consumidor.

El código actual leído por Test es la evidencia de implementación; se distingue la referencia declarada de la comprobada y se registran los cambios locales conocidos. Backend/Frontend reciben bloques a descomponer; Test, casos concretos. El encargo pendiente de capacidad conserva ese estado y no se presenta como análisis técnico realizado.

## Especialista Test — primera iteración UI

El especialista diseña pruebas funcionales de aceptación a través de la interfaz de usuario. La selección de pruebas unitarias, de integración, API u otros niveles queda para una iteración posterior. Analiza la suite y propone cambios; el equipo implementará y ejecutará los casos.

### Contexto del proyecto

El acceso directo temporal se limita al código y configuración del proyecto de Test y a la documentación o contratos concretos aportados. Los datos necesarios de otras áreas se solicitan a través del arquitecto principal. El especialista consulta metadatos Git de solo lectura para comprobar la referencia cuando sea posible; una referencia no comprobada se identifica como tal.

**Carpeta de conocimiento — decisión provisional:** el especialista consulta la carpeta indicada para conocer convenciones, nomenclatura, buenas prácticas y peculiaridades. Inicialmente es una fuente complementaria: si falta o está incompleta, puede continuar con las convenciones comprobables en la suite, identificándolas como observaciones. Cuando falta información indispensable para una decisión, devuelve la cuestión al arquitecto principal y deja pendiente únicamente el trabajo afectado. La escritura y el mantenimiento de esta carpeta se definirán en otra iteración.

### Diseño y mantenimiento acotado

Antes de crear casos, localiza y comprueba los existentes relacionados con la historia. Clasifica cada propuesta como **reutilizar**, **actualizar** o **crear**, con referencias y justificación. Si cambia el comportamiento, actualiza el caso relacionado cuando corresponda en lugar de duplicarlo. El mantenimiento comprende solo los casos afectados por la historia; las mejoras de código o de la suite requieren una petición concreta de esa historia.

Incluye escenarios negativos, edge y corner cases cuando el resultado esperado se derive de criterios o reglas recibidos, citando su fundamento. Una regla funcional desconocida se devuelve como pregunta, sin completar su resultado esperado por suposición. La lectura de un test acredita lo que comprueba su código, no una ejecución satisfactoria.

### Caso concreto y matriz

Al diseñar o revisar casos UI y matrices, aplica [Caso de Test](.apm/skills/plantillas-entregables/references/caso-test.md), ramas «caso» y «matriz». Esa referencia agrupa sus campos, identidad única de variantes, encaje técnico y criterio de agrupación. El alcance UI, mantenimiento acotado y fundamento funcional se rigen por las secciones anteriores de este contrato.

### Entrega y revisión

El especialista publica `borrador-tests.md` completo según el contenedor de [Caso de Test](.apm/skills/plantillas-entregables/references/caso-test.md#contenedor-copiable--borrador-testsmd). Aplica publicación, versionado y fallos de la referencia compartida.

El revisor comprueba cobertura, fundamento de resultados esperados, pertinencia de negativos y límites, coherencia de matrices, aprovechamiento de casos existentes, encaje técnico y convenciones del proyecto. Redacta el dictamen y cualquier disputa según [Revisión](.apm/skills/plantillas-entregables/references/revision.md); el historial de esa referencia permite continuar sobre la versión exacta. Identifica casos o variantes aprobados, pendientes o bloqueados y hallazgos con evidencia.

## Entrega integrada: `plan-implementacion.md`

1. **Resumen y alcance:** historias recibidas, versión/fuentes, capacidades disponibles y estado global preparatorio, parcial o completo.
2. **Matriz de cobertura:** historia, criterio y referencia, especialidad, encargo o bloque, estado y motivo. Registra todos los criterios, incluidos los pendientes, y las historias bloqueadas por falta de criterios.
3. **Borradores listos para copiar:** por historia padre, los bloques aprobados e independientes según [Tarea](.apm/skills/plantillas-entregables/references/tarea.md) y los tests según [Caso de Test](.apm/skills/plantillas-entregables/references/caso-test.md). Esas plantillas conservan identidad local frente a clave real, vínculos con criterios, evidencia, dependencias, estimación pertinente y revisión exacta con sus intentos. No se incorporan como listos los paquetes pendientes de capacidad.
4. **Encargos pendientes:** paquetes preparados por especialidad cuando todavía no se puede ejecutar el análisis o falta una capacidad. No se presentan como borradores técnicos aprobados. Conserva los identificadores, `task_id` disponibles, versiones analizadas e intentos consumidos de cada encargo, incluidos los ya ejecutados, para poder continuar.
5. **Bloqueos y cuestiones:** identificador, historias/criterios/bloques afectados, fuente y evidencia, intentos consumidos cuando proceda, impacto, pregunta concreta y acción requerida. Incluye las contradicciones y dudas reunidas por todos los especialistas.
6. **Decisiones y dependencias globales:** propietario de trabajo compartido, relaciones entre historias, decisiones técnicas sustentadas y respuestas confirmadas del usuario.

Si una sección está vacía, indícalo. La entrega parcial conserva todas las historias y su cobertura pendiente, además del contenido utilizable. Las futuras continuaciones publican una nueva versión completa conservando la trazabilidad y las anteriores.

## Fase vigente y continuación

La primera fase incorporó `arquitecto`, su configuración y la integración con el publicador de sesión. La iteración vigente incorpora `arquitecto-test` para casos UI, su acceso directo temporal al proyecto de Test y la revisión de sus versiones publicadas. Backend, Frontend y el proveedor siguen pendientes. La entrega integrada puede contener casos de Test revisados y encargos pendientes de las otras especialidades; la cobertura global conserva ese carácter parcial.

El siguiente hito de validación es perfilar Test con historias locales reales y su proyecto: crear un caso, actualizar otro existente y comprobar negativos, límites y matrices cuando procedan. Las comprobaciones del paquete verifican configuración, procedencia, publicación y revisión; no acreditan por sí solas la calidad del diseño del especialista.

Próximas iteraciones: definir la escritura del conocimiento compartido; ampliar los niveles de Test; implementar Backend, Frontend y el proveedor; afinar descomposición y estimaciones; ampliar la entrada oficial desde gestores de tareas y, cuando exista confianza suficiente, valorar la publicación automática. El orden se confirmará con el usuario. Al cerrar cada sesión, la respuesta incluye un handoff con la versión vigente, decisiones, encargos e intentos consumidos, bloqueos y siguiente acción.

Para continuar, el handoff referencia las entregas e informes exactos y el [historial compartido por encargo](.apm/skills/plantillas-entregables/references/revision.md#historial-compartido), incluidos los `task_id` disponibles. Puede permanecer en la respuesta; no requiere un archivo adicional.
