# Criterios de aceptación — escenarios Gherkin

## Aplicación y suficiencia

Planificador y Refinador redactan con esta referencia los criterios de aceptación de [Historia](historia.md), incluido `borrador.md` y sus propuestas. Arquitecto Test solo la usa para interpretar los criterios que recibe, no para redactar los suyos: sus casos siguen [Caso de Test](caso-test.md). Revisor la aplica al cotejar historias, convirtiendo su incumplimiento en hallazgo material según [Revisión](revision.md). Antes de publicar, corregir o revisar aplica [publicación y revisión](../../operativa-comun/references/publicacion-revision.md); esta referencia determina la forma de los criterios, no redefine guardado ni aprobación. Los criterios de contenido —qué hace buena una condición y qué es acuerdo o propuesta— pertenecen a [user-stories](../../user-stories/SKILL.md), ramas de confirmación y revisión.

**Contrato:** todo criterio de aceptación, confirmado o propuesto, es un escenario Gherkin completo y autónomo. Las reglas y definiciones que no pueden expresarse como escenario (una definición de dominio, un permiso transversal, una restricción de retención) van al apartado «Alcance y reglas funcionales» (RF-) de la historia, nunca al de criterios.

1. **Escenario completo:** abre con Dado (contexto y actores), Cuando (disparador) y Entonces (resultado observable); las consecuencias adicionales del mismo caso se encadenan con Y dentro del escenario. Prohibido publicar como criterio independiente una cláusula «Y» huérfana o un paso final del caso anterior: esas consecuencias se reagrupan bajo su escenario de origen.
2. **Autonomía:** cada escenario se lee sin necesidad del anterior. Repetir Dado/Cuando entre criterios del mismo flujo no es defecto; es lo que los hace independientes. Divide un escenario solo cuando existen disparadores independientes (p. ej. estado del expediente frente a rol del usuario), no para enumerar consecuencias del mismo caso.
3. **Idioma:** usa las palabras clave en el idioma de la fuente (Dado/Cuando/Entonces/Y; Given/When/Then/And si el original está en inglés) y conserva sus literales de interfaz entre comillas.
4. **Cuerpo limpio:** el escenario no contiene evidencia: sin sessionIDs, rutas locales, marcas temporales del gestor, citas de código ni localizadores de implementación. El mapeo con el original y la fuente de cada acuerdo viven en la tabla de trazabilidad del archivo de incidencias; cada hallazgo se documenta una sola vez, allí. La historia resultante es pegable tal cual en la descripción del gestor.
5. **Propuestas:** los PC pendientes de confirmación siguen el mismo formato de escenario, en su apartado propio, sin mezclarse con los confirmados.

**Cierre:** cada criterio es un escenario completo, autónomo y en el idioma de la fuente; ningún fragmento huérfano se publica como criterio; ninguna regla no escenificable figura como criterio; ninguna evidencia aparece en el cuerpo de un criterio; el mapeo con los originales reside completo en el archivo de incidencias.

## Plantilla copiable — escenario

```markdown
- **<CA-ID> — <título corto del escenario>**
  - **Dado** <contexto y actores>
  - **Cuando** <disparador>
  - **Entonces** <resultado observable>
  - **Y** <consecuencia adicional del mismo caso; solo las que procedan>
```

## Correspondencia para casos de test

La especialidad de Test no redacta sus casos en Gherkin. Para interpretar un criterio recibido: Dado alimenta «Precondiciones, datos y preparación», Cuando produce los «Pasos UI», y Entonces con sus cláusulas Y producen los resultados esperados de [Caso de Test](caso-test.md). Una cláusula Y del escenario original nunca genera un caso independiente: pertenece al caso que nace del mismo escenario.

## Ejemplo ficticio — escenario reagrupado

Todos los nombres, acuerdos y literales de este ejemplo son inventados.

```markdown
- **CA-1 — Guardar mensaje editado sin efectos colaterales**
  - **Dado** un usuario autenticado con rol de gestión (Administrador, Director)
    en un expediente vivo
  - **Cuando** modifica el mensaje existente de una NC y confirma el modal
    «¿Aplicar los cambios?»
  - **Entonces** el sistema guarda el nuevo mensaje
  - **Y** no ejecuta ningún recálculo del estado de la NC
  - **Y** no cambia la fecha del mensaje ni la de modificación de la NC
  - **Y** no muestra ninguna marca de «Editado»
```

El original traía esas consecuencias como cláusulas sueltas «Y NO»; el criterio las conserva encadenadas en un único escenario y cada literal de origen queda citado en la trazabilidad del archivo de incidencias.
