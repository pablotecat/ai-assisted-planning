# Encargo de especialista

## Aplicación y suficiencia

Arquitecto prepara un paquete por historia y especialidad, ejecutable o pendiente de capacidad. Todos los apartados de la plantilla son obligatorios. La rama «Contexto Test» se incluye solo para Test; referencia solicitada y conocimiento pueden estar pendientes o no aplicar con motivo. Relaciones entre áreas solo transmiten el contrato o dato pertinente, no código ajeno. El resultado requerido distingue bloques a descomponer Backend/Frontend de casos UI concretos Test.

Conserva ID y `sessionID` disponibles en continuaciones. Antes de delegar, publicar, revisar o continuar aplica [publicación y revisión](../../operativa-comun/references/publicacion-revision.md#intentos--solo-flujo-de-arquitectura), fuente normativa de límite, cómputo, historial y fallos. Representa sus datos con [Revisión](revision.md#historial-compartido); el contrato mantiene alcance y estados.

**Cierre:** el receptor puede identificar qué analizar, qué fuentes y criterios usar, qué devolver y si tiene margen de revisión. Cada dato indispensable ausente tiene efecto y pregunta; la falta de especialista mantiene el paquete pendiente, sin fingir análisis realizado.

## Plantilla copiable

```markdown
# <ENC-ID> — <Objetivo breve>

**Especialidad y productor esperado:** <especialidad; agente disponible o capacidad pendiente>
**Historia padre:** <una sola ID>
**Estado y continuidad:** <estado; sessionID si disponible o No disponible>

## Fuentes, versiones y fragmentos pertinentes
- <Ruta/fuente oficial y versión identificada; revisión previa si existe>
- Objetivo: <objetivo de la historia>
- Fragmentos literales: <texto pertinente con localizador>

## Criterios asignados y reglas transversales
- <ID; texto o referencia accesible; regla y fuente>

## Alcance, decisiones y dependencias
- Incluido / excluido: <alcance de esta especialidad>
- Confirmado: <decisiones y fuente>
- Propuesto: <decisiones a evaluar y quién decide>
- Dependencias y relaciones: <IDs, datos concretos de otras áreas, estado>

## Dudas y bloqueos conocidos
- <Dato pendiente, efecto, pregunta, responsable y siguiente acción; o Ninguno>

## Revisión e historial
**MAX_INTENTOS_REVISION:** <entero positivo del contrato/configuración>
**Intentos consumidos:** <entero respaldado o Desconocido: bloqueo>
**Historial:** <registro de Revisión; Ninguno, encargo nuevo si se verificó>
**Siguiente intento:** <número y pendiente de solicitud, o bloqueo/límite agotado>

## Resultado requerido
<Formato Tarea o Caso de Test; evidencia, cobertura de todos los criterios,
versión publicada completa, revisión exacta, aprobados independientes y bloqueos>

## Contexto Test
<Solo Test: ruta y alcance del proyecto; referencia solicitada;
referencia comprobada y cambios conocidos, o Pendiente de comprobar;
carpeta de conocimiento o No aportada; borradores/informes previos o Encargo nuevo>
```

## Ejemplo ficticio — Test nuevo

Rutas, citas y acuerdos inventados; no acreditan un proyecto real.

```markdown
# ENC-UI-1 — Consulta de saldo

**Especialidad y productor esperado:** Test; arquitecto-test.
**Historia padre:** LOCAL-H1-A.
**Estado y continuidad:** pendiente; sessionID aún no disponible.

## Fuentes, versiones y fragmentos pertinentes
- historias.md v2 §LOCAL-H1-A; revisión declarada por usuario, sin informe aportado.
- Objetivo: conocer la disponibilidad de bonos.
- Fragmento literal CA-1: «Al abrir Bonos con saldo 5, se muestra 5».

## Criterios asignados y reglas transversales
- CA-1, historias.md v2 §CA-1; no se asigna PC-1 porque sigue propuesto.

## Alcance, decisiones y dependencias
- Incluido / excluido: diseño de aceptación UI; implementación y ejecución fuera.
- Confirmado: acceso mediante UI (contrato de arquitectura, alcance Test).
- Propuesto: evaluar parametrización con otros saldos si hay fundamento.
- Dependencias y relaciones: ninguna conocida para CA-1.

## Dudas y bloqueos conocidos
- Carpeta de conocimiento no aportada: consultar convenciones de la suite;
  devolver al arquitecto cualquier carencia indispensable. No bloquea por sí sola.

## Revisión e historial
**MAX_INTENTOS_REVISION:** 3, valor confirmado del encargo ficticio.
**Intentos consumidos:** 0.
**Historial:** ninguno, encargo nuevo verificado.
**Siguiente intento:** 1, pendiente de solicitud tras publicación confirmada.

## Resultado requerido
borrador-tests.md completo según Caso de Test: evidencia, cobertura de CA-1,
versión publicada y revisión exacta, casos independientes y bloqueos.

## Contexto Test
Proyecto: proyecto-demo/tests, solo lectura. Referencia solicitada: demo-v1;
comprobada: pendiente de comprobar por el especialista; cambios locales desconocidos.
Conocimiento: no aportado. Borradores e informes previos: encargo nuevo.
```
