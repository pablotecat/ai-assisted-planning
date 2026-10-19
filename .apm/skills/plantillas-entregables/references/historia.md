# Historia

## Aplicación y suficiencia

Planificador y Refinador usan esta estructura para historias refinadas y para cada historia de `borrador.md`. Al decidir clasificación, división, redacción o aceptación, aplica las ramas de [user-stories](../../user-stories/SKILL.md). Revisor coteja el mismo formato con los originales.

Todos los apartados de la plantilla son obligatorios. Son condicionales la clave real del gestor, la relación de división y la referencia de revisión: inclúyelas cuando existan. Estimación, prioridad y horizonte son opcionales y requieren atribución; su ausencia no autoriza a inventarlos. La versión es obligatoria si la historia entra en arquitectura o revisión versionada.

Conserva el identificador de cada criterio original; si falta, asigna uno local estable y enlaza su texto literal. Cada criterio original tiene destino o estado explícito, incluso si se mantiene pendiente, se propone retirarlo o se reparte entre resultados. Los criterios sugeridos tienen identificadores propios y permanecen separados de los confirmados hasta su acuerdo explícito. Una división conserva la historia de origen y el valor independiente de cada resultado; una tarea no se convierte en historia por cambiarle el encabezado.

**Cierre:** cada criterio original puede cotejarse, cada afirmación nueva tiene evidencia o etiqueta de propuesta, y todo desconocido material tiene efecto, pregunta y responsable. Si no hay actor, resultado o criterios fundados, conserva una propuesta pendiente y el bloqueo afectado.

## Plantilla copiable

```markdown
# <ID> — <Título>

**Identidad:** <local o clave real del gestor; clave/URL real si existe>
**Versión y procedencia:** <versión cuando el flujo la requiera; original y fuente>
**Estado:** <estado y alcance; revisión exacta si existe>

## Actor, objetivo y valor
<Beneficiario, resultado buscado y valor; evidencia o pendiente>

## Alcance y reglas funcionales
- <Incluido y excluido; regla confirmada e identificador/fuente>

## Criterios de aceptación confirmados
- <CA-ID>: <condición y resultado observable; fuente del acuerdo>

## Propuestas de criterios — pendientes de confirmación
- <PC-ID>: <condición y resultado sugeridos; fundamento y quién decide>

## Fuentes y trazabilidad al original
| Criterio original y fuente | Destino (historia/criterio) | Estado y cambio justificado |
|---|---|---|
| <ID y texto/localizador> | <ID estable> | <conservado, pendiente o propuesta de cambio y motivo> |

## Dependencias, decisiones y preguntas pendientes
- Confirmado: <decisión y fuente, o Ninguna>
- Propuesto: <decisión sugerida y responsable, o Ninguna>
- Pendiente: <dato, efecto, pregunta, responsable y siguiente acción, o Ninguno>
```

## Incidencias y contenedores

`borrador.md` agrupa una o varias historias con esta estructura; identifica las asignadas y los fragmentos fuera del alcance. Si hay división, incluye un mapa origen → resultados y el valor de cada uno. La historia final va en `<ID>.md`; las incidencias son documentos distintos, no sustituyen las preguntas ni la trazabilidad de la historia. Usa esta estructura tanto para `<ID>-incidencias.md` como para `incidencias-globales.md` (en este último, incluye conflictos entre historias):

```markdown
# Incidencias — <ID de historia o globales>

**Entrega:** <versión de historias acompañadas>

## Hallazgos y decisiones pendientes
- <INC-ID; historias/criterios afectados; evidencia; impacto; decisión o pregunta;
  responsable y siguiente acción; estado>
```

Si no hay incidencias, conserva el apartado con «Ninguna identificada» y el alcance comprobado. Publica mediante los argumentos vigentes de `write_planning_deliverables`: `historias[{clave, contenido, incidencias}]`, `incidencias_globales`, `fuentes?`, `decisiones?`. En `write_planning_originals(historias[{clave, contenido}])` guarda el contenido fiel y la procedencia en `Originales/`, con texto literal separado del análisis; no apliques la reestructuración de Historia a ese original.

## Ejemplo ficticio — historia dividida

Todos los nombres, rutas, acuerdos y referencias de este ejemplo son inventados; no acreditan fuentes reales.

```markdown
# LOCAL-H1-A — Consultar saldo de bonos

**Identidad:** local; sin clave real del gestor.
**Versión y procedencia:** v2; Originales/LOCAL-H1.md, fuente ficticia taller-v1.
**Estado:** pendiente de revisión; sin aprobación atribuida.
**División propuesta:** LOCAL-H1 → LOCAL-H1-A (consulta de saldo, valor: conocer
disponibilidad) y LOCAL-H1-B (descarga de movimientos, valor: conciliar gastos).
Cada resultado es utilizable por separado; producto debe confirmar la división.

## Actor, objetivo y valor
Como titular de bonos, consultar el saldo para conocer mi disponibilidad
(taller-v1, apartado «Consulta», acuerdo ficticio).

## Alcance y reglas funcionales
- Consulta del saldo; la descarga se conserva en LOCAL-H1-B.

## Criterios de aceptación confirmados
- CA-1: al abrir «Bonos» con saldo 5, se muestra 5 (taller-v1 §Consulta).

## Propuestas de criterios — pendientes de confirmación
- PC-1: mostrar la fecha de actualización; propuesta del refinador,
  pendiente de confirmación de producto, no es criterio acordado.

## Fuentes y trazabilidad al original
| Criterio original y fuente | Destino (historia/criterio) | Estado y cambio justificado |
|---|---|---|
| CA-1: mostrar saldo; taller-v1 §Consulta | LOCAL-H1-A/CA-1 | Conservado |
| CA-2: descargar movimientos; taller-v1 §Descarga | LOCAL-H1-B/CA-2 | Conservado en otro resultado; división propuesta |

## Dependencias, decisiones y preguntas pendientes
- Confirmado: consulta y descarga son resultados distintos (taller-v1 §Objetivos).
- Propuesto: dividir LOCAL-H1 en A y B; decide producto.
- Pendiente: saldo caducado; afecta solo a esa variante. ¿Qué debe mostrarse?
  Producto debe definir la regla antes de concretar su criterio.
```
