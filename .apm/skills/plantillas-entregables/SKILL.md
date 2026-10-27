---
name: plantillas-entregables
description: 'Historia, criterios de aceptación en Gherkin, Tarea, Encargo, Revisión y Caso de Test: define el formato Markdown al redactar, integrar o revisar estos entregables y sus contenedores.'
---

# Plantillas de entregables

1. **Elegir.** Abre solo la referencia del contenido que vas a redactar o comprobar:
   - [Historia](references/historia.md): historia refinada, división, `borrador.md` e incidencias de planificación.
   - [Criterios de aceptación](references/criterios-aceptacion.md): escenarios Gherkin de las historias y su correspondencia de solo lectura para casos de test.
   - [Tarea](references/tarea.md): bloque técnico o propuesta de subtarea para el gestor.
   - [Encargo](references/encargo.md): delegación a un especialista o paquete pendiente de capacidad.
   - [Revisión](references/revision.md): `sanity-check.md`, disputa e historial de versiones revisadas.
   - [Caso de Test](references/caso-test.md): caso UI, matriz parametrizada y `borrador-tests.md`.
   **Fin:** cada parte de la entrega tiene un formato y productor identificados.
2. **Aplicar la autoridad.** Esta skill es la fuente normativa de esos formatos. Para clasificar, redactar o evaluar el valor y los criterios de una historia, consulta [user-stories](../user-stories/SKILL.md) y sus ramas pertinentes. Para alcance técnico, estados y entrega integrada, lee el contrato `flujo-arquitectura.md` instalado en `.opencode/flujo-arquitectura.md`. El formato organiza la evidencia; no amplía el alcance ni concede una aprobación.
   - Al citar fuentes, distinguir hechos/propuestas o registrar inaccesibilidad, lee [fuentes y evidencias](../operativa-comun/references/fuentes-evidencias.md).
   - Al publicar, corregir, solicitar/comprobar revisión o continuar un encargo, lee [publicación y revisión](../operativa-comun/references/publicacion-revision.md): es la norma de versión, guardado e intentos, incluidos límite, cómputo e historial en arquitectura.
   - Si falta un ajuste de proyecto, guardado o límite, lee [configuración](../operativa-comun/references/configuracion.md) y usa la herramienta autorizada del rol.
   **Fin:** cada decisión material tiene fundamento o está identificada como propuesta o pendiente; cualquier conflicto de autoridad tiene pregunta y responsable.
3. **Completar.** Copia la estructura, sustituyendo marcadores. Redacta en el idioma del encargo o de las fuentes que establezca el productor, incluidos los encabezados traducidos de forma consistente. Conserva nombres de archivo, identificadores y literales de las fuentes. Mantén todos los apartados obligatorios: usa «Ninguno», «No aplica: motivo» o «Pendiente: efecto y pregunta», según corresponda. Los campos opcionales se omiten si no aportan información. Usa tablas para trazabilidad, cobertura y matrices; texto y listas para el resto.
   **Excepciones:** los originales son copias fieles, no se reescriben con estas plantillas. Una consulta puntual conserva la respuesta proporcional del rol. Los formatos especializados y las salidas automáticas conservan su propia fuente, identificada en el catálogo del README.
   **Fin:** no quedan marcadores sin resolver y se distinguen acuerdos, propuestas y pendientes.
4. **Cotejar.** Recorre todas las fuentes y criterios, incluidos los no cubiertos; comprueba identidad local frente a clave real, historia padre única de tareas/casos, dependencias, versión exacta e historial cuando corresponda. Aplica el cierre de la referencia elegida y del rol. Una entrega parcial termina con cada parte pendiente y su siguiente acción explícitas.
