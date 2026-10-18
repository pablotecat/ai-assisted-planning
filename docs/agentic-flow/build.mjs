import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FACTORIES, EXAMPLE, TOTAL_TASKS } from "./model.mjs";
import { makeFactoryScene } from "./geometry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.ANATOMY_HOME || join(homedir(), ".agents", "skills", "anatomy");
const load = name => import(pathToFileURL(join(HOME, name)).href);
const [k, G, A, { kitScript }] = await Promise.all([load("kit/iso-kit.mjs"), load("kit/lathe.mjs"), load("kit/audit.mjs"), load("scripts/inline-kit.mjs")]);
const theme = process.argv.includes("--light") ? "light" : "dark";
const scenes = FACTORIES.map(line => makeFactoryScene(line, k, G, A));

function card(line, scene, i) {
  const planning = i === 0;
  const heading = planning ? "De ideas a Historias Refinadas" : "De Historias Refinadas a tareas";
  const sub = planning ? "Leer y copiar → investigar preguntas → reescribir → revisar el conjunto → cotejar" : "Repartir por especialidad → solicitar código → crear tareas → revisar cada rama → integrar";
  const steps = line.steps.map((step, index) => `<button data-step="${index}" aria-label="Paso ${index + 1}: ${step.title}"><span>${String(index + 1).padStart(2, "0")}</span>${step.title}</button>`).join("");
  return `<section class="factory-section" id="${line.id}" data-factory="${line.id}">
    <div class="section-heading"><div class="phase-index">0${i + 1}</div><div><p class="eyebrow">FASE ${i + 1} / ${planning ? "PLANIFICACIÓN Y REFINAMIENTO" : "ARQUITECTURA"}</p><h2>${heading}</h2><p class="section-summary">${sub}</p></div><span class="phase-yield">${planning ? EXAMPLE.documents + " historias" : TOTAL_TASKS + " tareas"}<small>EN EL EJEMPLO</small></span></div>
    ${k.plateHtml({ fig: `CADENA 0${i + 1}`, title: planning ? "Planificador · refinadores · investigación · revisor" : "Arquitecto · especialistas · proveedor · revisores", hint: "Selecciona una máquina o recorre los pasos", readout: planning ? "Historias Refinadas · 3 / 3" : "Tareas · 9 / 9", body: `<div class="scene-viewport"><div class="iso-stage" tabindex="0" role="group" aria-label="${heading}. Flechas: cambiar de paso. Espacio: reproducir o pausar. Inicio y Fin: extremos.">${scene.svg}</div></div>`, caption: planning ? "P identifica al mismo planificador en dos puestos: primero lee, copia y distribuye; después recibe los borradores y revisa el conjunto. El revisor coteja esa propuesta con los originales conservados." : "A identifica al mismo arquitecto principal: reparte las historias y después recibe las tareas revisadas. Cada rama —Test, Back y Front— tiene su propio revisor." })}
    <div class="line-controls"><button class="play-button" data-play aria-label="Reproducir fase ${i + 1}"><span aria-hidden="true">▷</span> Recorrer fase ${i + 1}</button><button class="overview-button" data-overview>Ver cadena completa</button><label class="timeline-label"><span class="sr-only">Progreso de la fase ${i + 1}</span><input data-timeline type="range" min="0" max="${line.duration}" value="${line.duration}" step="0.02" aria-label="Progreso de la fase ${i + 1}"></label><span class="line-state" data-line-state>Vista completa</span></div>
    <div class="current-step" data-current><span class="current-number" data-current-number>✓</span><div><h3 data-current-title>${planning ? "Historias listas para la segunda fase" : "Tareas de las tres especialidades, reunidas"}</h3><p data-current-text>${planning ? "Los originales se conservan, las preguntas vuelven a sus solicitantes y el revisor contrasta la propuesta conjunta antes de entregarla." : "Test, Back y Front entregan tareas revisadas al arquitecto principal. El ejemplo reúne tres tareas por especialidad."}</p></div><div class="current-counts" data-counts>${planning ? "3 originales · 3 historias" : "9 revisadas · 9 entregadas"}</div></div>
    <details class="step-details"><summary>Recorrer los ${line.steps.length} pasos de esta cadena <span>+</span></summary><nav class="steps" aria-label="Pasos de la fase ${i + 1}">${steps}</nav></details>
  </section>`;
}

const body = `<style>${readFileSync(join(HERE, "style.css"), "utf8")}</style>
  <header class="masthead"><a class="brand" href="../../README.md"><span class="brand-mark" aria-hidden="true">ap</span><span>AI-ASSISTED-PLANNING<small>ANATOMÍA DEL TRABAJO</small></span></a><div class="header-actions"><a href="#planning">Fase 1</a><a href="#architecture">Fase 2</a><button data-theme-toggle aria-label="Cambiar tema">${theme === "light" ? "Oscuro" : "Claro"} ◐</button></div></header>
  <section class="intro"><div><p class="eyebrow">DOS CADENAS DE MONTAJE · UN MISMO RECORRIDO</p><h1>Entran ideas. <span class="headline-result">Salen <em>tareas.</em></span></h1></div><div class="intro-aside"><p>Primero se construyen historias con información contrastada. Después se transforman en tareas revisadas por especialidad.</p><div class="global-playback"><button class="run-all" data-run-all>▷ Reproducir las dos fases</button><label><span class="sr-only">Velocidad del recorrido</span><select data-speed aria-label="Velocidad del recorrido"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div></div></section>
  <div class="process-strip" aria-label="Ideas, primera fase, Historias Refinadas, segunda fase, Tareas"><span>IDEAS</span><span aria-hidden="true">→</span><a href="#planning">01 · Refinamiento</a><span aria-hidden="true">→</span><strong>Historias Refinadas</strong><span aria-hidden="true">→</span><a href="#architecture">02 · Arquitectura</a><span aria-hidden="true">→</span><span>TAREAS</span></div>
  <p class="reading-hint"><span class="paper-key" aria-hidden="true">?</span> Las preguntas y las respuestas recorren los ramales de investigación. <span class="paper-key document-key" aria-hidden="true">≡</span> Las hojas recorren la cadena principal. <span class="mobile-hint">Desliza cada cadena para ver sus estaciones.</span></p>
  ${card(FACTORIES[0], scenes[0], 0)}
  <div class="shared-stock"><div class="shared-stack" aria-hidden="true"><i></i><i></i><i></i></div><div><span class="eyebrow">LA SALIDA DE LA FASE 1 ES LA ENTRADA DE LA FASE 2</span><h3>Historias Refinadas</h3><p>La misma pila conecta las dos cadenas.</p></div><span class="shared-down" aria-hidden="true">↓</span></div>
  ${card(FACTORIES[1], scenes[1], 1)}
  <footer class="footer"><span>MODELO FUNCIONAL · ${EXAMPLE.documents} DOCUMENTOS · ${EXAMPLE.refiners} REFINADORES · ${TOTAL_TASKS} TAREAS DE EJEMPLO</span><a href="README.md">Controles y construcción ↗</a></footer><p class="sr-only" aria-live="polite" data-announcer></p>`;
const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = readFileSync(join(HERE, "live.mjs"), "utf8");
const script = kitScript() + model + `const FACTORY_CAMERAS=${JSON.stringify(Object.fromEntries(FACTORIES.map((line, i) => [line.id, scenes[i].P])))};` + live;
const html = k.pageHtml({ title: "Dos cadenas de montaje · ai-assisted-planning", theme, width: 1420, body, script }).replace('<html lang="en">', '<html lang="es">');
const file = theme === "light" ? "index-light.html" : "index.html";
writeFileSync(join(HERE, file), html);
console.log(`wrote ${file} · ${scenes.reduce((sum, scene) => sum + scene.R.solids.length, 0)} solids · ${FACTORIES.reduce((sum, line) => sum + line.routes.length, 0)} routes`);
for (let i = 0; i < scenes.length; i++) {
  console.log(FACTORIES[i].id, scenes[i].R.solids.length, "solids");
  A.auditOrExit(scenes[i].R, scenes[i].P);
}
