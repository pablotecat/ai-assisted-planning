// Synchronize text and the embedded model without rebuilding external Anatomy geometry.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { FACTORIES, FIGURE_SCOPE } from "./model.mjs";
import { planningDescription, stationLabelText } from "./geometry.mjs";

const model = (await readFile(new URL("./model.mjs", import.meta.url), "utf8")).replace(/^export /gm, "");
const live = await readFile(new URL("./live.mjs", import.meta.url), "utf8");
for (const name of ["index.html", "index-light.html"]) {
  const path = new URL(name, import.meta.url);
  const original = await readFile(path, "utf8");
  const previousModel = original.slice(original.indexOf("const EXAMPLE ="), original.indexOf("const FACTORY_CAMERAS="));
  const previous = runInNewContext(previousModel + ";FACTORIES");
  let html = original;
  const scope = `<p class="section-summary" data-flow-scope><strong>ILUSTRATIVA.</strong> ${FIGURE_SCOPE}</p>`;
  const scriptAt = html.indexOf('<script type="module">');
  assert.ok(scriptAt > 0, `${name}: script boundary`);
  let markup = html.slice(0, scriptAt).replace(/<p class="section-summary" data-flow-scope>[\s\S]*?<\/p>\s*/g, "");
  assert.equal([...markup.matchAll(/<figure class="iso-figure">/g)].length, 2, `${name}: figures`);
  markup = markup.replaceAll('<figure class="iso-figure">', `${scope}\n    <figure class="iso-figure">`);
  html = markup + html.slice(scriptAt);
  for (let i = 0; i < FACTORIES.length; i++) {
    const line = FACTORIES[i];
    assert.equal(previous[i].nodes.length, line.nodes.length);
    const physicalRoutes = routes => JSON.stringify(routes.map(route => [route.points, route.width, route.kind]));
    assert.equal(physicalRoutes(previous[i].routes), physicalRoutes(line.routes), `${name}: physical routes`);
    line.nodes.forEach((node, j) => {
      const old = previous[i].nodes[j];
      for (const key of ["x", "y", "w", "d", "type"]) assert.equal(old[key], node[key], `${name}: geometry ${node.id}/${key}`);
      for (const attribute of ["data-station", "data-node-part", "data-rewrite-node"])
        html = html.replaceAll(`${attribute}="${old.id}"`, `${attribute}="${node.id}"`);
      const pattern = new RegExp(`(<g class="station-label" data-station="${node.id}"[^>]*>)([\\s\\S]*?)(</g>)`, "g");
      html = html.replace(pattern, (_, opening, body, closing) => {
        const width = Math.max(node.name.length * 7, node.detail.length * 5.3) + 16;
        return opening.replace(/aria-label="[^"]*"/, `aria-label="${node.name}: ${node.detail}"`)
          + body.replace(/(<text class="station-name"[^>]*>)[\s\S]*?<\/text>/, `$1${stationLabelText(node)}</text>`)
            .replace(/(<text class="station-detail"[^>]*>)[\s\S]*?<\/text>/, `$1${node.detail}</text>`)
            .replace(/(<rect class="station-hit") x="[^"]*"/, `$1 x="${-width / 2}"`).replace(/(<rect class="station-hit"[^>]* )width="[^"]*"/, `$1width="${width}"`)
          + closing;
      });
    });
    line.steps.forEach((step, j) => {
      if (previous[i].steps[j].title !== step.title) html = html.replaceAll(previous[i].steps[j].title, step.title);
    });
  }
  html = html.replace(/aria-label="Cadena completa del planificador:[^"]*"/, `aria-label="${planningDescription}"`);
  const start = html.indexOf("const EXAMPLE ="), camera = html.indexOf("const FACTORY_CAMERAS=");
  const liveStart = html.indexOf("const factoryStill =", camera), end = html.lastIndexOf("</script>");
  assert.ok(start > 0 && camera > start && liveStart > camera && end > liveStart);
  html = html.slice(0, start) + model + html.slice(camera, liveStart) + live + html.slice(end);
  if (html !== original) await writeFile(path, html);
  console.log(`${name}: text and model synchronized; physical geometry preserved`);
}
