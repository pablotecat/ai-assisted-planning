# Aceptación e integración S08 — 2026-11-04

## Estado actual

Continuación limitada a S08 desde [el handoff de pausa](handoff-continuacion.md), en `feat/fiabilidad-agentes-s07`, base `f883b5c`; implementación integrada hasta `69eddbc`. **S08 cerrada técnicamente (8.1–8.6), progreso 52/78**, por elección explícita del usuario de la opción A el 2026-11-04. La conducta completa con modelo sigue sin acreditar y se comprobará dentro de S14, sin repetir ahora un ensayo exclusivo S08. Se conservan los resultados fallidos sin reinterpretarlos como éxito. No se han iniciado S09–S14, ni hecho push o archivo OpenSpec.

## Recuperación y aceptación del runtime

- Los cuatro worktrees conservaban sus HEAD y cambios registrados. Los parches locales coinciden byte a byte con `build/handoff-r2-wip/`: revisión **4799 bytes**, SHA-256 `f4b93a275d1161e503ecf3ea52396075fc02b7da44c3f98b5cdaadaf0bb37bf3`; contratos **22677 bytes**, SHA-256 `049db500bb1f7e049f13ccca39ac2f9c5a5e0f2c8c9fd847226096e38cc81f0c`. Los originales y respaldos siguen intactos; no se reactivan sesiones archivadas.
- Revisados `db54ead` → `1985bc7`, `f6017dd` y sus dos parches pendientes. Integrados en raíz como `898153e`, `843e013`, `9a0a737`, más los parches exactos. No se repite la aceptación histórica de S01–S07/S12.
- La revisión contrasta inventario combinado hasta `cursor:null`, `share` limitado a quien gestiona ambos encargos compatibles, revalidación del blob, matriz por rol y ausencia de persistencia con guardado desactivado. Cobertura/versión siguen siendo declaraciones; hash y bytes son verificaciones del runtime, no recibos HTTP ni garantía de vigencia.
- Los dos rojos de JSON textual quedan cubiertos: conservación exacta de espacios/orden/CRLF incluso con etiqueta `objeto_serializado`, y diagnóstico del envoltorio desconocido recibido como string. Un objeto realmente recibido sigue serializándose determinísticamente.
- El ajuste 8.5 demuestra lectura de la fuente **antes** del informe v1, cita ID/hash, recuperación intacta del informe durante v2 y ausencia de aprobación heredada. La aceptación añade lectura propia de ambas entregas completas y negativos de paginación inversa, suplantación y blob adulterado en `share`.
- Los contratos documentados coinciden con los argumentos combinados: lectura con `artefacto_id` usando el ID de instantánea; solo `share` recibe `instantanea_id`. Permiso dedicado de captura únicamente en cinco roles con Code Mode; Revisor conserva `execute` sin captura; ambos alias Jira siguen en solo lectura.

## Pruebas ejecutadas y límites

| Comprobación | Resultado |
| --- | --- |
| Repetición en worktrees originales | 9 locales de reutilización correctas; los consumidores de reutilización/permisos fallaron al arrancar el verificador antiguo, antes de comprobar S08. Logs `build/verify-s08-resume-{reuse,permissions}.log`. |
| Combinación sobre la base actual | **12/12**, sin fallos/omisiones; `build/verify-s08-combined-acceptance.log`. Evidencias privadas `source-reuse-Z8rG6I`, `source-perm-A59NJK`. |
| Negativos adicionales y lectura de entregas 8.5 | **2/2** en el candidato privado `s08-acceptance-20261104`. |
| Suite raíz del runtime integrado | **147 correctas, 1 fallo, 1 cancelada, 0 omitidas**, 452106,8031 ms. `build/verify-s08-runtime-integrated-root.log`. Cancelación por timeout de 240 s en actualización APM; fallo `spawnSync cmd.exe ETIMEDOUT` en distribución APM. Las pruebas S08 y publicación/reload pasaron. No se atribuye la causa ni se considera verde la suite. |
| Repetición aislada de APM | **2/2**, sin fallos/cancelaciones/omisiones, 272236,7898 ms; `build/verify-s08-apm-isolated.log`. No acredita la causa de los fallos anteriores. |
| Regresión combinada final del runtime y driver integrado | **169/169**, sin fallos/cancelaciones/omisiones, **408792,7135 ms**, sobre `5fa48e1`; `build/verify-s08-final-root.log`. Comando `node --test --test-concurrency=2 *.test.ts`: solo se reduce la concurrencia del runner, sin omitir archivos/pruebas, modificar timeouts ni cambiar límites de agentes. No se solapa con otra suite raíz. |

En el fixture de reutilización se observa **una recuperación común y cero adicionales** para la segunda pregunta, con pendientes separados. En permisos, **una lectura por alias** y ninguna al releer la instantánea; `{guardado:false}` exacto y control intacto antes/después de reload real. Son proveedores programados, no conducta elegida por un modelo ni consultas actuales a Jira/Codegraph.

`npm install` correcto, sin cambiar dependencias declaradas; informa las 28 vulnerabilidades conocidas (24 moderadas, 4 altas), sin actualizaciones ajenas. El fallo de los worktrees antiguos usa su infraestructura anterior al ajuste de transporte ya integrado: se conserva el diagnóstico, sin modificar timeouts ni atribuir la causa histórica de APM.

## Driver: aceptación determinista, no conducta con modelo

El original `0a05983` no se acepta sin correcciones. Se reproducen tres falsos positivos: líneas numeradas con contenido contradictorio, reutilización con cero recuperaciones/lecturas, y captura asociada solo al mensaje aunque el execute sea otro. Registro local `build/verify-s08-original-driver-reds.json`.

Las correcciones quedan inicialmente aisladas en `s08-acceptance-20261104`:

- Observador nativo del input exacto, admisión durable, ejecución terminada y respuesta final del turno 1 **antes** de enviar el 2. Un idle antiguo no basta.
- Recibos de captura con argumentos/resultados reales y el ID del **execute exterior exacto**, ligados al resultado del fixture; tipo recibido distinto de etiqueta declarada.
- Contador por invocación interna, incluidas páginas de comentarios, repeticiones y sesiones delegadas. Tres recuperaciones del recorrido común: issue y dos páginas; ninguna se infiere del número de executes.
- Lecturas completas con contenido, cursores, archivo, encargo, corpus y actor contrastados; no se ensamblan páginas entre actores. Cobertura por componentes de una versión coherente, sin exigir que cada página contenga el issue entero.
- Publicación reutiliza el verificador exacto de informe S02 (llamada/argumentos/digest/manifiesto/bytes). Revisor opcional: lecturas propias completas de fuente y entrega **previas** al informe, dictamen de versión exacta e informe confirmado con sus bytes.
- Guard de consentimiento y límites 360000/600000 ms, interrupción por query, limpieza solo del árbol propio y credencial no comprobada como `unknown`. Se mantiene `review_required` / `sufficientForS08:false` y revisión semántica separada.

Pruebas: **18/18** deterministas/adversariales (`build/verify-s08-driver-adversarial.log`) y **1/1** recorrido nativo privado (`build/verify-s08-driver-native-review.log`, evidencia `s08-driver-native-dlOKHB`), con cuatro capturas, tres recuperaciones observadas en turno 1 y cero en turno 2, fuente y páginas completas reutilizadas. La exportación adicional del observador dio después un **500 de RPC** por campos `undefined` (18/19; `build/verify-s08-driver-accepted.log`, consumidor `s08-driver-native-4SDNdq`); se corrige únicamente la proyección JSON del fixture, sin tocar el runtime. Conjunto final **19/19**, sin fallos/cancelaciones/omisiones, **56977,1898 ms**; `build/verify-s08-driver-final-acceptance.log`, evidencia `s08-driver-native-iiUTpb`. Incluye exportación completa de eventos y fronteras nativas de ambos turnos. Los fallos auxiliares de importación Windows y de formato de un probe de recibos no se interpretan como fallos del paquete.

**Driver aceptado e integrado:** `0a05983` → `c0c389b`, correcciones privadas `4cb2ac4` → `523b67f`. Las cuatro fuentes de prueba son las contrastadas; los worktrees originales no se modifican. La conversión LF/CRLF de Git en la integración se contrastó sin diferencias de código; la suite raíz incluye de nuevo el driver nativo sobre los bytes instalados desde raíz.

**Último ajuste exclusivo de pruebas:** `1660b8c` → `69eddbc`, sin cambios de producción posteriores a la suite 169/169. El issue ahora devuelve solo el contador de comentarios, no sus cuerpos: las dos páginas son necesarias de verdad. Se admiten nombres de fuente por componente, campos `fields.*` y la versión opcional cuando los hashes/recibos prueban componentes del fixture invariante; una versión declarada incompatible sigue bloqueando completitud. El dictamen del Revisor exige también ambas páginas. El supervisor reserva 6 s de su ventana para terminación del árbol privado y evidencia, sin ampliar los 600 s autorizados.

Validaciones posteriores a la suite raíz: variantes de componentes **19/19**, paginación real **19/19**, previo al ensayo en candidato **19/19** (`build/verify-s08-driver-pretrial.log`, `s08-driver-native-f7r1xI`) y repetición del driver ya integrado en raíz **19/19**, **37288,4435 ms** (`build/verify-s08-driver-integrated-pretrial.log`, `s08-driver-native-6cJU5I`). Esta última valida exactamente los bytes actuales instalados desde raíz. No se repite otra suite de producción para estos tres archivos de prueba aislados; los 169 resultados anteriores y la comprobación dirigida posterior se mantienen separados.

## Ensayo autorizado S08

**Concluido sin aceptación:** un único ensayo con `plainconcepts/glm-5-3` desde `69eddbc`, posterior a la aceptación determinista y la regresión. Sin fallback ni reintentos. Evidencia `C:\Users\potero\AppData\Local\Temp\opencode\s08-model-KeD86u`; log `build/verify-s08-authorized-model.log`, cronómetro externo `build/verify-s08-authorized-budget.json`.

- Ventana real externa **343048,1885 ms** (5 min 43,048 s), dentro de 600000 ms. Input del turno 1 enviado a 08:41:06.601Z; espera nativa 08:41:13.240Z–08:46:18.916Z, terminada con **`fetch failed`**, no con una respuesta final. El error no conserva su causa de transporte; no se atribuye a cuota, proveedor ni a un timeout concreto del cliente.
- Una sesión, **14 mensajes asistente**, todos con modelo efectivo `plainconcepts/glm-5-3`; **un solo input de usuario y cero respuestas finales `stop`**. El último mensaje conservaba una llamada `session_work` en estado `streaming`. El driver **no envió el turno 2**: la barrera de final del primero funcionó. No hay prueba de reutilización ante Q-GARANTIA y no puede inferirse de «cero lecturas en turno 2».
- Se conserva una publicación confirmada `c4f6ba62-f7a5-4ced-980b-189280f65f32`, manifiesto `c142f42e0c2111b98cab53477cb542213d6e93b3fa5200938385fd509ff186de`, informe de 6215 bytes y resumen de 2229. El contenido responde Q-CANCELACION/Q-ABONO y separa sus pendientes; no equivale al cierre del turno ni a la aceptación del ensayo.
- Se observan **seis recuperaciones exitosas** (issue dos veces, primera página de comentarios tres, segunda una), además de un rechazo inicial de `cloudId` URL. Hay tres instantáneas, capturadas en el mismo execute de su recuperación. Las lecturas previas para inspeccionar formato y la comprobación posterior de fechas no expuestas quedan registradas: **no se certifica ahorro general ni ausencia de repeticiones con modelo**. El informe afirma que cada recuperación se capturó, pero el contador demuestra lecturas previas adicionales; esa afirmación no se acepta literalmente.
- El fixture no exponía `status`, `updated` ni fechas de comentarios; el agente buscó esos metadatos y conservó sus límites. El corpus fue declarado `jira:fixture.atlassian.net`, compatible con su encargo y distinto del identificador del sitio; no deben confundirse ambos conceptos en futuros verificadores.
- Recuperación parcial completa de árbol/historial, estados y eventos, sin errores secundarios declarados; interrupción nativa con `resume=false` devolvió **`interrupted:true`**. El cotejo posterior de credencial devolvió **`activeCredentialUnchanged:true`**. El servidor privado terminó por el teardown del driver, sin intervenir el servicio compartido. `summary.json` permanece `check:"failed"` / `sufficientForS08:false`.

**Decisión posterior del usuario — opción A, 2026-11-04:** cerrar técnicamente S08 con las pruebas verificadas y conservar los tres ensayos restantes. **8.6 se marca completa (52/78)** por sus criterios técnicos ya demostrados, no por aprobar el ensayo fallido. La prueba de conducta de reutilización entre preguntas se incorpora expresamente al criterio 14.1 de la campaña integrada. No se reabre S08 ni se ejecuta otro ensayo exclusivo suyo sin nueva autorización. Esto habilita las dependencias técnicas de S09, S10 y S13 según D12; no acredita aún conducta completa con modelo, Jira/Codegraph reales ni lectura visual de adjuntos.

## Presupuesto y exclusiones

**Saldo tras el ensayo S08:** **2/5 consumidas, 3 restantes y 2518910,8115 ms (41 min 58,911 s)** agregados disponibles, descontando conservadoramente toda la ventana externa. Modelo autorizado `plainconcepts/glm-5-3`, sin fallback automático; 360 s de flujo / 600 s totales por ensayo. No se repiten 1.4, 2.4 ni 7.5. Toda la preparación determinista consumió cero plazas.

Servicio y credenciales compartidos sin modificaciones. Conservadas las evidencias históricas y diagnósticos, incluidos fallos APM. Intocables y fuera de los cambios: `docs/example-test/`, `docs/planes/DIAGNOSTICO-adaptador-de-sesion-no-disponible.md`, `docs/planes/plan-mejora-agentes-tools-skills.md`.

## Entrada para la siguiente sesión

1. Leer este registro vigente y `tasks.md`; el handoff de pausa del 2026-11-03 es histórico, no el estado actual. Comprobar rama/HEAD y cambios locales sin restaurar ni volver a integrar los worktrees antiguos.
2. Empezar S09 con su spec y D09/D12: probar la capacidad nativa de presentar un PNG sintético antes de preparar un ensayo visual. Un HTTP 200, firma PNG o dimensiones no acreditan que el modelo haya recibido y leído la imagen.
3. Reservar inicialmente un ensayo para S09, otro para S13 y otro para S14. Validar antes cada driver, captura, límites y limpieza; usar solo `plainconcepts/glm-5-3`, sin fallback. Si no hay capacidad visual compatible, registrar el bloqueo sin gastar un ensayo, inventar éxito, construir OCR o ampliar permisos.
4. Si S09 queda bloqueada por capacidad del entorno, S10 puede avanzar independientemente porque depende de S08, no de S09. Mantener un único frente principal; no abrir toda la campaña a la vez. S11 requiere S10; S14 requiere las capacidades previas según D12 y conserva la comprobación de conducta S08 pendiente.
5. Reutilizar las pruebas y contratos ya aceptados. Las regresiones por código nuevo siguen siendo necesarias, pero no volver a diagnosticar el ensayo S08 ni los fallos históricos APM por iniciativa propia. Separar siempre resultados técnicos, proveedores programados, conducta con modelo y servicios reales.

**Verificación del cierre documental:** OpenSpec confirma **52/78** y validación estricta sin incidencias; comprobaciones de enlaces/catálogo/contrato de arquitectura **3/3** y `git diff --check` sin errores (solo aviso LF/CRLF). No se repite la suite raíz ni se ejecuta otro modelo para registrar esta decisión.
