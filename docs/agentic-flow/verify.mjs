import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FACTORIES, snapshotAt } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.ANATOMY_HOME || join(homedir(), ".agents", "skills", "anatomy");
const light = process.argv.includes("--light"), phone = process.argv.includes("--phone"), motion = process.argv.includes("--animated");
const actions = [];
const check = expression => ["eval", `(()=>{${expression};return 'passed'})()`];
actions.push(check("if(document.querySelectorAll('[data-factory]').length !== 2)throw Error('two phases');if(document.documentElement.scrollWidth>innerWidth+1)throw Error('page overflow')"));
if (!motion) {
  for (const line of FACTORIES) {
    const root = `[data-factory="${line.id}"]`;
    actions.push(check(`if(document.querySelectorAll('${root} [data-station]').length!==${line.nodes.length})throw Error('all station labels')`));
    actions.push(["eval", `document.querySelector('${root} .step-details').open=true`]);
    line.steps.forEach((step, i) => {
      const time = step.start + step.duration / 2, expected = snapshotAt(line, time);
      actions.push(["scroll", `${root} [data-step="${i}"]`], ["click", `${root} [data-step="${i}"]`]);
      actions.push(check(`const root=document.querySelector('${root}');if(root.dataset.step!=='${i}')throw Error('step ${line.id}/${i}');if(root.dataset.output!=='${line.id === "planning" ? expected.histories : expected.tasks}')throw Error('output');if(root.querySelector('[data-current-title]').textContent!==${JSON.stringify(step.title)})throw Error('description');if(root.querySelector('[data-timeline]').getAttribute('aria-valuetext')!==${JSON.stringify(step.title)})throw Error('accessible step')`));
      if (!phone || [0, 3, 8, 9, 12].includes(i)) actions.push(["lines", null, `${root} .iso-plate`]);
    });
    actions.push(["click", `${root} [data-overview]`], check(`if(document.querySelector('${root}').dataset.done!=='true')throw Error('overview');if(document.querySelector('${root}').dataset.output!=='${line.id === "planning" ? 3 : 9}')throw Error('complete output')`));
    actions.push(["key", "Home", `${root} .iso-stage`], ["key", "ArrowRight", `${root} .iso-stage`], check(`if(document.querySelector('${root}').dataset.step!=='1')throw Error('keyboard')`));
    actions.push(["key", "End", `${root} .iso-stage`], ["scroll", `${root} [data-station="${line.id === "planning" ? "truth" : "provider"}"]`], ["click", `${root} [data-station="${line.id === "planning" ? "truth" : "provider"}"]`]);
    actions.push(check(`if(document.querySelector('${root} [data-current-title]').textContent!==${JSON.stringify(line.id === "planning" ? "Fuente de Verdad" : "Proveedor")})throw Error('station selection')`));
    actions.push(["click", `${root} [data-overview]`]);
    if (phone) actions.push(check(`const viewport=document.querySelector('${root} .scene-viewport');if(viewport.scrollWidth<=viewport.clientWidth)throw Error('readable panning scene')`));
  }
  actions.push(["scroll", "[data-theme-toggle]"], ["click", "[data-theme-toggle]"], check(`if(document.body.dataset.theme!=='${light ? "dark" : "light"}')throw Error('theme')`));
  actions.push(["wait", 250], check("window.parked=[...document.querySelectorAll('[data-factory]')].map(e=>e.dataset.time).join(',')"), ["wait", 400], check("if([...document.querySelectorAll('[data-factory]')].map(e=>e.dataset.time).join(',')!==window.parked)throw Error('reduced motion')"));
} else {
  const root = '[data-factory="planning"]';
  actions.push(["click", `${root} [data-play]`], ["move", ".masthead", 0.5, 0.5], ["wait", 900]);
  actions.push(check(`if(!(Number(document.querySelector('${root}').dataset.time)>0.2))throw Error('play did not advance');window.beforeHover=Number(document.querySelector('${root}').dataset.time)`));
  actions.push(["move", `${root} .iso-stage`, 0.45, 0.3], ["wait", 120], check(`window.held=document.querySelector('${root}').dataset.time`), ["wait", 300], check(`if(document.querySelector('${root}').dataset.time!==window.held)throw Error('hover pause')`));
  actions.push(["move", ".masthead", 0.5, 0.5], ["wait", 500], check(`if(Number(document.querySelector('${root}').dataset.time)<=Number(window.held))throw Error('hover resume')`));
  actions.push(["eval", "(()=>{const spacer=document.createElement('div');spacer.id='test-spacer';spacer.style.height='3000px';document.body.append(spacer);scrollTo(0,document.documentElement.scrollHeight)})()"], ["wait", 250], check(`window.offscreen=document.querySelector('${root}').dataset.time`), ["wait", 400], check(`if(document.querySelector('${root}').dataset.time!==window.offscreen)throw Error('offscreen suspension');document.querySelector('#test-spacer').remove()`));
  actions.push(["key", "End", `${root} .iso-stage`], ["lines", null, `${root} .iso-plate`]);
  actions.push(["eval", "(()=>{const speed=document.querySelector('[data-speed]');speed.value='4';speed.dispatchEvent(new Event('change',{bubbles:true}))})()"], ["click", "[data-run-all]"], ["move", ".masthead", 0.5, 0.5]);
  actions.push(["until", "[...document.querySelectorAll('[data-factory]')].every(root=>root.dataset.done==='true')", 90000]);
  actions.push(check("if(document.querySelector('[data-factory=\"planning\"]').dataset.output!=='3'||document.querySelector('[data-factory=\"architecture\"]').dataset.output!=='9')throw Error('connected output')"));
}
try {
  const output = execFileSync(process.execPath, [join(HOME, "scripts", "drive.mjs"), light ? "index-light.html" : "index.html", JSON.stringify(actions), "--height", phone ? "1800" : "3000", ...(phone ? ["--width", "390"] : []), ...(!motion ? ["--reduced"] : [])], { cwd: HERE, encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
  console.log(output);
  assert.match(output, /console: clean/);
  assert.doesNotMatch(output, /line ends: [1-9]/);
  console.log(`browser verification passed · ${light ? "light" : "dark"} · ${phone ? "390px" : "desktop"} · ${motion ? "motion" : "all steps"}`);
} catch (error) { console.error(error.stdout || "", error.stderr || error.message); process.exit(1); }
