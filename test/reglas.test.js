// Reglas por nivel que el servidor aplica a cada guardado (reglas.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const { validarDatos, validarNombres, aplicarReglasRol, versionNivel, reponerOculto, limitador } = require("../reglas");

const base = () => ({
  equipo: [
    { id: "u1", nombre: "Ana", nivel: "lider", email: "ana@x", cats: ["a"] },
    { id: "u2", nombre: "Beto", nivel: "editor", email: "beto@x", cats: [] },
    { id: "u3", nombre: "Caro", nivel: "colaborador", email: "caro@x", cats: [], cedula: "" },
  ],
  tareas: [{ id: "t1", titulo: "Confirmada" }, { id: "t2", titulo: "Borrador", borrador: true }],
  horasExtra: [
    { id: "h1", miembro: "Caro", aprobacion: "Pendiente", horas: "2" },
    { id: "h2", miembro: "Caro", aprobacion: "Aprobado", horas: "3" },
    { id: "h3", miembro: "Beto", aprobacion: "Pendiente", horas: "1" },
  ],
  permisos: [{ id: "p1", miembro: "Caro", aprobacion: "Pendiente" }, { id: "p2", miembro: "Beto", aprobacion: "Aprobado" }],
  publicaciones: [{ id: "pub1", creadoPor: "Caro", estado: "produccion" }, { id: "pub2", creadoPor: "Beto", estado: "aprobado" }],
  bitacora: [{ id: "b1", accion: "Antes" }],
  pedidos: [{ id: "ped1", folio: "P-0001" }],
  historico: [{ id: "his1" }],
});
const copia = o => JSON.parse(JSON.stringify(o));
const LIDER = { id: "u1", nivel: "lider" }, EDITOR = { id: "u2", nivel: "editor" }, COLAB = { id: "u3", nivel: "colaborador" };
const ids = l => l.map(x => x.id).sort();

test("validarDatos rechaza lo que no tiene forma de datos del tablero", () => {
  assert.equal(validarDatos(base()), null);
  assert.ok(validarDatos(null));
  assert.ok(validarDatos([]));
  assert.ok(validarDatos({ equipo: [] }));                              // sin tareas
  assert.ok(validarDatos({ ...base(), tareas: "x" }));
  assert.ok(validarDatos({ ...base(), tareas: [{ titulo: "sin id" }] }));
  assert.ok(validarDatos({ ...base(), etiquetas: [1] }));
});

test("el Líder puede quitar tareas, pero nunca solicitudes de permiso", () => {
  const n = copia(base()); n.tareas = []; n.permisos = [];
  const r = aplicarReglasRol(n, base(), LIDER);
  assert.equal(r.tareas.length, 0);
  assert.deepEqual(ids(r.permisos), ["p1", "p2"]);
});

test("el Colaborador no quita tareas y el Editor solo quita borradores", () => {
  const sinTareas = () => ({ ...copia(base()), tareas: [] });
  assert.deepEqual(ids(aplicarReglasRol(sinTareas(), base(), COLAB).tareas), ["t1", "t2"]);
  assert.deepEqual(ids(aplicarReglasRol(sinTareas(), base(), EDITOR).tareas), ["t1"]);
});

test("una tarea publicada no vuelve a borrador salvo por el Líder, y el Editor no la quita así", () => {
  const aBorrador = () => { const n = copia(base()); n.tareas[0] = { ...n.tareas[0], titulo: "Cambiada", borrador: true }; return n; };
  [EDITOR, COLAB].forEach(u => assert.deepEqual(aplicarReglasRol(aBorrador(), base(), u).tareas[0], { id: "t1", titulo: "Confirmada" }));
  assert.equal(aplicarReglasRol(aBorrador(), base(), LIDER).tareas[0].borrador, true);
  // Volverla borrador y quitarla en el siguiente guardado: la guardada sigue publicada, así que vuelve
  const actual = aplicarReglasRol(aBorrador(), base(), EDITOR), sinT1 = copia(actual);
  sinT1.tareas = sinT1.tareas.filter(t => t.id !== "t1");
  assert.deepEqual(ids(aplicarReglasRol(sinT1, actual, EDITOR).tareas), ["t1", "t2"]);
  // Un borrador sigue siendo borrador al editarlo, y una tarea nueva puede nacer borrador
  const n = copia(base()); n.tareas[1].titulo = "Borrador editado"; n.tareas.push({ id: "t3", titulo: "Nueva", borrador: true });
  const r = aplicarReglasRol(n, base(), EDITOR).tareas;
  assert.equal(r.find(t => t.id === "t2").titulo, "Borrador editado");
  assert.equal(r.find(t => t.id === "t3").borrador, true);
});

test("nadie salvo el Líder cambia niveles, agrega personas o toca perfiles ajenos", () => {
  const n = copia(base());
  n.equipo[2].nivel = "lider"; n.equipo[2].cedula = "8-123-456"; n.equipo[2].cats = ["todo"];
  n.equipo[1].nombre = "Otro nombre";
  n.equipo.push({ id: "u9", nombre: "Nuevo", nivel: "lider" });
  const r = aplicarReglasRol(n, base(), COLAB);
  const caro = r.equipo.find(p => p.id === "u3");
  assert.equal(caro.nivel, "colaborador");
  assert.equal(caro.cedula, "8-123-456");          // su propio perfil sí
  assert.deepEqual(caro.cats, []);
  assert.equal(r.equipo.find(p => p.id === "u2").nombre, "Beto");
  assert.ok(!r.equipo.some(p => p.id === "u9"));
  const quitado = copia(base()); quitado.equipo = quitado.equipo.slice(0, 1);
  assert.equal(aplicarReglasRol(quitado, base(), EDITOR).equipo.length, 3);
});

test("el Colaborador no aprueba horas ni toca registros ajenos o ya revisados", () => {
  const n = copia(base());
  n.horasExtra[0].aprobacion = "Aprobado";          // su pendiente: no puede aprobarla
  n.horasExtra[1].horas = "30";                       // ya aprobada: no se cambia
  n.horasExtra[2].horas = "9";                        // ajena: no se cambia
  n.horasExtra.push({ id: "h9", miembro: "Caro", aprobacion: "Aprobado", horas: "8" });
  const r = aplicarReglasRol(n, base(), COLAB), h = id => r.horasExtra.find(x => x.id === id);
  assert.equal(h("h1").aprobacion, "Pendiente");
  assert.equal(h("h2").horas, "3");
  assert.equal(h("h3").horas, "1");
  assert.equal(h("h9").aprobacion, "Pendiente");
});

test("cada quien retira solo sus horas pendientes; lo revisado o ajeno vuelve", () => {
  const sinHoras = () => ({ ...copia(base()), horasExtra: [] });
  assert.deepEqual(ids(aplicarReglasRol(sinHoras(), base(), COLAB).horasExtra), ["h2", "h3"]);
  assert.deepEqual(ids(aplicarReglasRol(sinHoras(), base(), EDITOR).horasExtra), ["h1", "h2"]);
  assert.equal(aplicarReglasRol(sinHoras(), base(), LIDER).horasExtra.length, 0);
});

test("el Editor sí aprueba horas y permisos de otras personas", () => {
  const n = copia(base()); n.horasExtra[0].aprobacion = "Aprobado"; n.permisos[0].aprobacion = "Aprobado";
  const r = aplicarReglasRol(n, base(), EDITOR);
  assert.equal(r.horasExtra[0].aprobacion, "Aprobado");
  assert.equal(r.permisos[0].aprobacion, "Aprobado");
});

test("el Colaborador anula su permiso pendiente, pero no aprueba ni toca el ajeno", () => {
  const n = copia(base()); n.permisos[0].aprobacion = "Anulado"; n.permisos[1].aprobacion = "Anulado";
  let r = aplicarReglasRol(n, base(), COLAB);
  assert.equal(r.permisos[0].aprobacion, "Anulado");
  assert.equal(r.permisos[1].aprobacion, "Aprobado");
  const m = copia(base()); m.permisos[0].aprobacion = "Aprobado";
  assert.equal(aplicarReglasRol(m, base(), COLAB).permisos[0].aprobacion, "Pendiente");
});

test("el Colaborador no aprueba publicaciones y solo quita las suyas sin aprobar", () => {
  const n = copia(base()); n.publicaciones[0].estado = "aprobado";
  assert.equal(aplicarReglasRol(n, base(), COLAB).publicaciones[0].estado, "produccion");
  const sinPubs = () => ({ ...copia(base()), publicaciones: [] });
  assert.deepEqual(ids(aplicarReglasRol(sinPubs(), base(), COLAB).publicaciones), ["pub2"]);
  assert.equal(aplicarReglasRol(sinPubs(), base(), EDITOR).publicaciones.length, 0);
});

test("la bitácora solo crece y los pedidos e histórico no se borran sin ser Líder", () => {
  const n = copia(base());
  n.bitacora = [{ id: "b2", accion: "Nueva" }, { id: "b1", accion: "Cambiada" }];
  n.pedidos = []; n.historico = [];
  const r = aplicarReglasRol(n, base(), EDITOR);
  assert.deepEqual(r.bitacora.map(b => b.accion), ["Nueva", "Antes"]);
  assert.equal(r.pedidos.length, 1);
  assert.equal(r.historico.length, 1);
  const vacia = copia(base()); vacia.bitacora = [];
  assert.equal(aplicarReglasRol(vacia, base(), COLAB).bitacora.length, 1);
});

test("solo el Líder cambia la asignación automática por área", () => {
  const antes = { ...copia(base()), asigAuto: { "Diseño": ["u5"] } };
  const n = { ...copia(antes), asigAuto: { "Diseño": ["u3"] } };
  assert.deepEqual(aplicarReglasRol(copia(n), antes, EDITOR).asigAuto, { "Diseño": ["u5"] });
  assert.deepEqual(aplicarReglasRol(copia(n), antes, LIDER).asigAuto, { "Diseño": ["u3"] });
  assert.equal(aplicarReglasRol({ ...copia(base()), asigAuto: { x: ["u1"] } }, base(), COLAB).asigAuto, undefined);
  assert.ok(validarDatos({ tareas: [], equipo: [], asigAuto: { "Diseño": "u5" } }));
  assert.equal(validarDatos({ tareas: [], equipo: [], asigAuto: { "Diseño": ["u5"] } }), null);
});

test("solo el Líder cambia nombres: si otro nivel se renombra, se repone y no se adueña de registros ajenos", () => {
  const n = copia(base());
  n.equipo[2].nombre = "Beto"; n.equipo[2].cedula = "8-1-1";
  n.horasExtra = n.horasExtra.filter(h => h.id !== "h3");
  n.permisos.find(p => p.id === "p2").aprobacion = "Pendiente";
  const r = aplicarReglasRol(n, base(), COLAB);
  assert.equal(r.equipo.find(p => p.id === "u3").nombre, "Caro");
  assert.equal(r.equipo.find(p => p.id === "u3").cedula, "8-1-1");
  assert.ok(r.horasExtra.some(h => h.id === "h3"));
  assert.equal(r.permisos.find(p => p.id === "p2").aprobacion, "Aprobado");
  assert.equal(validarNombres(r, base()), null);
  const e = copia(base()); e.equipo[1].nombre = "Roberto";
  assert.equal(aplicarReglasRol(e, base(), EDITOR).equipo.find(p => p.id === "u2").nombre, "Beto");
});

test("un nombre con < > \" ' o de más de 80 caracteres se rechaza", () => {
  const con = nombre => { const n = copia(base()); n.equipo[2].nombre = nombre; return validarNombres(aplicarReglasRol(n, base(), LIDER), base()); };
  assert.ok(con("<script>alert(1)</script>"));
  assert.ok(con("<img src=x onerror=alert(1)>"));
  assert.ok(con('Caro "la jefa"'));
  assert.ok(con("D'Caro"));
  assert.ok(con("x".repeat(81)));
  assert.ok(con(""));
  assert.equal(con("Carolina Pérez"), null);
  const nueva = copia(base()); nueva.equipo.push({ id: "u9", nombre: "<b>Nuevo</b>", nivel: "colaborador" });
  assert.ok(validarNombres(nueva, base()));
  const vieja = copia(base()); vieja.equipo[1].nombre = "Beto <viejo>";   // un nombre ya guardado no frena otros guardados
  assert.equal(validarNombres(copia(vieja), vieja), null);
});

test("no puede haber dos personas con el mismo nombre (sin importar mayúsculas ni espacios)", () => {
  const ren = copia(base()); ren.equipo[1].nombre = "  ana ";
  assert.ok(validarNombres(ren, base()));
  const nueva = copia(base()); nueva.equipo.push({ id: "u9", nombre: "CA RO", nivel: "colaborador" });
  assert.ok(validarNombres(nueva, base()));
  const ok = copia(base()); ok.equipo.push({ id: "u9", nombre: "Carolina", nivel: "colaborador" });
  assert.equal(validarNombres(ok, base()), null);
});

test("cuando el Líder renombra a alguien, el nombre nuevo pasa a todos sus registros", () => {
  const antes = copia(base());
  antes.horasExtra.push({ id: "h4", miembro: "Beto", aprobacion: "Aprobado", aprobadoPor: "Caro", registradoPor: "Caro" });
  antes.tareas[0] = { id: "t1", titulo: "Confirmada", creadaPor: "Caro", secciones: { "Diseño": { responsables: ["u3"], completadoPor: "Caro" } },
    audiovisualData: { asignaciones: [{ userId: "u3", nombre: "Caro", medio: "foto" }, { userId: "u2", nombre: "Beto", medio: "video" }] } };
  antes.bitacora = [{ id: "b1", usuario: "Caro", accion: "Antes", detalle: "Caro hizo algo" }];
  const n = copia(antes); n.equipo[2].nombre = "Carolina";
  const r = aplicarReglasRol(n, antes, LIDER);
  assert.deepEqual(r.horasExtra.map(h => h.miembro), ["Carolina", "Carolina", "Beto", "Beto"]);
  assert.equal(r.horasExtra[3].aprobadoPor, "Carolina");
  assert.equal(r.horasExtra[3].registradoPor, "Carolina");
  assert.equal(r.permisos.find(p => p.id === "p1").miembro, "Carolina");
  assert.equal(r.publicaciones.find(p => p.id === "pub1").creadoPor, "Carolina");
  assert.equal(r.tareas[0].creadaPor, "Carolina");
  assert.equal(r.tareas[0].secciones["Diseño"].completadoPor, "Carolina");
  assert.deepEqual(r.tareas[0].audiovisualData.asignaciones.map(a => a.nombre), ["Carolina", "Beto"]);
  assert.equal(r.bitacora[0].usuario, "Carolina");
  assert.equal(r.bitacora[0].detalle, "Caro hizo algo");
  assert.equal(r.equipo.find(p => p.id === "u2").nombre, "Beto");
});

test("el Colaborador recibe lo suyo y al guardar vuelve lo ajeno que no recibió", () => {
  const antes = copia(base());
  antes.horasExtra.push({ id: "h4", miembro: "Beto", tipo: "compensatorio", aprobacion: "Aprobado", horas: "8", fecha: "2026-01-12", actividad: "Viaje" });
  const v = versionNivel(copia(antes), COLAB);
  assert.deepEqual(v.horasExtra.map(h => h.id), ["h1", "h2", "h4"]);
  assert.equal(v.horasExtra[2].actividad, undefined);
  assert.deepEqual(v.permisos.map(p => p.id), ["p1"]);
  assert.deepEqual([v.bitacora, v.historico], [[], []]);
  assert.deepEqual(v.equipo[1], { id: "u2", nombre: "Beto", nivel: "editor", cats: [], sistema: false });
  assert.equal(v.equipo[2].email, "caro@x");
  assert.deepEqual(versionNivel(copia(antes), { id: "u4", nivel: "lector" }).horasExtra.map(h => h.id), ["h4"]);
  assert.deepEqual(versionNivel(antes, EDITOR), antes);
  // borra su hora pendiente, agrega una y toca el compensatorio ajeno que recibió recortado
  v.horasExtra = [{ id: "h5", miembro: "Caro", aprobacion: "Pendiente", horas: "1" }, v.horasExtra[1], { ...v.horasExtra[2], horas: "0" }];
  v.permisos = [];
  const r = aplicarReglasRol(reponerOculto(v, antes, COLAB), antes, COLAB);
  assert.deepEqual(r.horasExtra.map(h => h.id), ["h5", "h2", "h3", "h4"]);
  assert.deepEqual(r.horasExtra[3], antes.horasExtra[3]);
  assert.deepEqual(ids(r.permisos), ["p1", "p2"]);
  assert.deepEqual(r.equipo, antes.equipo);
  assert.deepEqual([r.bitacora, r.historico], [antes.bitacora, antes.historico]);
});

test("limitador cuenta intentos por clave", () => {
  const l = limitador(2, 60e3);
  assert.equal(l.lleno("a"), false);
  l.sumar("a"); l.sumar("a");
  assert.equal(l.lleno("a"), true);
  assert.equal(l.lleno("b"), false);
  l.limpiar("a");
  assert.equal(l.lleno("a"), false);
});
