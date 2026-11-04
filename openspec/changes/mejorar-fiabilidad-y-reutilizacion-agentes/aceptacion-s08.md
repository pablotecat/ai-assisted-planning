# Aceptación e integración S08 — 2026-11-04

## Estado actual

Continuación limitada a S08 desde [el handoff de pausa](handoff-continuacion.md), en `feat/fiabilidad-agentes-s07`, base `f883b5c`. **8.2–8.5 verificadas; 8.6 pendiente de regresión final. Progreso 51/78.** El driver se revisa antes de cualquier ensayo con modelo. No se inician S09–S14, no hay push ni archivo OpenSpec.

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

**Driver aceptado e integrado:** `0a05983` → `c0c389b`, correcciones privadas `4cb2ac4` → `523b67f`. Las cuatro fuentes de prueba son las contrastadas; los worktrees originales no se modifican. Falta la regresión raíz final antes de decidir el ensayo real.

## Presupuesto y exclusiones

**Ningún modelo nuevo ejecutado.** Saldo intacto: **4 ensayos y 47 min 41,959 s**. Modelo autorizado `plainconcepts/glm-5-3`, sin fallback automático; 360 s de flujo / 600 s totales por ensayo. No se repiten 1.4, 2.4 ni 7.5. La preparación determinista consume cero plazas.

Servicio y credenciales compartidos sin modificaciones. Conservadas las evidencias históricas y diagnósticos, incluidos fallos APM. Intocables y fuera de los cambios: `docs/example-test/`, `docs/planes/DIAGNOSTICO-adaptador-de-sesion-no-disponible.md`, `docs/planes/plan-mejora-agentes-tools-skills.md`.
