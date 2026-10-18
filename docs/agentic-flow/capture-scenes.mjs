import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.ANATOMY_HOME || join(homedir(), ".agents", "skills", "anatomy");
const light = process.argv.includes("--light"), phone = process.argv.includes("--phone"), motion = process.argv.includes("--motion");
const theme = light ? "light" : "dark";
const planning = '[data-factory="planning"]', architecture = '[data-factory="architecture"]';
const open = root => ["eval", `document.querySelector('${root} .step-details').open=true`];
const step = (root, n) => ["key", "Enter", `${root} [data-step="${n}"]`];
let actions;
if (phone) actions = [
  ["shot", `shots/phone-${theme}.png`, ".iso-page", 1.5],
  open(planning), step(planning, 5), ["scroll", `${planning} .iso-plate`],
  ["shot", `shots/phone-research-${theme}.png`, planning, 1.5],
  open(architecture), step(architecture, 9), ["scroll", `${architecture} .iso-plate`],
  ["shot", `shots/phone-review-${theme}.png`, architecture, 1.5],
] ; else if (motion) actions = [
  open(planning), step(planning, 8), ["click", `${planning} [data-play]`], ["move", ".masthead", 0.5, 0.5],
  ["slow", 0.35], ["sheet", `shots/answers-motion-${theme}.png`, 230, 12, `${planning} .iso-plate`, 1, [300, 100, 600, 420], 4],
]; else actions = [
  ["shot", `shots/two-phases-${theme}.png`, ".iso-page", 1.3],
  ["shot", `shots/planning-${theme}.png`, `${planning} .iso-plate`, 1.6],
  ["lines", `shots/lines-planning-${theme}.png`, `${planning} .iso-plate`],
  ["shot", `shots/architecture-${theme}.png`, `${architecture} .iso-plate`, 1.6],
  ["lines", `shots/lines-architecture-${theme}.png`, `${architecture} .iso-plate`],
  ["shot", `shots/planning-left-${theme}-4x.png`, `${planning} .iso-plate`, 4, [0, 230, 560, 330]],
  ["shot", `shots/source-of-truth-${theme}-4x.png`, `${planning} .iso-plate`, 4, [520, 60, 790, 220]],
  ["shot", `shots/planning-output-${theme}-4x.png`, `${planning} .iso-plate`, 4, [650, 290, 660, 290]],
  ["shot", `shots/architecture-left-${theme}-4x.png`, `${architecture} .iso-plate`, 4, [0, 230, 590, 330]],
  ["shot", `shots/provider-code-${theme}-4x.png`, `${architecture} .iso-plate`, 4, [590, 60, 500, 200]],
  ["shot", `shots/architecture-output-${theme}-4x.png`, `${architecture} .iso-plate`, 4, [780, 230, 560, 330]],
  open(planning), step(planning, 3), ["shot", `shots/questions-${theme}.png`, planning, 1.3],
  step(planning, 12), ["shot", `shots/originals-proposal-${theme}.png`, planning, 1.3],
  open(architecture), step(architecture, 6), ["shot", `shots/code-response-${theme}.png`, architecture, 1.3],
  step(architecture, 9), ["shot", `shots/three-reviewers-${theme}.png`, architecture, 1.3],
];
try {
  console.log(execFileSync(process.execPath, [join(HOME, "scripts", "drive.mjs"), light ? "index-light.html" : "index.html", JSON.stringify(actions), "--height", "3300", ...(phone ? ["--width", "390"] : []), ...(!motion ? ["--reduced"] : [])], { cwd: HERE, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 }));
} catch (error) { console.error(error.stdout || "", error.stderr || error.message); process.exit(1); }
