---
name: consulta-codegraph
description: Investiga código con Codegraph cuando Lector Código debe descubrir recorridos y verificar workspace, índice, referencia y citas definitivas.
---

# Consulta Codegraph

Codegraph es el medio principal del Lector Código para descubrir símbolos, relaciones y recorridos. Lectura directa, búsqueda textual y Git de solo lectura validan sus resultados. Arquitecto Test conserva su acceso directo acotado al proyecto de Test; esta skill no es un requisito para ese rol.

## Interfaz de consulta

Usa la CLI `codegraph` con el workspace recibido como ruta absoluta entre comillas:

```text
codegraph status "<WORKSPACE>" --json
codegraph query -p "<WORKSPACE>" "<busqueda>" [-l <limite>] [-k <tipo>] [--json]
codegraph explore -p "<WORKSPACE>" "<consulta>" [--max-files <numero>]
codegraph context -p "<WORKSPACE>" "<tarea>" [-n <numero>] [-f markdown|json] [--no-code]
codegraph node -p "<WORKSPACE>" "<simbolo>" [-f <archivo>]
codegraph node -p "<WORKSPACE>" -f "<archivo>" [--offset <linea>] [--limit <numero>] [--symbols-only]
codegraph callers -p "<WORKSPACE>" "<simbolo>" [-l <limite>] [--json]
codegraph callees -p "<WORKSPACE>" "<simbolo>" [-l <limite>] [--json]
codegraph files -p "<WORKSPACE>" [--filter <directorio>] [--pattern <glob>] [--format tree|flat|grouped]
```

Los corchetes señalan opciones, no caracteres literales. Ejecuta consultas sin redirecciones ni opciones que escriban archivos. El usuario prepara el workspace y su índice; conserva ramas, worktrees e índice tal como los recibes, sin `fetch`, `pull`, `checkout` ni reindexado.

Para metadatos Git, realiza tres llamadas de shell independientes, cada una con `workdir` igual a la ruta absoluta completa de `WORKSPACE`, incluidos sus espacios:

```text
git branch --show-current
git rev-parse HEAD
git status --short --branch
```

Son comandos separados, no un script multilínea: el directorio se indica en el argumento `workdir`, no mediante `cd` ni `git -C`. Ante una denegación, corrige la forma con la alternativa permitida; si no existe, devuelve el impedimento concreto. Cambiar solo el timeout conserva el mismo rechazo.

## Verificación y cierre

1. Ejecuta `status`: contrasta `projectPath`, `indexPath`, `lastIndexed`, `pendingChanges`, `worktreeMismatch` e `index.state` con `WORKSPACE`, incluidos sus avisos. Cero pendientes junto con avisos relevantes de archivos cambiados mantiene una reserva de coherencia; la antigüedad por sí sola tampoco demuestra invalidez. Termina con la correspondencia del índice demostrada o una insuficiencia explícita.
2. Obtén por separado los metadatos Git anteriores. Registra rama, commit y cambios locales y comprueba si el cambio de la pregunta pertenece a ese corpus: una historia en QA no demuestra su presencia en la rama preparada. Un índice completo sin pendientes no acredita una referencia solicitada. Sin ella, los cambios locales forman parte del contenido analizado; con ella, atribuye hallazgos solo cuando esté demostrada su correspondencia con workspace e índice. Separa evidencia histórica de implementación actual. Si el corpus es anterior al cambio o la referencia no está demostrada, una búsqueda negativa deja la ausencia funcional como `NO DETERMINADO`; identifica la fuente o referencia necesaria sin cambiar de rama.
3. Con corpus suficiente para la pregunta, descubre el recorrido relevante con los comandos anteriores y valida cada archivo decisivo mediante lectura directa del workspace. Cita `ruta/archivo.ext:linea-inicial-linea-final` (`Simbolo`), con rangos estrechos y cada salto decisivo. Obtén las líneas por lectura si la herramienta no las ofrece. Cierra con evidencia verificable de cada afirmación material.

Si falta la CLI, el workspace es ambiguo, el índice no se corresponde o una referencia necesaria no puede comprobarse, devuelve `INSUFICIENTE` e indica el dato o acción exactos requeridos. Conserva Codegraph como medio principal; no lo sustituyas silenciosamente. El código acredita implementación, no intención funcional; comentarios y tests son contexto secundario, y leer un test no demuestra su ejecución.

Reutiliza la comprobación de corpus dentro del encargo mientras mantenga workspace, referencia efectiva, commit, árbol e índice relevantes. Antes de apoyarte en ella otra vez, contrasta esos datos; un cambio relevante exige renovar la parte afectada. Registra comprobación, reservas e invalidación en el alcance del informe. Para ampliar o cerrar cada pregunta aplica [investigación por pregunta](../operativa-comun/references/fuentes-evidencias.md#investigación-por-pregunta).

Para redactar `investigacion.md` y comprobar su suficiencia, aplica [informe de código](references/informe.md). Termina con todos sus apartados y evidencia o límite por afirmación material.
