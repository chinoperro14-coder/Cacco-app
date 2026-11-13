// Avisos al celular: a quién le llega qué
const test = require("node:test");
const assert = require("node:assert/strict");
const { asignaciones, avisosNuevos, recordatorios, relojPanama } = require("../push");

const tarea = (extra) => ({ id: "t1", titulo: "Concierto", fecha: "2026-11-20", hora: "15:00",
  secciones: { "Diseño": { responsables: ["u5"], estado: "Pendiente" }, "Audiovisual": { responsables: ["u3"], estado: "Completada" } }, ...extra });

test("al aprobar un borrador con responsables, se avisa a cada uno de lo que le toca", () => {
  const antes = { tareas: [tarea({ borrador: true })] }, despues = { tareas: [tarea()] };
  const r = asignaciones(antes, despues, "u1", "2026-11-14");
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].para, ["u5"]);
  assert.match(r[0].cuerpo, /Concierto · Diseño · vie 20 nov · 3:00 p\. m\./);
});

test("no se avisa en borradores, a quien guardó, a quien ya estaba ni en actividades pasadas", () => {
  const t = tarea();
  assert.equal(asignaciones({ tareas: [] }, { tareas: [tarea({ borrador: true })] }, "u1", "2026-11-14").length, 0);
  assert.equal(asignaciones({ tareas: [] }, { tareas: [t] }, "u5", "2026-11-14").length, 0);
  assert.equal(asignaciones({ tareas: [t] }, { tareas: [t] }, "u1", "2026-11-14").length, 0);
  assert.equal(asignaciones({ tareas: [] }, { tareas: [t] }, "u1", "2026-11-21").length, 0);
  assert.equal(asignaciones({ tareas: [] }, { tareas: [tarea({ cancelada: { motivo: "x" } })] }, "u1", "2026-11-14").length, 0);
});

test("lo que queda por aprobar llega a Líder y Editor; la respuesta, a la persona", () => {
  const users = [{ id: "u1", nivel: "lider" }, { id: "u2", nivel: "editor" }, { id: "u5", nivel: "colaborador" }];
  const equipo = [{ id: "u5", nombre: "ANA" }];
  const despues = { notifs: [
    { id: "n1", ico: "👀", txt: "Pieza por aprobar: Afiche", sub: "Diseño" },
    { id: "n2", ico: "✅", txt: "Permiso aprobado: ANA", sub: "12 nov", miembro: "ANA" },
    { id: "n3", ico: "🎉", txt: "Tarea completada: \"X\"", sub: "100%" },
    { id: "n0", ico: "📨", txt: "Pedido P-0001 de Dirección: Gala", sub: "Formulario" } ] };
  const r = avisosNuevos({ notifs: [{ id: "n0" }] }, despues, "u2", users, equipo);
  assert.deepEqual(r.map(a => a.para), [["u1"], ["u5"]]);
});

test("la víspera a las 4 p. m. llega un resumen, y una hora antes, el recordatorio", () => {
  const data = { tareas: [tarea(), tarea({ id: "t2", titulo: "Gala", hora: "09:00" }), tarea({ id: "t3", borrador: true })] };
  assert.equal(recordatorios(data, "2026-11-19", "2026-11-20", 15 * 60 + 59).length, 0);
  const v = recordatorios(data, "2026-11-19", "2026-11-20", 16 * 60);
  assert.equal(v.length, 1);
  assert.equal(v[0].clave, "v:u5:2026-11-20");
  assert.match(v[0].titulo, /2 actividades/);
  assert.match(v[0].cuerpo, /^9:00 a\. m\. · Gala\n3:00 p\. m\. · Concierto$/);
  const h = recordatorios(data, "2026-11-20", "2026-11-21", 14 * 60);
  assert.deepEqual(h.map(a => a.clave), ["h:t1:2026-11-20:u5"]);
  assert.equal(recordatorios(data, "2026-11-20", "2026-11-21", 13 * 60 + 59).length, 0);
  assert.equal(recordatorios(data, "2026-11-20", "2026-11-21", 15 * 60).length, 0);
});

test("actividades de varios días y otras fechas también recuerdan", () => {
  const data = { tareas: [tarea({ fechaFin: "2026-11-22", otrasFechas: ["2026-11-25"] })] };
  assert.equal(recordatorios(data, "2026-11-21", "2026-11-22", 14 * 60).length, 1);
  assert.equal(recordatorios(data, "2026-11-24", "2026-11-25", 16 * 60)[0].clave, "v:u5:2026-11-25");
  assert.equal(recordatorios(data, "2026-11-25", "2026-11-26", 14 * 60).length, 1);
});

test("el reloj usa la hora de Panamá", () => {
  const r = relojPanama(Date.UTC(2026, 10, 14, 3, 30));   // 14 nov 03:30 UTC = 13 nov 10:30 p. m. en Panamá
  assert.deepEqual(r, { hoy: "2026-11-13", manana: "2026-11-14", min: 22 * 60 + 30 });
});
