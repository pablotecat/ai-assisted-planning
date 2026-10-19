# Tarea o bloque técnico

## Aplicación y suficiencia

Arquitecto integra este formato por historia en «Borradores listos para copiar» de `plan-implementacion.md`; el contrato de arquitectura determina qué puede entrar aprobado. Para Test usa [Caso de Test](caso-test.md), que concreta el tipo test. Para un análisis que aún no puede ejecutarse usa [Encargo](encargo.md) en «Encargos pendientes».

Todos los apartados son obligatorios salvo historias relacionadas y estimación cuando no sea pertinente. Si se solicita una estimación sin base del equipo, indica «Pendiente» y qué falta. Los detalles técnicos (archivos, pasos, interfaces) son condicionales a evidencia suficiente. Registra la propuesta técnica como propuesta, aunque esté fundamentada; la aprobación del diseño no demuestra implementación ni ejecución.

Backend y Frontend siguen como capacidades pendientes: conserva sus paquetes como encargos y sus bloques pendientes de descomposición cuando corresponda; no los presentes como tareas concretas analizadas o revisadas. Un bloque a descomponer identifica ese nivel de precisión incluso tras una futura revisión. Un trabajo compartido tiene una sola historia propietaria; las demás son relacionadas.

Antes de publicar, revisar o continuar aplica [publicación y revisión](../../operativa-comun/references/publicacion-revision.md), incluida la norma de intentos de arquitectura; [Revisión](revision.md#historial-compartido) define solo cómo representar el historial. El contrato determina estados e integración global.

**Cierre:** identidad local diferenciada de clave real, historia padre única, criterios verificables, resultado/comprobación y estado coherentes con dependencias y revisión según esas autoridades.

## Plantilla copiable

```markdown
# <ID local> — <Título>

**Identidad en el gestor:** <clave real verificada o Sin crear>
**Tipo y especialidad:** <subtarea/bloque; Backend/Frontend/otra>
**Precisión:** <bloque pendiente de descomposición o propuesta concreta>
**Historia padre:** <una sola ID y versión/fuente>
**Criterios y reglas relacionados:** <IDs y referencias>

## Objetivo, alcance y propuesta técnica
- Objetivo y alcance: <resultado habilitado; incluido/excluido>
- Confirmado: <restricciones y evidencia>
- Propuesto: <solución fundamentada; detalles solo si están comprobados>

## Resultado esperado y comprobación
<Resultado observable, procedimiento para comprobarlo y qué sigue sin verificar>

## Evidencias y dependencias
- Evidencias: <fuentes/versiones/localizadores>
- Dependencias: <IDs, estado y efecto; Ninguna si procede>
- Historias relacionadas: <opcional; no son historias padre adicionales>

## Estado, bloqueos y revisión
<Estado, motivo y siguiente acción; entrega exacta e informe cuando existan>
<Encargo e historial de intentos, o No solicitada y motivo>

## Estimación
<Si es pertinente: propuesta, fundamento del equipo y supuestos; o Pendiente>
```

## Ejemplo ficticio — bloque pendiente

Todos los identificadores, referencias y acuerdos son ficticios. Este bloque ilustra precisión limitada; en la fase vigente se acompaña del encargo pendiente, no entra en «Borradores listos para copiar».

```markdown
# LOCAL-BE-1 — Habilitar consulta del saldo

**Identidad en el gestor:** Sin crear; LOCAL-BE-1 es local.
**Tipo y especialidad:** bloque / futura subtarea; Backend.
**Precisión:** bloque pendiente de descomposición.
**Historia padre:** LOCAL-H1-A v2, historias.md §Consulta.
**Criterios y reglas relacionados:** CA-1, mostrar saldo (historias.md §CA-1).

## Objetivo, alcance y propuesta técnica
- Objetivo y alcance: habilitar el dato requerido para consultar saldo; sin descarga.
- Confirmado: CA-1 requiere mostrar saldo (historias.md v2 §CA-1).
- Propuesto: evaluar reutilización de la consulta existente; sin afirmar endpoints
  ni archivos, porque falta análisis del especialista.

## Resultado esperado y comprobación
Pendiente de concretar técnicamente; contrastar la futura propuesta con CA-1.
No hay implementación ni ejecución acreditada.

## Evidencias y dependencias
- Evidencias: historias.md v2 §CA-1; sin evidencia de código Backend.
- Dependencias: ENC-BE-1 pendiente de capacidad Backend y proveedor.
- Historias relacionadas: LOCAL-H2 requiere también el saldo; no es historia padre.

## Estado, bloqueos y revisión
Pendiente; encargo ENC-BE-1 preparado. Incorporar capacidad y analizar antes de
descomponer. Revisión no solicitada; 0 de 3 intentos consumidos, sin aprobación.

## Estimación
Pendiente: el equipo necesita la descomposición y su base de comparación.
```
