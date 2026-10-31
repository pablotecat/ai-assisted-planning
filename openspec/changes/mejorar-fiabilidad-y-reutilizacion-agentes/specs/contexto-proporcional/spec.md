# Spec Delta

## Purpose

Reducir contexto y generación repetidos sin perder reglas efectivas, acceso a entregables completos ni información necesaria para continuar el trabajo.

## ADDED Requirements

### Requirement: Cargar instrucciones solo para ramas activas
El agente SHALL cargar las referencias normativas necesarias para la rama activa y reutilizar lo leído íntegramente mientras siga vigente en esa sesión. Una referencia o hash compartidos con otra sesión MUST NOT acreditar que esa sesión ha recibido y leído sus instrucciones.

#### Scenario: Consulta puntual y reglas de publicación
- **WHEN** el encargo solicita un único campo Jira
- **THEN** no se cargan plantillas de refinamiento, revisión o publicación que esa rama no requiere

#### Scenario: Delegación a una sesión nueva
- **WHEN** un coordinador comparte identificadores de reglas con una nueva sesión
- **THEN** también se hace accesible su contenido efectivo por las vías permitidas; los hashes por sí solos no se tratan como instrucciones recibidas

### Requirement: Resumir solo una entrega guardada y accesible
Con guardado confirmado y contenido completo accesible al destinatario, la respuesta SHALL devolver resultado, rutas verificadas, versión, revisión, límites y pendientes sin repetir íntegramente los documentos. Una solicitud explícita de contenido completo SHALL respetarse.

#### Scenario: Entrega guardada correctamente
- **WHEN** el publicador confirma guardado:true y el destinatario puede abrir el contenido íntegro
- **THEN** la respuesta identifica la versión y sus resultados, límites y siguientes acciones sin reemitir el documento completo

### Requirement: Mantener contenido completo como alternativa verificable
Con guardado desactivado, fallido o inaccesible al destinatario, el agente SHALL entregar el contenido completo disponible y su estado real. MUST NOT omitirlo por disponer únicamente de una ruta declarada o de un resumen.

#### Scenario: Guardado correcto pero inaccesible al siguiente agente
- **WHEN** el productor ha guardado el informe pero el receptor no tiene acceso autorizado a él
- **THEN** el productor facilita su contenido completo por una vía permitida o conserva explícito el impedimento, sin dar por entregado el informe mediante su ruta

### Requirement: Mantener cierre y trazabilidad al reducir texto
Una respuesta concisa SHALL conservar para cada hallazgo material evidencia accesible, impacto y siguiente acción, y para el encargo versión, pendientes y estado real de investigaciones. Acortar la respuesta MUST NOT convertir una preentrega en candidata completa ni suprimir decisiones humanas.

#### Scenario: Investigación todavía activa
- **WHEN** el coordinador emite una preentrega breve con un hijo activo
- **THEN** señala su propósito parcial, el resultado pendiente y el efecto sobre la entrega sin atribuir integración o aprobación inexistentes

### Requirement: Afinar contexto sin alterar políticas de modelos
El afinado SHALL conservar una fuente normativa por regla y priorizar referencias condicionales sobre inyección runtime. Cambios de esfuerzo, modelos o inyección SHALL requerir evidencia de coste restante y autorización específica; no se incorporan automáticamente como optimización documental.

#### Scenario: Coste residual no acreditado
- **WHEN** no hay medición que justifique inyección normativa o menor esfuerzo de modelo
- **THEN** se mantienen las capacidades y políticas actuales y no se añade una skill genérica que duplique las reglas existentes
