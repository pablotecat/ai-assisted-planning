# Publicación y revisión

## Herramienta y guardado

Usa exclusivamente el publicador autorizado por rol y rama:

Si necesitas resolver su interfaz o diagnosticar un impedimento, aplica [herramientas y autorizaciones](configuracion.md#herramientas-y-autorizaciones) antes de atribuir indisponibilidad o fallo.

| Consumidor / rama | Herramienta |
|---|---|
| Investigador directo | `write_report_pair` |
| Investigador delegado, lectores, Refinador, Arquitecto y Test | `publish_agent_deliverable` |
| Planificador: originales | `write_planning_originals` |
| Planificador: entrega | `write_planning_deliverables` |
| Revisor: informe o disputa | `write_review_documents` |

Respeta el guardado configurado. Anuncia solo rutas reales devueltas tras comprobar `guardado:true`; devuelve siempre el contenido al solicitante. Con guardado desactivado o fallido, entrega el contenido y comunica su estado o fallo sin atribuirle una ruta guardada. Conserva los nombres y formatos exigidos por cada rol. Las correcciones se publican como versiones completas, nunca parches ni sobrescrituras de versiones anteriores.

## Revisión de versión exacta

Remite al Revisor la ruta confirmada del archivo o carpeta, el encargo y las fuentes pertinentes. Una carpeta se revisa completa; un archivo versionado se revisa exactamente como fue publicado. El informe identifica entrega y versión, fuentes consultadas, cobertura, hallazgos con evidencia e impacto, corrección requerida y número de intento si procede. Contrasta hallazgos previos en continuaciones; una modificación no hereda aprobación automáticamente.

El Revisor publica el informe incluso sin hallazgos mediante `write_review_documents(entrega, sanidad)`; una disputa persistente se adjunta a esa misma versión con `write_review_documents(entrega, disputa)`. Comprueba `guardado:true`, rutas e identidad de la versión antes de atribuir aprobación. Un fallo o ausencia de revisión no aprueba la entrega. Si falla o se desactiva el guardado del Revisor, devuelve el dictamen y el fallo: no existe informe guardado verificable.

## Intentos — solo flujo de arquitectura

Esta definición se aplica a Arquitecto y especialistas del contrato de arquitectura, incluido Test; no añade un contador a los otros flujos. `MAX_INTENTOS_REVISION` limita las solicitudes totales por encargo de especialista, incluida la inicial y las correcciones. El límite debe ser entero positivo y el contador entero entre cero y el límite. Empieza en cero solo para un encargo nuevo.

La solicitud enviada consume un intento aunque falle o no pueda verificarse; una publicación fallida antes de solicitarla no consume. La revisión requiere borrador publicado e informe guardado junto a la versión exacta: con publicación fallida o guardado del especialista/Revisor desactivado, devuelve contenido y bloqueo, sin solicitar revisión sin publicación confirmada.

Registra en versiones, informes y handoff los intentos anteriores, número solicitado, entrega exacta, resultado y rutas confirmadas. Reapertura, aprobación parcial y cambio material conservan el contador; un cambio material exige revisar su nueva versión dentro del mismo límite. Sin historial verificable, bloquea nuevas revisiones hasta recuperarlo. Al agotar el límite devuelve hallazgos y bloqueo, conservando aprobados independientes; abrir otro encargo no reinicia el mismo trabajo. El contador es documental y de flujo, no automático del publicador.
