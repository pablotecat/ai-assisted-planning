export const EXAMPLE = { documents: 3, refiners: 3, investigators: 2, tasksPerArea: 3 };
export const AREAS = [{ id: "test", name: "Test", letter: "T" }, { id: "back", name: "Back", letter: "B" }, { id: "front", name: "Front", letter: "F" }];
export const TOTAL_TASKS = AREAS.length * EXAMPLE.tasksPerArea;
export const FIGURE_SCOPE = "Hoy: investigación, refinamiento y Test UI con lectura directa de su proyecto, Revisor común y publicación versionada. Previsto: Backend, Frontend y proveedor. Las tres ramas, revisores por rama y nueve tareas son el ejemplo visual, no capacidades instaladas ni resultados reales.";

const station = (id, name, detail, x, y, type = "work", w = 84, agent = id) => ({ id, name, detail, x, y, type, w, d: type === "archive" ? 92 : 38, agent });
export const portOf = (node, side = "right") => side === "left" ? [node.x - node.w / 2, node.y + 8] : side === "north" ? [node.x, node.y - node.d / 2] : side === "south" ? [node.x, node.y + node.d / 2] : [node.x + node.w / 2, node.y + 8];

function factory(id, nodes, specs, instructions, runs) {
  const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
  const routes = specs.map(([key, from, to, via = [], kind = "documents", sideFrom = "right", sideTo = "left"]) => ({ id: key, from, to, kind, width: kind === "research" ? 10 : 16, points: [portOf(byId[from], sideFrom), ...via, portOf(byId[to], sideTo)] }));
  let end = 0;
  const steps = instructions.map(([title, text, active, duration = 4.8]) => { const start = end; end += duration; return { title, text, active, start, end, duration }; });
  const packets = [];
  runs.forEach(([index, routeIds, kind, role = "", labels = [], reverse = false, payload = 1]) => {
    const step = steps[index];
    const distances = routeIds.map(id => {
      const points = routes.find(route => route.id === id).points;
      return Math.max(1, points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0) - 12);
    });
    const stagger = 0.55;
    const speed = Math.max(...distances) / Math.max(1, step.duration - (routeIds.length - 1) * stagger - 0.5);
    routeIds.forEach((route, i) => {
      const duration = distances[i] / speed;
      packets.push({ id: `${id}-${packets.length}`, route, kind, role, reverse, payload, label: labels[i] || (kind === "question" ? "?" : kind === "answer" ? "R" : `H${i + 1}`), start: step.start + i * stagger + 0.15, end: step.start + i * stagger + 0.15 + duration });
    });
  });
  return { id, nodes, routes, steps, packets, duration: end };
}

export function planningFactory() {
  const nodes = [
    station("ideas", "Documentos / ideas", "Varios documentos iniciales", 70, 260, "input", 52),
    station("planner", "Planificador", "P · Lee, copia y distribuye", 225, 260, "scanner", 84, "planificador"),
    ...Array.from({ length: EXAMPLE.refiners }, (_, i) => station(`refiner-${i}`, `Refinador ${i + 1}`, "Deconstruye y redacta", 465, 230 + i * 120, "refiner", 84, "refinador")),
    station("investigator-0", "Investigador 1", "Consulta concreta", 650, 80, "switch", 72, "investigador"),
    station("investigator-1", "Investigador 2", "Consulta concreta", 785, 80, "switch", 72, "investigador"),
    station("code-reader", "Lector Código", "Busca comportamiento", 950, 80, "reader", 64, "lector-codigo"),
    station("documentation-reader", "Lector Documentación", "Busca reglas e intención", 1070, 80, "reader", 80, "lector-documentacion"),
    station("truth", "Fuente de Verdad", "Gran almacén de archivos", 1275, 65, "archive", 168),
    station("joint", "Planificador", "P · Revisa todas las historias", 770, 350, "collator", 96, "planificador"),
    station("reviewer", "Revisor", "Originales frente a propuesta", 1060, 350, "reviewer", 104, "revisor"),
    station("originals", "Originales", "Copias fieles conservadas", 225, 535, "originals", 68),
    station("stories", "Historias Refinadas", "Salida de la primera fase", 1300, 350, "stories", 76),
  ];
  const routes = [
    ["intake", "ideas", "planner"],
    ["copy", "planner", "originals", [], "documents", "south", "north"],
    ...Array.from({ length: 3 }, (_, i) => [`assign-${i}`, "planner", `refiner-${i}`, [[345, 268], [345, 238 + i * 120]]]),
    ["query-0", "refiner-0", "investigator-0", [[555, 238], [555, 88]], "research"],
    ["query-1", "refiner-1", "investigator-1", [[555, 358], [555, 30], [725, 30], [725, 88]], "research"],
    ["query-2", "refiner-2", "investigator-0", [[555, 478], [555, 88]], "research"],
    ["ask-code", "investigator-0", "code-reader", [[705, 88], [705, 145], [900, 145], [900, 88]], "research"],
    ["ask-docs", "investigator-1", "documentation-reader", [[840, 88], [840, 165], [1010, 165], [1010, 88]], "research"],
    ["search-code", "code-reader", "truth", [[950, 10], [1170, 10], [1170, 73]], "research", "north"],
    ["search-docs", "documentation-reader", "truth", [[1070, 35], [1170, 35], [1170, 73]], "research", "north"],
    ...Array.from({ length: 3 }, (_, i) => [`draft-${i}`, `refiner-${i}`, "joint", [[620, 238 + i * 120], [620, 358]]]),
    ["proposal", "joint", "reviewer"],
    ["compare-originals", "originals", "reviewer", [[285, 543], [285, 590], [970, 590], [970, 358]]],
    ["refined", "reviewer", "stories"],
  ];
  const steps = [
    ["Entrar y leer", "Varios documentos iniciales llegan al planificador, que lee el encargo y organiza el trabajo.", ["ideas", "planner"]],
    ["Conservar los originales", "El planificador hace una copia fiel de cada documento y conserva los originales para el cotejo final.", ["planner", "originals"]],
    ["Repartir copias", "El planificador envía los documentos a los refinadores. Varias historias se trabajan en paralelo.", ["planner", "refiner-0", "refiner-1", "refiner-2"]],
    ["Preguntar con precisión", "Los refinadores envían consultas concretas a los investigadores: una regla, una excepción o un comportamiento que necesitan aclarar.", ["refiner-0", "refiner-1", "refiner-2", "investigator-0", "investigator-1"]],
    ["Encargar la investigación", "Los investigadores recurren a Lector Código y Lector Documentación para resolver las preguntas recibidas.", ["investigator-0", "investigator-1", "code-reader", "documentation-reader"]],
    ["Buscar en Fuente de Verdad", "Lector Código y Lector Documentación buscan los archivos pertinentes en el gran almacén Fuente de Verdad.", ["code-reader", "documentation-reader", "truth"]],
    ["Recuperar las evidencias", "Los fragmentos de código y documentos relevantes salen del almacén hacia los especialistas que los buscaron.", ["truth", "code-reader", "documentation-reader"]],
    ["Responder al investigador", "Lector Código y Lector Documentación devuelven sus hallazgos. El investigador reúne una respuesta concreta para la pregunta recibida.", ["code-reader", "documentation-reader", "investigator-0", "investigator-1"]],
    ["Devolver las respuestas", "Las respuestas vuelven hasta cada refinador que preguntó, por el mismo recorrido de la consulta.", ["investigator-0", "investigator-1", "refiner-0", "refiner-1", "refiner-2"]],
    ["Deconstruir y redactar", "Con las respuestas, cada refinador separa reglas, criterios y excepciones y redacta de nuevo su historia.", ["refiner-0", "refiner-1", "refiner-2"], 6],
    ["Devolver los borradores", "Los refinadores envían sus historias reconstruidas al planificador.", ["refiner-0", "refiner-1", "refiner-2", "joint"]],
    ["Revisar el conjunto", "El mismo planificador que repartió las copias revisa ahora todas las propuestas juntas: cobertura, coherencia y relaciones entre historias.", ["joint"]],
    ["Cotejar originales y propuesta", "El revisor recibe los originales conservados y la propuesta del planificador. Verifica que el trabajo respeta las fuentes.", ["originals", "joint", "reviewer"], 6],
    ["Apilar Historias Refinadas", "El trabajo verificado se entrega en la pila Historias Refinadas, que alimenta la segunda cadena.", ["reviewer", "stories"], 5.5],
  ];
  const run = [
    [0, ["intake", "intake", "intake"], "document"],
    [1, ["copy", "copy", "copy"], "document", "original"],
    [2, ["assign-0", "assign-1", "assign-2"], "document"],
    [3, ["query-0", "query-1", "query-2"], "question"],
    [4, ["ask-code", "ask-docs"], "question"],
    [5, ["search-code", "search-docs"], "question"],
    [6, ["search-code", "search-docs"], "answer", "", [], true],
    [7, ["ask-code", "ask-docs"], "answer", "", [], true],
    [8, ["query-0", "query-1", "query-2"], "answer", "", [], true],
    [10, ["draft-0", "draft-1", "draft-2"], "story"],
    [12, ["compare-originals", "proposal"], "document", "", ["O", "P"], false, EXAMPLE.documents],
    [13, ["refined", "refined", "refined"], "story", "refined"],
  ];
  return factory("planning", nodes, routes, steps, run);
}

export function architectureFactory() {
  const nodes = [
    station("stories-in", "Historias Refinadas", "La misma pila de la fase 1", 70, 350, "stories-in", 76),
    station("architect", "Arquitecto principal", "A · Lee y reparte las historias", 245, 350, "scanner", 104, "arquitecto"),
    ...AREAS.map((area, i) => station(`architect-${area.id}`, `Arquitecto ${area.name}`, "Lee y prepara varias tareas", 505, 230 + i * 155, "specialist", 104, `arquitecto-${area.id}`)),
    station("provider", "Proveedor", "Entrega fragmentos solicitados", 760, 80, "switch", 104),
    station("code-store", "Código", "Pila de archivos del proyecto", 1035, 65, "archive", 168),
    ...AREAS.map((area, i) => station(`reviewer-${area.id}`, `Revisor · ${area.name}`, "Verifica las tareas de esta rama", 945, 230 + i * 155, "reviewer", 104, `revisor-${area.id}`)),
    station("integrate", "Arquitecto principal", "A · Recibe e integra las tareas", 1190, 385, "collator", 108, "arquitecto"),
    station("tasks", "Tareas", "Salida de las tres especialidades", 1390, 385, "tasks", 76),
  ];
  const routes = [
    ["stories-intake", "stories-in", "architect"],
    ...AREAS.map((area, i) => [`dispatch-${area.id}`, "architect", `architect-${area.id}`, [[370, 358], [370, 238 + i * 155]]]),
    ...AREAS.map((area, i) => [`request-${area.id}`, `architect-${area.id}`, "provider", [[625, 238 + i * 155], [625, 88]], "research"]),
    ["fetch-code", "provider", "code-store", [[880, 88], [880, 73]], "research"],
    ...AREAS.map((area, i) => [`tasks-${area.id}`, `architect-${area.id}`, `reviewer-${area.id}`, [], "documents"]),
    ...AREAS.map((area, i) => [`return-${area.id}`, `reviewer-${area.id}`, "integrate", [[1085, 238 + i * 155], [1085, 393]]]),
    ["tasks-out", "integrate", "tasks"],
  ];
  const steps = [
    ["Tomar Historias Refinadas", "El arquitecto principal toma los documentos producidos por la primera cadena y lee las historias.", ["stories-in", "architect"]],
    ["Repartir por especialidad", "El arquitecto principal envía las historias y los encargos a Test, Back y Front.", ["architect", ...AREAS.map(a => `architect-${a.id}`)]],
    ["Leer el documento", "Cada arquitecto especialista lee la historia y determina qué partes de código necesita conocer.", AREAS.map(a => `architect-${a.id}`)],
    ["Pedir código al proveedor", "Los arquitectos Test, Back y Front solicitan fragmentos concretos de código al proveedor.", ["provider", ...AREAS.map(a => `architect-${a.id}`)]],
    ["Consultar la pila Código", "El proveedor busca en Código los archivos o fragmentos que necesita cada especialista.", ["provider", "code-store"]],
    ["Recuperar los fragmentos", "Los fragmentos solicitados vuelven desde Código al proveedor.", ["code-store", "provider"]],
    ["Entregar el código solicitado", "El proveedor devuelve el código pertinente a cada arquitecto que lo pidió.", ["provider", ...AREAS.map(a => `architect-${a.id}`)]],
    ["Crear varias tareas", "Cada especialista transforma la historia y el contexto de código en varias tareas concretas de su área.", AREAS.map(a => `architect-${a.id}`), 6],
    ["Enviar a su propio revisor", "Cada rama entrega sus tareas a un revisor propio: uno para Test, uno para Back y uno para Front.", [...AREAS.map(a => `architect-${a.id}`), ...AREAS.map(a => `reviewer-${a.id}`)]],
    ["Revisar las tres ramas", "Los tres revisores verifican las tareas de su respectivo especialista antes de devolverlas al arquitecto principal.", AREAS.map(a => `reviewer-${a.id}`), 5.5],
    ["Volver al arquitecto principal", "Las tareas revisadas de Test, Back y Front confluyen de nuevo en el mismo arquitecto principal que repartió el trabajo.", ["integrate", ...AREAS.map(a => `reviewer-${a.id}`)]],
    ["Integrar el conjunto", "El arquitecto principal reúne las tareas revisadas, comprueba sus relaciones y organiza la entrega.", ["integrate"]],
    ["Entregar las tareas", "La segunda cadena entrega las tareas de las tres especialidades. En el ejemplo: tres tareas por área, nueve en total.", ["integrate", "tasks"], 6],
  ];
  const run = [
    [0, ["stories-intake", "stories-intake", "stories-intake"], "story"],
    [1, AREAS.map(a => `dispatch-${a.id}`), "story", "", AREAS.map(() => "H"), false, EXAMPLE.documents],
    [3, AREAS.map(a => `request-${a.id}`), "question"],
    [4, ["fetch-code"], "question"],
    [5, ["fetch-code"], "answer", "", [], true],
    [6, AREAS.map(a => `request-${a.id}`), "answer", "", [], true],
    [8, AREAS.map(a => `tasks-${a.id}`), "task", "", AREAS.map(a => a.letter), false, EXAMPLE.tasksPerArea],
    [10, AREAS.map(a => `return-${a.id}`), "task", "reviewed", AREAS.map(a => a.letter), false, EXAMPLE.tasksPerArea],
    [12, Array(TOTAL_TASKS).fill("tasks-out"), "task", "task-output", AREAS.flatMap(a => Array.from({ length: EXAMPLE.tasksPerArea }, (_, i) => a.letter + (i + 1)))],
  ];
  return factory("architecture", nodes, routes, steps, run);
}

export const FACTORIES = [planningFactory(), architectureFactory()];

export function pointOnRoute(route, share, reverse = false) {
  const points = reverse ? [...route.points].reverse() : route.points;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  // A small sheet enters and leaves a real port without crossing its housing.
  let at = 6 + Math.max(0, Math.min(1, share)) * Math.max(0, total - 12);
  for (let i = 0; i < lengths.length; i++) {
    if (at <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? at / lengths[i] : 0;
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t, 3];
    }
    at -= lengths[i];
  }
  return [...points[0], 3];
}

export function snapshotAt(line, time) {
  const t = Math.max(0, Math.min(line.duration, time));
  const index = Math.min(line.steps.length - 1, line.steps.findIndex(step => t < step.end) < 0 ? line.steps.length - 1 : line.steps.findIndex(step => t < step.end));
  const step = line.steps[index];
  const progress = Math.max(0, Math.min(1, (t - step.start) / step.duration));
  const byRoute = Object.fromEntries(line.routes.map(route => [route.id, route]));
  const packets = line.packets.filter(packet => t >= packet.start && t < packet.end).map(packet => {
    const share = (t - packet.start) / (packet.end - packet.start);
    return { ...packet, share, point: pointOnRoute(byRoute[packet.route], share, packet.reverse), opacity: Math.min(1, share * 12, (1 - share) * 12) };
  });
  const count = role => line.packets.filter(packet => packet.role === role && packet.end <= t).reduce((sum, packet) => sum + packet.payload, 0);
  const rewrite = line.steps.find(s => s.title === "Deconstruir y redactar" || s.title === "Crear varias tareas");
  return { time: t, index, step, progress, packets, done: t === line.duration, active: t === line.duration ? [] : step.active, originals: count("original"), histories: count("refined"), reviewedTasks: count("reviewed"), tasks: count("task-output"), rewrite: rewrite ? Math.max(0, Math.min(1, (t - rewrite.start) / rewrite.duration)) : 0 };
}
