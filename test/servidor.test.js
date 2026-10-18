// Pruebas del servidor con datos de prueba en una carpeta temporal (sin MongoDB)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path"), zlib = require("zlib");
const bcrypt = require("bcrypt"), jwt = require("jsonwebtoken");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cacco-prueba-"));
process.env.CACCO_DATOS = dir;
process.env.MONGODB_URI = "";
process.env.JWT_SECRET = "clave-de-prueba";
delete process.env.RENDER;
const CLAVE = "prueba1234", hash = bcrypt.hashSync(CLAVE, 4);
fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify([
  { id: "u1", email: "lider@x.org", password: hash, nivel: "lider" },
  { id: "u2", email: "editor@x.org", password: hash, nivel: "editor" },
  { id: "u3", email: "colab@x.org", password: hash, nivel: "colaborador" },
  { id: "u4", email: "tv@x.org", password: hash, nivel: "lector" },
]));
const CLAVES = { "Administración": "clave-admin-1", "Dirección": "clave-direccion-1", "Desarrollo Social": "clave-social-1",
  "Coordinación de Arte y Cultura": "clave-arte-1", "Educación Artística y Cultural": "clave-educa-1", "Otra": "clave-otra-1" };
const ficha = (id, nombre, nivel) => ({ id, nombre, nivel, email: `${nombre.toLowerCase()}@x.org`, cargo: "Cargo", cats: [], secciones: ["Diseño"],
  cedula: `8-${id}`, correo: `${nombre.toLowerCase()}@gmail.com`, puesto: "Puesto", posicion: "100", ingreso: "2024-01-01" });
fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify({
  equipo: [ficha("u1", "Ana", "lider"), ficha("u2", "Beto", "editor"), ficha("u3", "Caro", "colaborador"), ficha("u4", "TV", "lector")],
  tareas: [{ id: "t1", titulo: "Confirmada" }],
  horasExtra: [
    { id: "h1", miembro: "Beto", fecha: "2026-01-05", horas: "3", aprobacion: "Aprobado", actividad: "Gala" },
    { id: "h2", miembro: "Caro", fecha: "2026-01-06", horas: "2", aprobacion: "Pendiente", actividad: "Concierto" },
    { id: "h3", miembro: "Beto", tipo: "compensatorio", fecha: "2026-01-12", horas: "8", aprobacion: "Aprobado", actividad: "Día libre" },
    { id: "h4", miembro: "Ana", tipo: "compensatorio", fecha: "2026-01-13", horas: "4", aprobacion: "Pendiente" },
  ],
  permisos: [{ id: "p1", miembro: "Beto", motivo: 3, desdeF: "2026-01-07", aprobacion: "Aprobado", motivoAnul: "x" },
             { id: "p2", miembro: "Caro", motivo: 1, desdeF: "2026-01-08", aprobacion: "Pendiente" }],
  bitacora: [{ id: "b0", accion: "Permiso solicitado", detalle: "Beto — Enfermedad" }], historico: [{ id: "his1", reporte: "Horas de Beto" }],
  config: { clavesPedidos: CLAVES },
}));

const app = require("../app");
let srv, URL_;
test.before(() => new Promise(ok => { srv = app.listen(0, () => { URL_ = `http://127.0.0.1:${srv.address().port}`; ok(); }); }));
test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const pedir = (ruta, { metodo = "GET", token, cuerpo, headers = {} } = {}) => fetch(URL_ + ruta, {
  method: metodo, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...headers },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
});
const entrar = async email => (await (await pedir("/api/login", { metodo: "POST", cuerpo: { email, password: CLAVE } })).json()).token;

test("no se pueden bajar datos, contraseñas ni código por la ruta de archivos", async () => {
  for (const r of ["/users.json", "/data.json", "/app.js", "/reglas.js", "/package.json", "/.env",
                   "/api/%2e%2e/users.json", "/api/%2e%2e/app.js", "/%2e%2e/users.json", "/public/../users.json", "/api/..%2fusers.json"]) {
    const res = await pedir(r);
    assert.ok([400, 401, 403, 404].includes(res.status), `${r} respondió ${res.status}`);
    assert.ok(!(await res.text()).includes(hash), `${r} dejó ver las contraseñas`);
  }
  assert.equal((await pedir("/caccoisotipo.png")).status, 200);
  assert.equal((await pedir("/pedidos.js")).status, 200);
  assert.equal((await pedir("/")).status, 200);
});

test("el inicio de sesión no dice si el correo existe", async () => {
  const a = await (await pedir("/api/login", { metodo: "POST", cuerpo: { email: "nadie@x.org", password: "x" } })).json();
  const b = await (await pedir("/api/login", { metodo: "POST", cuerpo: { email: "colab@x.org", password: "x" } })).json();
  assert.equal(a.error, b.error);
});

test("un enlace de adjunto o una sesión inventada no sirven como sesión", async () => {
  for (const t of [jwt.sign({ adj: "a1" }, "clave-de-prueba"), jwt.sign({ adj: "a1", typ: "adj" }, "clave-de-prueba"),
                   jwt.sign({ id: "u1", nivel: "lider" }, "otra-clave"), jwt.sign({ id: "no-existe", nivel: "lider" }, "clave-de-prueba")])
    assert.equal((await pedir("/api/data", { token: t })).status, 401);
});

test("manda el nivel que la cuenta tiene hoy, no el que dice la sesión", async () => {
  const falso = jwt.sign({ id: "u3", email: "colab@x.org", nivel: "lider" }, "clave-de-prueba", { expiresIn: "1h" });
  assert.equal((await pedir("/api/respaldos", { token: falso })).status, 403);
  const d = await (await pedir("/api/data", { token: falso })).json();
  assert.equal(d.config?.clavesPedidos, undefined);           // las claves del formulario no le llegan
});

test("los datos llegan comprimidos y solo cuando cambiaron", async () => {
  const t = await entrar("editor@x.org");
  const r1 = await pedir("/api/data", { token: t, headers: { "Accept-Encoding": "gzip" } });
  assert.equal(r1.status, 200);
  const huella = r1.headers.get("etag");
  assert.ok(huella);
  const r2 = await pedir("/api/data", { token: t, headers: { "If-None-Match": huella } });
  assert.equal(r2.status, 304);
  // fetch descomprime solo; se revisa a mano que el servidor sí comprime
  const crudo = await new Promise((ok, mal) => require("http").get(URL_ + "/api/data",
    { headers: { Authorization: "Bearer " + t, "Accept-Encoding": "gzip" } }, res => {
      const partes = []; res.on("data", c => partes.push(c)); res.on("end", () => ok({ res, cuerpo: Buffer.concat(partes) }));
    }).on("error", mal));
  assert.equal(crudo.res.headers["content-encoding"], "gzip");
  assert.ok(JSON.parse(zlib.gunzipSync(crudo.cuerpo)).tareas);
});

test("guardar con una versión vieja responde conflicto; con la vigente, guarda", async () => {
  const t = await entrar("lider@x.org");
  const r = await pedir("/api/data", { token: t }), huella = r.headers.get("etag"), d = await r.json();
  d.tareas.push({ id: "t2", titulo: "Nueva" });
  const ok = await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d, headers: { "If-Match": huella } });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.ok(j.huella && j.huella !== huella);
  const viejo = await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d, headers: { "If-Match": huella } });
  assert.equal(viejo.status, 409);
});

test("guardados seguidos con la huella recibida nunca chocan consigo mismos", async () => {
  for (const email of ["lider@x.org", "colab@x.org"]) {
    const t = await entrar(email);
    const r = await pedir("/api/data", { token: t });
    let huella = r.headers.get("etag"), d = await r.json();
    for (let i = 0; i < 25; i++) {
      d.bitacora = [{ id: `b-${email}-${i}`, accion: "Prueba", detalle: String(i) }, ...(d.bitacora || [])];
      const res = await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d, headers: { "If-Match": huella } });
      assert.equal(res.status, 200, `guardado ${i} de ${email}`);
      const j = await res.json();
      if (j.ajustado) { const g = await pedir("/api/data", { token: t }); huella = g.headers.get("etag"); d = await g.json(); }
      else huella = j.huella;
    }
  }
});

test("lector no guarda y un guardado sin forma de datos se rechaza", async () => {
  const tv = await entrar("tv@x.org"), t = await entrar("lider@x.org");
  assert.equal((await pedir("/api/data", { metodo: "POST", token: tv, cuerpo: { tareas: [], equipo: [] } })).status, 403);
  assert.equal((await pedir("/api/data", { metodo: "POST", token: t, cuerpo: { hola: 1 } })).status, 400);
});

test("el servidor deshace lo que el nivel no permite y avisa", async () => {
  const t = await entrar("colab@x.org");
  const d = await (await pedir("/api/data", { token: t })).json();
  d.tareas = []; d.equipo.find(p => p.id === "u3").nivel = "lider";
  const r = await (await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d })).json();
  assert.equal(r.ajustado, true);
  const ahora = await (await pedir("/api/data", { token: t })).json();
  assert.ok(ahora.tareas.length >= 1);
  assert.equal(ahora.equipo.find(p => p.id === "u3").nivel, "colaborador");
  // la clave del formulario no se puede cambiar con un guardado normal
  const lider = await entrar("lider@x.org");
  const dl = await (await pedir("/api/data", { token: lider })).json();
  dl.config = { clavesPedidos: { "Dirección": "robada12345" } };
  await pedir("/api/data", { metodo: "POST", token: lider, cuerpo: dl });
  assert.equal((await (await pedir("/api/data", { token: lider })).json()).config.clavesPedidos["Dirección"], "clave-direccion-1");
});

test("un nombre con signos de código o repetido no se guarda, y el colaborador no se cambia el nombre", async () => {
  assert.equal((await pedir("/nombres.js")).status, 200);
  const t = await entrar("lider@x.org");
  const d = await (await pedir("/api/data", { token: t })).json();
  d.equipo.find(p => p.id === "u3").nombre = "<img src=x onerror=alert(1)>";
  assert.equal((await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d })).status, 400);
  d.equipo.find(p => p.id === "u3").nombre = " beto ";
  assert.equal((await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d })).status, 400);
  const c = await entrar("colab@x.org");
  const dc = await (await pedir("/api/data", { token: c })).json();
  dc.equipo.find(p => p.id === "u3").nombre = "Beto";
  assert.equal((await (await pedir("/api/data", { metodo: "POST", token: c, cuerpo: dc })).json()).ajustado, true);
  assert.equal((await (await pedir("/api/data", { token: c })).json()).equipo.find(p => p.id === "u3").nombre, "Caro");
});

test("al cambiar la contraseña, las sesiones anteriores dejan de valer", async () => {
  const vieja = await entrar("editor@x.org");
  await new Promise(r => setTimeout(r, 1100));          // las sesiones se fechan por segundo
  const r = await (await pedir("/api/change-password", { metodo: "POST", token: vieja, cuerpo: { passwordActual: CLAVE, passwordNueva: CLAVE } })).json();
  assert.ok(r.token);
  assert.equal((await pedir("/api/data", { token: vieja })).status, 401);
  assert.equal((await pedir("/api/data", { token: r.token })).status, 200);
});

test("colaborador y lector no reciben horas, permisos ni datos personales ajenos", async () => {
  const ed = await (await pedir("/api/data", { token: await entrar("editor@x.org") })).json();
  assert.equal(ed.horasExtra.length, 4); assert.equal(ed.permisos.length, 2); assert.equal(ed.equipo[0].cedula, "8-u1");
  const c = await (await pedir("/api/data", { token: await entrar("colab@x.org") })).json();
  assert.deepEqual(c.horasExtra.map(h => h.id), ["h2", "h3"]);             // las suyas y quién sale por compensatorio
  assert.deepEqual(c.horasExtra[1], { id: "h3", miembro: "Beto", tipo: "compensatorio", aprobacion: "Aprobado", horas: "8", fecha: "2026-01-12" });
  assert.deepEqual(c.permisos.map(p => p.id), ["p2"]);
  assert.deepEqual(c.bitacora, []); assert.deepEqual(c.historico, []);
  for (const p of c.equipo.filter(p => p.id !== "u3"))
    for (const k of ["cedula", "correo", "email", "puesto", "posicion", "ingreso"]) assert.equal(p[k], undefined, `${p.nombre}.${k}`);
  assert.equal(c.equipo.find(p => p.id === "u1").nombre, "Ana");
  assert.equal(c.equipo.find(p => p.id === "u3").cedula, "8-u3");        // su propia ficha llega completa
  const l = await (await pedir("/api/data", { token: await entrar("tv@x.org") })).json();
  assert.deepEqual(l.horasExtra.map(h => h.id), ["h3"]); assert.deepEqual(l.permisos, []);
  assert.equal(l.equipo.find(p => p.id === "u3").cedula, undefined);
  assert.ok(!JSON.stringify(l).includes("Enfermedad") && !JSON.stringify(c).includes("Enfermedad"));
});

test("un guardado del colaborador con su versión no borra lo ajeno que no recibió", async () => {
  const t = await entrar("colab@x.org"), antes = await (await pedir("/api/data", { token: await entrar("lider@x.org") })).json();
  const r = await pedir("/api/data", { token: t }), huella = r.headers.get("etag"), d = await r.json();
  assert.notEqual(huella, (await pedir("/api/data", { token: await entrar("editor@x.org") })).headers.get("etag"));
  d.horasExtra.find(h => h.id === "h2").horas = "2.5";
  d.horasExtra.unshift({ id: "h5", miembro: "Caro", fecha: "2026-01-20", horas: "1", aprobacion: "Pendiente" });
  d.bitacora.unshift({ id: "b-colab", accion: "Hora registrada" });
  const g = await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d, headers: { "If-Match": huella } });
  assert.equal(g.status, 200);
  const j = await g.json();
  assert.equal(j.ajustado, false);
  assert.equal((await pedir("/api/data", { token: t, headers: { "If-None-Match": j.huella } })).status, 304);
  assert.equal((await pedir("/api/data", { metodo: "POST", token: t, cuerpo: d, headers: { "If-Match": huella } })).status, 409);
  const ahora = await (await pedir("/api/data", { token: await entrar("lider@x.org") })).json();
  assert.deepEqual(ahora.horasExtra.map(h => h.id), ["h5", "h1", "h2", "h3", "h4"]);
  assert.equal(ahora.horasExtra.find(h => h.id === "h2").horas, "2.5");
  assert.deepEqual(ahora.horasExtra.find(h => h.id === "h3"), antes.horasExtra.find(h => h.id === "h3"));
  assert.deepEqual(ahora.permisos, antes.permisos);
  assert.deepEqual(ahora.equipo, antes.equipo);
  assert.deepEqual(ahora.historico, antes.historico);
  assert.deepEqual(ahora.bitacora.map(b => b.id), ["b-colab", ...antes.bitacora.map(b => b.id)]);
});

test("los fallos de un correo no impiden entrar a otra persona desde la misma conexión", async () => {
  let ultima;
  for (let i = 0; i < 11; i++) ultima = await pedir("/api/login", { metodo: "POST", cuerpo: { email: "otro@x.org", password: "mala" } });
  assert.equal(ultima.status, 429);
  const t = await entrar("colab@x.org");
  assert.ok(t);
  for (let i = 0; i < 11; i++) ultima = await pedir("/api/change-password", { metodo: "POST", token: t, cuerpo: { passwordActual: "mala", passwordNueva: "otra12345" } });
  assert.equal(ultima.status, 429);
  assert.ok(await entrar("tv@x.org"));                                   // cambiar contraseña tiene su propio contador
});

test("varias oficinas pueden enviar pedidos desde la misma conexión", async () => {
  const pedido = clave => ({ clave, areaOtra: "Biblioteca", nombre: "Ana", contacto: "6000-0000", actividad: "Gala de Danza", fecha: "2099-05-10", hora: "17:00",
    servicios: ["cobertura"], puntoFocal: { nombre: "Luis", telefono: "6111-1111" }, detalles: { cobertura: { llegada: "16:30" } } });
  for (const clave of Object.values(CLAVES)) {
    const r = await pedir("/api/pedidos", { metodo: "POST", cuerpo: pedido(clave) });
    assert.equal(r.status, 200, `${clave}: ${(await r.json()).error}`);
  }
  let r;
  for (let i = 0; i < 20; i++) r = await pedir("/api/pedidos", { metodo: "POST", cuerpo: pedido(CLAVES["Dirección"]) });
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /^Se enviaron muchos pedidos desde esta red/);
  assert.equal((await pedir("/api/pedidos", { metodo: "POST", cuerpo: pedido(CLAVES["Administración"]) })).status, 200);
});

test("el formulario de pedidos frena a quien prueba claves", async () => {
  let ultima;
  for (let i = 0; i < 31; i++) ultima = await pedir("/api/pedidos/oficina", { metodo: "POST", cuerpo: { clave: "mala" + i } });
  assert.equal(ultima.status, 429);
});

test("diez contraseñas malas desde otra red no dejan fuera a la persona en su oficina", async () => {
  let ultima;
  for (let i = 0; i < 11; i++)
    ultima = await pedir("/api/login", { metodo: "POST", cuerpo: { email: "editor@x.org", password: "mala" }, headers: { "X-Forwarded-For": "66.6.6.6" } });
  assert.equal(ultima.status, 429);
  assert.ok(await entrar("editor@x.org"));
});

test("tras varios intentos fallidos de entrar, se espera", async () => {
  let ultima;
  for (let i = 0; i < 11; i++) ultima = await pedir("/api/login", { metodo: "POST", cuerpo: { email: "lider@x.org", password: "mala" } });
  assert.equal(ultima.status, 429);
});
