# Spec Delta

## Purpose

Publicar entregas completas identificables y recuperables, reutilizando artefactos sin retranscripción y conservando la revisión independiente de cada versión.

## ADDED Requirements

### Requirement: Identificar el contenido inmutable del productor
Cada nueva entrega registrada SHALL tener identidad, productor, sesión, archivos, hashes y procedencia. La identidad del contenido SHALL excluir los documentos posteriores del Revisor. Los originales y versiones anteriores MUST permanecer intactos.

#### Scenario: Revisión añadida a una carpeta
- **WHEN** el Revisor adjunta su informe a una entrega de varios archivos
- **THEN** no cambia el hash del contenido del productor y el informe queda vinculado a esa misma versión

### Requirement: Reintentar una publicación sin duplicarla
Una operación de publicación con identidad lógica estable SHALL devolver el resultado ya confirmado al repetirse con el mismo contenido y alcance. Reutilizar esa identidad con contenido distinto SHALL rechazarse; una corrección deliberada SHALL usar otra operación y crear una versión nueva completa.

#### Scenario: Respuesta perdida y recarga
- **WHEN** la publicación termina, se pierde su respuesta, se recarga el plugin y se reintenta la misma operación
- **THEN** se obtienen las mismas rutas e identidad sin crear otra versión, conservando la verificación de autoría

#### Scenario: Reintentos concurrentes
- **WHEN** dos invocaciones válidas solicitan simultáneamente la misma operación lógica
- **THEN** solo se confirma una entrega y ambas obtienen su mismo resultado

#### Scenario: Clave reutilizada para otra corrección
- **WHEN** se repite una identidad de operación con archivos o contenido distintos
- **THEN** se rechaza el conflicto y no se modifica la publicación anterior

### Requirement: Recuperar interrupciones sin aprobación ficticia
Una interrupción entre preparación, materialización y registro SHALL permitir comprobar el estado real antes de reintentar. Archivos huérfanos o una entrega incompleta MUST NOT presentarse como publicación confirmada; la recuperación MUST NOT sobrescribir contenido existente no verificable.

#### Scenario: Proceso interrumpido durante el commit
- **WHEN** se interrumpe el proceso tras materializar archivos pero antes de devolver o registrar completamente el resultado
- **THEN** el siguiente intento reconcilia los archivos propios verificables o informa un impedimento, sin generar silenciosamente una segunda entrega

### Requirement: Conservar contratos literales y guardado configurado
Las firmas literales existentes SHALL seguir admitidas. Con guardado desactivado SHALL devolverse guardado:false sin atribuir rutas nuevas; los metadatos o modalidades nuevos MUST NOT conceder permisos adicionales ni exigir reescribir entregas históricas.

#### Scenario: Llamador anterior sin metadatos nuevos
- **WHEN** un consumidor utiliza los argumentos literales anteriores
- **THEN** puede publicar conforme a sus permisos y configuración sin tener que adoptar las modalidades de promoción o validación estructurada

### Requirement: Promover un artefacto completo registrado
Un productor autorizado SHALL poder publicar una nueva entrega completa a partir de un artefacto registrado y hash esperado sin reenviar su contenido. SHALL conservar origen y autoría, comprobar acceso al artefacto y mantener la propiedad de la publicación destino.

#### Scenario: Promoción sin cambios
- **WHEN** el productor selecciona archivos completos de artefactos accesibles del encargo con hashes coincidentes
- **THEN** se materializa la entrega nueva con contenido idéntico y procedencia preservada sin regenerarlo mediante el modelo

#### Scenario: Referencia no autorizada o hash incorrecto
- **WHEN** el origen pertenece a otro encargo no autorizado, se resuelve fuera de su ubicación segura o no coincide su hash
- **THEN** se rechaza la promoción sin leer arbitrariamente otras rutas ni publicar una entrega parcial

### Requirement: Aplicar transformaciones exactas y verificables
Las sustituciones SHALL declarar texto anterior, nuevo y cantidad esperada de coincidencias; la extracción SHALL identificar inequívocamente la sección y su versión. La operación SHALL comprobar todos sus pasos antes de materializar una nueva entrega completa.

#### Scenario: Una palabra corregida
- **WHEN** se solicita una sustitución con una coincidencia esperada y el hash coincide
- **THEN** se publica otra versión completa con ese cambio y todos los archivos restantes, conservando el origen intacto

#### Scenario: Extracción o sustitución ambigua
- **WHEN** una sección no tiene delimitación inequívoca o el número de coincidencias difiere del solicitado
- **THEN** se rechaza toda la operación sin cambios parciales ni selección heurística de texto

### Requirement: Registrar solo dictámenes del Revisor autorizado
Solo el Revisor delegado por el productor SHALL registrar un dictamen estructurado asociado a la identidad exacta de entrega y a un informe guardado. Una entrega histórica con informe narrativo sin dictamen estructurado SHALL conservarlo sin inferir aprobación automática.

#### Scenario: Registro de aprobación por el productor
- **WHEN** el productor o una sesión ajena intenta registrar un dictamen favorable
- **THEN** se rechaza la operación aunque conozca la ruta o el hash de la entrega

#### Scenario: Revisión sin guardado confirmado
- **WHEN** falla el guardado del informe o está desactivado
- **THEN** se devuelve el dictamen conversacional y su limitación sin registrar una aprobación persistida

### Requirement: Separar publicación, revisión y aprobación
El estado SHALL distinguir última versión publicada, última revisada y última aprobada completamente, conservando resultados parciales por elemento. Una versión nueva MUST NOT heredar revisión ni aprobación; una revisión tardía SHALL modificar solo la versión que identifica.

#### Scenario: Revisión tardía y aprobación parcial
- **WHEN** se publica v2 y después se revisa v1 con algunos elementos aprobados
- **THEN** v2 sigue sin revisión propia y el dictamen parcial de v1 no convierte ninguna versión en aprobada globalmente

### Requirement: Generar un índice verificable desde registros
El índice SHALL enlazar entregas e informes existentes mediante rutas relativas completas y mostrar sus estados por versión. Un estado agregado MUST NOT sustituir el dictamen exacto ni ocultar entregas sin revisión.

#### Scenario: Entrega nueva sin revisión
- **WHEN** existe una versión anterior revisada y otra más reciente publicada
- **THEN** el índice muestra ambas y señala la nueva como pendiente de revisión sin transferir el estado anterior
