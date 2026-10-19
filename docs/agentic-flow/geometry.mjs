// The factory has one world: x along the assembly line, y across its lanes, z up.
// Rectangular belt modules are unioned before drawing so junctions never overlap.
export function beltRectangles(routes) {
  const rectangles = [];
  for (const route of routes) {
    const half = route.width / 2;
    route.points.slice(1).forEach((p, i) => {
      const a = route.points[i];
      if (a[0] === p[0] && a[1] !== p[1]) rectangles.push({ x: a[0] - half, y: Math.min(a[1], p[1]), w: route.width, d: Math.abs(p[1] - a[1]) });
      else if (a[1] === p[1] && a[0] !== p[0]) rectangles.push({ x: Math.min(a[0], p[0]), y: a[1] - half, w: Math.abs(p[0] - a[0]), d: route.width });
      else if (a[0] !== p[0] || a[1] !== p[1]) throw Error(`Non-orthogonal belt: ${route.id}`);
    });
    route.points.slice(1, -1).forEach(([x, y]) => rectangles.push({ x: x - half, y: y - half, w: route.width, d: route.width }));
  }
  const xs = [...new Set(rectangles.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const out = [], open = new Map();
  for (let i = 0; i < xs.length - 1; i++) {
    const x = xs[i], right = xs[i + 1], intervals = rectangles.filter(r => r.x < right && r.x + r.w > x).map(r => [r.y, r.y + r.d]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const interval of intervals) {
      const prev = merged.at(-1);
      if (prev && interval[0] <= prev[1]) prev[1] = Math.max(prev[1], interval[1]);
      else merged.push([...interval]);
    }
    const next = new Map();
    for (const [top, bottom] of merged) {
      const key = `${top}:${bottom}`, previous = open.get(key);
      if (previous && previous.x + previous.w === x) { previous.w += right - x; next.set(key, previous); }
      else { const rect = { x, y: top, w: right - x, d: bottom - top, r: 0 }; out.push(rect); next.set(key, rect); }
    }
    open.clear();
    next.forEach((value, key) => open.set(key, value));
  }
  return out;
}

export const stationLabelText = n => n.agent.startsWith("lector-") ? `<tspan x="0" dy="-12">Lector</tspan><tspan x="0" dy="12">${n.name.split(" ").slice(1).join(" ")}</tspan>` : n.name;
export const planningDescription = "Cadena completa del planificador: documentos, copia de originales, tres refinadores, dos investigadores, Lector Código y Lector Documentación, Fuente de Verdad, revisión conjunta, cotejo y pila de Historias Refinadas.";

export function makeFactoryScene(line, k, G, A) {
  const W = 1460, H = 670;
  const P = k.fitProjection([[0, -70, 0], [1450, 640, 0], [0, 640, -10], [1450, -70, 0], [1275, 19, 108]], W, H, { pad: 31, azimuth: 90, elevation: 52 });
  const R = A.recorder(P);
  const at = p => k.iso(p, P), S = k.solidSvg, L = k.lineSvg, D = k.dotsSvg;
  const labels = [], moving = [], shadows = [];
  const screws = (plan, z, inset = 4) => {
    const points = k.corners(plan, inset);
    return L(points.map(([x, y]) => k.ring(x, y, 1.1, z, P, 16)).join(""), { tone: "lo" }) + D(points.map(([x, y]) => at([x, y, z])), { size: 0.5 });
  };
  const rules = (x, y, w, z, count = 3) => L(Array.from({ length: count }, (_, i) => k.lineOnTop([x, y + i * 2.8], [x + w * (i === count - 1 ? 0.62 : 1), y + i * 2.8], z, P)).join(""), { tone: "lo", free: true });
  function put(name, node, centre, paths, shape, { tone = "mid", inner = "", extra = "", lit = false, attrs = "" } = {}) {
    return R.put({ name, piece: node, at: centre, svg: `<g data-node-part="${node}"${attrs}>${S(paths, { tone, inner, lit })}${extra}</g>`, shapes: [R.solid(shape)] });
  }
  function slab(name, node, plan, z, h, style = {}) {
    return put(name, node, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], k.slabOf(plan, z, h, P, 5, style.bevel ?? 0.6), A.slab(plan, z, h, { name, ground: z === 0 }, 5), style);
  }
  function cylinder(name, node, x, y, radius, z, height, style = {}) {
    return put(name, node, [x, y, z + height / 2], k.cylinder(x, y, radius, z, height, P, 48, 0.35), A.cylinder(x, y, radius, z, height, { name, ground: z === 0 }), style);
  }
  function paper(name, node, x, y, width, depth, z, style = {}) {
    const thickness = style.thickness ?? 0.65;
    return slab(name, node, { x: x - width / 2, y: y - depth / 2, w: width, d: depth, r: 0.7 }, z, thickness, { tone: "hi", bevel: 0, extra: rules(x - width / 2 + 3, y - depth / 2 + 3, width - 6, z + thickness, depth > 12 ? 3 : 1), ...style });
  }
  function label(n, height) {
    const p = at([n.x, n.y - n.d / 2, height]);
    const width = Math.max(n.name.length * 7, n.detail.length * 5.3) + 16;
    const research = line.id === "planning" && ["investigator-0", "investigator-1", "code-reader", "documentation-reader"].includes(n.id);
    const x = n.id === "originals" ? p[0] - 100 * P.scale : p[0];
    const y = research ? at([n.x, 10, 0])[1] - 50 : p[1] - 33;
    labels.push(`<g class="station-label" data-station="${n.id}" role="button" tabindex="0" aria-label="${n.name}: ${n.detail}" transform="translate(${x} ${y})"><text class="station-name" text-anchor="middle">${stationLabelText(n)}</text><text class="station-detail" y="16" text-anchor="middle">${n.detail}</text><rect class="station-hit" x="${-width / 2}" y="-16" width="${width}" height="40" rx="4"/></g>`);
  }
  function pile(n, count, attribute) {
    const plan = { x: n.x - n.w / 2, y: n.y - 19, w: n.w, d: 38, r: 3 };
    slab(`${n.id}.bed`, n.id, plan, 0, 3, { tone: "lo", extra: screws(plan, 3) });
    for (const y of [n.y - 18, n.y + 15]) slab(`${n.id}.guide.${y}`, n.id, { x: n.x - n.w / 2 + 5, y, w: n.w - 10, d: 3, r: 0.5 }, 3, 7, { tone: "lo" });
    for (let i = 0; i < count; i++) paper(`${n.id}.sheet.${i}`, n.id, n.x, n.y + 2, n.w - 20, 23, 3 + i * 0.95, { thickness: 0.95, attrs: ` data-stock="${attribute}" data-sheet="${i}"` });
    label(n, 12);
    const p = at([n.x, n.y + 30, 0]);
    labels.push(`<text class="stock-count" data-stock-count="${attribute}" text-anchor="middle" x="${p[0]}" y="${p[1] + 15}">${count} ${attribute === "tasks" ? "tareas" : ["histories", "input-histories"].includes(attribute) ? "historias" : "documentos"}</text>`);
  }
  function archive(n) {
    const x = n.x - n.w / 2, y = n.y - 46;
    const bed = { x, y, w: n.w, d: 92, r: 3 };
    slab(`${n.id}.pedestal`, n.id, bed, 0, 3, { tone: "lo", extra: screws(bed, 3, 5) });
    slab(`${n.id}.back`, n.id, { x, y, w: n.w, d: 3, r: 0.4 }, 3, 78, { tone: "mid" });
    for (const sx of [x, x + n.w - 3]) slab(`${n.id}.side.${sx}`, n.id, { x: sx, y: y + 3, w: 3, d: 89, r: 0.3 }, 3, 78, { tone: "mid" });
    for (const z of [27, 51]) slab(`${n.id}.shelf.${z}`, n.id, { x: x + 3, y: y + 3, w: n.w - 6, d: 87, r: 0.3 }, z, 3, { tone: "mid" });
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const box = { x: x + 8 + col * 51, y: y + 28, w: 43, d: 62, r: 1.4 }, z = row ? [0, 30, 54][row] : 3;
      const seams = [4, 8, 12, 16].map(h => k.sideSeam(box, z + h, P, 5)).join("");
      slab(`${n.id}.files.${row}.${col}`, n.id, box, z, 19, { tone: "lo", inner: L(seams, { tone: "faint" }), extra: rules(box.x + 5, box.y + 8, 25, z + 19, 4) + D(k.dotGrid(box.x + 5, box.y + 43, 6, 2, 5, z + 19, P), { size: 0.45, tone: "lo" }) });
    }
    label(n, 85);
  }
  function work(n) {
    const plan = { x: n.x - n.w / 2, y: n.y - 19, w: n.w, d: 38, r: 3 };
    slab(`${n.id}.bed`, n.id, plan, 0, 3, { tone: "mid", extra: screws(plan, 3, 4) });
    const body = { x: plan.x + 4, y: plan.y + 2, w: n.w - 8, d: 14, r: 2 };
    const vents = [0, 1, 2, 3, 4].map(i => k.planOutline({ x: body.x + 7 + i * 7, y: body.y + 4, w: 3.6, d: 6, r: 1 }, 21, P, 4)).join("");
    slab(`${n.id}.housing`, n.id, body, 3, 18, { tone: "mid", inner: L(k.sideSeam(body, 14, P, 5), { tone: "faint" }), extra: screws(body, 21, 3) + L(vents, { tone: "faint" }) });
    if (n.type === "switch") {
      cylinder(`${n.id}.selector`, n.id, n.x, n.y + 7, 8, 3, 3, { tone: "hi", extra: L(k.knurl(n.x, n.y + 7, 8, 3, 6, 32, P), { tone: "lo" }) + L(k.lineOnTop([n.x, n.y + 7], [n.x + 6, n.y + 7], 6, P), { tone: "hi", free: true }) + D([at([n.x, n.y + 7, 6])], { size: 0.6, tone: "hi" }) });
    } else if (n.type === "reviewer") {
      for (const dx of [-n.w / 2 + 5, n.w / 2 - 9]) slab(`${n.id}.reader-post.${dx}`, n.id, { x: n.x + dx, y: n.y + 2, w: 4, d: 13, r: 0.5 }, 3, 18);
      slab(`${n.id}.reader-bridge`, n.id, { x: plan.x + 5, y: n.y + 3, w: n.w - 10, d: 5, r: 0.5 }, 21, 5, { tone: "hi", extra: D([at([plan.x + 10, n.y + 5.5, 26]), at([plan.x + n.w - 10, n.y + 5.5, 26])], { size: 0.5 }) });
      paper(`${n.id}.original`, n.id, n.x - 19, n.y + 8, 25, 16, 3);
      paper(`${n.id}.proposal`, n.id, n.x + 19, n.y + 8, 25, 16, 3, { attrs: ` data-reviewed="${n.id}"` });
    } else if (n.type === "refiner") {
      for (let i = 0; i < 3; i++) paper(`${n.id}.strip.${i}`, n.id, n.x, n.y + 3 + i * 4, 28, 4, 3, { attrs: ` data-rewrite="${i}" data-rewrite-node="${n.id}"` });
      for (const dx of [-n.w / 2 + 5, n.w / 2 - 8]) slab(`${n.id}.guide.${dx}`, n.id, { x: n.x + dx, y: n.y + 1, w: 3, d: 15, r: 0.5 }, 3, 2, { tone: "lo" });
    } else if (n.type === "specialist") {
      for (let i = 0; i < 3; i++) paper(`${n.id}.task.${i}`, n.id, n.x - 27 + i * 27, n.y + 8, 20, 15, 3, { attrs: ` data-task-card="${i}"` });
    } else {
      paper(`${n.id}.work`, n.id, n.x - 8, n.y + 8, 29, 17, 3);
      cylinder(`${n.id}.knob`, n.id, plan.x + n.w - 14, n.y + 8, 4.2, 3, 4, { tone: "mid", extra: L(k.knurl(plan.x + n.w - 14, n.y + 8, 4.2, 3, 7, 24, P), { tone: "lo" }) });
      for (const dx of [-n.w / 2 + 5, n.w / 2 - 8]) slab(`${n.id}.scan-post.${dx}`, n.id, { x: n.x + dx, y: n.y + 1, w: 3, d: 14, r: 0.4 }, 3, 10);
      slab(`${n.id}.scan-head`, n.id, { x: plan.x + 5, y: n.y + 3, w: n.w - 10, d: 3, r: 0.4 }, 13, 4, { tone: "hi" });
    }
    label(n, n.type === "reviewer" ? 27 : 22);
  }

  // Each disjoint plate is a real, flush module of the roller conveyor.
  const belts = beltRectangles(line.routes);
  belts.forEach((plan, i) => {
    const horizontal = plan.w > plan.d;
    const seams = [];
    if (horizontal && plan.d <= 20) for (let x = plan.x + 7; x < plan.x + plan.w - 4; x += 9) seams.push(k.lineOnTop([x, plan.y], [x, plan.y + plan.d], 3, P));
    else if (!horizontal && plan.w <= 20) for (let y = plan.y + 7; y < plan.y + plan.d - 4; y += 9) seams.push(k.lineOnTop([plan.x, y], [plan.x + plan.w, y], 3, P));
    slab(`stand.belt.${i}`, "conveyors", plan, 0, 3, { tone: "lo", bevel: 0, extra: L(seams.join(""), { tone: "faint" }) });
  });
  for (const n of line.nodes) {
    const plan = { x: n.x - n.w / 2 - 4, y: n.y - n.d / 2 - 4, w: n.w + 8, d: n.d + 8, r: 4 };
    shadows.push(`<path class="iso-halo machine-shadow" d="${k.haloOf(plan, 0, 0, P)}"/>`);
    if (n.type === "archive") archive(n);
    else if (["input", "originals", "stories", "stories-in", "tasks"].includes(n.type)) pile(n, n.type === "tasks" ? 9 : 3, n.type === "originals" ? "originals" : n.type === "stories" ? "histories" : n.type === "tasks" ? "tasks" : n.type === "stories-in" ? "input-histories" : "input");
    else work(n);
  }
  A.settle(R, P);
  const routes = line.routes.map(route => {
    const segments = route.points.slice(1).map((p, i) => ({ a: route.points[i], b: p, length: Math.hypot(p[0] - route.points[i][0], p[1] - route.points[i][1]) }));
    const longest = segments.sort((a, b) => b.length - a.length)[0];
    const [ax, ay] = longest.a, [bx, by] = longest.b, ux = (bx - ax) / longest.length, uy = (by - ay) / longest.length;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2;
    const triangle = direction => k.onTop([[cx + ux * 4 * direction, cy + uy * 4 * direction], [cx - ux * 3 * direction - uy * 2.5, cy - uy * 3 * direction + ux * 2.5], [cx - ux * 3 * direction + uy * 2.5, cy - uy * 3 * direction - ux * 2.5]], 3.2, P, true);
    return `<path class="route-ink" data-route="${route.id}" d="${k.onTop(route.points, 3.15, P)}"/><path class="belt-direction" d="${triangle(1)}"/>` + (route.kind === "research" ? `<path class="belt-direction return-direction" transform="${k.translateAlong(P, [-ux * 11, -uy * 11, 0])}" d="${triangle(-1)}"/>` : "");
  }).join("");
  // One reusable sheet for each packet; only its translation and opacity change.
  for (const packet of line.packets) {
    const count = Math.min(3, packet.payload);
    const sheets = Array.from({ length: count }, (_, i) => S(k.slabOf({ x: -5, y: -4, w: 10, d: 8, r: 0.5 }, 3 + i * 0.65, 0.65, P, 4, 0), { tone: "hi", lit: true })).join("");
    const origin = at([0, 0, 0]);
    const text = k.faceTextSvg(k.topMatrix([0, 1], 3 + count * 0.65 + 0.05, P), packet.label, { size: 4.2, tone: "hi", anchor: "middle" });
    moving.push(`<g class="packet" data-packet="${packet.id}" data-kind="${packet.kind}" style="opacity:0" transform="translate(0 0)"><g transform="translate(${-origin[0]} ${-origin[1]})">${sheets}${text}</g></g>`);
  }
  const ordered = [...R.items].sort((a, b) => a.key - b.key);
  const body = `${shadows.join("")}<g data-belt-layer>${ordered.filter(item => item.piece === "conveyors").map(item => item.svg).join("")}</g><g class="route-layer">${routes}</g><g class="packet-layer">${moving.join("")}</g><g data-solid-layer>${ordered.filter(item => item.piece !== "conveyors").map(item => item.svg).join("")}</g><g class="labels-layer">${labels.join("")}</g>`;
  const svg = k.figureSvg({ width: W, height: H, label: line.id === "planning" ? planningDescription : "Cadena completa de arquitectura: Historias Refinadas, arquitecto principal, Test, Back y Front, proveedor y pila Código, tres revisores, integración del arquitecto principal y pila de Tareas.", body });
  return { svg, P, R, belts, W, H };
}
