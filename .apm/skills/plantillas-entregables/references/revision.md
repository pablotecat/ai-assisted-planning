# Revisión y disputa

## Aplicación y suficiencia

Revisor usa el formato de dictamen para `sanity-check.md`, incluso sin hallazgos, y consulta además la plantilla del contenido revisado. Los nombres efectivos, incluidos prefijos de archivos versionados, los asigna `write_review_documents`. Al publicar, comprobar una revisión o continuar aplica [publicación y revisión](../../operativa-comun/references/publicacion-revision.md), única norma de guardado, versión exacta e intentos (consumo, límite, reapertura, aprobación parcial y fallos). El contrato de arquitectura define alcance y estados.

Todos los apartados son obligatorios. Intento, límite e historial se incluyen cuando la norma compartida los exige. Identifica la entrega por ruta confirmada y versión exacta; para una carpeta, delimita todos sus archivos. En una revisión parcial enumera aprobados con dependencias, pendientes y bloqueados según la norma y estados aplicables.

**Cierre:** todos los criterios y elementos del alcance tienen resultado o pendiente explícito, cada hallazgo tiene evidencia/impacto/corrección, y el dictamen identifica inequívocamente su versión. El fallo de revisión o guardado conserva el resultado y el bloqueo, sin atribuir informe guardado.

## Plantilla copiable — dictamen

```markdown
# Revisión — <entrega y versión>

**Dictamen:** <favorable, parcial o con hallazgos>
**Productor y encargo:** <agente; ENC-ID o identificador del encargo>
**Entrega exacta:** <ruta confirmada; versión y archivos incluidos>
**Intento e historial:** <número, límite y registro si aplica; o No aplica: motivo>

## Fuentes y alcance comprobado
- <Fuente, versión y localizador; comprobada o inaccesible y efecto>

## Cobertura comprobada y pendiente
| Historia / criterio / elemento o variante | Resultado | Evidencia o motivo pendiente |
|---|---|---|
| <ID> | <comprobado, pendiente, bloqueado o no aplica justificado> | <localizador> |

## Hallazgos
- <REV-ID; elemento; evidencia; impacto; corrección necesaria; estado>

## Elementos aprobados, pendientes y bloqueados
- Aprobados: <IDs y dependencias comprobadas; o Ninguno>
- Pendientes/bloqueados: <IDs, motivo y dependencias; o Ninguno>

## Siguiente acción
<Responsable, corrección o decisión requerida; propuestas diferenciadas del acuerdo>
```

## Historial compartido

Encargo, borrador, plan integrado y handoff referencian este registro por encargo. Representa los datos exigidos por [Intentos — solo flujo de arquitectura](../../operativa-comun/references/publicacion-revision.md#intentos--solo-flujo-de-arquitectura), incluida la siguiente solicitud cuando esté preparada; esa norma decide el consumo y la continuidad. El registro es documental, no un contador automático de la herramienta.

```markdown
**Encargo:** <ENC-ID; sessionID disponibles del especialista/revisor>
**Límite:** <MAX_INTENTOS_REVISION>
**Intentos consumidos:** <número verificado o Desconocido: bloqueo de continuidad>

| Intento | Entrega exacta | Solicitud | Resultado | Informe confirmado / bloqueo |
|---|---|---|---|---|
| <n> | <ruta y versión> | <enviada o pendiente de solicitud> | <dictamen, fallo o pendiente> | <ruta o motivo> |
```

## Variante copiable — disputa

Ante desacuerdo persistente tras la respuesta del productor, conserva la misma entrega y versión del dictamen. Todos estos campos son obligatorios; adjunta con `write_review_documents(entrega, disputa)` a esa versión, manteniendo su sanidad previa.

```markdown
# Disputa — <entrega y versión exactas>

**Productor y encargo:** <agente; ENC-ID>
**Dictamen e intento de referencia:** <informe exacto y número si aplica>
**Entrega exacta:** <misma ruta/versión; sin trasladar a una corrección posterior>

## Desacuerdo y evidencia
- <Hallazgo; posición del productor y su fuente; posición del revisor y su fuente>

## Impacto, acuerdos y decisión pendiente
<Contenido afectado; lo acordado y lo todavía disputado; quién debe decidir>

## Siguiente acción
<Pregunta o corrección concreta; estado del bloqueo y responsable>
```

## Ejemplo ficticio — revisión parcial

Rutas, informes y resultados inventados; no son una revisión real.

```markdown
# Revisión — borrador-tests v2

**Dictamen:** parcial.
**Productor y encargo:** arquitecto-test; ENC-UI-R1 (ejemplo independiente).
**Entrega exacta:** 02-borrador-tests.md, v2; un archivo completo.
**Intento e historial:** 2 de 3; 2 consumidos, sin reinicio por aprobación parcial.
Intento 1: 01-borrador-tests.md v1, solicitud enviada, con hallazgos,
informe 01-borrador-tests-sanity-check.md confirmado en este ejemplo.
Intento 2: 02-borrador-tests.md v2, solicitud enviada, parcial,
informe 02-borrador-tests-sanity-check.md confirmado en este ejemplo.

## Fuentes y alcance comprobado
- historias.md v2 §CA-1 y suite/saldo.spec.ts:10-25, referencias ficticias comprobadas
  en el escenario ilustrado; lectura de código, sin ejecución.

## Cobertura comprobada y pendiente
| Historia / criterio / elemento o variante | Resultado | Evidencia o motivo pendiente |
|---|---|---|
| LOCAL-H1-A / CA-1 / UI-1-V1 | Comprobado | historias.md §CA-1; borrador v2 §UI-1 |
| LOCAL-H1-A / PC-1 / UI-2 | Pendiente | PC-1 sigue propuesto; falta acuerdo de producto |

## Hallazgos
- REV-2: UI-2 afirma una fecha sin regla acordada; historias.md §PC-1.
  Impacto: resultado no fundado. Corrección: conservar propuesta pendiente de decisión.

## Elementos aprobados, pendientes y bloqueados
- Aprobados: UI-1-V1; sin dependencias pendientes comprobadas; falta integración global.
- Pendientes/bloqueados: UI-2, regla de fecha sin acuerdo; no aporta cobertura confirmada.

## Siguiente acción
Producto debe resolver PC-1. Se propone retirar UI-2 del conjunto listo para copiar;
el arquitecto decide integración. Si hay corrección material, revisar v3 como intento 3.
```
