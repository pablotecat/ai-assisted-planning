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

## Instalación

Copia `agent/`, `plugin/`, `tools/`, `skills/`, `package.json`, `opencode.json` y `agent-settings.example.json` a `.opencode/` del proyecto anfitrión. Ejecuta `npm install` en esa carpeta. Si el anfitrión ya tiene `opencode.json`, conserva sus opciones y añade `"subagent_depth": 4`. Instala Codegraph e indexa el workspace si vas a consultar código; prepara MarkItDown si vas a convertir otros formatos documentales. Reinicia OpenCode después de instalar o cambiar agentes, plugin o permisos.

Copia `agent-settings.example.json` a `agent-settings.json` dentro de `.opencode/`. Indica rutas absolutas de workspace y raíces documentales solo para el proyecto anfitrión; deja vacíos los campos que no correspondan. El archivo personal está ignorado por Git. `especialistasPermitidos` controla qué especialistas puede invocar el coordinador y cada agente tiene su propio `guardarEntregablesEnSesion`.

## Uso

Entrega a `agente-planificador` texto o rutas de documentos con los requisitos y el alcance a refinar. El planificador conserva copias en `Originales/`, delega borradores, publica historias e incidencias en `entrega/` y pide al revisor un `sanity-check.md` de esa versión. Las correcciones se publican en `entrega-02/`, etc. Los entregables se guardan en `sesiones.carpetaRaiz` bajo la raíz del proyecto anfitrión (por defecto `informes-agente/sesiones/`). Puedes invocar directamente al coordinador o a los especialistas para consultas independientes.

`tools/session_store.ts` asigna carpetas según la sesión verificada por `plugin/agent-session.ts`, rechaza archivos ajenos y no sobrescribe publicaciones. El adaptador de OpenCode proporciona la identidad de cada llamada; una integración nueva necesitará su propio adaptador y fuentes documentadas.

Para ejecutar las comprobaciones: `node --test *.test.ts` (Node.js 24 o posterior).
