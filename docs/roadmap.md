# Evolución futura

Estas capacidades son **previstas, no disponibles** en la distribución actual. El contrato ejecutable está en [flujo-arquitectura.md](../flujo-arquitectura.md). El orden de las iteraciones requiere confirmación del usuario.

## Validar Test UI con trabajo real

Perfilar el especialista con historias locales refinadas y revisadas y su proyecto de Test: crear un caso, actualizar otro relacionado y comprobar negativos, límites y matrices cuando procedan. Las pruebas del paquete acreditan configuración, procedencia, publicación y revisión, no calidad de diseño en una conversación real. Ampliar después la selección a pruebas unitarias, integración, API u otros niveles.

## Backend, Frontend y proveedor

- Implementar especialistas Backend y Frontend con permisos y publicación propios. Recibirían criterios y reglas pertinentes por historia, no todas las historias por defecto. Entregarían bloques que el equipo todavía tendría que descomponer; la precisión y las estimaciones se afinarían con evidencia e iteraciones.
- Implementar el proveedor como mecanismo de acceso a código por especialidad. Cada área, incluida Test, mantendría su ámbito: Backend sin código Frontend, Frontend sin tests E2E. El proveedor daría acceso a todo el código de la propia área; las necesidades entre áreas se resolverían mediante datos concretos y trazables, como endpoints y contratos.
- La lectura directa actual de Test es la vía disponible para perfilarlo mientras el proveedor está pendiente. Su eventual sustitución exige validar el mismo aislamiento, trazabilidad y controles de revisión.
- La [figura interactiva](agentic-flow/README.md) es **ILUSTRATIVA**: sus tres ramas, proveedor y nueve tareas describen el recorrido visual deseado, no agentes instalados ni entregas reales.

## Conocimiento, entradas y publicación

Definir escritura y mantenimiento del conocimiento compartido (hoy complementario y de solo lectura), ampliar la entrada oficial desde gestores de tareas y, cuando exista confianza suficiente, valorar publicación automática. Actualmente las historias locales identificadas son la fuente oficial de arquitectura, Jira es contexto complementario de solo lectura y el usuario copia manualmente los borradores al gestor.
