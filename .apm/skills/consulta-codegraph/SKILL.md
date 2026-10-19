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

## Verificación y cierre

1. Ejecuta `status`: contrasta `projectPath`, `indexPath`, `lastIndexed`, `pendingChanges`, `worktreeMismatch` e `index.state` con `WORKSPACE`. Termina esta comprobación con la correspondencia del índice demostrada o una insuficiencia explícita.
2. Ejecuta Git de solo lectura con `WORKSPACE` como directorio de trabajo; por ejemplo, `git status --short --branch` y `git rev-parse HEAD`. Registra rama, commit y cambios locales. Un índice completo sin pendientes no acredita un commit solicitado. Sin referencia solicitada, los cambios locales forman parte del contenido analizado; con referencia solicitada, atribuye hallazgos a ella solo si workspace e índice se corresponden. Separa la evidencia histórica consultada con Git de la implementación actual.
3. Descubre el recorrido relevante con los comandos anteriores y valida cada archivo decisivo mediante lectura directa del workspace. Cita `ruta/archivo.ext:linea-inicial-linea-final` (`Simbolo`), con rangos estrechos y cada salto decisivo. Obtén las líneas por lectura si la herramienta no las ofrece. Cierra con evidencia verificable de cada afirmación material.

Si falta la CLI, el workspace es ambiguo, el índice no se corresponde o una referencia necesaria no puede comprobarse, devuelve `INSUFICIENTE` e indica el dato o acción exactos requeridos. Conserva Codegraph como medio principal; no lo sustituyas silenciosamente. El código acredita implementación, no intención funcional; comentarios y tests son contexto secundario, y leer un test no demuestra su ejecución.
