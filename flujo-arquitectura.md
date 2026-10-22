# Contrato del flujo de arquitectura — V1

## Propósito y alcance

Convertir historias locales refinadas y revisadas en un plan integrado con casos funcionales UI de Test revisados, encargos pendientes de capacidad y bloqueos. Están implementados `arquitecto`, `arquitecto-test`, el Revisor común y la publicación versionada. Backend, Frontend y el proveedor siguen pendientes; su evolución se recoge en `docs/roadmap.md` del paquete.

El usuario crea manualmente las subtareas y tests en su gestor, incluido Jira. Cada bloque pertenece a una sola historia padre; otras historias pueden citarse como relacionadas. Las estimaciones sin fundamento quedan pendientes.

La fuente oficial V1 es una versión identificada de los archivos locales recibidos. Conserva los identificadores originales; si faltan, asigna identificadores locales estables. No se requieren claves Jira. Si una fuente no tiene versión, el usuario confirma una etiqueta para el contenido recibido; en continuaciones se contrasta de nuevo el archivo. `arquitecto` puede consultar Jira directamente en solo lectura como contexto funcional complementario, con citas y alcance explícitos. El flujo toma decisiones técnicas; las contradicciones funcionales y cuestiones sin resolver se comunican al usuario a través de `arquitecto`.

## Responsabilidades y recorrido

1. `arquitecto` lee las historias del encargo, mantiene la visión global, identifica trabajo compartido y prepara encargos acotados por historia y especialidad.
2. `arquitecto-test` recibe criterios y reglas pertinentes de una historia, lee directamente su proyecto de Test en solo lectura y diseña casos UI con encaje técnico. Las necesidades de otras áreas se resuelven con contratos o datos concretos aportados al encargo, como un endpoint, sin acceso general a código ajeno.
3. Test publica y solicita revisión de sus borradores según la norma compartida; corrige hallazgos y devuelve al coordinador propuestas revisadas y bloqueos. El Revisor común recibe encargo y fuentes pertinentes.
4. `arquitecto` comprueba cobertura y coherencia global, evita duplicaciones y entrega lo aprobado e independiente junto con pendientes y bloqueos.

El coordinador conserva como pendientes los encargos sin capacidad técnica y su revisión. Test se invoca exclusivamente desde `arquitecto`; le devuelve sus cuestiones para resolución. La presencia de un nombre en permisos no demuestra que el especialista esté distribuido.

## Revisión y estados

Antes de publicar, revisar o reanudar, carga `operativa-comun` y lee [publicación y revisión](.apm/skills/operativa-comun/references/publicacion-revision.md), incluida «Intentos — solo flujo de arquitectura»: es la definición normativa de guardado, versión exacta, cómputo, historial, agotamiento y fallos. Arquitecto valida y transmite `MAX_INTENTOS_REVISION` de `architecture_settings()`; Test aplica la norma por encargo y Revisor registra y verifica la versión. Los casos revisados favorables e independientes pueden continuar tras la comprobación global.

Estados de seguimiento: **pendiente** (trabajo o capacidad aún por completar), **en curso**, **aprobado** (revisión favorable y comprobación global, con dependencias necesarias resueltas), **bloqueado** (requiere resolver un impedimento) y **no aplica** (justificación explícita). Cada criterio debe tener un estado verificable; no se declara cobertura completa por omisión. Una historia sin criterios verificables se registra como bloqueada, con la información que falta.

## Encargo mínimo para un especialista

Al preparar o continuar una delegación, carga `plantillas-entregables` y aplica [Encargo](.apm/skills/plantillas-entregables/references/encargo.md), incluida su rama Test cuando corresponda. Esa referencia define los campos; este contrato mantiene alcance, estados y entrega integrada. Los enlaces se resuelven desde este archivo: el instalador adapta `.apm/skills/` del paquete a `../.agents/skills/` desde el contrato instalado en `.opencode/`.

El código actual leído por Test es la evidencia de implementación; distingue la referencia declarada de la comprobada y registra cambios locales conocidos. Un encargo pendiente de capacidad conserva ese estado, separado del análisis técnico realizado.

## Especialista Test — primera iteración UI

El especialista diseña pruebas funcionales de aceptación a través de la interfaz de usuario. Analiza la suite y propone cambios; el equipo implementa y ejecuta los casos. Su alcance actual es UI.

### Contexto del proyecto

El acceso directo se limita al código y configuración del proyecto de Test y a los documentos o contratos concretos aportados. Los datos necesarios de otras áreas se solicitan a través del arquitecto principal. El especialista consulta metadatos Git de solo lectura para comprobar la referencia cuando sea posible; una referencia no comprobada se identifica como tal.

**Carpeta de conocimiento — fuente complementaria:** consulta la carpeta indicada para convenciones, nomenclatura, buenas prácticas y peculiaridades. Si falta o está incompleta, continúa con las convenciones comprobables en la suite, identificadas como observaciones. Si falta información indispensable, devuelve la cuestión al arquitecto principal y deja pendiente solo el trabajo afectado. El acceso vigente a esta carpeta es de solo lectura.

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
4. **Encargos pendientes:** paquetes preparados por especialidad cuando todavía no se puede ejecutar el análisis o falta una capacidad. No se presentan como borradores técnicos aprobados. Conserva los identificadores, `sessionID` disponibles, versiones analizadas e intentos consumidos de cada encargo, incluidos los ya ejecutados, para poder continuar.
5. **Bloqueos y cuestiones:** identificador, historias/criterios/bloques afectados, fuente y evidencia, intentos consumidos cuando proceda, impacto, pregunta concreta y acción requerida. Incluye las contradicciones y dudas reunidas por todos los especialistas.
6. **Decisiones y dependencias globales:** propietario de trabajo compartido, relaciones entre historias, decisiones técnicas sustentadas y respuestas confirmadas del usuario.

Si una sección está vacía, indícalo. La entrega parcial conserva todas las historias y su cobertura pendiente, además del contenido utilizable. Las futuras continuaciones publican una nueva versión completa conservando la trazabilidad y las anteriores.

## Fase vigente y continuación

La entrega integrada actual contiene casos de Test revisados y encargos pendientes de las otras especialidades; la cobertura global conserva ese carácter parcial. Se completa una etapa cuando sus entradas y resultados son verificables o el trabajo afectado tiene un pendiente o bloqueo con causa y siguiente acción.

Las comprobaciones del paquete verifican configuración, procedencia, publicación y revisión; la calidad del diseño del especialista requiere validación con historias y proyecto reales, descrita en el roadmap del paquete.

Al cerrar cada sesión, incluye en la respuesta un handoff con versión vigente, decisiones, encargos y `sessionID` disponibles, intentos consumidos, bloqueos y siguiente acción. Aplica la continuidad de la norma compartida de publicación y revisión.

Para continuar, el handoff referencia las entregas e informes exactos y el [historial compartido por encargo](.apm/skills/plantillas-entregables/references/revision.md#historial-compartido), incluidos los `sessionID` disponibles. Puede permanecer en la respuesta; no requiere un archivo adicional.
