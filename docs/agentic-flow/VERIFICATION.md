# Verificación de las dos cadenas

Se verifica el recorrido funcional solicitado: planificación completa y arquitectura completa en dos cadenas.

## Resultados · 17 de octubre de 2026

| Comprobación | Resultado |
|---|---|
| Modelo y recorridos | 5 tests aprobados |
| Geometría estática, ambos temas | `audit passed`; 139 sólidos en planificación y 109 en arquitectura, sin incidencias |
| Hojas en movimiento | Recorridos completos comprobados a 60 Hz: soporte, estaciones, cruces y contadores |
| Navegador de escritorio | Los 27 pasos, selección de estaciones, teclado, temas y movimiento reducido aprobados |
| Navegador móvil | Ambos temas a 390 px; navegación y desplazamiento interno de las cadenas aprobados |
| Reproducción encadenada | Las dos fases terminan en 3 historias y 9 tareas; pausa al señalar y suspensión fuera de pantalla aprobadas |
| Finales de línea | 0 flotantes: 1.234 extremos en planificación y 814 en arquitectura |
| Inspección visual | Vista completa, consultas, respuestas, cotejo, tres revisores, móvil y ampliaciones 4× en ambos temas |

Las auditorías de Anatomy registran la geometría estática real. Las pruebas del modelo verifican por separado los paquetes que se desplazan sobre ella. Todas las comprobaciones de navegador finalizaron con consola limpia.

## Comprobaciones

- El modelo entrega tres originales conservados y tres Historias Refinadas al terminar la primera fase.
- Cada consulta de un refinador tiene una respuesta que recorre el trayecto inverso hasta ese mismo refinador.
- El revisor de planificación recibe originales y propuesta conjunta por dos rutas diferentes.
- Test, Back y Front consultan al proveedor, tienen un revisor propio y devuelven las tareas al arquitecto principal.
- Las nueve tareas de ejemplo pasan por las revisiones de área antes de entregarse.
- Los módulos físicos de transportador se tocan sin solaparse.
- Se comprueba a 60 Hz que las hojas no salen de las bandas, ni atraviesan estaciones, ni chocan entre sí.

Los comandos y las capturas reproducibles se describen en [README.md](README.md). La comprobación de la maqueta y su modelo no ejecuta los agentes ni genera tareas reales.
