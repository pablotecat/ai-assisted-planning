# Plan: activar la investigación de preguntas durante el refinamiento

**Fecha:** 2026-10-20.  
**Estado:** implementado y verificado; [resultados, trazas e incidencias](../refinement-routing-verification.md).  
**Destinatario:** agente que trabajará en `ai-assisted-planning`.  
**Objetivo:** que las preguntas investigables encontradas al refinar historias activen la delegación `refinador → investigador`, conservando la recuperación directa de originales y las decisiones humanas.

## 1. Contexto y diagnóstico comprobado

El usuario observó que los refinadores de Planning Office no utilizaban investigadores para sus preguntas. Se revisaron las sesiones reales de ES-1345 y ES-1514, los componentes instalados y la configuración efectiva de OpenCode 1.19.3.

### Evidencia de ejecución

| Sesión | Identificador | Resultado observado |
|---|---|---|
| Planificador del encargo | `ses_ea9dcb1c7ffed2Wm1LTCutj5Kw` | Delegó las dos historias en refinadores y les pidió consultar directamente las historias Jira relacionadas. |
| Refinador ES-1345 | `ses_ea9db0425ffegtRZf1RhjhVQ7i` | Consultó Jira, leyó fuentes y publicó borradores; cero llamadas a `task` y cero errores de herramienta registrados. |
| Refinador ES-1514 | `ses_ea9db03cfffeZ4EiBP7pFFLH2B` | Mismo patrón: cotejo directo, preguntas pendientes y ninguna delegación intentada. |

El borrador de ES-1514 declara: «No se solicitó investigación adicional de implementación/documentación: el encargo se resolvió por cotejo directo de las fuentes Jira indicadas». En su cierre figuran dudas sobre comportamiento existente y evidencias, además de decisiones de negocio.

Las sesiones pueden inspeccionarse con `opencode export <ID>` desde `../planning-office/workspace/`. La grabación `../planning-office/recordings/latest.office.json` fue sustituida por una consulta posterior sobre la ausencia de investigadores; no representa aquel encargo original.

Artefactos locales de apoyo, relativos a `../planning-office/workspace/`:

- `informes-agente/sesiones/2026-10-19_2148__planificacion__encargo-de-refinamiento/indice.md`.
- En esa sesión, `01-planificador/01-refinador__revisar-investigacion-es-1345-refinador-subagent/01-borrador.md`.
- En esa sesión, `01-planificador/02-refinador__revisar-mensajes-es-1514-refinador-subagent/01-borrador.md`, apartado «Cobertura, límites y cierre de etapa».

### Configuración comprobada

- El permiso efectivo del refinador incluye `task → investigador: allow`.
- `investigador` está instalado con `mode: all` y puede delegar en sus lectores autorizados.
- El límite del refinador es `MAX_CONSULTAS_PARALELAS = 2`; `subagent_depth = 4`.
- Las sesiones de ambos refinadores solo añadían una denegación de `todowrite`, sin prohibición adicional de `task`.
- Los agentes instalados `refinador.md` e `investigador.md` coincidían con las fuentes de este repositorio.

Esto acredita disponibilidad y ausencia de intentos, no una ejecución satisfactoria de toda la cadena anidada. La validación funcional debe comprobar esa cadena.

### Causa de enrutado identificada

En `.apm/agents/refinador.agent.md`:

- El párrafo Jira, actualmente en la línea 50, permite «investigación o cotejo» directo para cuestiones adicionales.
- El paso 2, actualmente en la línea 53, reserva la llamada al investigador a «implementación o documentación adicional».
- El cierre permite entregar preguntas pendientes sin exigir distinguir las investigables de las decisiones humanas ni justificar el recorrido de cada una.

En `.apm/agents/planificador.agent.md`, el paso 4, actualmente en la línea 67, pide consultar directamente fuentes Jira. Los encargos reales reforzaron esa vía con instrucciones de cotejar y declarar límites, sin recordar el enrutado de preguntas investigables.

La evidencia apunta a una ambigüedad de instrucciones y a un disparador insuficiente. No hubo una llamada rechazada que justifique ampliar permisos.

## 2. Comportamiento que debe quedar definido

Antes de cerrar una historia, clasificar las carencias materiales:

| Tipo | Ejemplos | Tratamiento |
|---|---|---|
| Recuperación o lectura de originales | Descripción completa, comentarios paginados, criterio ya expresado, dato puntual identificado | Lectura directa proporcionada con las herramientas autorizadas. No necesita una investigación independiente por defecto. |
| Pregunta investigable | Regla vigente sin localizar, contradicción entre fuentes, comportamiento implementado, evidencia histórica o documento adicional necesario | Delegar en `investigador` con una pregunta concreta y alcance acotado; confirmar su resumen y seguir el resultado. |
| Decisión nueva de negocio | Elegir una política futura, aprobar una propuesta, fijar una prioridad o decidir entre alternativas sin acuerdo previo | Dejar explícita la decisión, sus opciones y responsable; elevarla al planificador para conversación humana. Una investigación puede aportar antecedentes, pero no adoptar la decisión. |

Una pregunta investigable no se convierte en decisión humana por estar sin respuesta en la historia original. Tampoco se exige un investigador en todas las historias ni una consulta independiente por cada duda trivial.

Si faltan corpus, ruta, referencia o acceso indispensables, identificar exactamente el dato pendiente y canalizar su confirmación mediante los roles autorizados. No inventar fuentes ni ejecutar una búsqueda sin alcance. Cuando el usuario haya limitado expresamente el encargo a las fuentes aportadas, respetar ese límite y explicitar su efecto.

## 3. Cambios de instrucciones

### 3.1. Refinador — cambio principal

Modificar `.apm/agents/refinador.agent.md`:

1. Acotar el párrafo de Jira: la recuperación de originales y comprobaciones puntuales siguen siendo directas; una pregunta material que requiera investigación adicional usa `investigador`, también cuando el corpus sea Jira.
2. Sustituir el disparador limitado a «implementación o documentación adicional» por la clasificación del apartado 2. Incluir las dudas funcionales y contradicciones documentales investigables.
3. Exigir una delegación con pregunta, historia/criterios afectados, fuentes conocidas, alcance autorizado y datos de corpus/referencia disponibles. Distinguir valores aportados de los pendientes de confirmar.
4. Conservar el protocolo existente: el investigador devuelve `PENDIENTE_CONFIRMACION`; el refinador comprueba el resumen y reanuda mediante `CONFIRMAR` en el mismo `task_id` antes de investigar. Si el resumen es incorrecto o incompleto, corregirlo antes de confirmar.
5. Mantener `MAX_CONSULTAS_PARALELAS`, seguimiento por `task_id`, reutilización de resultados pertinentes y límites de los especialistas. Agrupar preguntas estrechamente relacionadas cuando compartan alcance y fuentes.
6. Integrar respuesta, citas y límites en el borrador. Una declaración de implementación o un comentario de ejecución no se convierte en evidencia independiente por delegarlo.
7. Reforzar el cierre: para cada pregunta material, indicar tipo, tratamiento y resultado. Las investigables deben tener respuesta con evidencia, consulta pendiente identificada o impedimento concreto que explique por qué no pudo iniciarse o completarse. Las decisiones humanas deben quedar identificadas como tales.

Representar esta trazabilidad en los apartados actuales de preguntas, incidencias y cierre. Incluir `task_id` cuando haya una consulta real; no introducir un formato de grabación ni un esquema de publicación nuevo.

### 3.2. Planificador — preservar el enrutado al delegar e integrar

Modificar `.apm/agents/planificador.agent.md`:

1. En el paso de delegación, distinguir la lectura directa de originales del trabajo de investigación. Remitir a la responsabilidad del refinador de enviar sus preguntas investigables a `investigador`.
2. Pedir que el refinador devuelva las consultas realizadas, sus resultados o impedimentos y las decisiones que requieren una persona. Mantener las fuentes, el alcance y las restricciones del encargo.
3. En el contraste de borradores, devolver al mismo `task_id` las preguntas investigables que se hayan dejado pendientes sin tratamiento o justificación. No cerrar esa carencia solo porque se haya añadido un responsable humano.
4. Conservar la publicación y revisión versionadas existentes. Un impedimento puede permitir una entrega parcial claramente identificada; no acredita investigación completada ni aprobación.

No conceder al planificador delegación directa en `investigador` como sustituto de esta cadena. La disponibilidad de agentes se evalúa por rol: que el planificador solo pueda llamar a refinador/revisor no significa que el refinador carezca de investigador.

### 3.3. Coherencia y fuente única

- Contrastar el cambio con `.apm/agents/investigador.agent.md`, especialmente el protocolo de confirmación. Ajustarlo solo si es necesario para conservar coherencia.
- Mantener la norma de enrutado en el rol que la ejecuta; el planificador debe remitir a ella sin duplicar toda la secuencia.
- Reutilizar `.apm/skills/operativa-comun/` y `.apm/skills/plantillas-entregables/references/historia.md` para evidencia, configuración, preguntas y publicaciones. Cambiar sus referencias solo si el contrato actual impide expresar la trazabilidad requerida.
- Conservar permisos de lectura, alias Jira, gestores de configuración, publicadores y autoridad humana. Este diagnóstico no exige herramientas nuevas, cuotas mínimas de delegación ni otro orquestador.

## 4. Implementación y verificación

### Paso 1 — revisar y editar las fuentes

Leer el README y las instrucciones aplicables al repositorio. Revisar el estado Git y preservar trabajo previo. Implementar los cambios principalmente en los dos agentes indicados; comprobar los punteros compartidos y evitar reglas contradictorias.

Referencias útiles:

- [README](../../README.md): instalación, actualización y fuentes normativas.
- [Verificación de instrucciones](../agent-instructions-verification.md): contratos actuales y alcance de las comprobaciones anteriores.
- [Verificación Jira](../jira-access-verification.md): permisos, distribución y límites de la validación funcional.

### Paso 2 — regresiones y configuración efectiva

- Ejecutar `node --test *.test.ts` con el aislamiento de consumidores y temporales empleado por el proyecto.
- Añadir o ajustar una comprobación significativa del contrato afectado siguiendo las pruebas existentes. Una búsqueda de frases en Markdown no demuestra que el modelo delegue correctamente.
- Verificar en un consumidor instalado los permisos efectivos de refinador e investigador y la disponibilidad de las skills. Conservar el acceso Jira de lectura y las denegaciones actuales.
- Ejecutar `git diff --check` y documentar resultados, fallos y alcance real. No modificar evidencias históricas para presentarlas como validación del cambio.

### Paso 3 — comprobación funcional acotada con OpenCode

Usar un consumidor de prueba y sesiones nuevas, con cierre de procesos y límite de ejecución. Preparar una historia ficticia y una fuente documental adicional autorizada que permita resolver una duda sobre una regla existente. Facilitar el corpus y sus rutas como datos confirmados del encargo.

Pedir el refinamiento sin ordenar explícitamente en ese prompt «llama al investigador»: se debe comprobar el disparador de las instrucciones del agente. Mantener los datos ficticios separados de historias reales y registrar el uso de modelos.

| Caso | Resultado observable requerido |
|---|---|
| Pregunta investigable, con fuente adicional accesible | `planificador → refinador → investigador`; resumen pendiente de confirmación, reanudación del mismo investigador con `CONFIRMAR`, consulta al lector cuando corresponda y resultado integrado con evidencia. |
| Historia suficiente sin pregunta investigable | Puede terminar sin investigador; no aparece una delegación impuesta para completar una cuota. |
| Decisión nueva de negocio | Se mantiene como decisión humana; ningún agente inventa un acuerdo. |
| Investigación necesaria con corpus o acceso indispensable pendiente | Se identifica el dato o impedimento y el siguiente paso; no se declara investigación realizada ni se inventa un resultado. |

Comprobar llamadas `task`, `subagent_type`, relaciones padre/hijo, `task_id`, entradas de confirmación y respuestas reales. No usar como prueba únicamente la afirmación del agente de que puede delegar ni la existencia de archivos publicados.

Las pruebas de instalación/permisos y el smoke de Planning Office que llega a `planificador → refinador` no acreditan por sí solos la cadena `refinador → investigador`. Si falta la validación con modelo, registrarla expresamente como pendiente.

### Paso 4 — distribución a Planning Office

Tras validar las fuentes, actualizar el consumidor de demostración desde `../planning-office/` con `npm run setup`, que toma este repositorio local como fuente. Las copias en `workspace/.opencode/` y `workspace/.agents/` son generadas; las correcciones pertenecen a este repositorio.

Pedir al usuario que detenga y reinicie la oficina y su runtime de demostración, y abra sesiones nuevas para cargar las instrucciones. Para continuar encargos previos, conservar documentos, handoff, decisiones, versiones e intentos consumidos.

## 5. Criterios de aceptación y entrega del agente implementador

- Una duda investigable material activa la cadena prevista o queda asociada a un impedimento verificable.
- Jira directo para originales y datos puntuales sigue disponible; no absorbe silenciosamente toda investigación adicional.
- Los encargos del planificador preservan el enrutado y la integración detecta preguntas sin tratamiento.
- Se conservan confirmación, límites, trazabilidad, publicación versionada y decisiones humanas.
- El informe de entrega identifica archivos modificados, pruebas y trazas ejecutadas, resultados y validación pendiente. Las sesiones ES-1345/ES-1514 son evidencia del diagnóstico, no pruebas de aceptación del cambio futuro.

## Skills sugeridas para el siguiente agente

- `customize-opencode`: cambios de instrucciones de agentes y comprobación de permisos/configuración OpenCode.
- `writing-for-agents`: si se modifican skills o sus referencias normativas; conservar disparadores claros, cierre verificable y fuente única.
- `ponytail`: mantener la corrección acotada y reutilizar los mecanismos existentes.
