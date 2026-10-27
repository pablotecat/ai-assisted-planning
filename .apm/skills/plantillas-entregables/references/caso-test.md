# Caso de Test — UI

## Aplicación y suficiencia

Arquitecto Test redacta casos concretos y Revisor los contrasta con el encargo, la suite y el contrato de arquitectura. Todos los apartados son obligatorios; historias relacionadas y estimación son opcionales cuando no sean pertinentes. Antes de publicar, revisar o continuar aplica [publicación y revisión](../../operativa-comun/references/publicacion-revision.md), incluida la norma de intentos de arquitectura; representa dictamen e historial con [Revisión](revision.md#historial-compartido). La lectura de tests describe sus comprobaciones, no una ejecución satisfactoria; diseño, implementación y ejecución son estados distintos.

Clasifica cada caso como **reutilizar**, **actualizar** o **crear**, citando el caso existente o el alcance buscado y la justificación. En una actualización indica qué pasos/resultados cambian. El encaje distingue recursos existentes de propuestos; las convenciones observadas se identifican como tales. Fundamenta positivos, negativos y límites en criterios o reglas recibidos; un resultado funcional desconocido permanece pendiente con pregunta, no se rellena con una suposición.

Una matriz agrupa variantes con el mismo objetivo y procedimiento: cada fila tiene ID estable, datos/condiciones y resultado verificable, además de estado. Explica su contribución de cobertura. Si cambia sustancialmente el procedimiento o el comportamiento, crea otro caso. Un caso puede cubrir varios criterios de su única historia padre y un criterio puede requerir varios casos.

Los criterios recibidos llegan como escenarios Gherkin según [criterios de aceptación](criterios-aceptacion.md); interpreta su correspondencia con el caso —Dado alimenta las precondiciones, Cuando produce los pasos, Entonces y sus cláusulas Y producen los resultados esperados— pero los casos de test no se redactan en Gherkin y una cláusula Y nunca genera un caso independiente.

**Cierre:** cada criterio asignado y cada variante tiene fundamento, cobertura/estado y dependencias explícitos; cada aprobado remite a revisión exacta verificable. Las dependencias y comprobación global del arquitecto determinan qué está listo para copiar.

## Plantilla copiable — caso

```markdown
# <UI-ID> — <Título>

**Identidad:** <ID local; clave real verificada o Sin crear>
**Tipo y especialidad:** test; Test UI.
**Historia padre:** <una sola ID, versión/fuente>
**Acción:** <reutilizar/actualizar/crear; justificación y caso existente si aplica>

## Objetivo y criterios
<Resultado observable; IDs de criterios/reglas y fuentes; alcance incluido/excluido>

## Precondiciones, datos y preparación
<Estado inicial, usuario, datos y preparación necesaria; existentes o propuestos>

## Pasos UI y resultados esperados
1. <Acción en la interfaz> → <resultado verificable y fundamento>

## Encaje técnico
- Existente: <suite/archivo, caso, fixtures y utilidades; referencias>
- Propuesto: <recursos o cambios; convenciones comprobadas/observadas>

## Evidencias y dependencias
<Fuentes/versiones/localizadores; dependencias y estado; historias relacionadas si aportan>

## Estado, bloqueos y revisión
<Estado del diseño; implementación/ejecución acreditadas o pendientes;
preguntas, responsable y acción; entrega e informe exactos; historial por encargo>

## Estimación
<Si es pertinente: propuesta fundamentada del equipo, o Pendiente y dato necesario>
```

## Variante copiable — matriz del caso

Colócala bajo «Pasos UI y resultados esperados» del caso, sin duplicar el caso base. Los pasos comunes usan nombres de parámetros de la matriz.

```markdown
### Matriz <UI-ID>
<Procedimiento común y contribución de cobertura; regla que fundamenta las variantes>

| Variante | Datos / condiciones | Resultado esperado y fuente | Estado / bloqueo |
|---|---|---|---|
| <UI-ID-V1> | <valores> | <resultado verificable; criterio/regla> | <estado; revisión exacta si existe> |
```

## Contenedor copiable — `borrador-tests.md`

Todos los apartados son obligatorios, aunque indiquen «Ninguno» con motivo. Las correcciones conservan el historial y son versiones completas. La tabla incluye todos los criterios asignados, incluso sin casos o bloqueados por información insuficiente.

```markdown
# Borrador de Test — <ENC-ID>

## Identificación, fuentes y versiones
<Encargo, historia padre, versión completa del borrador, fuentes funcionales y revisión;
proyecto Test, referencia solicitada/comprobada, cambios locales conocidos,
carpeta de conocimiento y limitaciones>

## Casos y matrices
<Casos según plantilla; matrices solo cuando procedan>

## Cobertura de criterios asignados
| Criterio y fuente | Casos / variantes | Cobertura y estado | Motivo pendiente / dependencia |
|---|---|---|---|
| <CA-ID> | <UI-ID o Sin caso> | <estado> | <motivo o Ninguno> |

## Bloqueos y cuestiones
<Evidencia, efecto, pregunta, responsable y acción por elemento; o Ninguno>

## Historial de revisiones y siguiente acción
<Registro por encargo según Revisión; tarea del revisor si disponible;
intentos anteriores y siguiente pendiente de solicitud o límite/bloqueo;
qué devolver al arquitecto>
```

## Ejemplo ficticio — caso actualizado con matriz

Todos los archivos, acuerdos y observaciones de suite son inventados. El ejemplo no acredita ejecución ni implementación.

```markdown
# UI-1 — Consultar saldo de bonos

**Identidad:** local; Sin crear en el gestor.
**Tipo y especialidad:** test; Test UI.
**Historia padre:** LOCAL-H1-A v3, historias.md §Consulta.
**Acción:** actualizar DEMO-SALDO en suite/saldo.spec.ts:10-25; ya comprueba saldo 5.

## Objetivo y criterios
CA-1: mostrar el saldo disponible al abrir Bonos; historias.md v3 §CA-1 confirma
saldos 0 y 5. Fuera de alcance: fecha de actualización, PC-1 aún propuesto.

## Precondiciones, datos y preparación
Titular autenticado mediante fixture existente titularDemo (suite/fixtures.ts:5-18).
Datos propuestos: saldo de la variante; preparar cuenta aislada antes de abrir UI.

## Pasos UI y resultados esperados
1. Abrir «Bonos» → se muestra el saldo de la variante, según CA-1.
Actualización: parametrizar datos y aserción existentes para añadir el saldo cero;
se mantiene el procedimiento. La matriz cubre ambos valores acordados.

### Matriz UI-1
| Variante | Datos / condiciones | Resultado esperado y fuente | Estado / bloqueo |
|---|---|---|---|
| UI-1-V1 | saldo=5 | Se muestra 5; CA-1 | Pendiente de revisión |
| UI-1-V2 | saldo=0 | Se muestra 0; CA-1 | Pendiente de revisión |

## Encaje técnico
- Existente: suite/saldo.spec.ts:10-25 y titularDemo; convención observada de casos parametrizados.
- Propuesto: añadir UI-1-V2 al conjunto de datos; no crear otro procedimiento.

## Evidencias y dependencias
historias.md v3 §CA-1; suite ficticia en demo-v1 comprobada sin cambios locales
en el escenario ilustrado. Sin dependencias conocidas para las dos variantes.

## Estado, bloqueos y revisión
Diseño pendiente de revisión; implementación y ejecución pendientes del equipo.
ENC-UI-M1 nuevo (ejemplo independiente): 0 de 3 intentos,
intento 1 pendiente de solicitud tras publicar.
Pendiente: producto debe decidir PC-1; afecta solo al futuro caso de fecha.

## Estimación
Pendiente: el equipo debe valorar preparación de datos frente a su trabajo comparable.
```
