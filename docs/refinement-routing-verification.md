# Verificación del enrutado de preguntas de refinamiento

**Fecha:** 2026-10-20. **Rama:** `fix/enrutado-refinador-investigador`.
Implementación del [plan de enrutado](planes/2026-10-20-enrutado-refinador-investigador.md).
Entorno: Windows, Node.js **24.18.0**, OpenCode **1.19.3**, APM **0.32.0**.

## Cambios y contrato comprobado

- `.apm/agents/refinador.agent.md`: clasifica recuperación de originales, preguntas investigables y decisiones nuevas; delega las investigables también cuando las fuentes sean Jira. El encargo identifica pregunta, criterios, fuentes, alcance y datos confirmados o pendientes. Comprueba `PENDIENTE_CONFIRMACION`, corrige el resumen cuando proceda y reanuda con `CONFIRMAR` en el mismo `task_id`. Integra evidencia y límites y registra tipo, tratamiento y resultado en los apartados existentes.
- `.apm/agents/planificador.agent.md`: conserva ese enrutado al delegar; contrasta consultas, impedimentos y decisiones humanas y devuelve al mismo refinador las preguntas investigables sin tratamiento. Permite parciales explícitos con efecto y siguiente paso.
- `.apm/agents/investigador.agent.md`: añade únicamente las rutas relativas exactas de sus tres referencias operativas a las excepciones de lectura existentes. La ejecución con modelo descubrió esta necesidad adicional al diagnóstico inicial.
- `jira_access.test.ts`: comprueba autorizaciones reales de `task` para los tres roles, destinos denegados, profundidad y modos instalados, y las tres referencias tanto relativas al worktree como con prefijo. Conserva las comprobaciones de ambos alias Jira y de denegación de escrituras.

Las plantillas y las reglas compartidas permiten expresar la trazabilidad requerida con su contrato actual. El investigador conserva su protocolo y las lecturas de dominio pasan por sus lectores. Las decisiones nuevas siguen correspondiendo a una persona.

### Bloqueo real de lectura y regresión rojo/verde

En la primera investigación real, el investigador intentó leer `fuentes-evidencias.md` y `configuracion.md` y recibió una denegación. OpenCode 1.19.3 solicita el permiso de `read` con `path.relative(instance.worktree, filepath)`. El patrón anterior `*/.agents/skills/...` acepta un prefijo, pero no `.agents/skills/...` desde la raíz del consumidor.

Se amplió primero el probe a las rutas relativas que utiliza la herramienta real. Antes de corregir el agente, `node --test --test-name-pattern "OpenCode autoriza" jira_access.test.ts` falló con `investigador: read .agents\skills\operativa-comun\references\fuentes-evidencias.md`, `deny !== allow`. Después pasan el probe, la instalación APM y la lectura efectiva dentro de la cadena con modelo. Las excepciones nuevas nombran los mismos tres archivos, sin permitir otras referencias, configuración ni documentos de dominio.

Código del runtime contrastado: [ReadTool 1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/tool/read.ts) y [motor de permisos 1.19.3](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/permission/index.ts).

## Regresiones e instalación

Ejecución final de `node --test *.test.ts`: **25 correctas, 0 fallos, 0 canceladas y 0 omitidas**, **203009,355 ms**. Incluye migración, conservación de personalizaciones, distribución APM, permisos reales, skills, publicadores y revisión de versiones exactas.

Se verificó previamente la existencia de `C:\Users\potero\AppData\Local\Temp\opencode` y se asignaron `TEMP`, `TMP` y `TMPDIR` a esa ruta. Cada consumidor conserva el aislamiento propio de la suite para HOME/USERPROFILE, AppData, XDG, OpenCode, APM y npm. El directorio externo temporal está autorizado para estas comprobaciones.

```powershell
$env:TEMP = "C:\Users\potero\AppData\Local\Temp\opencode"
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
node --test *.test.ts
git diff --check
```

Las primeras ejecuciones con temporales bajo `build/tmp` presentaron incidencias intermitentes de APM: `WinError 5` al activar staging local, `EBUSY` durante limpieza y cancelaciones por los límites de tiempo existentes. Hubo una suite completa 25/25 antes de incorporar las excepciones relativas; tras incorporarlas, una ejecución dio 22 correctas, 1 fallo y 2 canceladas, y la ejecución con `--test-concurrency=1` dio 24 correctas y 1 fallo de staging. Una repetición específica de actualización terminó con `EBUSY`. La suite completa final con los temporales anteriores pasó conjuntamente. Estos resultados no identifican por sí solos la causa de los bloqueos de APM; se conservaron los límites y las aserciones.

## Comprobación funcional con modelo

Consumidor aislado instalado con los agentes y skills de las fuentes y `scripts/setup-opencode.mjs`. Estado, configuración, caché y sesiones propios bajo `build/`; corpus ficticio local, sin conexiones MCP. Se utilizó una copia temporal de las credenciales del proveedor, eliminada al cerrar cada runtime. Los procesos iniciados para las pruebas se terminaron con su árbol de procesos.

El prompt de entrada pide refinar una historia y aporta sus fuentes y restricciones. **No ordena llamar al investigador.** El encargo generado por el planificador sí preserva el enrutado de sus instrucciones. En el caso investigable se aportaron como confirmados la carpeta documental y la referencia `fixture-v1`.

### Historias y resultados observados

| Caso | Fuentes ficticias y resultado comprobado |
|---|---|
| **FICT-INV: regla existente** | El original pregunta por R-17 para bonos caducados. El manual adicional `fixtures/manual-v1/reglas-bonos.md`, §Regla vigente R-17, L4, contiene el acuerdo previo: saldo utilizable **0**, estado **«Caducado»**, nominal solo histórico. Se ejecutaron Planificador → Refinador → Investigador → Lector Documentación, resumen pendiente, confirmación y lectura real. La conclusión delegada `conclusion.md`, el borrador y la entrega final integran respuesta y localizadores; la pregunta conserva el `task_id`. |
| **FICT-SUF: historia suficiente** | Corpus exhaustivo con bono activo de saldo 5 y literal «5 bonos disponibles». Refinador y revisión completados, **cero investigadores**. |
| **FICT-DEC: decisión nueva** | Consulta de saldo confirmada y futura bonificación de 10 o 20 sin acuerdo previo. Se conservan ambas alternativas para Producto; ninguna pasa a criterios confirmados. **Cero investigadores**. |
| **FICT-BLO: corpus indispensable pendiente** | El original declara un acuerdo existente sin documento, localizador ni acceso y prohíbe ampliar fuentes. Se mantiene la regla no determinada, el efecto en CA-1, los datos mínimos y la acción para recuperarlos. El refinador hizo una consulta acotada para constatar el impedimento mediante el mismo original; no se buscó el acuerdo fuera del corpus ni se inventó su contenido. La entrega permanece parcial. |

Los cuatro casos terminaron con entrega final e incidencias guardadas y `sanity-check.md` de su versión, con respuestas de publicadores `guardado:true`. La comprobación de enrutado no atribuye aprobación funcional a esas revisiones documentales.

### Identificadores y trazas

Raíz local de la campaña final: **`build/routing-1792486073909/`**.

| Caso | Sesión del planificador | Export de mensajes completo |
|---|---|---|
| Investigable | `ses_ea78066c0ffeniCR9rFMy1z1U2` | `investigable-continued.json` |
| Suficiente | `ses_ea7806697ffejRL8kFjwwQw4qm` | `suficiente.json` |
| Decisión | `ses_ea7806681ffeNsMPCBA6AKGXA1` | `decision.json` |
| Impedimento | `ses_ea780666effeniRxi43yswsEOI` | `impedimento-continued.json` |

Cadena positiva comprobada mediante `parentID`, mensajes y llamadas reales:

```text
planificador  ses_ea78066c0ffeniCR9rFMy1z1U2
  refinador   ses_ea77c17efffes35HwdS85Z7kJs
    investigador ses_ea77bbd8fffe1jpefUo850W1W8
      lector-documentacion ses_ea77b2be3ffedh21fJn4GPtdPL
```

El refinador realiza una llamada inicial a `investigador` que devuelve `PENDIENTE_CONFIRMACION`; la segunda lleva `task_id: ses_ea77bbd8fffe1jpefUo850W1W8` y un prompt que empieza por `CONFIRMAR`. El investigador llama al lector, que lee realmente el manual autorizado. Esta evidencia acredita ejecución anidada, además de disponibilidad de permisos.

`acceptance.json` conserva las relaciones, los `task_id`, las rutas reales de entregas y revisiones y el uso reportado del modelo. `effective-contract.json`, `summary.json`, `continuation.json` y los logs complementan los mensajes. Los scripts auxiliares y consumidores permanecen locales en `build/`, excluido de Git; los JSON son respuestas del runtime y no añaden un formato operativo de publicación.

Comandos auxiliares locales ejecutados:

```sh
node build/verify-refinement-routing.mjs
node build/continue-routing.mjs build/routing-1792486073909
node build/validate-routing-evidence.mjs build/routing-1792486073909
node build/verify-office-routing.mjs
```

### Límites e incidencias de la comprobación funcional

- Los primeros consumidores desactivaban los plugins incorporados y no activaron OpenAI OAuth: las solicitudes fallaron antes de ejecutar herramientas con `ProviderModelNotFoundError`. Se habilitaron esos plugins únicamente en el entorno aislado y se verificó el proveedor conectado antes de continuar. Sus registros están en `build/routing-1792484997937/` y `build/routing-1792485448424/`.
- La primera campaña con modelo, `build/routing-1792485511905/`, descubrió la denegación de referencias y un límite del cliente HTTP síncrono. Sus trazas se conservan como diagnóstico, no como aceptación de la corrección.
- La campaña final usa envío asíncrono y sondeo. Dos casos terminaron en la primera pasada; investigable e impedimento alcanzaron **600000 ms** al preparar la publicación del planificador. La investigación y sus borradores ya estaban guardados. Se abortaron las ejecuciones y se continuaron **los mismos IDs**, conservando fuentes, consultas y versiones, con un límite de **420000 ms** y una petición de redacción final concisa. Ambos completaron publicación y revisión. Los exports originales y los continuados se conservan por separado.
- En FICT-BLO el investigador publicó una pareja de informes en lugar de `conclusion.md`, y el refinador declaró que no tenía sus rutas verificadas. La lectura adicional fue procedimental; las fuentes funcionales permanecieron restringidas al original. La entrega final conserva estos límites y acredita el impedimento, no una investigación resuelta. El caso positivo sí publicó y verificó la conclusión delegada prevista.
- Los casos ejercitan documentación local. La investigación remota con Jira, Codegraph y la repetición de historias reales ES-1345/ES-1514 conservan su validación específica pendiente; aquellas sesiones siguen siendo evidencia del diagnóstico. La autorización de ambos alias Jira y sus denegaciones se verificó con el motor real en la suite.

### Uso del modelo

Modelo observado en la campaña final: **`openai/gpt-6.1-sol-fast`** en los roles ejecutados. Las cifras incluyen las continuaciones y las llamadas ya realizadas antes de las interrupciones de esa campaña.

| Caso | Tokens entrada | Tokens salida | Razonamiento reportado | Lectura de caché |
|---|---:|---:|---:|---:|
| Investigable | 95659 | 17438 | 113 | 249472 |
| Suficiente | 59280 | 10810 | 89 | 194432 |
| Decisión | 70171 | 12821 | 72 | 147968 |
| Impedimento | 101267 | 17555 | 354 | 243200 |
| **Total de esta campaña** | **326377** | **58624** | **628** | **835072** |

El runtime devolvió coste `0`; ese valor no permite inferir gratuidad ni facturación real. Los intentos diagnósticos anteriores conservan sus propios contadores en sus exports y resúmenes locales.

## Distribución a Planning Office

Ejecutado `npm run setup` desde `../planning-office/` tras actualizar las fuentes, incluida la corrección de las referencias relativas. El cotejo posterior verifica los **ocho agentes coincidentes** con el repositorio, las **ocho skills** instaladas, `investigador.mode: all`, profundidad al menos 4, las tres referencias relativas, `MAX_CONSULTAS_PARALELAS = 2`, permisos de delegación por rol y las denegaciones/excepciones Jira.

**Siguiente paso del usuario:** detener y reiniciar la oficina y su runtime de demostración, y abrir sesiones nuevas. Para continuar encargos anteriores, aportar documentos y handoff conservando decisiones, versiones e intentos consumidos. La sesión activa mantiene las instrucciones que cargó al iniciarse.
