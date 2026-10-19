---
name: meeting-coach
description: Reuniones, a petición explícita del usuario con meeting-coach; prepara una reunión, continúa una preparación abierta, registra feedback y cierre o consulta el estado de un tema.
---

# Preparación y continuidad de reuniones

Usa esta skill por invocación manual: el usuario pide expresamente `meeting-coach` y la operación. Esta condición es una instrucción de uso; OpenCode la carga con `skill`, sin un atributo de frontmatter de exclusión automática. Trabaja en el idioma del usuario.

1. **Identificar.** Determina operación, tema y reunión. Si hay varias opciones plausibles, muéstralas y espera la elección del usuario. **Fin:** destino y operación inequívocos, o pregunta pendiente antes de escribir.
2. **Leer el contrato privado.** Para toda operación lee [artefactos y autoridad](references/artefactos.md): ubicación, estado vigente, citas e historial cerrado. **Fin:** artefactos relevantes identificados y autoridad aplicada.
3. **Ejecutar solo la rama solicitada:**
   - Preparar una reunión nueva → [preparación](references/preparacion.md#preparar-una-reunión), incluido el enfoque por tipo.
   - Continuar una preparación abierta → [continuación](references/preparacion.md#continuar-una-preparación).
   - Registrar feedback y cerrar → [cierre](references/cierre-estado.md#registrar-feedback-y-cerrar).
   - Consultar un tema → [estado](references/cierre-estado.md#consultar-el-estado).
   - Cuando una operación incorpore fuentes → lee primero [fuentes y privacidad](references/fuentes-privacidad.md), incluidos consentimientos de instalación y servicios externos.
   **Fin:** se cumple el cierre de la rama o cada impedimento conserva su acción requerida.
4. **Entregar.** En operaciones de escritura guarda la información sustantiva en los artefactos y resume rutas, hallazgos y pendientes en el chat. En una consulta devuelve el estado con citas. **Cierre:** el usuario puede localizar el resultado y distinguir lo confirmado de lo pendiente.
