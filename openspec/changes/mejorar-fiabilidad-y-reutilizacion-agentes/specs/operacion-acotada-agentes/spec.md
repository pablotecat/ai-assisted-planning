# Spec Delta

## Purpose

Delimitar las consultas de los agentes por pregunta, corpus autorizado y evidencia realmente obtenida, evitando bloqueos inventados e investigaciones innecesarias.

## ADDED Requirements

### Requirement: Resolver herramientas por su interfaz efectiva
El agente SHALL utilizar la interfaz y firma expuestas en su sesión y rol. Una búsqueda vacía en un catálogo parcial MUST NOT acreditar indisponibilidad global ni fallo de una operación no invocada.

#### Scenario: Publicador directo fuera de Code Mode
- **WHEN** el publicador está expuesto directamente y no aparece en el catálogo de Code Mode
- **THEN** el agente utiliza su interfaz directa cuando corresponde publicar una entrega válida, sin realizar escrituras de prueba

#### Scenario: Diagnóstico limitado por la evidencia
- **WHEN** una herramienta no se ha invocado o devuelve denegación, error o guardado desactivado
- **THEN** el agente distingue esos estados y comunica operación, alcance afectado y siguiente acción, sin inventar rutas ni confundirlos con publicación confirmada

### Requirement: Resolver solo la configuración de la rama activa
El agente SHALL resolver los valores indispensables de la rama antes de delegar, respetando confirmación y precedencia. Una consulta puntual de un campo de una historia conocida MUST NOT activar configuración, originales, delegación, publicación ni revisión.

#### Scenario: Solo el título
- **WHEN** el usuario solicita únicamente el título de una historia identificada
- **THEN** el agente recupera el campo necesario y devuelve solo su valor literal sin iniciar un flujo completo

#### Scenario: Configuración indispensable sin acceso
- **WHEN** falla realmente la lectura de un valor indispensable para una delegación
- **THEN** permanece pendiente solo el trabajo dependiente de ese valor y el agente informa el impedimento concreto

### Requirement: Mantener consultas de shell admitidas
El Lector Código SHALL usar consultas independientes de Git y Codegraph admitidas por su rol. Una denegación SHALL ofrecer una forma permitida cuando exista; repetir la misma forma cambiando solo el timeout MUST NOT considerarse una corrección.

#### Scenario: Metadatos Git en workspace con espacios
- **WHEN** el lector necesita rama, commit y estado de un workspace cuya ruta contiene espacios
- **THEN** obtiene los datos mediante comandos separados con directorio de trabajo explícito, sin cadenas con separadores, redirecciones ni rutas abreviadas

#### Scenario: Consulta con escritura o efecto destructivo
- **WHEN** un comando solicita escritura, salida a archivo, actualización de ramas o reindexado
- **THEN** se rechaza sin ampliar los permisos del lector

### Requirement: Comprobar corpus e índice antes de concluir
El Lector Código SHALL identificar workspace, referencia efectiva, commit, cambios locales y correspondencia del índice. Una búsqueda negativa en un corpus anterior al cambio MUST NOT demostrar ausencia funcional. La comprobación reutilizada SHALL invalidarse ante cambios relevantes del árbol, commit o índice.

#### Scenario: Funcionalidad en otra referencia
- **WHEN** la pregunta se refiere a un cambio que no está acreditado en el corpus preparado
- **THEN** el lector entrega un resultado acotado con la referencia comprobada y la fuente necesaria, sin cambiar ramas ni recuperar otro corpus por iniciativa propia

#### Scenario: Índice con avisos de archivos cambiados
- **WHEN** el índice declara cero pendientes pero informa cambios relevantes en archivos
- **THEN** el lector mantiene una reserva de coherencia y no trata el índice como prueba suficiente; su antigüedad por sí sola tampoco demuestra invalidez

### Requirement: Investigar y parar por pregunta material
Cada pregunta SHALL conservar evidencia necesaria, fuentes iniciales, motivo de expansión, resultado, condición de parada y pendiente. La expansión SHALL permanecer en el alcance autorizado; los límites numéricos MUST proceder de configuración o acuerdo, no de cifras inventadas.

#### Scenario: Dos preguntas con fuentes comunes
- **WHEN** dos preguntas materiales requieren el mismo recorrido documental
- **THEN** se agrupan o reutilizan las fuentes disponibles, conservando resultado y pendientes separados por pregunta

#### Scenario: Relaciones no pertinentes
- **WHEN** no existe una pregunta material que justifique ampliar a historias o enlaces remotos adicionales
- **THEN** el agente no abre esa exploración por defecto y cierra con la evidencia suficiente o el pendiente identificado

#### Scenario: Fuente decisiva pendiente o presupuesto agotado
- **WHEN** una fuente decisiva sigue sin leerse o se agota un presupuesto acordado
- **THEN** el resultado permanece parcial con efecto y siguiente acción; asignar un responsable humano no convierte la investigación en completada

### Requirement: Separar clases de evidencia
Cada afirmación material SHALL distinguir requisito documental, inferencia de código, comprobación escrita en un test, resultado de ejecución y comportamiento observado. La clasificación MUST NOT legitimar conclusiones más fuertes que su evidencia.

#### Scenario: Test leído sin ejecución
- **WHEN** el agente lee un test de concurrencia pero no dispone de una ejecución observada
- **THEN** afirma qué comprueba el test, sin declarar funcionamiento comprobado ni deducir un error HTTP concreto de un mecanismo de versionado

### Requirement: Conservar requisitos y conflictos sin arbitraje implícito
El agente SHALL conservar requisitos explícitos y excepciones específicas, señalando conflictos y decisiones pendientes. Un comentario general o una ausencia de implementación MUST NOT retirar una excepción ni transformar por sí solos un requisito confirmado en propuesta.

#### Scenario: Excepción específica y acuerdo general
- **WHEN** una fuente exige conservar una fecha al borrar el último mensaje de un elemento cerrado y otro comentario trata el retroceso de estado en general
- **THEN** se conserva la excepción y se plantea la duda de alcance, sin eliminarla mediante inferencia

#### Scenario: Límites de retención contradictorios
- **WHEN** fuentes sin precedencia acordada describen un mínimo y un máximo incompatibles
- **THEN** se conservan ambos textos y su conflicto sin decidir qué política debe prevalecer
