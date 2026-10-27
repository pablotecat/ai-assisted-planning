# Historia

## Aplicación y suficiencia

Planificador y Refinador usan esta estructura para historias refinadas y para cada historia de `borrador.md`. Al decidir clasificación, división, redacción o aceptación, aplica las ramas de [user-stories](../../user-stories/SKILL.md); los criterios de aceptación se redactan como escenarios Gherkin según [criterios de aceptación](criterios-aceptacion.md). Revisor coteja el mismo formato con los originales.

Antes de publicar, corregir o revisar aplica [publicación y revisión](../../operativa-comun/references/publicacion-revision.md); esta referencia determina el formato, no redefine guardado ni aprobación.

Todos los apartados de la plantilla son obligatorios. Son condicionales la clave real del gestor, la relación de división y la referencia de revisión: inclúyelas cuando existan. Estimación, prioridad y horizonte son opcionales y requieren atribución; su ausencia no autoriza a inventarlos. La versión es obligatoria si la historia entra en arquitectura o revisión versionada.

La historia final es un documento de decisión humana: se pega tal cual en la descripción del gestor. Su cuerpo no incluye rutas locales, sessionIDs, marcas temporales del gestor ni evidencia de implementación; esa información y el mapeo con el original viven en el archivo de incidencias, que custodia la tabla de trazabilidad con todos los criterios originales y su destino. Conserva el identificador de cada criterio original en esa tabla; si falta, asigna uno local estable y enlaza su texto literal. Cada criterio original tiene destino o estado explícito, incluso si se mantiene pendiente, se propone retirarlo o se reparte entre resultados. Los criterios sugeridos tienen identificadores propios y permanecen separados de los confirmados hasta su acuerdo explícito. Una división conserva la historia de origen y el valor independiente de cada resultado; una tarea no se convierte en historia por cambiarle el encabezado.

**Cierre:** cada criterio original puede cotejarse en la trazabilidad del archivo de incidencias, cada criterio de aceptación es un escenario completo según [criterios de aceptación](criterios-aceptacion.md), y todo desconocido material tiene efecto, pregunta y responsable. Si no hay actor, resultado o criterios fundados, conserva una propuesta pendiente y el bloqueo afectado.

## Plantilla copiable

```markdown
# <ID> — <Título>

**Identidad:** <local o clave real del gestor; clave/URL real si existe>
**Versión y procedencia:** <versión cuando el flujo la requiera; localizador del
original (URL o `Originales/`); dictamen de revisión si existe>
**Estado:** <estado y alcance; revisión exacta si existe>

## Actor, objetivo y valor
<Beneficiario, resultado buscado y valor; evidencia o pendiente>

## Alcance y reglas funcionales
- <Incluido y excluido>
- <RF-ID>: <regla o definición no escenificable; confirmada e identificador/fuente>

## Criterios de aceptación confirmados
- **<CA-ID> — <título del escenario>**: escenario completo Dado/Cuando/Entonces
  con sus cláusulas Y, según criterios de aceptación; sin evidencia en el cuerpo

## Propuestas de criterios — pendientes de confirmación
- **<PC-ID> — <título del escenario>**: mismo formato de escenario; fundamento
  breve y quién decide

## Dependencias, decisiones y preguntas pendientes
- Confirmado: <decisión y fuente, o Ninguna>
- Propuesto: <decisión sugerida y responsable, o Ninguna>
- Pendiente: <INC/PC con efecto, pregunta, responsable y siguiente acción, o Ninguno>
```

Las reglas que no pueden expresarse como escenario completo (definiciones, permisos transversales, restricciones) se publican como RF- en «Alcance y reglas funcionales»; el apartado de criterios solo contiene escenarios.

## Incidencias y contenedores

`borrador.md` agrupa una o varias historias con esta estructura; identifica las asignadas y los fragmentos fuera del alcance. Si hay división, incluye un mapa origen → resultados y el valor de cada uno. La historia final va en `<ID>.md`; las incidencias son documentos distintos, no sustituyen las preguntas de la historia y además custodian la evidencia y la trazabilidad al original. Usa esta estructura tanto para `<ID>-incidencias.md` como para `incidencias-globales.md` (en este último, incluye conflictos entre historias):

```markdown
# Incidencias — <ID de historia o globales>

**Entrega:** <versión de historias acompañadas>

## Hallazgos y decisiones pendientes
- <INC-ID; historias/criterios afectados; evidencia; impacto; decisión o pregunta;
  responsable y siguiente acción; estado>

## Trazabilidad al original
| Criterio original y fuente | Destino (historia/criterio) | Estado y cambio justificado |
|---|---|---|
| <ID y texto/localizador> | <ID estable> | <conservado, pendiente o propuesta de cambio y motivo> |
```

La tabla de trazabilidad cubre todos los criterios originales, incluidos los repartidos a otras historias y los pendientes, con el literal citado y su fuente. La evidencia de cada hallazgo vive en este documento, una sola vez; el cuerpo de la historia conserva únicamente los escenarios y las decisiones con su responsable. Si no hay incidencias, conserva «Ninguna identificada» y el alcance comprobado; la trazabilidad se mantiene mientras existan criterios originales que cotejar.

Publica mediante los argumentos vigentes de `write_planning_deliverables`: `historias[{clave, contenido, incidencias}]`, `incidencias_globales`, `fuentes?`, `decisiones?`. En `write_planning_originals(historias[{clave, contenido}])` guarda el contenido fiel y la procedencia en `Originales/`, con texto literal separado del análisis; no apliques la reestructuración de Historia a ese original.

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
- **CA-1 — Mostrar el saldo disponible al abrir Bonos**
  - **Dado** un titular autenticado con un saldo conocido en su cuenta de bonos
  - **Cuando** abre la sección «Bonos»
  - **Entonces** se muestra ese saldo como disponible,
    incluido 0 cuando la cuenta está vacía

## Propuestas de criterios — pendientes de confirmación
- **PC-1 — Mostrar la fecha de la última actualización**
  - **Dado** un titular autenticado consultando su saldo
  - **Cuando** se muestra el saldo disponible
  - **Entonces** se muestra junto a él la fecha de su última actualización

  Propuesta del refinador, pendiente de confirmación de producto; no es criterio
  acordado.

## Dependencias, decisiones y preguntas pendientes
- Confirmado: consulta y descarga son resultados distintos (taller-v1 §Objetivos).
- Propuesto: dividir LOCAL-H1 en A y B; decide producto.
- Pendiente: regla del saldo caducado; afecta solo a esa variante. ¿Qué debe
  mostrarse? Producto debe definirla antes de concretar su criterio.

En `LOCAL-H1-A-incidencias.md`: trazabilidad con `CA-1: mostrar saldo
(taller-v1 §Consulta) → LOCAL-H1-A/CA-1, conservado` y `CA-2: descargar
movimientos (taller-v1 §Descarga) → LOCAL-H1-B/CA-2, conservado en otro
resultado; división propuesta`, además del hallazgo del saldo caducado con
su evidencia y responsable.
```
