# Contrato del flujo de arquitectura — V1

## Propósito y alcance

Convertir historias refinadas y revisadas en borradores de bloques de trabajo Backend, Frontend y Test. El usuario crea manualmente las subtareas y tests en su gestor de tareas, incluido Jira si lo utiliza. Cada bloque pertenece a una sola historia padre; otras historias pueden citarse como relacionadas. La granularidad inicial son bloques que el equipo todavía deberá descomponer. La precisión de tareas y estimaciones se afinará mediante iteraciones; las estimaciones sin fundamento quedan pendientes.

La fuente oficial V1 es una versión identificada de los archivos locales recibidos. Se conservan los identificadores originales; si faltan, se asignan identificadores locales estables. No se requieren claves Jira. Si una fuente no tiene versión, el usuario confirma una etiqueta para el contenido recibido; en continuaciones se contrasta de nuevo el archivo. La lectura desde gestores de tareas y la publicación automática quedan para fases posteriores. El flujo toma decisiones técnicas; las contradicciones funcionales y las cuestiones sin resolver se comunican al usuario a través de `agente-arquitecto`.

## Responsabilidades y recorrido

1. `agente-arquitecto` lee las historias del encargo, mantiene la visión global, identifica trabajo compartido y prepara encargos acotados por historia y especialidad.
2. Los arquitectos Backend, Frontend y Test analizan sus encargos y código mediante el proveedor. Reciben los criterios y reglas relevantes, no el conjunto completo de historias por defecto.
3. El proveedor facilita a cada especialista acceso a todo el código de su propia área. Backend no recibe código Frontend; Frontend no recibe los tests E2E. Cada área, incluida Test, mantiene su ámbito. Las necesidades entre áreas se resuelven con datos concretos y trazables, como un endpoint o su contrato, en lugar de exponer el código de la otra área.
4. Cada especialista remite sus borradores al revisor, corrige los hallazgos y devuelve al coordinador bloques aprobados y bloqueos. La revisión corresponde a la versión exacta entregada.
5. `agente-arquitecto` verifica cobertura y coherencia global, evita duplicaciones y entrega lo aprobado e independiente junto con todos los bloqueos para resolución.

El coordinador no reemplaza el análisis técnico ni la revisión cuando falta una capacidad. La configuración de permisos y publicación de cada nuevo especialista y del proveedor se incorporará al crearlos.

## Revisión y estados

`agentes.arquitecto.maxIntentosRevision` en `agent-settings.json` limita las revisiones totales por entrega de especialista; valor inicial: **3**. Se cuenta la revisión inicial y cada revisión de una versión corregida. Con valor 3: primer borrador, primera corrección y segunda corrección. Una revisión no verificable no aprueba la entrega y debe comunicarse como bloqueo. Reabrir el mismo encargo conserva el contador; una aprobación parcial no lo reinicia. Si el historial no está disponible, el encargo queda bloqueado para nuevas revisiones hasta recuperarlo.

Al agotar el límite con problemas pendientes, el especialista devuelve el bloqueo y los hallazgos. Los bloques aprobados que no dependan de ese problema siguen adelante. Una modificación material posterior a la aprobación requiere revisar la nueva versión dentro del mismo límite.

Estados de seguimiento: **pendiente** (trabajo o capacidad aún por completar), **en curso**, **aprobado** (revisión favorable y comprobación global, con dependencias necesarias resueltas), **bloqueado** (requiere resolver un impedimento) y **no aplica** (justificación explícita). Cada criterio debe tener un estado verificable; no se declara cobertura completa por omisión. Una historia sin criterios verificables se registra como bloqueada, con la información que falta.

## Encargo mínimo para un especialista

- Identificador estable del encargo, especialidad y una sola historia padre.
- Fuente local y versión identificada; objetivo y fragmentos literales pertinentes de la historia.
- Criterios de aceptación asignados y reglas transversales necesarias.
- Alcance, decisiones confirmadas, dependencias y relaciones concretas con otras historias.
- Dudas conocidas y datos entre áreas que habrá que pedir al proveedor.
- `MAX_INTENTOS_REVISION` y número de revisiones ya consumidas si es una continuación.
- Resultado solicitado: bloques a descomponer, evidencia, cobertura por criterio, revisión de la versión exacta y bloqueos. Para Test, borradores de tests vinculados a la historia y sus criterios.

## Entrega integrada: `plan-implementacion.md`

1. **Resumen y alcance:** historias recibidas, versión/fuentes, capacidades disponibles y estado global preparatorio, parcial o completo.
2. **Matriz de cobertura:** historia, criterio y referencia, especialidad, encargo o bloque, estado y motivo. Registra todos los criterios, incluidos los pendientes, y las historias bloqueadas por falta de criterios.
3. **Borradores listos para copiar:** por historia padre, los bloques aprobados e independientes. Cada borrador incluye identificador local, tipo (subtarea o test), especialidad, título, objetivo, alcance del trabajo o prueba, criterios cubiertos, resultado esperado, dependencias, historias relacionadas, evidencias y referencia a la revisión exacta con el número de intentos. El identificador local no es una clave real del gestor. Las estimaciones son propuestas fundamentadas o se indican pendientes.
4. **Encargos pendientes:** paquetes preparados por especialidad cuando todavía no se puede ejecutar el análisis o falta una capacidad. No se presentan como borradores técnicos aprobados. Conserva los identificadores, `task_id` disponibles, versiones analizadas e intentos consumidos de cada encargo, incluidos los ya ejecutados, para poder continuar.
5. **Bloqueos y cuestiones:** identificador, historias/criterios/bloques afectados, fuente y evidencia, intentos consumidos cuando proceda, impacto, pregunta concreta y acción requerida. Incluye las contradicciones y dudas reunidas por todos los especialistas.
6. **Decisiones y dependencias globales:** propietario de trabajo compartido, relaciones entre historias, decisiones técnicas sustentadas y respuestas confirmadas del usuario.

Si una sección está vacía, indícalo. La entrega parcial conserva todas las historias y su cobertura pendiente, además del contenido utilizable. Las futuras continuaciones publican una nueva versión completa conservando la trazabilidad y las anteriores.

## Primera fase y continuación

En esta fase se crea `agente-arquitecto`, su configuración y la integración con el publicador de sesión existente. Puede leer archivos, registrar cobertura, preparar encargos y publicar el plan preparatorio. Los especialistas y el proveedor todavía están pendientes; la planificación técnica completa y su revisión se verificarán cuando estén integrados.

Próximas fases: definir e implementar el proveedor de código, los tres especialistas y su integración con el revisor; validar el circuito con historias locales reales; afinar descomposición y estimaciones; añadir lectura desde gestores de tareas y, cuando exista confianza suficiente, valorar la publicación automática. El orden de las siguientes fases se confirmará con el usuario. Al cerrar cada sesión, la respuesta incluye un handoff con la versión vigente, decisiones, encargos e intentos consumidos, bloqueos y siguiente acción.
