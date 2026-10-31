# Spec Delta

## Purpose

Permitir comparaciones reproducibles del trabajo de los agentes, separando actividad observada, reconstrucciones y datos ausentes sin exponer contenido sensible.

## ADDED Requirements

### Requirement: Delimitar y recuperar el encargo diagnosticado
El diagnóstico SHALL aceptar sesión raíz, selección de descendientes e intervalo del encargo, recuperar todas las páginas aplicables y deduplicar por identificadores reales. SHALL emitir JSON y resumen Markdown y excluir la propia auditoría del trabajo original.

#### Scenario: Historial paginado con descendientes
- **WHEN** un encargo contiene varias páginas, sesiones hijas y eventos repetidos
- **THEN** el diagnóstico representa su árbol y turnos sin omitir páginas ni duplicar eventos, manteniendo aparte relaciones de delegación y contención

### Requirement: Contar capas sin duplicar operaciones
El diagnóstico SHALL separar herramientas registradas, operaciones internas, búsquedas locales de catálogo, solicitudes de recuperación y orquestación. Al expandir contenedores SHALL sustituirlos recursivamente por hijas conocidas una sola vez y señalar expansiones desconocidas.

#### Scenario: Contenedor con tres operaciones
- **WHEN** una llamada a execute contiene tres operaciones identificadas
- **THEN** se informa una llamada exterior y tres internas, o tres operaciones finales, nunca cuatro operaciones finales

#### Scenario: Anidamiento y ejecución puramente local
- **WHEN** parallel contiene execute y existe otro execute con cálculo local sin llamadas hijas
- **THEN** la expansión deduplica las hijas conocidas, conserva la ejecución local como operación y no deduce peticiones HTTP de ninguno de esos totales

#### Scenario: Hijas no observables
- **WHEN** el historial no identifica las operaciones internas de un contenedor
- **THEN** el diagnóstico declara la expansión parcial o desconocida sin reconstruirla como un conteo exacto a partir del código del prompt

### Requirement: Medir tiempos con fronteras observables
El diagnóstico SHALL distinguir primer evento, ejecución de herramienta, espera delegada y resultado a notificación e integración solo cuando existan marcas suficientes. Las esperas solapadas MUST NOT sumarse como duración de reloj ni atribuirse a una causa no observada.

#### Scenario: Padre esperando al hijo
- **WHEN** el padre espera mientras una sesión hija trabaja y hay eventos después del cierre del encargo
- **THEN** no se suma espera y trabajo como duración total ni se prolonga el intervalo por eventos posteriores

#### Scenario: Demora anterior a ejecutar
- **WHEN** se observa demora antes de iniciar una herramienta sin evidencia de su causa
- **THEN** se informa el intervalo observado sin atribuirlo al disco, a Jira o a generación del proveedor como hecho probado

### Requirement: Clasificar errores y reintentos por incidente
El diagnóstico SHALL distinguir errores de proveedor, permisos, invocación y dominio, correlacionando reintentos y propagaciones. Una herramienta completada que contiene un error de dominio SHALL conservar esa clasificación sin multiplicar el incidente por sus informes posteriores.

#### Scenario: Error 404 propagado
- **WHEN** una lectura devuelve un 404 dentro de una herramienta completada y varios agentes lo mencionan
- **THEN** se registra un incidente de dominio y sus referencias, no un incidente nuevo por cada mención

### Requirement: Conservar procedencia y unidades de las métricas
Cada métrica SHALL identificar unidad, cobertura y procedencia: evento original, reconstrucción de historial o declaración de agente. Tokens del proveedor, caracteres enviados a publicadores, lecturas, descargas y fuentes realmente leídas SHALL mantenerse diferenciados.

#### Scenario: Datos autodeclarados incompletos
- **WHEN** solo un subagente declara sus conteos y no hay recibos verificables o tokens disponibles
- **THEN** el informe los etiqueta como autodeclarados y parciales, sin inferir tokens, facturación o duración del volumen de llamadas

### Requirement: Exportar solo diagnóstico permitido
El diagnóstico SHALL usar descubrimiento y autenticación soportados del servicio y exportar únicamente campos diagnósticos permitidos. MUST NOT leer directamente la base de datos, fijar un puerto compartido, exportar credenciales, prompts, argumentos con contenido documental ni cargas nativas o razonamiento cifrado.

#### Scenario: Historial con cargas sensibles
- **WHEN** los mensajes incluyen archivos, URLs firmadas, cabeceras de autenticación o cargas nativas del proveedor
- **THEN** el export contiene identificadores y métricas permitidos, sin esos valores ni fragmentos del contenido

### Requirement: Comparar resultados con reservas explícitas
La comparación SHALL usar casos y límites equivalentes, informar dispersión y datos ausentes y separar demoras externas del trabajo del paquete. Menos llamadas MUST NOT presentarse por sí solas como ahorro temporal o mejora de calidad.

#### Scenario: Muestra reducida y tiempos variables del proveedor
- **WHEN** se comparan pocas ejecuciones con distintas esperas del proveedor
- **THEN** se publican resultados observados, procedencia y limitaciones sin prometer un porcentaje general de mejora
