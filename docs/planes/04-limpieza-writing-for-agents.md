# Plan 4 — Limpieza con writing-for-agents

## Objetivo y condiciones de ejecución

Revisar todos los agentes y skills mediante `writing-for-agents`: eliminar redundancias y referencias operativas obsoletas, ordenar la información y expresar el comportamiento esperado en lenguaje positivo. Unificar las instrucciones en español, conservando las funciones y los controles vigentes.

Ejecuta esta actuación cuando la solicite el usuario, después de las tres anteriores. Comprueba sus resultados en las fuentes actuales: nombres nuevos, reglas compartidas y `plantillas-entregables` conectada a sus consumidores. Los archivos de planes anteriores pueden haberse eliminado.

Trabaja exclusivamente dentro de `ai-assisted-planning`. Revisa el estado y diff y conserva el trabajo local existente. Usa `build/` para configuración y temporales de prueba. Marca cada paso al comprobar el resultado.

## Alcance y decisiones confirmadas

- Revisa los ocho agentes y todas las skills distribuidas, tanto `user-stories`, `domain-glossary` y `meeting-coach` como las incorporadas en las actuaciones anteriores.
- Conserva las tres skills originales y su finalidad. La limpieza afecta a su redacción, organización e integración con las reglas comunes.
- Aplica también la revisión a las referencias que consumen los agentes: contrato de arquitectura, punteros de README y formatos de entrega.
- Las instrucciones se redactan en español; identificadores, comandos, rutas, campos y términos técnicos conservan su forma literal. Los entregables mantienen el idioma que corresponda según el encargo y el rol.
- La documentación operativa describe las capacidades disponibles. Las previsiones de Backend, Frontend y proveedor quedan separadas como evolución futura.
- Las revisiones y límites de acceso siguen vigentes. Conserva una prohibición cuando sea un límite duro que no pueda expresarse con igual precisión en positivo; acompáñala de la acción esperada.

## Criterios obligatorios de writing-for-agents

1. **Fuente única:** cada regla tiene una definición normativa; sus consumidores la alcanzan mediante punteros verificables.
2. **Disparadores claros:** cada puntero identifica el material y las ramas concretas que exigen leerlo.
3. **Jerarquía:** el cuerpo principal contiene los pasos necesarios; las ramas particulares y referencias extensas se consultan bajo demanda.
4. **Co-localización:** definición, excepciones y criterios de un concepto permanecen juntos.
5. **Finalización verificable:** cada paso termina en una condición que permite distinguir completado, pendiente y bloqueado.
6. **Lenguaje positivo:** las instrucciones indican qué hacer, con límites precisos donde sean necesarios.
7. **Poda:** elimina exposición irrelevante, instrucciones sin efecto y copias de datos que ya se consultan de forma sencilla en el entorno. Conserva convenciones y razones que el entorno no explica.

## Puntos concretos que revisar

- `README.md` y `docs/jira-access-verification.md` contienen referencias a copias externas `agents-old/`, `old/` y a una prohibición antigua de Jira. Resuelve su vigencia con las fuentes locales del paquete y elimina esas referencias de las instrucciones operativas.
- `flujo-arquitectura.md` combina el contrato vigente con fases anteriores, acceso temporal de Test y trabajo futuro sobre Backend, Frontend y proveedor. Separa estado actual y evolución sin atribuir capacidades implementadas a las pendientes.
- `docs/agentic-flow/` representa un recorrido funcional con especialistas y proveedor que supera la implementación disponible. Identifica ese carácter ilustrativo junto a la figura y en su documentación; mantén distinguida la capacidad real actual.
- Lector Código contiene procedimientos, interfaz de comandos, límites y una estructura extensa de salida. Tras las extracciones anteriores, conserva en su cuerpo la secuencia del rol y los punteros pertinentes.
- `meeting-coach` contiene ramas y formatos extensos. Mantén una entrada breve de enrutado y extrae referencias por operación cuando mejore la lectura, preservando su autoridad documental, privacidad, consentimiento y ciclo de vida.
- `domain-glossary` contiene reglas especializadas de definición, sinonimia y citas. Conserva esas reglas y apóyate en la lectura documental común para la ingesta.
- `user-stories` y sus referencias están actualmente en inglés. Traduce las instrucciones conservando sus matices, ramas y distinción entre acuerdos y propuestas; conecta el formato de salida a `plantillas-entregables`.

## Ejecución

### 1. Fijar el contrato vigente

- [ ] Carga y aplica `writing-for-agents`. Sus criterios son la pauta de revisión de este plan.
- [ ] Inventaría todos los agentes, skills y referencias distribuidas. Identifica misión, entradas, herramientas, salidas, ramas y criterio de cierre de cada uno.
- [ ] Contrasta los documentos con permisos, herramientas y pruebas locales. Documenta las diferencias reales antes de retirar contenido.
- [ ] Fija las capacidades actuales: acceso Jira de solo lectura según rol; Codegraph en Lector Código; documentación en su lector; historias refinadas desde Planificador; arquitectura con Test UI implementado y otras especialidades pendientes; revisión y publicación versionadas.

**Resultado:** cada documento tiene función y autoridad definidas y cada capacidad descrita tiene respaldo local.

### 2. Depurar agentes

- [ ] Revisa cada agente con los siete criterios de la sección anterior. Retira repeticiones de reglas y formatos ya centralizados, manteniendo punteros precisos.
- [ ] Conserva en el cuerpo la decisión entre consulta puntual y trabajo completo, las delegaciones propias, las excepciones y la condición de entrega.
- [ ] Reescribe las instrucciones negativas como acciones esperadas cuando el significado se conserve. Por ejemplo, «atribuye cada hallazgo a las fuentes efectivamente consultadas» expresa el objetivo de trazabilidad.
- [ ] Conserva expresamente los límites de solo lectura, herramientas autorizadas y acceso por especialidad donde constituyan parte del contrato. Su comprobación en código y permisos sigue siendo necesaria.
- [ ] Verifica que el Investigador mantiene su función anterior y que coordinar sigue siendo una responsabilidad legítima del Arquitecto; el renombrado de un rol no elimina esa función.

**Resultado:** cada agente contiene su contrato operativo y conduce a las reglas y formatos correctos sin reproducirlos.

### 3. Depurar skills y referencias

- [ ] Revisa nombre, descripción y condiciones de invocación de cada skill frente al soporte real de OpenCode. Conserva sus identificadores salvo incompatibilidad comprobada.
- [ ] Expresa en español qué resuelve cada skill y en qué ramas corresponde utilizarla. Mantén el uso manual previsto de `meeting-coach` conforme al mecanismo admitido por el entorno.
- [ ] Traduce `user-stories` y sus referencias preservando autoridad del decisor, estimaciones del equipo, valor, incertidumbre y criterios confirmados frente a propuestos.
- [ ] Reduce cuerpos extensos mediante referencias por rama u operación cuando la separación tenga un disparador claro. Comprueba que las referencias trasladadas conservan todas sus relaciones.
- [ ] Revisa `domain-glossary` y `meeting-coach` con sus criterios propios: fuentes originales, sinónimos fundamentados, contenido privado de reuniones, estado vigente e inmutabilidad del historial cerrado.
- [ ] Comprueba que las skills nuevas de reglas y plantillas tienen una responsabilidad delimitada y una única definición por regla o formato.

**Resultado:** todas las skills tienen alcance, entrada y cierre claros; sus referencias son alcanzables y conservan las excepciones necesarias.

### 4. Separar operación vigente e historia

- [ ] Simplifica README y contrato para explicar qué puede ejecutarse hoy. Conserva las instrucciones de instalación, migración y continuidad necesarias para operar.
- [ ] Mueve las previsiones útiles a `docs/roadmap.md`, identificado como evolución futura. Si el documento ya existe al ejecutar el plan, integra el contenido respetando su estructura.
- [ ] Identifica en la documentación y en ambos HTML de la figura las capacidades ilustrativas pendientes de implementar. Mantén alineadas sus fuentes y textos distribuidos mediante cambios locales.
- [ ] Retira alusiones a flujos sustituidos y ubicaciones externas de las instrucciones vigentes, usando el estado actual del paquete como autoridad.
- [ ] Conserva los informes de verificación fechados como evidencia histórica y añade una indicación visible de su alcance temporal cuando sus nombres o cifras ya no describan el estado actual. Evita convertir resultados pasados en resultados recién ejecutados.

**Resultado:** la persona y el agente distinguen contrato actual, evidencia histórica y trabajo futuro desde sus puntos de entrada.

### 5. Comprobar la lectura completa del sistema

- [ ] Recorre la cadena de punteros desde cada agente instalado hasta las reglas, plantillas y referencias que necesita. Corrige rutas huérfanas y ciclos de lectura sin condición de cierre.
- [ ] Revisa una consulta puntual, una investigación, un refinamiento, una entrega de Test y una continuación con historial: en cada recorrido debe quedar claro qué se lee, qué se produce y cuándo termina.
- [ ] Revisa el diff completo para detectar cambios accidentales de obligaciones, permisos, estados, contadores, idioma de entregables o criterios de aceptación.
- [ ] Actualiza las comprobaciones documentales que dependían de frases trasladadas, para verificar la norma y el puntero donde ahora residen, preservando el comportamiento comprobado.

**Resultado:** el conjunto puede seguirse de extremo a extremo y conserva sus responsabilidades y controles.

## Validación

- [ ] Verifica para todos los agentes y skills los siete criterios de `writing-for-agents`, con resultado y corrección de cada hallazgo material.
- [ ] Comprueba que las búsquedas de nombres antiguos y flujos sustituidos solo devuelven migración, pruebas de compatibilidad o historia explícitamente identificada.
- [ ] Comprueba que README, contrato y figura distinguen las especialidades disponibles de las previstas.
- [ ] Ejecuta las pruebas existentes afectadas y `node --test *.test.ts` con temporales locales. Si se han modificado identificadores o datos del modelo de la figura, ejecuta también `node --test docs/agentic-flow/model.test.mjs`.
- [ ] Comprueba que las skills y referencias siguen incluidas por APM y cargables en OpenCode en un consumidor local. Registra las herramientas ausentes como verificaciones pendientes.
- [ ] Ejecuta `git diff --check`. Comunica el alcance de las comprobaciones: revisión documental, permisos, distribución y ejecuciones funcionales realmente observadas.

## Cierre y retirada de estas instrucciones

- [ ] Confirma que todos los documentos del alcance están revisados, los hallazgos materiales corregidos y las verificaciones obligatorias completas.
- [ ] Resume las ubicaciones normativas definitivas y la separación entre contrato vigente y evolución. Comunica el requisito de reiniciar OpenCode tras instalar los cambios.
- [ ] Elimina únicamente `docs/planes/04-limpieza-writing-for-agents.md`. Conserva este archivo si queda un bloqueo, indicando el estado y la siguiente acción. Retira `docs/planes/` solo si queda vacía y mediante una operación limitada a esa carpeta.
