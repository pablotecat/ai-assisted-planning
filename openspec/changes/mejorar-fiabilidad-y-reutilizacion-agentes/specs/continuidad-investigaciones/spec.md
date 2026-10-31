# Spec Delta

## Purpose

Conservar el trabajo verificado y coordinar investigaciones hasta su integración, sin duplicar encargos ni confundir sesiones persistentes con ejecuciones terminadas.

## ADDED Requirements

### Requirement: Identificar encargo y ejecución de forma independiente
El seguimiento SHALL asociar pregunta, criterios, responsable, corpus y referencia con sesión y ejecución usando los identificadores disponibles del runtime. Distintos turnos de una sesión MUST NOT compartir automáticamente resultados o confirmaciones de otra ejecución.

#### Scenario: Notificación tardía de un turno anterior
- **WHEN** una investigación se reanuda y llega una notificación duplicada o tardía de un turno previo
- **THEN** se conserva vinculada a su ejecución y no completa ni cierra el trabajo nuevo

### Requirement: Recuperar antes de sustituir
Antes de crear una delegación sustituta, el coordinador SHALL comprobar continuación de la sesión anterior, recuperar artefactos accesibles y entregar un inventario de trabajo completo y pendiente. SHALL conservar fuentes, decisiones, IDs e intentos de revisión aplicables.

#### Scenario: Fallo posterior a publicación
- **WHEN** una investigación publica su resultado y después falla la sesión
- **THEN** el coordinador recupera ese resultado y evita repetir la investigación ya completada; el sustituto recibe solo el trabajo restante

#### Scenario: Registro de otro corpus
- **WHEN** un artefacto pertenece a otro proyecto, raíz de encargo o corpus no autorizado
- **THEN** se rechaza su reutilización y no se presenta como evidencia recuperada del encargo actual

### Requirement: Mantener pendiente el trabajo incompleto
La recuperación SHALL conservar alcance, suficiencia, pendientes y siguiente acción; recuperar un archivo MUST NOT convertir un resultado parcial en completo. Con guardado desactivado SHALL utilizar el contexto disponible e informar la limitación sin crear rutas o registros persistentes ficticios.

#### Scenario: Contexto sin artefactos guardados
- **WHEN** el guardado está desactivado y la continuación solo dispone de una conclusión parcial en conversación
- **THEN** reutiliza ese contenido con su alcance y pendientes y declara que no existe un artefacto persistido verificable

### Requirement: Confirmar investigaciones independientes concurrentemente
El Refinador SHALL validar cada PENDIENTE_CONFIRMACION y enviar CONFIRMAR a la misma sesión cuando pregunta, corpus y referencia sean correctos. SHALL mantener las consultas independientes hasta el límite configurado sin esperar innecesariamente la finalización de otra investigación.

#### Scenario: Límite dos frente a límite uno
- **WHEN** existen dos consultas independientes confirmables y el límite vale dos
- **THEN** ambas investigaciones comienzan antes de terminar cualquiera; con límite uno se ejecutan secuencialmente

#### Scenario: Una confirmación incorrecta
- **WHEN** el resumen de una consulta identifica un corpus incorrecto y el de otra es correcto
- **THEN** solo la primera queda pendiente de corrección y la segunda puede continuar dentro del límite

### Requirement: Integrar resultados antes de cerrar la candidata
Cada investigación requerida SHALL distinguir sin confirmar, en curso o en cola, resultado disponible, integrado e impedimento concreto. La candidata SHALL cerrar solo con cada resultado integrado o impedimento con efecto y siguiente acción; una confirmación MUST NOT acreditar investigación realizada.

#### Scenario: Una llamada retorna mientras el hijo sigue activo
- **WHEN** la delegación o continuación devuelve control pero la investigación sigue en segundo plano
- **THEN** su dependencia permanece abierta y el coordinador utiliza espera o notificación nativa, sin polling, reanudación redundante ni publicación final prematura

#### Scenario: Entrega parcial justificada
- **WHEN** se solicita o se motiva una entrega parcial mientras queda un hijo activo
- **THEN** la entrega identifica su propósito, el hijo activo, el alcance no integrado y la siguiente acción sin atribuir cierre completo

#### Scenario: Dos resultados de duración distinta
- **WHEN** dos investigaciones requeridas finalizan en momentos distintos y se repiten notificaciones
- **THEN** cada resultado se integra una sola vez en su ejecución antes de publicar la candidata completa

### Requirement: Recuperar cuota y transporte en la sesión afectada
Al reanudar, el flujo SHALL comprobar el modelo efectivo de la sesión afectada. Un cambio SHALL requerir autorización y verificación posterior. Cuota agotada con restablecimiento conocido SHALL producir espera informada o alternativa autorizada, sin cambiar la política global de reintentos.

#### Scenario: Cambio del padre sin cambio del hijo
- **WHEN** cambia el modelo principal pero un hijo conserva el proveedor agotado
- **THEN** se identifica el modelo real del hijo y se informa el bloqueo o se aplica y verifica el cambio autorizado específicamente para esa sesión

#### Scenario: Sin autorización de cambio
- **WHEN** una cuota impide continuar y no existe autorización para usar otra selección
- **THEN** se comunica la espera o decisión necesaria sin crear otro hijo para eludir la restricción

### Requirement: Comprobar efectos antes de repetir una operación
La recuperación SHALL distinguir generación interrumpida antes de ejecutar, ejecución iniciada y operación completada con respuesta perdida. SHALL consultar efectos y resultado registrado antes de repetir o sustituir; con evidencia insuficiente la causa SHALL permanecer indeterminada.

#### Scenario: Respuesta perdida de un publicador
- **WHEN** el guardado completó pero su respuesta no llegó al coordinador
- **THEN** la recuperación obtiene la misma publicación, sin crear otra versión por el reintento

### Requirement: Emitir alertas informativas basadas en actividad
Las alertas SHALL distinguir ausencia de primer evento, herramienta larga con progreso e hijos activos usando marcas suficientes y umbrales medidos o acordados. MUST NOT cancelar sesiones ni cambiar modelos automáticamente.

#### Scenario: Herramienta lenta con progreso
- **WHEN** transcurre un intervalo largo pero hay progreso de herramienta o actividad de un hijo
- **THEN** el diagnóstico no lo clasifica como silencio del proveedor y la alerta, si corresponde, conserva esa distinción
