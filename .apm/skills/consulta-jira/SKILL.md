---
name: consulta-jira
description: Consulta Jira en solo lectura cuando se pide un dato puntual, seleccionar historias, recuperar originales o investigar y cotejar requisitos.
---

# Consulta Jira

Elige la rama del encargo antes de leer configuración o activar un flujo completo. Esta skill conserva los permisos del consumidor: Investigador, Lector Documentación, Planificador, Refinador y Arquitecto admiten `atlassianUserInfo`; Revisor conserva su perfil sin esa operación. Lector Código y Arquitecto Test no consultan Jira.

## Acceso y catálogo

Usa el alias conectado, `jira` o `atlassian`, y las operaciones realmente publicadas. En OpenCode V2 esas operaciones viven en el catálogo de Code Mode bajo el namespace del alias (`tools.jira.*` o `tools.atlassian.*`): se llaman desde `execute` con las firmas descubiertas. Si el catálogo llega vacío al inicio, comprueba el estado de conexión y vuelve a consultar tras conectarse; mientras tanto, la disponibilidad permanece no determinada. Ese catálogo no incluye las herramientas directas de configuración y publicación: para esas ramas aplica [herramientas y autorizaciones](../operativa-comun/references/configuracion.md#herramientas-y-autorizaciones). Reutiliza el sitio y `cloudId` verificados; si el usuario aporta una URL Jira/Confluence, úsala como `cloudId` cuando el contrato de la herramienta lo admita. Sin contexto de sitio, llama una vez a `getAccessibleAtlassianResources`, confirma el sitio pertinente y reutiliza su `cloudId` explícito en las llamadas siguientes. Solicita solo el dato de acceso indispensable que falte.

Para una historia conocida usa `getJiraIssue` con su clave o ID. `fetch` necesita un ARI obtenido de una fuente verificada; una clave como `ES-1228` no es un ARI. Busca con `search`, salvo JQL indicado, que usa `searchJiraIssuesUsingJql`. `discover` y `executeRead` son opcionales: úsalos solo si el catálogo los publica, con nombres e inputs comprobados. Las creaciones, ediciones, comentarios, transiciones, trabajo registrado, `executeWrite` y `executeDestructive` quedan fuera de esta consulta de solo lectura.

## Dato puntual de una historia conocida

1. Lee únicamente los campos necesarios y respeta el formato pedido. Para «solo el título», llama a `getJiraIssue` con `fields: ["summary"]` y devuelve únicamente el valor literal de `summary`, sin encabezados, comillas ni explicación.
2. Cierra al devolver el dato; si falla el acceso, comunica el impedimento concreto. La clave delimita esta lectura: no requiere seleccionar proyecto o sprint, cargar valores por defecto ni guardar configuración. Esta rama no activa delegación, originales, publicación, revisión ni etiquetas de suficiencia.

## Búsqueda y selección de alcance

1. Fija proyecto, claves, filtro o sprint con lo indicado en el encargo; cuando haga falta un valor por defecto, sigue la rama configuración de `operativa-comun`. Pide el alcance indispensable que falte.
2. Busca dentro de ese alcance, recorre la paginación necesaria para seleccionarlo y abre las historias decisivas. Si aún falta decidir qué historias revisar, muestra las candidatas y confirma la selección. Cierra con el conjunto identificado o la selección pendiente, sin convertir una búsqueda en refinamiento por defecto.

## Recuperación completa de originales

1. Por cada historia seleccionada recupera clave, URL, título, estado, fecha de actualización, descripción, criterios completos en todos sus campos, todos los comentarios paginados con autor, fecha e identificador y las referencias disponibles de adjuntos y vínculos. Una vista compacta no demuestra que los criterios o campos personalizados estén vacíos: pide los campos necesarios o la vista que los incluya. Los comentarios se leen mediante su operación específica; su contador no es su contenido.
2. Conserva el texto literal separado del análisis. Una síntesis no sustituye al original. Identifica datos inaccesibles, adjuntos no leídos y páginas pendientes; devuelve siempre el contenido recuperado, incluso con guardado desactivado. Cierra cuando cada historia tiene su original recuperado o su límite de acceso explícito.

## Investigación o cotejo de fuentes

Aplica [investigación por pregunta](../operativa-comun/references/fuentes-evidencias.md#investigación-por-pregunta) al elegir fuentes, ampliar y cerrar; el cotejo íntegro conserva todos los componentes exigidos.

1. Abre cada historia decisiva y recupera campos, criterios, comentarios, relaciones e historial pertinentes a la pregunta o al cotejo. Recorre toda su paginación aplicable; para JQL continúa con `nextPageToken` hasta `isLast`, y para otras operaciones sigue su cursor o contrato. Pide historial mediante su operación paginable cuando sea necesario; una página expandida no acredita la historia completa.
2. Cita clave, URL y campo o identificador de comentario, con actualización y estado cuando sean pertinentes. Distingue contenido literal, análisis y datos inaccesibles. Para originales, coteja todos los componentes de la rama anterior. Cierra cuando cada afirmación o componente cotejado tiene evidencia o un pendiente explícito.
