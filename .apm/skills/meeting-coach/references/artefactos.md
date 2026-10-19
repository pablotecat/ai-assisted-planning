# Artefactos privados y autoridad

## Autoridad y evidencia

Trata los artefactos como notas privadas y francas, no como documentos para distribuir. Guarda referencias y extractos relevantes; no copies documentos completos. Toda información sustantiva queda en los artefactos; el chat resume.

Al contrastar fuentes aplica [fuentes y evidencias](../../operativa-comun/references/fuentes-evidencias.md). La autoridad propia de reuniones es: decisiones confirmadas, documentación vigente, inferencias y propuestas. Clasifica las afirmaciones relevantes como `evidencia`, `inferencia`, `duda` o `propuesta` y cítalas. Incorpora propuestas no solicitadas solo ante riesgos evidentes, indicando evidencia, beneficio, coste y riesgo.

`state.md` es la fuente vigente; las reuniones son el historial. Una reunión cerrada es inmutable: conserva sus artefactos, incluidos `prep.md` y `sources.md`; registra correcciones posteriores en una nueva reunión enlazada. Los cambios inequívocos pueden actualizar el estado; ante ambigüedad o contradicción con decisiones confirmadas, registra el pendiente y pregunta antes de modificarlo.

## Almacenamiento y citas

Guarda todo bajo `data/`:

```text
data/
|-- profile.md
|-- .tmp/meeting-coach/
`-- topics/<topic-slug>/
    |-- state.md
    `-- meetings/YYYY-MM-DD--<meeting-slug>/
        |-- prep.md
        |-- sources.md
        `-- outcome.md
```

Usa slugs ASCII y el nombre de la carpeta de reunión como `meeting_id`. Añade un sufijo numérico si la ruta existe. Crea `profile.md` solo cuando el usuario pida conservar datos estables sobre su rol, preferencias o estilo.

Usa frontmatter YAML y fechas ISO 8601:

- `prep.md`: `meeting_id`, `topic`, `meeting_type`, `meeting_date`, `created_at`, `language`, `related_meetings`.
- `sources.md`: `meeting_id`, `consulted_at`.
- `outcome.md`: `meeting_id`, `status` (`open` o `closed`), `updated_at`.
- `state.md`: `topic`, `updated_at`.

Cita como `[source: ruta#sección]` o `[decision: meeting-id#sección]`, con los localizadores de [lectura documental](../../lectura-documental/SKILL.md) cuando haya conversiones.

## Contenido requerido

- **`prep.md`:** objetivo, participantes, resumen ejecutivo, contexto vigente, cambios respecto al historial, agenda, puntos clave, conflictos, preguntas por participante, decisiones necesarias, guion personal, objeciones, riesgos, propuestas, análisis solicitados y citas. Asigna tiempos si conoces la duración.
- **`sources.md`:** por fuente, ruta o enlace original, fecha, versión conocida, estado de lectura, limitaciones, método de conversión, extractos relevantes, afirmaciones respaldadas y conflictos. Conserva el original como referencia, sin reproducir el documento.
- **`outcome.md`:** feedback original, normalización, decisiones confirmadas, rechazadas y aplazadas, acciones, responsables, fechas, dudas, cambios de premisas y referencias al estado actualizado.
- **`state.md`:** premisas activas con evidencia, decisiones confirmadas con reunión de origen, acciones, dudas abiertas, elementos sustituidos o descartados y registro cronológico de cambios.

**Cierre de escritura:** cada artefacto afectado tiene metadatos y contenido de su tipo; el estado conserva procedencia y el historial cerrado permanece intacto.
