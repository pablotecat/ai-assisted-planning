# Handoff de pausa — 2026-11-03

## Punto de entrada

**Campaña detenida por petición del usuario.** Este documento sustituye los estados «en curso» del tramo R2 de [tasks.md](tasks.md). Continuar solo tras una nueva solicitud; recuperar lo existente antes de abrir más frentes.

- Rama: `feat/fiabilidad-agentes-s07`; HEAD anterior a este handoff: `a722de2effefd6d1371c1acd92ef95a3ce0f0ab0`.
- Progreso comprobado por `openspec list --json`: **47/78**. S01–S07 y S12 completas; S08 solo **8.1** verificada. **8.2–8.6 siguen pendientes**. S09–S11, S13 y S14 no implementadas.
- Última suite raíz completa: **137/137**, cero fallos, cancelaciones u omisiones, **262292,6995 ms**, sobre `24a4db4`. Log: `build/verify-campaign-r2-core-root.log`. No cubre las entregas privadas pendientes.
- No hay integración nueva de runtime, permisos ni driver durante la pausa; el commit del handoff contiene solo documentación de continuidad.

## Sesiones cerradas y trabajo conservado

Se interrumpieron con `resume=false` los cuatro subagentes activos; cada operación devolvió `interrupted:true`. Se archivaron las **23 sesiones hijas directas** de la campaña, sin borrar su historial. La comprobación posterior mostró solo al orquestador activo y ningún shell hijo en ejecución.

Registro: `build/campaign-pause-sessions.json`. Sesión raíz: `ses_e5ec4bfb7ffeX44NsNgv01W5mG`.

| Frente detenido | Sesión |
| --- | --- |
| R2-D, ajuste de prueba 8.5 | `ses_e5cbf33d9ffejknGrOSYF4dA0l` |
| R2-E, permisos y contratos 8.6 | `ses_e5cbe6d5fffemmbw2R68SLS5gi` |
| R2-B, aceptación independiente del runtime | `ses_e5e3e6097ffeNQJ4oKFFdCeMqx` |
| Aceptación independiente del driver | `ses_e5c9414efffeojjasBLFjao5Km` |

El archivo de sesiones **no archiva el cambio OpenSpec**. Conservar worktrees y diagnósticos; consultar los archivos persistidos, sin reactivar sesiones solo para pedir estado. Algunos mensajes anteriores de «continúo trabajando» llegaron como resultado final de una sesión ya inactiva: no equivalen a trabajo ejecutándose.

## Entregas privadas pendientes de aceptación

Todos los directorios de esta sección están bajo `C:\Users\potero\AppData\Local\Temp\opencode\`. Sus estados se comprobaron después de detener los trabajadores.

| Worktree | HEAD y estado | Contenido |
| --- | --- | --- |
| `campaign-s08-reuse-20261103` | `1985bc7`, limpio | Cadena `db54ead` → `1985bc7`: inventario/share, pruebas de reutilización/Revisor y correcciones JSON. Base `44a33a7`. |
| `campaign-s08-review-fix-20261103` | `1985bc7`, **sucio** | Ajuste exclusivamente de `session_source_reuse.test.ts` para acreditar el cotejo anterior a v1. Sin commit. |
| `campaign-s08-contracts-20261103` | `f6017dd`, **sucio** | Permiso dedicado, roles, referencias y pruebas; cinco archivos adicionales alineados con el contrato final. |
| `campaign-s08-model-driver-20261103` | `0a05983`, limpio | Driver S08 y pruebas deterministas. Revisión independiente interrumpida, sin aceptación final. |

Hashes completos para recuperar las entregas:

```text
db54ead830fdb1d7a691518f3c51c385b8753014
1985bc7c54ebcf2af904d98abec515ad545168ec
f6017dd5207a491bd6fc4d79147a70272d73dfa5
0a0598385a5d5237440c779e220589546c065106
```

### Cambios sin commit y copias de seguridad

- `campaign-s08-review-fix-20261103`: `session_source_reuse.test.ts`. Copia: `build/handoff-r2-wip/review-fix.patch` (**4799 bytes**).
- `campaign-s08-contracts-20261103`: `.apm/skills/consulta-jira/SKILL.md`, `.apm/skills/operativa-comun/references/fuentes-evidencias.md`, `.apm/skills/operativa-comun/references/publicacion-revision.md`, `README.md` y `tools/capture_agent_source.ts`. Copia: `build/handoff-r2-wip/contracts.patch` (**22677 bytes**).

Las copias son `git diff --binary` de los cambios locales; no incluyen los commits privados. Los cambios siguen aplicados en sus worktrees: cotejar antes de restaurar una copia, para no aplicarla dos veces. `build/` está ignorado y no viaja con el commit del handoff.

## Qué queda por aceptar en S08

Leer [spec de evidencia reutilizable](specs/evidencia-reutilizable/spec.md), [diseño D05/D08](design.md) y los propietarios indicados por [AGENTS.md](../../../AGENTS.md), sin repetir exploración global.

### Runtime R2-D: 8.2–8.5

`db54ead` incorpora `session_artifacts list.instantaneas`, con paginación compartida con los artefactos: seguir `cursor` hasta `null`, aunque `artefactos` esté vacío. La cobertura, versión y pendientes son declaraciones del productor; hash/bytes son comprobados por el runtime, no recibos de recuperación HTTP ni prueba automática de vigencia.

Firma de compartición incorporada:

```text
{ action: "share", encargo_id: destino, origen_encargo_id,
  instantanea_id, corpus, referencia }
```

Exige gestionar ambos encargos, corpus/referencia compatibles y blob íntegro. Es idempotente y no amplía la matriz de lectores: las fuentes crudas de especialistas siguen vetadas al Investigador. Verificar especialmente paginación combinada, aislamiento, suplantación, enlaces entre encargos y `{guardado:false}` exacto sin persistencia.

`1985bc7` corrige dos rojos todavía reproducibles en **main**:

1. `build/verify-s08-original-string.mjs`: JSON recibido como string y declarado `objeto_serializado` perdía espacios, orden y CRLF.
2. `build/verify-s08-wrapper-string.mjs`: un envoltorio desconocido recibido como JSON textual no producía diagnóstico.

El fix conserva el string exacto; parsea solo para diagnóstico/vista. La etiqueta declarada `objeto_serializado` puede conservarse tras validar el JSON, **sin reserializarlo**. Un objeto realmente recibido sigue serializándose determinísticamente. No inferir el tipo recibido a partir de la etiqueta declarada.

**8.3 se marcó y luego se reabrió en `8d6ad1e`** por el segundo rojo. La suite 137/137 no cubría esa variante. No volver a cerrarla por aquella suite.

El autor reportó **10/10** nuevas, **51/51** existentes y **17/17** de consumidor/adaptador. Fixture programado: una recuperación común y cero adicionales observadas, pendientes separados por pregunta. No es conducta de modelo ni aceptación independiente completa.

Para **8.5**, el revisor confirmó un hueco de prueba: el informe v1 se publicaba antes de que el Revisor leyera la fuente y no citaba ID/hash. El ajuste sin commit en `campaign-s08-review-fix-20261103` añade la cadena exigida:

1. Lectura íntegra por identidad del Revisor **antes** del informe v1; cotejo de contenido y hash.
2. ID de instantánea y hash cotejado incluidos en ese informe.
3. Recuperación intacta del informe al revisar v2 y relectura con el mismo hash.
4. Conservación de negativos y punteros: v2 no hereda revisión/aprobación de v1.

El log `C:\Users\potero\AppData\Local\Temp\opencode\s08-review-fix-full.log` tiene nueve resultados correctos, incluido 8.5, **sin totales finales** por la interrupción. No tratarlo como suite completa.

Evidencia independiente en `s08-r2b-review-20261103`: `addendum-r2d-8.5-cotejo-previo.md`, `replay-reds-results.json`, `replay-reds.mjs` y los informes anteriores del núcleo. No hay dictamen final completo de aceptación R2-D; los informes del núcleo no aceptan automáticamente esta cadena.

### Permisos y contratos R2-E: 8.6

`f6017dd` introduce `sesion_capture_agent_source` en lugar del permiso genérico de captura, conserva `execute` para Code Mode y añade pruebas de consumidor privado. Cambia plugin, cinco roles, referencias, README y pruebas; no está integrado.

Los cinco archivos sucios posteriores alinean inventario/share y conservación de strings con R2-D. Terminar su revisión y comprobar que los argumentos documentados coinciden con el runtime combinado. Verificar permisos efectivos, ambos alias Jira de solo lectura, denegaciones de Revisor/lectores no autorizados y guardado desactivado antes/después de reload. El trabajo interrumpido no dejó una aceptación final que permita cerrar 8.6.

### Driver R2-F: aceptación antes de gastar otra plaza

`0a05983` añade solo `test-support/source-model/{data.mjs,fixture/index.ts,verify-model.mjs}` y `session_source_model_driver.test.ts`. El autor reportó **14/14** deterministas, con proveedor programado y límites 360/600 s. Esto acredita el driver solo dentro de esa cobertura, no conducta elegida por un modelo.

La revisión se interrumpió. Contrastar y corregir lo necesario antes del ensayo:

- Barrera nativa de **admisión del input** y final del primer turno antes del segundo: `idle`/`wait` solos no bastan.
- Transferencia vinculada al resultado de lectura en el **mismo execute**, no solo al mismo mensaje o a un hash coincidente.
- Lecturas completas con contenido/cursor/actor correctos, no solo números de líneas o referencias conocidas.
- Capturas válidas por página/componente y versiones coherentes, sin exigir siempre una copia del issue completo en cada instantánea.
- Recuento de todas las recuperaciones pertinentes, incluidas repeticiones de comentarios y llamadas delegadas; cero llamadas en turno 2 no acredita por sí solo reutilización.
- Etiqueta de representación frente al tipo/bytes recibidos, compatible con `1985bc7`.
- Publicación vinculada a argumentos, manifiesto y bytes exactos; Revisor, si existe, con lectura propia completa y versión precisa.
- Modelo efectivo por mensaje, consentimiento, presupuesto y cleanup; credencial no comprobada nunca equivale a «sin cambios».

Son riesgos de aceptación pendientes, no un dictamen final ya emitido. Mantener `review_required` y revisión semántica independiente: el verificador mecánico no aprueba la suficiencia de las respuestas.

## Presupuesto y límites de continuación

- Autorización previa: **5 ensayos**, máximo **6 minutos de flujo / 10 minutos totales** por ensayo y **50 minutos agregados**.
- Campaña actual: solo **2.4** consumió una plaza, **138,041 s**. Quedan **4 ensayos y 47 min 41,959 s**. La preparación determinista posterior consumió cero plazas.
- El driver de 2.4 se configuró erróneamente con 600/900 s, aunque concluyó dentro del límite autorizado. Los siguientes deben **enforzar 360000/600000 ms**, sin ampliar el presupuesto.
- Modelo solicitado por el usuario: `plainconcepts/glm-5-3`, tras el límite de uso observado. Sin fallback automático. Modelos reales solo por el orquestador, tras aceptación determinista del driver; **no repetir 1.4 ni 7.5**.
- Evidencia aceptada de 2.4: `s02-model-TinCbP`, incluido `acceptance-review.json`. Preservar también `s07-model-1MuvZZ`, sus summaries, revisión requerida y aceptación independiente.
- El usuario aceptó la indeterminación documentada de los fallos APM históricos para cerrar 5.6. Suites posteriores verdes no demuestran su causa. El deadline de reintentos de transporte de 30 s tampoco es un límite duro de pared: `spawnSync` conserva 120 s.
- Sin push ni archivo OpenSpec. Solo el orquestador integra, marca tareas y ejecuta la suite raíz. Si se delega tras nueva autorización, usar worktrees privados y un escritor por propietario compartido.
- Preservar servicio/credenciales compartidos, evidencias históricas y diagnósticos fallidos. Jira real y Codegraph requieren corpus/acceso autorizados; no sustituirlos por fixtures.
- Exclusiones intocables, actualmente no rastreadas: `docs/example-test/`, `docs/planes/DIAGNOSTICO-adaptador-de-sesion-no-disponible.md` y `docs/planes/plan-mejora-agentes-tools-skills.md`.

## Siguiente secuencia al reanudar

1. Comprobar rama, estado y los cuatro worktrees de la tabla; cotejar los dos parches locales sin sobreescribir trabajo.
2. Terminar aceptación del runtime y del ajuste de prueba 8.5; terminar contratos/permisos 8.6. Conservar la distinción entre resultados del autor, revisión independiente y regresión combinada.
3. Integrar solo lo aceptado, probar la combinación en consumidores privados y ejecutar `node --test *.test.ts` desde la raíz, además de OpenSpec estricto y `git diff --check`. Marcar únicamente los criterios demostrados.
4. Completar aceptación determinista/adversarial del driver. Solo entonces decidir el ensayo S08 dentro del saldo anterior y revisar su evidencia independientemente.
5. Continuar S09/S10/S13 cuando sus dependencias estén verificadas; S11 depende de S10 y S14 de las sesiones restantes. Usar el DAG de D12, sin reiniciar S01–S07/S12.

## Verificación de esta pausa

Solo documentación de handoff/tracking; no nueva suite raíz ni ensayo con modelo durante la pausa.

- Checks documentales de AGENTS: **3/3**, cero fallos, cancelaciones u omisiones (270,7065 ms).
- Cuatro enlaces locales del handoff: resolubles.
- `openspec validate mejorar-fiabilidad-y-reutilizacion-agentes --strict --json`: válido, sin incidencias.
- `git diff --check`: sin errores; aviso de conversión LF/CRLF en `tasks.md`.
- Consulta nativa final: solo el orquestador activo, **23 hijas archivadas, 0 shells hijos activos**.
