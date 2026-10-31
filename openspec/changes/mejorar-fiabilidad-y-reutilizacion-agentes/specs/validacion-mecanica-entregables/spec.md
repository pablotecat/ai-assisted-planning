# Spec Delta

## Purpose

Detectar errores mecánicos antes de la revisión humana o semántica, con comprobaciones reproducibles ligadas a formatos y fuentes identificados.

## ADDED Requirements

### Requirement: Validar perfiles explícitos de entregable
La validación SHALL aplicar reglas de estructura según el tipo y versión de formato declarados y separar errores bloqueantes de alertas y comprobaciones no realizadas. Documentos históricos o genéricos sin perfil MUST NOT reinterpretarse con una gramática nueva ni recibir aprobación implícita.

#### Scenario: Historia con perfil conocido
- **WHEN** una historia declara el formato vigente y omite un apartado obligatorio o mezcla espacios de IDs confirmados y propuestos
- **THEN** la validación señala el error mecánico concreto antes de su publicación como candidata válida

#### Scenario: Publicador literal anterior
- **WHEN** un consumidor anterior publica un documento genérico sin perfil ni vínculos estructurados
- **THEN** se mantienen sus comprobaciones previas y se informa la cobertura de validación disponible sin bloquearlo por reglas no declaradas

### Requirement: Comprobar cobertura e identidad de referencias
Con originales identificados, la validación SHALL verificar IDs únicos, destinos de todos los criterios originales, archivos y versión referenciados. SHALL generar recuentos desde los IDs y señalar las comprobaciones imposibles por falta de fuente vinculada.

#### Scenario: Nueve incidencias identificadas
- **WHEN** el entregable contiene nueve IDs únicos de incidencia
- **THEN** el recuento generado es nueve y no depende de una cantidad escrita manualmente en la narrativa

#### Scenario: Criterio pendiente o repartido
- **WHEN** un criterio original queda pendiente o se reparte entre historias
- **THEN** mantiene su ID y destinos o estado explícito en trazabilidad; no desaparece para superar el validador

### Requirement: Cotejar citas literales contra fuentes vinculadas
Una cita declarada literal SHALL compararse con su fragmento fuente identificado y hash esperado, aplicando solo normalización de formato documentada. Errores originales SHALL preservarse y las paráfrasis MUST NOT aceptarse como literales.

#### Scenario: Cambio de palabras o errata de transcripción
- **WHEN** una cita cambia eliminaran por eliminararan o diferentes de por distintos de
- **THEN** la validación rechaza su igualdad literal aunque el texto parezca cercano semánticamente

#### Scenario: Errata que sí pertenece al original
- **WHEN** el fragmento original contiene presevar
- **THEN** conservar presevar supera el cotejo literal y corregirlo dentro de una cita no se oculta mediante normalización

### Requirement: Mantener las decisiones semánticas fuera del validador
La validación SHALL señalar inconsistencias verificables sin decidir autoridad de fuentes, suficiencia funcional, equivalencia semántica ni aprobación de requisitos. Sus alertas SHALL conservar evidencia y efecto para el Revisor.

#### Scenario: Referencia inconsistente a OR-13
- **WHEN** una referencia textual a OR-13 no coincide con el contexto o el catálogo disponible
- **THEN** se informa la inconsistencia y resolver qué requisito significa sigue pendiente de cotejo semántico

### Requirement: Aplicar las mismas comprobaciones al contenido materializado
La validación SHALL comprobar el resultado completo de una publicación con perfil, tanto si procede de argumentos literales como de promoción, sustituciones o extracción. Un error bloqueante SHALL impedir la entrega completa sin producir versiones parciales.

#### Scenario: Transformación que rompe una referencia
- **WHEN** una sustitución exacta es válida como operación textual pero deja un destino de criterio inexistente
- **THEN** la validación del resultado detecta el error y no publica una entrega parcialmente válida
