// Unión en tres vías que hace la página al guardar (public/index.html: unir3, mergeArrById, mergeE)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const desde = html.indexOf("const _canon="), hasta = html.indexOf("function guardar(){");
assert.ok(desde > 0 && hasta > desde, "no se encontró la unión en index.html");
const { unir3, mergeArrById, mergeE } = new Function(html.slice(desde, hasta) + ";return {unir3,mergeArrById,mergeE};")();

const copia = o => JSON.parse(JSON.stringify(o));
const base = {
  id: "t1", titulo: "A", entregables: [{ id: "e1" }, { id: "e2" }],
  secciones: { Diseño: { estado: "Pendiente", responsables: ["u1"] }, Redes: { estado: "Pendiente" } },
  audiovisualData: { asignaciones: [{ userId: "u1", medio: "foto", tipo: "X", comp: false }, { userId: "u2", medio: "video", tipo: "R", comp: false }] },
};

test("lo que cambió cada uno en la misma tarea se conserva: título y áreas distintas", () => {
  const m = copia(base), t = copia(base);
  m.titulo = "B"; m.secciones.Redes.estado = "Completada";
  t.secciones.Diseño = { ...t.secciones.Diseño, estado: "Completada", completadoPor: "Fer" };
  const r = unir3(base, m, t);
  assert.equal(r.titulo, "B");
  assert.equal(r.secciones.Redes.estado, "Completada");
  assert.equal(r.secciones.Diseño.completadoPor, "Fer");
});

test("si los dos cambiaron el mismo dato gana el último que guarda", () => {
  const m = copia(base), t = copia(base);
  m.secciones.Diseño.estado = "No cumplida"; t.secciones.Diseño.estado = "Completada";
  assert.equal(unir3(base, m, t).secciones.Diseño.estado, "No cumplida");
});

test("entregables por id: lo quitado no revive y lo agregado por el otro se conserva", () => {
  const m = copia(base), t = copia(base);
  m.entregables = [{ id: "e2" }]; t.entregables.push({ id: "e3" });
  assert.deepEqual(unir3(base, m, t).entregables.map(e => e.id), ["e2", "e3"]);
});

test("asignaciones de Audiovisual elemento por elemento", () => {
  const m = copia(base), t = copia(base);
  m.audiovisualData.asignaciones.shift(); m.audiovisualData.asignaciones.push({ userId: "u3", medio: "foto", tipo: "Y", comp: false });
  t.audiovisualData.asignaciones[1].comp = true;
  assert.deepEqual(unir3(base, m, t).audiovisualData.asignaciones.map(a => [a.userId, a.comp]), [["u2", true], ["u3", false]]);
});

test("listas de textos como conjunto, orden de claves y vacíos no cuentan como cambio", () => {
  assert.deepEqual(unir3({ s: ["a"] }, { s: ["a", "b"] }, { s: ["a", "c"] }).s, ["a", "c", "b"]);
  assert.equal(unir3({ x: 1, y: null }, { y: undefined, x: 1 }, { x: 2 }).x, 2);
  assert.equal("fechaFin" in unir3({ fechaFin: "x", a: 1 }, { a: 1 }, { fechaFin: "x", a: 2 }), false);
});

test("tareas: un borrado a propósito no revive; lo editado por el otro sí se conserva", () => {
  const b = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
  assert.deepEqual(mergeArrById(b, [{ id: "b", v: 1 }], [...copia(b), { id: "c" }]).map(x => x.id), ["b", "c"]);
  assert.deepEqual(mergeArrById(b, [{ id: "b", v: 1 }], [{ id: "a", v: 2 }, { id: "b", v: 1 }]).map(x => x.id), ["b", "a"]);
});

test("mergeE junta por dentro de cada tarea", () => {
  const b = { tareas: [copia(base)], equipo: [], etiquetas: [] }, m = copia(b), t = copia(b);
  m.tareas[0].secciones.Redes.estado = "Completada"; t.tareas[0].secciones.Diseño.estado = "Completada";
  const r = mergeE(b, m, t).tareas[0].secciones;
  assert.deepEqual([r.Diseño.estado, r.Redes.estado], ["Completada", "Completada"]);
});
