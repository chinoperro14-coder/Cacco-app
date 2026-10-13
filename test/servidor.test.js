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
fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify({
  equipo: [{ id: "u1", nombre: "Ana", nivel: "lider" }, { id: "u2", nombre: "Beto", nivel: "editor" },
           { id: "u3", nombre: "Caro", nivel: "colaborador" }, { id: "u4", nombre: "TV", nivel: "lector" }],
  tareas: [{ id: "t1", titulo: "Confirmada" }], bitacora: [], permisos: [],
  config: { clavesPedidos: { "Dirección": "clave-direccion-1" } },
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

test("al cambiar la contraseña, las sesiones anteriores dejan de valer", async () => {
  const vieja = await entrar("editor@x.org");
  await new Promise(r => setTimeout(r, 1100));          // las sesiones se fechan por segundo
  const r = await (await pedir("/api/change-password", { metodo: "POST", token: vieja, cuerpo: { passwordActual: CLAVE, passwordNueva: CLAVE } })).json();
  assert.ok(r.token);
  assert.equal((await pedir("/api/data", { token: vieja })).status, 401);
  assert.equal((await pedir("/api/data", { token: r.token })).status, 200);
});

test("el formulario de pedidos frena a quien prueba claves", async () => {
  let ultima;
  for (let i = 0; i < 11; i++) ultima = await pedir("/api/pedidos/oficina", { metodo: "POST", cuerpo: { clave: "mala" + i } });
  assert.equal(ultima.status, 429);
});

test("tras varios intentos fallidos de entrar, se espera", async () => {
  let ultima;
  for (let i = 0; i < 11; i++) ultima = await pedir("/api/login", { metodo: "POST", cuerpo: { email: "lider@x.org", password: "mala" } });
  assert.equal(ultima.status, 429);
});
