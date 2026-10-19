# Preparación y continuación

## Preparar una reunión

1. Obtén tipo, objetivo, participantes y fecha. Pregunta por duración, rol del usuario, decisiones esperadas y restricciones solo cuando afecten al análisis. **Fin:** los datos decisivos están resueltos o la preparación queda pendiente de ellos.
2. Inspecciona los temas existentes y confirma tema, reuniones relacionadas y fuentes antes de crear artefactos. **Fin:** selección confirmada.
3. Elige un `meeting_id` único según [artefactos](artefactos.md) y crea `prep.md`, `sources.md` y `outcome.md` con estado `open`. **Fin:** existen los tres artefactos con metadatos.
4. Ingiere todas las fuentes según [fuentes y privacidad](fuentes-privacidad.md). **Fin:** cada resultado está registrado en `sources.md`.
5. Lee `state.md` y los `outcome.md` relevantes; si el tema es nuevo, crea su primer estado. Compara lo nuevo con el estado vigente: evidencia, cambios de premisas, contradicciones, dependencias, dudas y riesgos. **Fin:** cada cambio material tiene evidencia o pendiente.
6. Completa `prep.md` con su contenido requerido y el enfoque de abajo. Actualiza `state.md` aplicando su autoridad y tratamiento de conflictos de [artefactos](artefactos.md#autoridad-y-evidencia). **Fin:** análisis guardado y cambios inequívocos reflejados; conflictos pendientes de respuesta.
7. Completa la limpieza de lectura documental y resume rutas y hallazgos. **Cierre:** cada fuente tiene estado conocido, existen los tres artefactos, el estado refleja los cambios inequívocos y la limpieza está comprobada o su fallo declarado.

## Continuar una preparación

1. Identifica la reunión abierta y lee sus artefactos y `state.md`. Para una reunión cerrada aplica el historial inmutable de [artefactos](artefactos.md#autoridad-y-evidencia). **Fin:** contexto vigente y reunión abierta identificados.
2. Ingiere las fuentes nuevas con [fuentes y privacidad](fuentes-privacidad.md) y registra resultados en `sources.md`. **Fin:** cada fuente nueva tiene estado conocido.
3. Compara la nueva información con el estado: cambios de premisas, contradicciones, dependencias, dudas y riesgos. Guarda el análisis en `prep.md` y aplica a `state.md` la autoridad y tratamiento de conflictos de [artefactos](artefactos.md#autoridad-y-evidencia). **Fin:** incorporaciones guardadas y conflictos pendientes de respuesta.
4. Completa la limpieza y resume los cambios. **Cierre:** `prep.md` y `sources.md` contienen las incorporaciones, el estado refleja los cambios inequívocos y la limpieza está comprobada o su fallo declarado.

## Enfoque por tipo

- Kickoff: alcance, objetivos, éxito, roles, dependencias y alineamiento.
- Refinement: ambigüedades, aceptación, casos límite, dependencias y estimación.
- Planning: prioridad, capacidad, secuencia, dependencias y bloqueos.
- Code review: corrección, riesgos, tradeoffs y decisiones sobre código o diffs.
- Testing analysis: estrategia, cobertura, datos, entornos, riesgos y salida.
- Testing results: impacto, severidad, riesgo de entrega, repetición y defectos.
- Otro tipo: deriva el análisis del objetivo y de los participantes.
