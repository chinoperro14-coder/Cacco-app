// Formulario de pedidos (pedidos.js): lo comparten el servidor, /pedido y el tablero
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../pedidos");

const base = () => ({ area: "Dirección", nombre: "Ana", contacto: "6000-0000", actividad: "Gala de Danza", fecha: "2099-05-10", hora: "17:00",
  servicios: ["diseno", "cobertura"], puntoFocal: { nombre: "Luis", telefono: "6111-1111" },
  detalles: { diseno: { nombre: "Afiche Gala", tipo: "Afiche", formato: "Impreso tamaño carta", textos: "Línea 1\nLínea 2" }, cobertura: { llegada: "16:30", momentos: "Entrega de premios" } } });
const ctx = { hoy: "2099-01-01", folio: "P-0007", id: () => "id1" };

test("cada pregunta tiene su largo y el formulario no deja escribir más de lo que se guarda", () => {
  for (const [k, qs] of Object.entries(P.PREGUNTAS)) {
    assert.ok(P.SERVICIOS[k], `servicio ${k}`);
    for (const q of qs) if (q.tipo !== "entrega") assert.ok(q.max > 0 && q.nota && q.pregunta, `${k}.${q.c}`);
  }
  assert.ok(P.AREAS.every(a => P.PREFIJO_CLAVE[a]));
});

test("el pedido se convierte en borrador con sus respuestas en la nota", () => {
  const r = P.pedidoATarea(base(), ctx);
  assert.equal(r.error, undefined);
  assert.equal(r.tarea.borrador, true);
  assert.deepEqual(Object.keys(r.tarea.secciones).sort(), ["Audiovisual", "Diseño"]);
  assert.match(r.tarea.notas, /Nombre de la pieza: Afiche Gala/);
  assert.match(r.tarea.notas, /Llegada del equipo: 16:30/);
  assert.match(r.tarea.notas, /🌙 Fuera del horario laboral/);
  assert.equal(r.registro.folio, "P-0007");
});

test("lo que pasa del largo se corta y lo peligroso se limpia", () => {
  const b = base();
  b.detalles.diseno.nombre = "x".repeat(500);
  b.actividad = '<img src=x onerror="alert(1)">Gala';
  const r = P.pedidoATarea(b, ctx);
  assert.equal(r.pedido, undefined);
  assert.equal(r.tarea.pedido.detalles.diseno.nombre.length, P.PREGUNTAS.diseno.find(q => q.c === "nombre").max);
  assert.ok(!/[<>"]/.test(r.tarea.titulo));
});

test("faltan datos obligatorios", () => {
  assert.match(P.pedidoATarea({ ...base(), servicios: [] }, ctx).error, /Marca al menos/);
  assert.match(P.pedidoATarea({ ...base(), fecha: "2000-01-01" }, ctx).error, /ya pasó/);
  assert.match(P.pedidoATarea({ ...base(), puntoFocal: {} }, ctx).error, /punto focal/);
});

test("horario laboral y choques", () => {
  assert.equal(P.fueraDeHorario("2099-05-11", "09:00", "11:00"), null);          // lunes
  assert.equal(P.fueraDeHorario("2099-05-10", "09:00"), "fin de semana");         // domingo
  assert.deepEqual(P.choquesHorario([{ fecha: "2099-05-11", hora: "10:00", horaFin: "12:00" }], "2099-05-11", "11:00", "13:00"), [["10:00", "12:00"]]);
});
