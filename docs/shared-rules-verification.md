# Reglas compartidas: verificación

> **Evidencia histórica del plan 2, 19 de octubre de 2026**, sobre su rama aislada anterior a integrar plantillas. «Siete skills» y las cifras describen esa ejecución. El cierre conjunto consta en [plantillas](deliverable-templates-verification.md#integración-y-cierre); la limpieza posterior, en [instrucciones](agent-instructions-verification.md).

Ejecución del plan 2 sobre la base `15267b1`, rama `work/plan-2-reglas-compartidas`. Entorno: Windows, Node.js 24.18.0, OpenCode 1.19.3 y APM 0.32.0.

El [mapa normativo](../README.md#mapa-normativo-compartido) identifica propietario, consumidores, disparador y cierre de cada regla. Las fuentes son las cuatro skills de `.apm/skills/`; `operativa-comun` mantiene los contratos `references/fuentes-evidencias.md`, `references/configuracion.md` y `references/publicacion-revision.md`. Los agentes conservan sus secuencias y formatos. Las plantillas y `user-stories` corresponden al plan 3.

## Comprobaciones ejecutadas

Desde `build/worktree-plan-2`, con `TEMP`, `TMP` y `TMPDIR` dirigidos a su `build/tmp` existente:

```powershell
node --test *.test.ts
git diff --check
```

- Regresión completa: **21 correctas, 0 fallos, 0 omitidas**. Incluye herramientas, sesiones, migración, originales, versiones y revisión de Test.
- `git diff --check`: sin errores de espacios.
- Integraciones incluidas: `apm install <copia-local> --target opencode`, `apm update --yes --target opencode` y `node <instalador-distribuido>`; configuración efectiva y catálogo con `opencode debug config` y `opencode debug skill`; permisos con `opencode debug agent`.
- APM instala las siete skills en `.agents/skills/`, con nombres intactos y referencias presentes. Se recorrieron enlaces relativos desde los archivos instalados antes y después de actualizar. APM puede reescribir enlaces entre skills hacia la copia distribuida en `apm_modules`; esos destinos se comprobaron también.
- El instalador registra la carpeta instalada en `skills.paths`, sin duplicarla y conservando rutas personalizadas. Funciona con los escaneos externos desactivados y preserva los ajustes del consumidor al repetirse.
- OpenCode carga las siete skills esperadas. Se ejecutaron sus herramientas reales `skill` para las dos skills del Investigador y `read` para las tres referencias, desde el consumidor instalado.
- El motor real de permisos contrasta skills autorizadas y denegadas por los ocho roles. Investigador permite exactamente las tres referencias distribuidas; deniega código general, ajustes leídos como archivo, otras referencias, un archivo adicional en la misma carpeta y una ruta homónima fuera del árbol distribuido.
- Los permisos Jira siguen siendo de solo lectura con ambos alias; Revisor sigue sin `atlassianUserInfo`, y Lector Código y Test sin Jira. Se comprueban visibilidad y autorización con herramientas sintéticas y `context.ask`, sin acceso remoto Jira.

HOME/USERPROFILE, AppData, XDG, OpenCode, APM y npm se aíslan por consumidor bajo el `build/` de este worktree; también los probes de versión. Las copias locales de integración usan nombres cortos por el límite de rutas de Windows. Durante el ajuste hubo fallos de ruta larga y, en una ejecución aislada de APM, un `WinError 5` de activación; tras acortar rutas y repetir, la ejecución completa anterior finalizó sin fallos. No se actualizaron las CLI ni configuraciones globales.

## Recorridos contrastados en instrucciones

| Recorrido | Camino y cierre |
|---|---|
| Solo título | Los cuatro agentes enrutan antes del flujo completo a `consulta-jira` → dato puntual; allí se definen `fields: ["summary"]`, literal y cierre sin configuración ni entregables. |
| Refinamiento con originales | Planificador → selección y recuperación completa Jira → `write_planning_originals` → Refinador → entrega → Revisor; se conservan comentarios paginados, criterios, adjuntos/vínculos, inaccesibles y versiones completas. |
| Investigación completa | Investigador → fuentes/configuración → Jira directo y lectores autorizados → contraste y publicación proporcional; Lector Código carga Codegraph y mantiene sus criterios de suficiencia. |
| Conversión parcial | Lector Documentación usa salida estándar; glosario y reuniones usan temporal propio, lectura completa y limpieza. La parcialidad conserva estado, pérdidas y cita al original; reuniones mantiene sus consentimientos específicos. |
| Publicación fallida | La referencia compartida exige devolver contenido y fallo sin inventar ruta; arquitectura bloquea revisión sin publicación confirmada. |
| Revisión de Test | Contrato y agentes apuntan a revisión de versión exacta e intentos compartidos; Test conserva lectura directa acotada y los casos UI, y devuelve aprobados independientes y bloqueos. |

Esta tabla y la prueba del contrato son verificaciones documentales, no ejecuciones de esos recorridos por un modelo. No se ejecutó Jira real, una investigación con Codegraph, una conversión MarkItDown ni una conversación LLM; esas conductas no se atribuyen a las comprobaciones estructurales o de permisos. No quedan bloqueos de las validaciones obligatorias del plan 2.

## Integración y continuidad — contexto de aquella ejecución

El plan 3 puede solaparse en agentes, README y contrato de arquitectura: conserva sus formatos/plantillas y estos punteros y permisos compartidos. `jira_access.test.ts` y `scripts/setup-opencode.mjs` incluyen las adaptaciones de distribución de este plan. El plan 2 se retira tras completar sus comprobaciones; los demás planes permanecen.

**Cierra y reinicia OpenCode después de instalar o actualizar** para cargar agentes, skills y configuración nuevos.
