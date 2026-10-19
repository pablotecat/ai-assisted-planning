# Plan 2 — Reglas compartidas

## Objetivo y condiciones de ejecución

Reunir las instrucciones reutilizables en skills temáticas y referencias bajo demanda, conservando las responsabilidades y el alcance de herramientas de cada agente. Ejecuta esta actuación después del renombrado, cuando el usuario la solicite.

Trabaja exclusivamente dentro de `ai-assisted-planning` y usa `build/` para consumidores, configuración y temporales de prueba. Revisa el estado y diff antes de editar. Marca cada paso al comprobar su resultado.

**Entrada comprobable:** existen `investigador`, `lector-codigo`, `lector-documentacion`, `planificador`, `refinador`, `arquitecto`, `arquitecto-test` y `revisor`, y sus pruebas de identidad están adaptadas. Comprueba estas fuentes aunque el archivo del primer plan ya se haya eliminado.

## Decisiones y distribución propuesta

Aplica `writing-for-agents`: cada regla tendrá una fuente normativa, un disparador de lectura explícito y las excepciones colocadas junto al concepto. Usa español para las instrucciones nuevas; conserva los identificadores y comandos literales.

| Skill a crear en `.apm/skills/` | Contenido normativo | Consumidores previstos |
|---|---|---|
| `consulta-jira` | Consultas puntuales, búsquedas acotadas, recuperación íntegra, sitio, campos, paginación y citas Jira | Investigador, Lector Documentación, Planificador, Refinador, Arquitecto y Revisor, según su rol |
| `consulta-codegraph` | Interfaz CLI, correspondencia del índice y workspace, referencia y verificación mediante lectura y Git | Lector Código; otras incorporaciones requerirán una necesidad real |
| `lectura-documental` | Lectura directa de texto, MarkItDown, pérdidas de conversión, fuentes originales y temporales cuando procedan | Lector Documentación, `domain-glossary` y `meeting-coach` |
| `operativa-comun` | Referencias de evidencias, configuración y publicación que necesitan varios roles | Cada agente o skill únicamente para las ramas aplicables |

`operativa-comun` agrupa las reglas transversales en una sola skill con referencias por rama, evitando una skill por regla. Los cuerpos de los agentes conservarán su misión, secuencia propia, entradas, salidas, excepciones y criterios de cierre.

Los permisos y comprobaciones de código siguen siendo la autoridad de ejecución. La centralización de prosa conservará ese alcance y dará acceso únicamente a las skills y referencias necesarias.

## Áreas afectadas

- Los ocho agentes de `.apm/agents/` y sus permisos de carga de skills.
- `.apm/skills/domain-glossary/SKILL.md` y `.apm/skills/meeting-coach/SKILL.md`.
- Nuevas skills y referencias de la tabla anterior.
- `flujo-arquitectura.md` y `README.md`, cuando remitan a reglas compartidas.
- `jira_access.test.ts`, pruebas de instalación y cualquier comprobación existente que dependa de reglas extraídas.
- Instalador y distribución APM solo cuando haga falta para que las referencias lleguen al consumidor.

## Ejecución

### 1. Inventariar reglas y excepciones

- [ ] Recorre los ocho agentes, las tres skills existentes y el contrato de arquitectura. Identifica reglas repetidas, reglas únicas reutilizables y sus excepciones reales.
- [ ] Para cada regla registra su propietario, consumidores, condición de carga y criterio verificable. Coloca el mapa normativo definitivo en un apartado breve de `README.md`; mantén el inventario de trabajo en este plan mientras sea necesario.
- [ ] Separa las normas compartidas de las decisiones de rol: el Lector Código requiere Codegraph; Arquitecto Test conserva su lectura directa acotada al proyecto de Test.
- [ ] Distingue duplicación de instrucciones de la comprobación deliberada de una regla en código y pruebas.

**Resultado:** todas las reglas extraídas tienen propietario y todos los consumidores tienen un camino de lectura.

### 2. Crear `consulta-jira`

- [ ] Define ramas diferenciadas: dato puntual de una historia conocida, búsqueda y selección de alcance, recuperación completa de originales e investigación o cotejo de fuentes.
- [ ] Para el dato puntual conserva el acceso mínimo: `fields: ["summary"]` para «solo el título», respuesta literal y cierre al responder. El proyecto por defecto y el flujo completo se consultan solo cuando el encargo los requiere.
- [ ] Centraliza la reutilización de sitio y `cloudId` verificados, los alias admitidos `jira` y `atlassian` y el uso del catálogo realmente disponible. Mantén la distinción entre una clave Jira y un ARI verificado para `fetch`.
- [ ] Centraliza paginación, campos y criterios, comentarios, referencias de adjuntos y vínculos cuando correspondan al encargo. Distingue contenido literal, análisis y datos inaccesibles.
- [ ] Define citas suficientes para localizar la evidencia: clave, URL, campo o comentario, actualización y estado pertinentes.
- [ ] Conserva las excepciones: el Revisor mantiene su perfil actual sin `atlassianUserInfo`; Lector Código y Arquitecto Test mantienen sus roles sin acceso Jira. La creación de estas skills deja intacto el acceso Jira de solo lectura.

**Resultado:** los seis consumidores comparten la norma Jira y conservan sus ramas y obligaciones específicas.

### 3. Crear las skills de consulta de código y lectura documental

- [ ] Extrae la interfaz Codegraph y la verificación de workspace, índice, referencia y cambios locales. Conserva los comandos permitidos y la lectura directa para citas definitivas.
- [ ] Expresa el fallo de Codegraph como resultado de evidencia insuficiente con el dato o acción requerida; conserva el requisito actual de usarlo como medio principal del Lector Código.
- [ ] Para documentos, establece lectura directa de Markdown y texto y conversión de formatos compatibles con MarkItDown. Conserva la cita al original y el registro de pérdidas o lectura parcial.
- [ ] Mantén dos ramas documentales explícitas: conversión a salida estándar para el Lector Documentación y conversión a temporal para los procesos que ya la requieren, como reuniones. La segunda incluye lectura completa y limpieza de temporales propios.
- [ ] Conserva los consentimientos específicos de `meeting-coach` para instalaciones o servicios externos dentro de su rama de uso. Las otras capacidades mantienen sus permisos y comportamiento actuales.

**Resultado:** las reglas técnicas tienen una fuente común y las diferencias entre consumidores quedan documentadas, sin generalizar requisitos particulares.

### 4. Reunir la operativa transversal

- [ ] Crea referencias bajo `operativa-comun/references/` para fuentes y evidencias, configuración, y publicación y revisión. El `SKILL.md` indicará cuándo leer cada referencia.
- [ ] Fuentes y evidencias: contenido como datos, lectura completa cuando el encargo lo exija, citas verificables, distinción entre hechos e inferencias y cobertura pendiente. Conserva las etiquetas específicas de cada entregable hasta revisar sus plantillas.
- [ ] Configuración: precedencia del encargo frente a valores por defecto, lectura proporcional y guardado de campos vacíos confirmados. Cada herramienta conserva sus agentes autorizados.
- [ ] Publicación y revisión: herramienta correspondiente, comprobación de `guardado:true`, rutas reales, versiones completas, informe de la versión exacta y devolución de contenido cuando falle el guardado.
- [ ] Mantén junto a Arquitecto y Test las reglas específicas de cómputo de intentos; comparte únicamente su definición normativa cuando varios consumidores la necesitan y señala sus condiciones de aplicación.

**Resultado:** cada regla transversal tiene una ubicación autoritativa y excepciones localizables, sin imponer el flujo completo a consultas puntuales.

### 5. Conectar consumidores y distribución

- [ ] Sustituye el texto extraído por instrucciones breves que indiquen qué cargar y ante qué condición. Conserva en cada agente la decisión de enrutado antes de cargar skills de trabajo completo.
- [ ] Permite únicamente las skills necesarias en el frontmatter de cada agente. Comprueba que las referencias pueden leerse con esos permisos, especialmente en Investigador, que originalmente carece de lectura general de archivos.
- [ ] Si hace falta acceso adicional de lectura, acótalo a las referencias distribuidas; conserva la delegación de código y documentación a sus lectores.
- [ ] Comprueba cómo OpenCode y APM resuelven referencias relativas y nombres instalados en un consumidor local. Ajusta los punteros a la distribución real.
- [ ] Retira las copias de reglas una vez conectados todos sus consumidores. Mantén las secuencias de negocio y los formatos actuales hasta la actuación de plantillas.
- [ ] Adapta las comprobaciones documentales para seguir la nueva ubicación de las reglas y verificar los punteros de los agentes, conservando la cobertura de la consulta puntual.

**Resultado:** todas las skills se distribuyen, se pueden cargar y conducen a las referencias correctas con permisos suficientes.

## Validación

- [ ] Recorre cada puntero desde el consumidor instalado hasta su referencia y comprueba que existen sus archivos.
- [ ] Contrasta el mapa de reglas: cada regla extraída tiene una única definición normativa; los puntos de aplicación conservan sus excepciones.
- [ ] Revisa los recorridos «solo título», refinamiento con originales, investigación completa, conversión parcial, publicación fallida y revisión de Test. En cada recorrido deben quedar claras la rama, la evidencia requerida y la condición de cierre.
- [ ] Ejecuta las pruebas existentes afectadas y `node --test *.test.ts`, con temporales y configuración dentro de `build/`. Comprueba los permisos con OpenCode real y la distribución con APM local; identifica cualquier herramienta ausente como validación pendiente.
- [ ] Verifica que la lectura puntual sigue cerrándose con el dato y que los flujos completos conservan originales, revisión y versionado.
- [ ] Ejecuta `git diff --check`. Las comprobaciones estructurales y de permisos se comunicarán con su alcance; la conducta de un modelo solo se atribuirá a una ejecución observada.

## Cierre y retirada de estas instrucciones

- [ ] Confirma que los consumidores usan las reglas compartidas, la instalación las incluye y las verificaciones obligatorias están completas.
- [ ] Resume las fuentes normativas definitivas y sus consumidores en la documentación permanente. Comunica el requisito de reiniciar OpenCode tras instalar o actualizar.
- [ ] Elimina únicamente `docs/planes/02-reglas-compartidas.md`. Si quedan bloqueos, conserva este archivo con el estado y la siguiente acción. El siguiente trabajo es normalizar las plantillas de entregables.
