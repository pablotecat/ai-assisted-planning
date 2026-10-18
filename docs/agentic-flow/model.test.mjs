import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTORIES, AREAS, EXAMPLE, TOTAL_TASKS, snapshotAt, pointOnRoute } from "./model.mjs";
import { beltRectangles } from "./geometry.mjs";

test("dos cadenas completas: documentos → historias refinadas → tareas", () => {
  const [planning, architecture] = FACTORIES;
  assert.equal(snapshotAt(planning, planning.duration).originals, EXAMPLE.documents);
  assert.equal(snapshotAt(planning, planning.duration).histories, EXAMPLE.documents);
  assert.equal(snapshotAt(architecture, architecture.duration).reviewedTasks, TOTAL_TASKS);
  assert.equal(snapshotAt(architecture, architecture.duration).tasks, TOTAL_TASKS);
  assert.equal(TOTAL_TASKS, AREAS.length * EXAMPLE.tasksPerArea);
  assert.ok(planning.nodes.some(n => n.name === "Historias Refinadas"));
  assert.ok(architecture.nodes.some(n => n.name === "Historias Refinadas"));
});

test("cada consulta vuelve por su ruta hasta el refinador que la planteó", () => {
  const planning = FACTORIES[0];
  for (let i = 0; i < EXAMPLE.refiners; i++) {
    const route = planning.routes.find(r => r.id === `query-${i}`);
    assert.equal(route.from, `refiner-${i}`);
    assert.match(route.to, /^coordinator-/);
    assert.ok(planning.packets.some(p => p.route === route.id && p.kind === "question" && !p.reverse));
    assert.ok(planning.packets.some(p => p.route === route.id && p.kind === "answer" && p.reverse));
    const answer = planning.packets.find(p => p.route === route.id && p.kind === "answer");
    const rewrite = planning.steps.find(s => s.title === "Deconstruir y redactar");
    assert.ok(answer.end < rewrite.start);
  }
  for (const id of ["search-code", "search-docs"]) assert.equal(planning.routes.find(r => r.id === id).to, "truth");
  assert.ok(planning.routes.some(r => r.from === "originals" && r.to === "reviewer"));
  assert.ok(planning.routes.some(r => r.from === "joint" && r.to === "reviewer"));
});

test("Test, Back y Front reciben código y tienen un revisor propio antes de volver al principal", () => {
  const line = FACTORIES[1];
  for (const area of AREAS) {
    assert.ok(line.routes.some(r => r.from === "architect" && r.to === `architect-${area.id}`));
    assert.ok(line.routes.some(r => r.from === `architect-${area.id}` && r.to === "provider"));
    assert.ok(line.routes.some(r => r.from === `architect-${area.id}` && r.to === `reviewer-${area.id}`));
    assert.ok(line.routes.some(r => r.from === `reviewer-${area.id}` && r.to === "integrate"));
    assert.ok(line.packets.some(p => p.route === `request-${area.id}` && p.kind === "answer" && p.reverse));
  }
  assert.ok(line.routes.some(r => r.from === "provider" && r.to === "code-store"));
  assert.equal(new Set(line.nodes.filter(n => n.type === "reviewer").map(n => n.id)).size, 3);
});

test("rutas físicas ortogonales y módulos de transportador sin solapamientos", () => {
  for (const line of FACTORIES) {
    const ids = new Set(line.nodes.map(n => n.id));
    line.routes.forEach(route => {
      assert.ok(ids.has(route.from) && ids.has(route.to));
      route.points.slice(1).forEach((p, i) => assert.ok(p[0] === route.points[i][0] || p[1] === route.points[i][1], route.id));
      assert.notDeepEqual(pointOnRoute(route, 0), pointOnRoute(route, 1));
    });
    const plates = beltRectangles(line.routes);
    plates.forEach((a, i) => plates.slice(i + 1).forEach(b => {
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-8 && Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 1e-8;
      assert.equal(overlap, false, "los módulos se tocan, no se penetran");
    }));
  }
});

test("cada fotograma mantiene papeles sobre transportadores, sin atravesar estaciones ni chocar", () => {
  for (const line of FACTORIES) {
    const plates = beltRectangles(line.routes);
    let previous = 0;
    for (let frame = 0; frame <= Math.ceil(line.duration * 60); frame++) {
      const state = snapshotAt(line, Math.min(line.duration, frame / 60));
      const output = line.id === "planning" ? state.histories : state.tasks;
      assert.ok(output >= previous); previous = output;
      if (line.id === "architecture" && output > 0) assert.equal(state.reviewedTasks, TOTAL_TASKS);
      for (const packet of state.packets) {
        const [x, y, z] = packet.point;
        assert.equal(z, 3);
        for (const dx of [-5, 5]) for (const dy of [-4, 4]) assert.ok(plates.some(p => x + dx >= p.x - 1e-7 && x + dx <= p.x + p.w + 1e-7 && y + dy >= p.y - 1e-7 && y + dy <= p.y + p.d + 1e-7), `${packet.id}: papel fuera de la banda`);
        for (const node of line.nodes) assert.ok(!(x + 5 > node.x - node.w / 2 + 1e-6 && x - 5 < node.x + node.w / 2 - 1e-6 && y + 4 > node.y - node.d / 2 + 1e-6 && y - 4 < node.y + node.d / 2 - 1e-6), `${packet.id} atraviesa ${node.id}`);
      }
      for (let i = 0; i < state.packets.length; i++) for (let j = i + 1; j < state.packets.length; j++) {
        const a = state.packets[i], b = state.packets[j];
        if (a.opacity < 0.1 || b.opacity < 0.1) continue;
        assert.ok(Math.abs(a.point[0] - b.point[0]) >= 10 - 1e-6 || Math.abs(a.point[1] - b.point[1]) >= 8 - 1e-6, `${line.id} ${frame / 60}: choque ${a.id} / ${b.id}`);
      }
    }
  }
});
