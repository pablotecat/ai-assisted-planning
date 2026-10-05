# Planificación asistida por agentes

Agentes para investigar código y documentación local, refinar requisitos aportados por el usuario y revisar las entregas. Esta base no depende de un gestor de tareas: la integración con fuentes adicionales podrá añadirse más adelante.

| Agente | Responsabilidad |
|---|---|
| `agente-codigo` | Investiga un workspace indexado con Codegraph. |
| `agente-documentacion` | Analiza documentos locales y cita sus fuentes. |
| `agente-coordinador` | Contrasta investigación de código y documentación. |
| `agente-planificador` | Copia requisitos, coordina refinadores y publica historias. |
| `agente-refinamiento` | Redacta borradores trazables por historia. |
| `agente-revisor` | Revisa versiones publicadas y documenta hallazgos. |

## Instalación en OpenCode

Necesitas [OpenCode](https://opencode.ai/docs/), [APM](https://microsoft.github.io/apm/getting-started/installation/), [Node.js 24 o posterior](https://nodejs.org/en/download) y [Git](https://git-scm.com/downloads) (APM lo utiliza para descargar paquetes). Abre una terminal en la **carpeta raíz del proyecto** donde usarás los agentes, no en `.opencode/`, y ejecuta estos dos comandos:

```sh
apm install pablotecat/ai-assisted-planning --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
```

APM instala los agentes y skills. El segundo comando configura sus plugins, herramientas y dependencias npm para OpenCode; no necesitas descargar este repositorio. Después abre o reinicia OpenCode en esa misma carpeta y llama a `agente-planificador`.

**Actualizar:** desde la misma carpeta, ejecuta:

```sh
apm update --yes --target opencode
node apm_modules/pablotecat/ai-assisted-planning/scripts/setup-opencode.mjs
```

Tus ajustes se conservan en `.opencode/agent-settings.json`. Puedes dejar ese archivo como está: el agente pedirá las rutas de código o documentos cuando las necesite.

Para consultas de código, instala Codegraph e indexa el proyecto. Para convertir otros formatos de documentos, instala MarkItDown.

## Uso

Entrega a `agente-planificador` texto o rutas de documentos con los requisitos y el alcance a refinar. El planificador conserva copias en `Originales/`, delega borradores, publica historias e incidencias en `entrega/` y pide al revisor un `sanity-check.md` de esa versión. Las correcciones se publican en `entrega-02/`, etc. Los entregables se guardan en `sesiones.carpetaRaiz` bajo la raíz del proyecto anfitrión (por defecto `informes-agente/sesiones/`). Puedes invocar directamente al coordinador o a los especialistas para consultas independientes.

`tools/session_store.ts` asigna carpetas según la sesión verificada por `plugin/agent-session.ts`, rechaza archivos ajenos y no sobrescribe publicaciones. El adaptador de OpenCode proporciona la identidad de cada llamada; una integración nueva necesitará su propio adaptador y fuentes documentadas.

Para ejecutar las comprobaciones: `node --test *.test.ts` (Node.js 24 o posterior).
