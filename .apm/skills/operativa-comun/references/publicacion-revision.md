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

## Identidad de operación y reintentos

Antes de la primera llamada a cualquiera de los cinco publicadores, asigna `operacion_id` a esa publicación concreta: 1–128 caracteres, comenzando por letra o número, seguidos de letras, números, `_`, `.`, `:`, `-`. Conserva el valor y la petición completa en la continuación y el handoff. Si necesitas repetir por interrupción o respuesta perdida, reenvía la misma identidad y los mismos contenidos/metadatos, también después de recargar el location. La herramienta vuelve a comprobar identidad, autoría y guardado mediante el runtime en cada llamada; `operacion_id` no declara productor ni concede permisos.

Con `guardado:true`, comprueba las rutas, `artefacto_id` y `hash_manifiesto` devueltos. La misma identidad y petición recuperan ese resultado; otra petición con esa identidad se rechaza. Una corrección deliberada del productor usa otra identidad y publica todos sus archivos como una versión completa. Conserva los originales y las versiones previas. Los originales del Planificador siguen admitiendo una sola publicación: repetir su operación no los duplica ni autoriza corregirlos. El ID nuevo tampoco autoriza sobrescribir informes del Revisor: conserva su contrato de adjuntar sanidad o disputa a una entrega exacta.

Si llega `indice.actualizado:false`, la publicación ya está confirmada: comunica el aviso y reintenta la misma operación para reparar el índice, sin regenerar la entrega. Un archivo parcial o una carpeta existente sin confirmación no acreditan publicación. Un bloqueo sin propietario demostrablemente inactivo o un destino ajeno requieren resolver el impedimento; no los elimines ni cambies de identidad para saltarlos.

Los consumidores antiguos pueden omitir `operacion_id`, pero cada llamada conserva su efecto anterior y no garantiza recuperación entre turnos: no deduzcas identidad por contenido, `messageID` o ID de llamada. Con `guardado:false` no se crean artefactos ni operaciones persistentes, tampoco para simular recuperación. Los manifiestos nuevos identifican bytes y rutas de archivos del productor; los informes del Revisor se registran aparte. Un cambio externo o un archivo no registrado dentro de la carpeta de entrega bloquean su verificación. El historial anterior conserva sus rutas e informes narrativos, sin inferir encargo, autoría nueva ni aprobación estructurada.

## Promoción de archivos completos

Cuando el archivo final ya existe registrado y has comprobado que cumple el formato de destino, usa su origen en lugar de reemitir el contenido. Cada referencia tiene `{artefacto_id, archivo, sha256}`: `archivo` es la ruta relativa exacta del manifiesto de ese artefacto y `sha256` su hash de bytes. Las publicaciones nuevas devuelven `archivos[{path,sha256,bytes}]` junto a las rutas: conserva esa lista en el handoff para formar referencias sin leer de nuevo el documento ni ampliar permisos. Los reintentos de operaciones anteriores conservan su resultado anterior, que puede no incluirla. No suministres rutas absolutas ni deduzcas el hash desde una paráfrasis. Por archivo debes elegir **solo una** modalidad:

| Publicador | Literal anterior | Alternativa registrada |
|---|---|---|
| `publish_agent_deliverable` | `contenido` | `origen` |
| `write_report_pair` | `resumen_ejecutivo`, `informe_detallado` | `origen_resumen_ejecutivo`, `origen_informe_detallado` |
| `write_planning_deliverables` por historia | `contenido`, `incidencias` | `origen_contenido`, `origen_incidencias` |
| `write_planning_deliverables` global | `incidencias_globales` | `origen_incidencias_globales` |

Se pueden combinar archivos literales y promovidos, conservando la petición completa y `operacion_id`. Planificador enumera todas las historias, cada incidencia y el informe global, también al corregir. Si reutiliza una entrega registrada del Planificador, debe conservar todos sus nombres de archivo; un archivo puede sustituirse con contenido literal, pero no omitirse. Originales y documentos del Revisor mantienen sus modalidades literales.

El runtime admite archivos propios y, para Planificador, archivos de sus Refinadores directos con identidad y árbol comprobados. No concede acceso a hermanos, otras raíces o productores no autorizados; todavía no existe autorización adicional por registro de trabajo/corpus. El origen conserva su productor; el destino pertenece a quien publica. Hash incorrecto, origen alterado, archivo no registrado o ruta enlazada bloquean la promoción antes de preparar la entrega. Los bytes se copian sin cambios y el origen queda intacto; revisión y aprobación no se transfieren.

Para historias, la promoción exige archivos finales separados con el mismo nombre lógico de destino (`<ID>.md`, `<ID>-incidencias.md`, `incidencias-globales.md`). `borrador.md` sigue siendo el contenedor del Refinador: no se extrae ni renombra automáticamente como historia final. Si solo existe ese contenedor o hay que integrar/corregir texto, publica los archivos finales completos mediante los argumentos literales. La comprobación del formato sigue correspondiendo a productor y Revisor; esta modalidad no incorpora el validador M08 ni transformaciones.

## Revisión de versión exacta

Remite al Revisor la ruta confirmada del archivo o carpeta, `artefacto_id`, `hash_manifiesto`, el encargo y las fuentes pertinentes. Una carpeta se revisa completa; un archivo versionado se revisa exactamente como fue publicado. El informe identifica entrega y versión, fuentes consultadas, cobertura, hallazgos con evidencia e impacto, corrección requerida y número de intento si procede. Contrasta hallazgos previos en continuaciones; una modificación no hereda aprobación automáticamente.

El Revisor publica el informe incluso sin hallazgos mediante `write_review_documents(entrega, sanidad, dictamen)`; una disputa persistente se adjunta a esa misma versión con `write_review_documents(entrega, disputa)`. En el flujo actualizado, `dictamen` contiene `{artefacto_id, hash_manifiesto, resultado, alcance, aprobados, pendientes, bloqueados}`. `resultado` es `favorable`, `parcial` o `con_hallazgos`; las cuatro listas contienen IDs de elementos del alcance de la entrega completa. Cada ID del alcance tiene exactamente un resultado. `favorable` declara que el alcance completo está aprobado; `parcial` conserva aprobados y pendientes/bloqueados sin aprobación completa. Usa el mismo resultado en el informe y los campos estructurados; la herramienta comprueba su estructura, no la suficiencia semántica del alcance declarado.

Solo el Revisor delegado directamente por ese productor registra el dictamen, con `sanidad` en la misma operación y entrega/hash coincidentes. El registro se confirma junto al artefacto del informe, después de materializarlo y verificarlo. Las llamadas anteriores sin `dictamen` siguen guardando informes narrativos, incluso en historial sin identidad registrada, sin inferir aprobación a partir del texto. No adjuntes un dictamen nuevo a un informe existente para cambiar su interpretación; los informes no se sobrescriben.

Comprueba `guardado:true`, rutas e identidad de la versión antes de atribuir aprobación. Un fallo o ausencia de revisión no aprueba la entrega. Si falla o se desactiva el guardado del Revisor, devuelve el dictamen y la limitación: no existe aprobación persistida por ese intento. Con `guardado:false` se conserva exactamente esa respuesta, sin rutas ni registros nuevos; el dictamen permanece en la conversación.

`indice.md` separa última publicada, última revisada y última aprobada completa por sesión productora y tipo de publicación; no inventa IDs de encargo para el historial. Una revisión narrativa cuenta como revisada, no como aprobada estructuradamente. Cada versión mantiene archivos, informes, hash y resultados propios: una revisión tardía de v1 no revisa v2, y una versión promovida empieza sin revisión propia aunque tenga los mismos bytes. Las listas parciales se conservan por elemento. Esta aprobación de publicación no sustituye la integración, las dependencias ni los estados globales del contrato de arquitectura.

## Intentos — solo flujo de arquitectura

Esta definición se aplica a Arquitecto y especialistas del contrato de arquitectura, incluido Test; no añade un contador a los otros flujos. `MAX_INTENTOS_REVISION` limita las solicitudes totales por encargo de especialista, incluida la inicial y las correcciones. El límite debe ser entero positivo y el contador entero entre cero y el límite. Empieza en cero solo para un encargo nuevo.

La solicitud enviada consume un intento aunque falle o no pueda verificarse; una publicación fallida antes de solicitarla no consume. La revisión requiere borrador publicado e informe guardado junto a la versión exacta: con publicación fallida o guardado del especialista/Revisor desactivado, devuelve contenido y bloqueo, sin solicitar revisión sin publicación confirmada.

Registra en versiones, informes y handoff los intentos anteriores, número solicitado, entrega exacta, resultado y rutas confirmadas. Reapertura, aprobación parcial y cambio material conservan el contador; un cambio material exige revisar su nueva versión dentro del mismo límite. Sin historial verificable, bloquea nuevas revisiones hasta recuperarlo. Al agotar el límite devuelve hallazgos y bloqueo, conservando aprobados independientes; abrir otro encargo no reinicia el mismo trabajo. El contador es documental y de flujo, no automático del publicador.
