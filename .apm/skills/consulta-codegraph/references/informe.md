# Informe de investigación de código

## Suficiencia

Lector Código usa este formato al entregar `investigacion.md`. Marca `SUFICIENTE` solo cuando:

- La conclusión responde exactamente a la pregunta y delimita las condiciones en que es cierta.
- Cada afirmación material tiene al menos una cita de código verificable según [consulta Codegraph](../SKILL.md#verificación-y-cierre).
- El recorrido entre entrada y efecto observado está trazado o tiene justificación de «no aplica».
- Las variantes capaces de cambiar la conclusión están revisadas.
- Workspace, referencia efectiva y estado del índice están identificados.
- Hechos, inferencias y límites están separados según [fuentes y evidencias](../../operativa-comun/references/fuentes-evidencias.md).

En otro caso marca `INSUFICIENTE`, identifica la evidencia que falta y formula preguntas concretas que otro intento pueda investigar.

## Formato obligatorio

```markdown
# Investigación de código

## Respuesta breve
<respuesta directa, condicionada cuando corresponda>

## Estado de suficiencia
**SUFICIENTE | INSUFICIENTE**
<justificación breve>

## Alcance verificado
| Campo | Valor |
|---|---|
| Workspace | ... |
| Referencia solicitada | ... |
| Referencia efectiva | ... |
| Cambios locales | ... |
| Índice Codegraph | ... |
| Alcance revisado | ... |

## Hallazgos
| ID | Tipo | Afirmación | Evidencia |
|---|---|---|---|
| C-01 | HECHO | ... | `ruta:líneas` (`Símbolo`) |
<tipos: HECHO, INFERENCIA, NO DETERMINADO>

## Recorrido de implementación
<secuencia y relaciones entre hallazgos C-xx>

## Condiciones y variantes
<flags, configuración, permisos, errores y caminos alternativos; o Ninguna encontrada>

## Conflictos internos
<implementaciones o tests discrepantes; o Ninguno encontrado>

## Incertidumbres y límites
<hechos no demostrados y efecto; o Ninguno material>

## Preguntas de seguimiento
<preguntas dirigidas para INSUFICIENTE; o Ninguna si SUFICIENTE>
```

**Cierre:** todos los apartados están completos, cada afirmación tiene fundamento o límite y el estado satisface las condiciones anteriores.
