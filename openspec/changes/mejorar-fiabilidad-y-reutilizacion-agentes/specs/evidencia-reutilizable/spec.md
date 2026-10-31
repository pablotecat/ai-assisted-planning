# Spec Delta

## Purpose

Compartir fuentes originales completas y vigentes entre agentes autorizados, evitando recuperaciones repetidas sin confundir almacenamiento, acceso o descarga con lectura.

## ADDED Requirements

### Requirement: Conservar instantáneas originales y su cobertura
Cada instantánea SHALL identificar fuente, corpus, fecha de recuperación, versión o hash, campos y páginas recuperadas, y componentes pendientes. El original SHALL preservarse sin transformación; un resumen o una página parcial MUST NOT acreditar una fuente completa.

#### Scenario: Comentarios paginados y campos personalizados
- **WHEN** una historia contiene criterios en campos personalizados y varias páginas de comentarios
- **THEN** la instantánea distingue cada componente recuperado y pendiente y solo declara completitud cuando se ha obtenido todo el original exigido

### Requirement: Reutilizar solo evidencia pertinente y vigente
Antes de recuperar o delegar de nuevo, el flujo SHALL contrastar pregunta, criterios, corpus, referencia, versión y cobertura con fuentes accesibles existentes. SHALL investigar la diferencia pendiente y registrar el motivo cuando deba recuperar otra vez una fuente.

#### Scenario: Nueva pregunta sobre una fuente ya recuperada
- **WHEN** otra pregunta material puede responderse con una instantánea íntegra vigente y autorizada
- **THEN** se utiliza esa instantánea sin repetir su recuperación y se conserva el resultado propio de cada pregunta

#### Scenario: Cambio de versión o alcance
- **WHEN** cambia la fuente o el encargo exige componentes que la instantánea no contiene
- **THEN** se valida vigencia y se recupera la diferencia necesaria; la nueva instantánea no sobrescribe el original anterior

### Requirement: Dar acceso acotado a artefactos registrados
Un destinatario SHALL poder recibir contenido completo de artefactos registrados autorizados para su rol y encargo, sin obtener lectura general del filesystem. El acceso SHALL verificar identidad, ámbito y visibilidad; conocer una ruta o un hash MUST NOT conceder autorización.

#### Scenario: Investigador con lectura local restringida
- **WHEN** el Investigador necesita un original compartido válido del encargo
- **THEN** obtiene su contenido por el acceso acotado al registro sin habilitar lectura general de documentos locales ni cambiar el enrutado de sus especialistas

#### Scenario: Artefacto ajeno o sesión no autorizada
- **WHEN** una sesión intenta abrir una fuente de otro corpus o sin autorización de destinatario
- **THEN** el acceso se rechaza aunque el artefacto exista y su identificador sea conocido

### Requirement: Permitir lectura completa sin sustituir el original
La presentación de una fuente SHALL permitir recorrer su contenido completo con localizadores estables. Las vistas derivadas SHALL ser deterministas, conservar estructura y procedencia y permanecer separadas del original. Formatos o envoltorios desconocidos SHALL producir un diagnóstico explícito.

#### Scenario: HTML largo en una línea
- **WHEN** el original contiene una línea HTML de más de 2000 caracteres
- **THEN** el destinatario puede recorrerlo íntegramente mediante presentación paginada o vista derivada con correspondencia al original, sin perder tablas, numeración, menciones ni localizadores

#### Scenario: Envoltorio de respuesta desconocido
- **WHEN** una herramienta devuelve un formato no cubierto por su contrato conocido
- **THEN** se conserva la respuesta y se señala el formato inesperado, sin interpretar undefined como ausencia de contenido

### Requirement: Conservar independencia de revisión al compartir fuentes
El Revisor SHALL realizar su cotejo propio y podrá utilizar una instantánea íntegra accesible. La reutilización SHALL acreditar acceso a la fuente, no validar conclusiones ajenas ni transferir aprobación entre versiones.

#### Scenario: Misma fuente y entrega corregida
- **WHEN** una entrega nueva usa originales sin cambios ya cotejados por el Revisor
- **THEN** este conserva el cotejo verificable anterior y revisa la nueva entrega completa y sus diferencias, sin heredar su aprobación

### Requirement: Validar un adjunto antes del lote
Antes de procesar un lote, el flujo SHALL comprobar con un adjunto representativo las etapas localizar, obtener, descargar, presentar al modelo y leer. Un fallo de método SHALL corregirse y probarse una vez antes de extender esa estrategia a otros archivos.

#### Scenario: Descarga válida sin presentación
- **WHEN** se obtiene HTTP 200, firma PNG y dimensiones, pero el contenido no llega al lector visual
- **THEN** la fuente sigue pendiente de lectura y el diagnóstico identifica la etapa faltante sin afirmar indisponibilidad global de visor u OCR

#### Scenario: Método binario incompatible
- **WHEN** el método usado no existe en el runtime
- **THEN** se detiene esa estrategia antes del resto del lote y cualquier alternativa se valida de extremo a extremo antes de continuar

### Requirement: Reutilizar adjuntos sin ampliar permisos
El flujo SHALL reutilizar binarios y localizadores válidos, registrar causas de nueva descarga y mantener originales en ubicaciones autorizadas. Cuando falte una capacidad indispensable SHALL informar etapa, efecto y siguiente acción sin instalar servicios ni ampliar permisos silenciosamente.

#### Scenario: Binario accesible y URL caducada
- **WHEN** existe una copia íntegra accesible del adjunto pero caduca su URL remota
- **THEN** se reutiliza la copia; si no existe una copia válida, se justifica y realiza la recuperación autorizada del localizador

#### Scenario: Guardado desactivado
- **WHEN** el guardado está desactivado y no hay una ubicación persistente autorizada para el adjunto
- **THEN** se usa una presentación nativa sin persistencia adicional cuando sea posible o se informa el bloqueo de esa etapa sin crear archivos ocultos
