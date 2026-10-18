const factoryStill = matchMedia("(prefers-reduced-motion: reduce)");
const factoryAnnouncer = document.querySelector("[data-announcer]");
let factoryFrame = 0, factoryLast = 0, factoryBoth = false, factorySpeed = 1;
const factories = FACTORIES.map(line => {
  const root = document.querySelector(`[data-factory="${line.id}"]`);
  return { line, root, camera: FACTORY_CAMERAS[line.id], time: line.duration, playing: false, visible: false, hover: false, selected: null, idle: 0, lastIndex: -1, user: false,
    packets: [...root.querySelectorAll("[data-packet]")], stocks: [...root.querySelectorAll("[data-stock]")], parts: [...root.querySelectorAll("[data-node-part]")], labels: [...root.querySelectorAll("[data-station]")], routes: [...root.querySelectorAll("[data-route]")],
    play: root.querySelector("[data-play]"), slider: root.querySelector("[data-timeline]"), stage: root.querySelector(".iso-stage"), viewport: root.querySelector(".scene-viewport"), readout: root.querySelector("[data-readout]"), state: root.querySelector("[data-line-state]"), title: root.querySelector("[data-current-title]"), text: root.querySelector("[data-current-text]"), number: root.querySelector("[data-current-number]"), counts: root.querySelector("[data-counts]") };
});

function factoryDraw(factory) {
  const state = snapshotAt(factory.line, factory.time);
  const activePackets = new Map(state.packets.map(packet => [packet.id, packet]));
  const onRoutes = new Set(state.packets.map(packet => packet.route));
  if (factory.selected) factory.line.routes.filter(route => route.from === factory.selected || route.to === factory.selected).forEach(route => onRoutes.add(route.id));
  const onNodes = new Set(factory.selected ? [factory.selected] : state.active);
  factory.parts.forEach(part => part.toggleAttribute("data-on", onNodes.has(part.dataset.nodePart)));
  factory.labels.forEach(label => label.toggleAttribute("data-on", onNodes.has(label.dataset.station)));
  factory.routes.forEach(route => route.classList.toggle("is-on", onRoutes.has(route.dataset.route)));
  for (const el of factory.packets) {
    const packet = activePackets.get(el.dataset.packet);
    el.style.opacity = packet ? String(packet.opacity) : "0";
    if (packet) {
      const p = iso([packet.point[0], packet.point[1], 0], factory.camera);
      el.setAttribute("transform", `translate(${p[0]} ${p[1]})`);
    }
  }
  for (const sheet of factory.stocks) {
    const kind = sheet.dataset.stock;
    const count = kind === "originals" ? state.originals : kind === "histories" ? state.histories : kind === "tasks" ? state.tasks : EXAMPLE.documents;
    sheet.style.opacity = Number(sheet.dataset.sheet) < count ? "1" : "0";
  }
  factory.root.querySelectorAll("[data-stock-count]").forEach(el => {
    const kind = el.dataset.stockCount;
    const value = kind === "originals" ? state.originals : kind === "histories" ? state.histories : kind === "tasks" ? state.tasks : EXAMPLE.documents;
    el.textContent = `${value} ${kind === "tasks" ? "tareas" : ["histories", "input-histories"].includes(kind) ? "historias" : "documentos"}`;
  });
  factory.root.querySelectorAll("[data-rewrite]").forEach(el => {
    const offset = Math.sin(state.rewrite * Math.PI) * (Number(el.dataset.rewrite) === 1 ? -8 : 8);
    el.setAttribute("transform", translateAlong(factory.camera, [offset, 0, 0]));
  });
  factory.root.querySelectorAll("[data-task-card]").forEach(el => el.style.opacity = String(Math.max(0.12, Math.min(1, state.rewrite * 4 - Number(el.dataset.taskCard) * 0.65))));
  const planning = factory.line.id === "planning";
  factory.readout.textContent = planning ? `Historias Refinadas · ${state.histories} / ${EXAMPLE.documents}` : `Tareas · ${state.tasks} / ${TOTAL_TASKS}`;
  factory.counts.textContent = planning ? `${state.originals} originales · ${state.histories} historias` : `${state.reviewedTasks} revisadas · ${state.tasks} entregadas`;
  factory.root.dataset.time = factory.time.toFixed(3);
  factory.root.dataset.step = String(state.index);
  factory.root.dataset.done = String(state.done);
  factory.root.dataset.playing = String(factory.playing);
  factory.root.dataset.output = String(planning ? state.histories : state.tasks);
  factory.slider.value = String(factory.time);
  factory.slider.setAttribute("aria-valuetext", state.done ? "Vista completa de la cadena" : state.step.title);
  factory.play.innerHTML = factory.playing ? `<span aria-hidden="true">Ⅱ</span> Pausar recorrido` : `<span aria-hidden="true">▷</span> Recorrer fase ${planning ? 1 : 2}`;
  factory.state.textContent = factory.playing ? "En recorrido" : state.done ? "Vista completa" : "Exploración";
  if (factory.selected) {
    const node = factory.line.nodes.find(n => n.id === factory.selected);
    factory.number.textContent = "•";
    factory.title.textContent = node.name;
    factory.text.textContent = node.detail + ". " + factory.line.steps.filter(step => step.active.includes(node.id)).map(step => step.text).join(" ");
  } else if (factory.lastIndex !== state.index || factory.lastDone !== state.done || factory.lastSelected) {
    factory.number.textContent = state.done ? "✓" : String(state.index + 1).padStart(2, "0");
    factory.title.textContent = state.done ? planning ? "Historias listas para la segunda fase" : "Tareas de las tres especialidades, reunidas" : state.step.title;
    factory.text.textContent = state.done ? planning ? "Los originales se conservan, los refinadores reciben las respuestas y el revisor coteja la propuesta conjunta antes de entregarla en Historias Refinadas." : "Las tareas de Test, Back y Front han pasado por sus tres revisores y vuelven al arquitecto principal para la entrega conjunta." : state.step.text;
  }
  factory.root.querySelectorAll("[data-step]").forEach((button, i) => {
    button.classList.toggle("is-current", !state.done && i === state.index);
    if (!state.done && i === state.index) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
  });
  factory.lastIndex = state.index;
  factory.lastDone = state.done;
  factory.lastSelected = factory.selected;
}

function factoryRun() {
  if (!factoryFrame && !document.hidden && factories.some(f => f.visible)) { factoryLast = 0; factoryFrame = requestAnimationFrame(factoryTick); }
}
function factoryTick(now) {
  factoryFrame = 0;
  const dt = factoryLast ? Math.min((now - factoryLast) / 1000, 1 / 30) : 1 / 60;
  factoryLast = now;
  for (const factory of factories) {
    if (!factory.visible || factory.hover || factory.selected || factoryStill.matches) continue;
    if (factory.playing) {
      factory.time = Math.min(factory.line.duration, factory.time + dt * factorySpeed);
      if (factory.time === factory.line.duration) {
        factory.playing = false;
        factory.idle = 0;
        factoryAnnouncer.textContent = factory.line.id === "planning" ? "Fase 1 completada: Historias Refinadas." : "Fase 2 completada: tareas entregadas.";
        if (factoryBoth && factory.line.id === "planning") {
          const next = factories[1]; next.time = 0; next.playing = true; next.user = true;
          next.root.scrollIntoView({ block: "start", behavior: "smooth" });
        } else if (factory.line.id === "architecture") factoryBoth = false;
      }
      factoryDraw(factory);
    } else if (!factory.user) {
      factory.idle += dt;
      if (factory.idle > 9) { factory.time = 0; factory.playing = true; factory.idle = 0; factoryDraw(factory); }
    }
  }
  if (!document.hidden && !factoryStill.matches && factories.some(f => f.visible && !f.hover && !f.selected && (f.playing || !f.user))) factoryFrame = requestAnimationFrame(factoryTick);
}
function factoryCenter(factory, ids) {
  if (factory.viewport.scrollWidth <= factory.viewport.clientWidth + 1) return;
  const node = factory.line.nodes.find(n => ids.includes(n.id));
  if (!node) return;
  const p = iso([node.x, node.y, 0], factory.camera);
  const width = factory.stage.getBoundingClientRect().width;
  factory.viewport.scrollTo({ left: p[0] / 1460 * width - factory.viewport.clientWidth / 2, behavior: factoryStill.matches ? "auto" : "smooth" });
}
function factorySeek(factory, time, announce = true) {
  factoryBoth = false;
  factory.time = Math.max(0, Math.min(factory.line.duration, time));
  factory.playing = false; factory.user = true; factory.selected = null;
  factoryDraw(factory);
  const state = snapshotAt(factory.line, factory.time);
  if (announce) { factoryAnnouncer.textContent = state.done ? "Vista completa" : state.step.title; factoryCenter(factory, state.step.active); }
}
function factoryToggle(factory) {
  factoryBoth = false; factory.user = true; factory.selected = null;
  if (factoryStill.matches) {
    const state = snapshotAt(factory.line, factory.time);
    const index = state.done ? 0 : Math.min(factory.line.steps.length - 1, state.index + 1);
    const step = factory.line.steps[index]; return factorySeek(factory, step.start + step.duration / 2);
  }
  if (factory.time >= factory.line.duration) factory.time = 0;
  factory.playing = !factory.playing;
  factoryDraw(factory); factoryRun();
}
for (const factory of factories) {
  factory.play.addEventListener("click", () => factoryToggle(factory));
  factory.root.querySelector("[data-overview]").addEventListener("click", () => factorySeek(factory, factory.line.duration));
  factory.slider.addEventListener("input", () => factorySeek(factory, Number(factory.slider.value), false));
  factory.slider.addEventListener("change", () => { const state = snapshotAt(factory.line, factory.time); factoryAnnouncer.textContent = state.step.title; factoryCenter(factory, state.step.active); });
  factory.root.querySelector(".steps").addEventListener("click", event => {
    const button = event.target.closest("[data-step]");
    if (!button) return;
    const step = factory.line.steps[Number(button.dataset.step)]; factorySeek(factory, step.start + step.duration / 2);
  });
  function select(event) {
    const label = event.target.closest("[data-station]");
    if (!label) return;
    factory.selected = factory.selected === label.dataset.station ? null : label.dataset.station;
    factory.user = true; factory.playing = false; factoryBoth = false;
    factoryDraw(factory); factoryAnnouncer.textContent = factory.title.textContent;
  }
  factory.stage.addEventListener("click", select);
  factory.stage.addEventListener("keydown", event => {
    if (event.target.closest("[data-station]") && ["Enter", " "].includes(event.key)) { event.preventDefault(); return select(event); }
    const state = snapshotAt(factory.line, factory.time);
    if (["ArrowRight", "ArrowLeft", "Home", "End", " ", "Escape"].includes(event.key)) event.preventDefault(); else return;
    if (event.key === " ") return factoryToggle(factory);
    if (event.key === "Home") return factorySeek(factory, 0);
    if (event.key === "End") return factorySeek(factory, factory.line.duration);
    if (event.key === "Escape") { factory.selected = null; factory.playing = false; factory.user = true; return factoryDraw(factory); }
    const i = Math.max(0, Math.min(factory.line.steps.length - 1, state.index + (event.key === "ArrowRight" ? 1 : -1)));
    const step = factory.line.steps[i]; factorySeek(factory, step.start + step.duration / 2);
  });
  factory.stage.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") factory.hover = true; });
  factory.stage.addEventListener("pointerleave", () => { factory.hover = false; factoryRun(); });
  factory.stage.addEventListener("focusin", () => { factory.hover = true; });
  factory.stage.addEventListener("focusout", event => { if (!factory.stage.contains(event.relatedTarget)) { factory.hover = false; factoryRun(); } });
  new IntersectionObserver(entries => {
    factory.visible = entries.at(-1).isIntersecting;
    factoryRun();
  }, { rootMargin: "0px" }).observe(factory.stage);
  factoryDraw(factory);
}
document.querySelector("[data-run-all]").addEventListener("click", () => {
  factories.forEach(f => { f.time = 0; f.playing = false; f.user = true; f.selected = null; factoryDraw(f); });
  factoryBoth = true;
  factories[0].playing = !factoryStill.matches;
  factories[0].root.scrollIntoView({ block: "start", behavior: factoryStill.matches ? "auto" : "smooth" });
  if (factoryStill.matches) { factoryBoth = false; factories.forEach(f => factorySeek(f, f.line.duration)); }
  factoryDraw(factories[0]); factoryRun();
});
document.querySelector("[data-theme-toggle]").addEventListener("click", event => {
  document.body.dataset.theme = document.body.dataset.theme === "light" ? "dark" : "light";
  event.currentTarget.textContent = document.body.dataset.theme === "light" ? "Oscuro ◐" : "Claro ◐";
});
document.querySelector("[data-speed]").addEventListener("change", event => { factorySpeed = Number(event.target.value); });
factoryStill.addEventListener("change", () => { if (factoryStill.matches) factories.forEach(f => { f.playing = false; factoryDraw(f); }); factoryRun(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && factoryFrame) { cancelAnimationFrame(factoryFrame); factoryFrame = 0; } else factoryRun(); });
