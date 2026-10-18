require("dotenv").config();
const express  = require("express");
const path     = require("path");
const fs       = require("fs");
const crypto   = require("crypto");
const zlib     = require("zlib");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");
const { validarDatos, validarNombres, aplicarReglasRol, NIVELES, limitador } = require("./reglas");

const app        = express();
// La clave de las sesiones nunca va en el código (el repositorio es público).
// Sin JWT_SECRET se usa una clave aleatoria por arranque: las sesiones se cierran al reiniciar.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
if (!process.env.JWT_SECRET)
  console.warn("⚠️  Falta JWT_SECRET — usando clave temporal. Defínela en Render (Environment) para que las sesiones duren.");
const PORT       = process.env.PORT || 3000;
const MONGO_URI  = process.env.MONGODB_URI?.includes("xxxxx") ? null : process.env.MONGODB_URI;
// En Render los archivos locales se borran en cada despliegue: sin MongoDB no se arranca (se perderían los datos)
if (!MONGO_URI && process.env.RENDER) {
  console.error("❌ Falta MONGODB_URI en Render. Sin base de datos los cambios se perderían en el próximo despliegue.");
  process.exit(1);
}
// Carpeta de los datos locales (desarrollo y pruebas). En producción todo va en MongoDB.
const DIR_DATOS = process.env.CACCO_DATOS ? path.resolve(process.env.CACCO_DATOS) : __dirname;
const nuevoId = (n = 6) => Date.now().toString(36) + crypto.randomBytes(n).toString("hex");

app.disable("x-powered-by");
app.set("trust proxy", 1);   // Render pone un proxy delante: req.ip es la IP real de quien se conecta
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "same-origin" });
  next();
});
app.use(express.json({ limit: "5mb" }));
// Lo único que se publica tal cual son las imágenes de public/. Las páginas van comprimidas (más abajo)
// y nunca se sirven los datos, las contraseñas ni el código del servidor.
app.use(express.static(path.join(__dirname, "public"), { dotfiles: "deny", index: false, maxAge: "7d",
  setHeaders: (res, ruta) => { if (ruta.endsWith(".html")) res.set("Cache-Control", "no-cache"); } }));

// ════════════════════════
//  MODELOS MONGODB
// ════════════════════════
const DataSchema = new mongoose.Schema({ _id: String, payload: mongoose.Schema.Types.Mixed });
const UserSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nivel:    { type: String, required: true },
  ultimo:   { type: Date },
  claveCambiada: { type: Date }   // las sesiones abiertas antes de esta fecha dejan de valer
});
const DataModel = mongoose.models.AppData || mongoose.model("AppData", DataSchema);
const UserModel = mongoose.models.AppUser || mongoose.model("AppUser", UserSchema);

// ════════════════════════
//  HELPERS DE DATOS
// ════════════════════════
// Sin MongoDB (desarrollo y pruebas) se usan archivos locales
const DATA_FILE  = path.join(DIR_DATOS, "data.json");
const USERS_FILE = path.join(DIR_DATOS, "users.json");
function leerJSONLocal(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  return def;
}

// Copia en memoria de los datos (hay un solo servidor). Cada versión tiene su huella (ETag): la página
// pregunta «¿cambió algo?» y solo baja todo cuando cambió. Se relee de la base cada 30 s por si alguien la cambió directo.
let cache = null;
function ponerCache(payload) {
  const json = JSON.stringify(payload);
  cache = { payload, json, huella: crypto.createHash("sha1").update(json).digest("base64url").slice(0, 20), leido: Date.now(), variantes: {} };
  return cache;
}
async function estadoData() {
  if (cache && Date.now() - cache.leido < 30e3) return cache;
  let payload;
  if (!MONGO_URI) payload = leerJSONLocal(DATA_FILE, {});
  else { const doc = await DataModel.findById("main").lean(); payload = doc ? doc.payload : {}; }
  return ponerCache(payload || {});
}
// Cada quien recibe su propia copia: cambiarla no toca la de memoria
async function leerData() { return JSON.parse((await estadoData()).json); }
async function escribirData(data) {
  if (!MONGO_URI) fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  else await DataModel.findByIdAndUpdate("main", { payload: data }, { upsert: true });
  return ponerCache(JSON.parse(JSON.stringify(data)));
}
// Los cambios a los datos van de uno en uno (leer → cambiar → guardar), para que dos guardados a la vez no se pisen
let cola = Promise.resolve();
function enCola(fn) { const r = cola.then(fn, fn); cola = r.catch(() => {}); return r; }

let cacheUsers = null;
async function leerUsers() {
  if (cacheUsers && Date.now() - cacheUsers.t < 15e3) return cacheUsers.lista;
  const lista = MONGO_URI ? await UserModel.find({}).lean() : leerJSONLocal(USERS_FILE, []);
  cacheUsers = { t: Date.now(), lista };
  return lista;
}
async function escribirUser(u) {
  cacheUsers = null;
  if (!MONGO_URI) {
    const arr = leerJSONLocal(USERS_FILE, []);
    const i = arr.findIndex(x => x.id === u.id);
    if (i >= 0) arr[i] = { ...arr[i], ...u }; else arr.push(u);
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2)); return;
  }
  await UserModel.findOneAndUpdate({ id: u.id }, u, { upsert: true, new: true });
}
async function eliminarUser(id) {
  cacheUsers = null;
  if (!MONGO_URI) {
    const arr = leerJSONLocal(USERS_FILE, []).filter(u => u.id !== id);
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2)); return;
  }
  await UserModel.deleteOne({ id });
}

// ════════════════════════
//  MIDDLEWARE JWT
// ════════════════════════
// Solo vale una sesión de una cuenta que sigue existiendo; el nivel es el que tiene hoy (si el Líder lo cambia,
// rige de inmediato). Los enlaces firmados de adjuntos no sirven como sesión.
const firmarSesion = (u, recordar) => jwt.sign({ id: u.id, email: u.email, nivel: u.nivel, typ: "ses" }, JWT_SECRET, { expiresIn: recordar ? "30d" : "8h" });
async function verificarToken(req, res, next) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers["authorization"] || "");
  if (!m) return res.status(401).json({ error: "Sin sesión" });
  let p;
  try { p = jwt.verify(m[1], JWT_SECRET); } catch { return res.status(401).json({ error: "La sesión venció. Vuelve a entrar." }); }
  if (!p || p.adj !== undefined || (p.typ && p.typ !== "ses") || !p.id) return res.status(401).json({ error: "Sesión no válida" });
  try {
    const u = (await leerUsers()).find(x => x.id === p.id);
    if (!u || !NIVELES.includes(u.nivel)) return res.status(401).json({ error: "Tu cuenta ya no existe. Habla con el Líder." });
    if (u.claveCambiada && p.iat < Math.floor(new Date(u.claveCambiada).getTime() / 1000))
      return res.status(401).json({ error: "La contraseña cambió. Vuelve a entrar." });
    req.usuario = { id: u.id, email: u.email, nivel: u.nivel };
    req.sesionLarga = p.exp - p.iat > 86400;   // entró con «Recordarme»
    next();
  } catch { res.status(500).json({ error: "No se pudo revisar la sesión" }); }
}
function soloLider(req, res, next) {
  if (req.usuario?.nivel !== "lider")
    return res.status(403).json({ error: "Solo el Líder puede hacer esto" });
  next();
}

// Última actividad de cada persona (para ver en Equipo quién usa el tablero).
// Cuenta entrar, guardar o usar la página; no cuenta una pestaña abierta sin tocar.
const ultimoMarcado = new Map();
function marcarActivo(id) {
  if (!id) return;
  const ahora = Date.now();
  if (ahora - (ultimoMarcado.get(id) || 0) < 60e3) return;
  ultimoMarcado.set(id, ahora);
  const ultimo = new Date(ahora);
  (MONGO_URI ? UserModel.updateOne({ id }, { $set: { ultimo } }) : leerUsers().then(us => us.some(u => u.id === id) && escribirUser({ id, ultimo: ultimo.toISOString() })))
    .catch(() => {});
}

// Tiempo compensatorio: quien está fuera (aprobado, un día completo o más) no entra ni guarda
// hasta su fecha de regreso. El Líder siempre puede entrar, para que nunca falte quien administre.
const hoyPanama = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
function siguienteDiaSemana(f) {
  const d = new Date(f + "T12:00:00Z");
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}
async function regresoSiAusente(userId, nivel) {
  if (nivel === "lider") return null;
  const data = await leerData();
  const yo = (data.equipo || []).find(p => p.id === userId);
  if (!yo) return null;
  const f = hoyPanama();
  for (const h of data.horasExtra || []) {
    if (h.tipo !== "compensatorio" || h.miembro !== yo.nombre || h.aprobacion !== "Aprobado") continue;
    if (!(parseFloat(h.horas || 0) >= 8 - 1e-9)) continue;
    const regreso = h.regreso || siguienteDiaSemana(h.fechaFin || h.fecha);
    if (h.fecha <= f && f < regreso) return regreso;
  }
  return null;
}
const msgAusente = r => `🌴 Estás de tiempo compensatorio. Tu acceso se habilita el ${r.split("-").reverse().join("/")}.`;

// ════════════════════════
//  PÁGINAS
// ════════════════════════
// Las páginas se mandan comprimidas (gzip): la principal baja de ~650 KB a una fracción.
// Cada respuesta lleva su huella (ETag): si el navegador ya tiene esa versión, solo recibe «sin cambios».
function mandarComprimido(req, res, cuerpo, tipo, huella) {
  res.set({ "Content-Type": tipo, "Vary": "Accept-Encoding", "Cache-Control": "no-cache", ...(huella ? { ETag: huella } : {}) });
  if (huella && String(req.headers["if-none-match"] || "").split(/\s*,\s*/).some(h => h.replace(/^W\//, "") === huella)) return res.status(304).end();
  if (!/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return res.send(cuerpo.texto);
  res.set("Content-Encoding", "gzip").send(cuerpo.gz());
}
const archivos = {};
function enviarArchivo(ruta, tipo) {
  return (req, res) => {
    try {
      const mtime = fs.statSync(ruta).mtimeMs;
      if (!archivos[ruta] || archivos[ruta].mtime !== mtime) {
        const texto = fs.readFileSync(ruta), gz = zlib.gzipSync(texto, { level: 9 });
        archivos[ruta] = { mtime, texto, gz: () => gz, huella: `"${crypto.createHash("sha1").update(texto).digest("base64url").slice(0, 16)}"` };
      }
      mandarComprimido(req, res, archivos[ruta], tipo, archivos[ruta].huella);
    } catch { res.status(404).end(); }
  };
}
const HTML = "text/html; charset=utf-8";
app.get("/", enviarArchivo(path.join(__dirname, "public", "index.html"), HTML));
app.get("/pedido", enviarArchivo(path.join(__dirname, "public", "pedido.html"), HTML));
// Oficinas, servicios, preguntas y largos del formulario: un solo archivo que usan el servidor, /pedido y el tablero
app.get("/pedidos.js", enviarArchivo(path.join(__dirname, "pedidos.js"), "application/javascript; charset=utf-8"));
// Reglas de los nombres de las personas (y cómo se renombra en todos los registros): las mismas para el servidor y el tablero
app.get("/nombres.js", enviarArchivo(path.join(__dirname, "nombres.js"), "application/javascript; charset=utf-8"));

// ════════════════════════
//  PEDIDOS DE OTRAS ÁREAS (formulario público, sin sesión)
// ════════════════════════
// Cada pedido entra como borrador de tarea. Como el formulario es público, se limita cuántos pedidos puede enviar
// cada oficina desde una conexión, cuántos la conexión en total (todo el edificio sale por la misma) y cuántos
// borradores de pedidos pueden esperar revisión.
const { AREAS, pedidoATarea, siguienteFolio, buscarDuplicado, estadoPedido, normFolio, nuevaCorreccion, fueraDeHorario, choquesHorario } = require("./pedidos");
const PEDIDOS_SIN_REVISAR = 40;
const enviosOficina = limitador(20, 3600e3);         // pedidos o correcciones por conexión y oficina, por hora
const enviosRed = limitador(60, 3600e3);             // y por conexión, sumando todas las oficinas
const MSG_ENVIOS = "Se enviaron muchos pedidos desde esta red. Intenta en unos minutos o escribe al equipo de Comunicaciones.";
const enviosLlenos = (req, area) => enviosRed.lleno(req.ip) || (area && enviosOficina.lleno(req.ip + "|" + area));
const sumarEnvio = (req, area) => { enviosRed.sumar(req.ip); enviosOficina.sumar(req.ip + "|" + area); };
// Claves de acceso del formulario: una por oficina. La clave dice de qué oficina viene el pedido, así que la
// oficina no se elige a mano y cada una solo consulta sus propios folios. Líder y Editor las ven y las cambian.
// Viven en data.config.clavesPedidos y solo se cambian por /api/pedidos/claves (nunca con un guardado normal).
const fallosClave = limitador(30, 3600e3);           // claves equivocadas por conexión y hora
const fallosClaveTodos = limitador(100, 3600e3);     // y en total: frena a quien prueba claves desde muchas conexiones
const puedeClave = u => ["lider", "editor"].includes(u?.nivel);
const ahoraPanama = () => {
  const d = new Date(), tz = { timeZone: "America/Panama" };
  return { hora: d.toLocaleTimeString("es-PA", { ...tz, hour: "2-digit", minute: "2-digit" }),
           fecha: d.toLocaleDateString("es-PA", { ...tz, day: "2-digit", month: "short", year: "numeric" }) };
};
const oficinaDeClave = (data, clave) => {
  const c = String(clave || "").trim().toLowerCase();
  if (!c) return null;
  return Object.entries(data.config?.clavesPedidos || {}).find(([a, k]) => AREAS.includes(a) && k && k.toLowerCase() === c)?.[0] || null;
};
// Revisa la clave (con límite de intentos fallidos). Devuelve la oficina, o null si ya respondió el error.
function oficinaValida(req, res, data, msg) {
  if (fallosClave.lleno(req.ip) || fallosClaveTodos.lleno("*")) {
    res.status(429).json({ error: "Demasiados intentos con una clave incorrecta. Intenta de nuevo en una hora." }); return null;
  }
  if (!Object.values(data.config?.clavesPedidos || {}).some(Boolean)) { res.status(403).json({ error: "El formulario todavía no está activo. Pide la clave al equipo de Comunicaciones." }); return null; }
  const area = oficinaDeClave(data, req.body?.clave);
  if (!area) {
    fallosClave.sumar(req.ip); fallosClaveTodos.sumar("*");
    res.status(403).json({ error: msg || "La clave de acceso no es correcta. Pídela a tu jefatura o al equipo de Comunicaciones.", clave: true }); return null;
  }
  return area;
}
app.get("/api/pedidos/claves", verificarToken, async (req, res) => {
  if (!puedeClave(req.usuario)) return res.status(403).json({ error: "Sin permiso" });
  try { res.json({ areas: AREAS, claves: (await leerData()).config?.clavesPedidos || {} }); }
  catch { res.status(500).json({ error: "No se pudieron leer las claves" }); }
});
app.post("/api/pedidos/claves", verificarToken, async (req, res) => {
  if (!puedeClave(req.usuario)) return res.status(403).json({ error: "Sin permiso" });
  const area = String(req.body?.area || ""), clave = String(req.body?.clave || "").trim();
  if (!AREAS.includes(area)) return res.status(400).json({ error: "Oficina no válida" });
  if (clave && !/^[\p{L}\p{N}-]{8,40}$/u.test(clave)) return res.status(400).json({ error: "La clave debe tener de 8 a 40 letras o números, sin espacios." });
  try {
    await enCola(async () => {
      const data = await leerData(), claves = { ...(data.config?.clavesPedidos || {}) };
      if (clave && Object.entries(claves).some(([a, k]) => a !== area && k && k.toLowerCase() === clave.toLowerCase()))
        return res.status(400).json({ error: "Esa clave ya la usa otra oficina." });
      if (clave) claves[area] = clave; else delete claves[area];
      data.config = { ...(data.config || {}), clavesPedidos: claves };
      await escribirData(data); res.json({ ok: true, claves });
    });
  } catch { res.status(500).json({ error: "No se pudo guardar la clave" }); }
});
// El formulario pregunta de qué oficina es la clave para mostrarlo antes de enviar
app.post("/api/pedidos/oficina", async (req, res) => {
  try { const area = oficinaValida(req, res, await leerData()); if (area) res.json({ area }); }
  catch { res.status(500).json({ error: "No se pudo revisar la clave" }); }
});
app.post("/api/pedidos", async (req, res) => {
  if (enviosLlenos(req)) return res.status(429).json({ error: MSG_ENVIOS });
  try {
    await enCola(async () => {
      const data = await leerData();
      const area = oficinaValida(req, res, data); if (!area) return;
      if (enviosLlenos(req, area)) return res.status(429).json({ error: MSG_ENVIOS });
      data.tareas = data.tareas || []; data.pedidos = data.pedidos || []; data.notifs = data.notifs || [];
      if (data.tareas.filter(t => t && t.borrador && t.pedido).length >= PEDIDOS_SIN_REVISAR)
        return res.status(503).json({ error: "Hay muchos pedidos esperando revisión. Escribe directamente al equipo de Comunicaciones." });
      const folio = siguienteFolio(data.pedidos);
      const r = pedidoATarea({ ...req.body, area }, { hoy: hoyPanama(), folio, id: () => nuevoId(6) });
      if (r.error) return res.status(400).json({ error: r.error });
      // El pedido siempre entra aparte, a la bandeja. Si ya hay una actividad parecida ese día solo se avisa:
      // una persona decide en la bandeja si se une a ella, para no mezclar información sin revisar.
      const parecida = buscarDuplicado(data.tareas, r.tarea);
      if (parecida) r.registro.parecida = { id: parecida.id, titulo: parecida.titulo };
      data.tareas.unshift(r.tarea);
      data.pedidos.unshift(r.registro);
      const { hora, fecha } = ahoraPanama();
      data.notifs = [{ id: r.registro.id + "n", ico: "📨", ts: hora, sub: "Formulario de pedidos", txt: `Pedido ${folio} de ${r.registro.area}: ${r.tarea.titulo}` }, ...data.notifs].slice(0, 50);
      data.bitacora = [{ id: r.registro.id + "b", fecha, hora, usuario: "Formulario de pedidos", accion: "Pedido recibido",
        detalle: `${folio} de ${r.registro.area}: "${r.tarea.titulo}" (${r.tarea.fecha}) · pide ${r.registro.solicitante}${parecida ? ` · se parece a "${parecida.titulo}"` : ""}` },
        ...(data.bitacora || [])].slice(0, 300);
      await escribirData(data);
      sumarEnvio(req, area);
      res.json({ ok: true, folio });
    });
  } catch { res.status(500).json({ error: "No se pudo enviar el pedido. Intenta de nuevo en unos minutos." }); }
});
// Mientras llena el formulario, la oficina ve si su horario choca con otras actividades del equipo
// (solo dentro del horario laboral) o si cae fuera de él. Pide la misma clave y nunca devuelve títulos.
app.post("/api/pedidos/horario", async (req, res) => {
  try {
    const data = await leerData();
    if (!oficinaValida(req, res, data)) return;
    const { fecha, hora, horaFin } = req.body || {};
    res.json({ fuera: fueraDeHorario(fecha, hora, horaFin), choques: choquesHorario(data.tareas, fecha, hora, horaFin) });
  } catch { res.status(500).json({ error: "No se pudo revisar el horario" }); }
});
// Cada oficina solo ve sus pedidos (con la clave de «Otra», los que entraron con esa clave)
const pedidoDeOficina = (data, folio, area) => folio && (data.pedidos || []).find(p => p && p.folio === folio && (p.claveDe || p.area) === area);
// La oficina consulta en qué va su pedido con el folio y la misma clave del formulario
app.post("/api/pedidos/estado", async (req, res) => {
  try {
    const data = await leerData();
    const area = oficinaValida(req, res, data); if (!area) return;
    const folio = normFolio(req.body?.folio), reg = pedidoDeOficina(data, folio, area);
    if (!reg) return res.status(404).json({ error: `No encontramos el pedido ${folio || "con ese número"} de tu oficina. Revisa el folio.` });
    res.json(estadoPedido(reg, data.tareas, data.equipo));
  } catch { res.status(500).json({ error: "No se pudo consultar el pedido. Intenta de nuevo en unos minutos." }); }
});

// Si la oficina se equivocó al llenar el pedido, pide una corrección con el folio y su clave.
// No cambia la tarea: queda en la bandeja del equipo hasta que alguien la aplica.
app.post("/api/pedidos/correccion", async (req, res) => {
  if (enviosLlenos(req)) return res.status(429).json({ error: MSG_ENVIOS });
  try {
    await enCola(async () => {
      const data = await leerData();
      const area = oficinaValida(req, res, data); if (!area) return;
      if (enviosLlenos(req, area)) return res.status(429).json({ error: MSG_ENVIOS });
      const folio = normFolio(req.body?.folio), reg = pedidoDeOficina(data, folio, area);
      if (!reg) return res.status(404).json({ error: `No encontramos el pedido ${folio || "con ese número"} de tu oficina. Revisa el folio.` });
      if ((reg.correcciones || []).length >= 10) return res.status(400).json({ error: "Este pedido ya tiene muchas correcciones. Escribe directamente al equipo de Comunicaciones." });
      const { hora, fecha } = ahoraPanama();
      const r = nuevaCorreccion(req.body, { hoy: hoyPanama(), hora, id: () => nuevoId(4) });
      if (r.error) return res.status(400).json({ error: r.error });
      reg.correcciones = [...(reg.correcciones || []), r.correccion];
      const txt = `${folio} "${reg.titulo}": ${r.correccion.campos.join(", ")} → ${r.correccion.texto}`;
      data.notifs = [{ id: r.correccion.id + "n", ico: "✏️", ts: hora, sub: "Formulario de pedidos", txt: `Corrección pedida en ${txt}` }, ...(data.notifs || [])].slice(0, 50);
      data.bitacora = [{ id: r.correccion.id + "b", fecha, hora, usuario: "Formulario de pedidos", accion: "Pedido: corrección pedida",
        detalle: `${txt} (pide ${r.correccion.nombre}, ${reg.area})` }, ...(data.bitacora || [])].slice(0, 300);
      await escribirData(data);
      sumarEnvio(req, area);
      res.json({ ok: true });
    });
  } catch { res.status(500).json({ error: "No se pudo enviar la corrección. Intenta de nuevo en unos minutos." }); }
});

// ════════════════════════
//  LOGIN
// ════════════════════════
// Un solo mensaje de error (no dice si el correo existe) y límites de intentos fallidos por cuenta, por conexión y
// correo, y por conexión (alto: toda la oficina sale por la misma). Cambiar la contraseña tiene su propio contador.
const QUINCE_MIN = 15 * 60e3;
const fallosLogin = limitador(100, QUINCE_MIN), fallosCorreo = limitador(10, QUINCE_MIN), fallosCuenta = limitador(10, QUINCE_MIN);
const fallosCambioClave = limitador(10, QUINCE_MIN);
const HASH_FALSO = bcrypt.hashSync("cacco-no-existe", 10);
app.post("/api/login", async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim(), password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Escribe tu correo y tu contraseña." });
  const conCorreo = req.ip + "|" + email;
  if (fallosLogin.lleno(req.ip) || fallosCorreo.lleno(conCorreo) || fallosCuenta.lleno(email))
    return res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar." });
  try {
    const user = (await leerUsers()).find(u => u.email === email);
    const valid = await bcrypt.compare(password, user?.password || HASH_FALSO);
    if (!user || !valid) {
      fallosLogin.sumar(req.ip); fallosCorreo.sumar(conCorreo); fallosCuenta.sumar(email);
      return res.status(401).json({ error: "Correo o contraseña incorrectos." });
    }
    fallosCuenta.limpiar(email); fallosCorreo.limpiar(conCorreo);
    const regreso = await regresoSiAusente(user.id, user.nivel);
    if (regreso) return res.status(403).json({ error: msgAusente(regreso) });
    marcarActivo(user.id);
    res.json({ token: firmarSesion(user, req.body?.recordar), userId: user.id });
  } catch { res.status(500).json({ error: "Error interno" }); }
});
app.post("/api/actividad", verificarToken, (req, res) => { marcarActivo(req.usuario.id); res.json({ ok: true }); });
// Solo Líder y Editor ven cuándo usó cada quien el tablero por última vez
app.get("/api/actividad", verificarToken, async (req, res) => {
  if (!["lider", "editor"].includes(req.usuario?.nivel)) return res.status(403).json({ error: "Sin permiso" });
  try {
    const out = {};
    for (const u of await leerUsers()) out[u.id] = u.ultimo ? new Date(u.ultimo).toISOString() : null;
    res.json(out);
  } catch { res.status(500).json({ error: "No se pudo leer la actividad" }); }
});

// ════════════════════════
//  DATOS COMPARTIDOS
// ════════════════════════
// La página pregunta cada pocos segundos si hubo cambios (con la huella de lo que ya tiene): si no los hubo,
// la respuesta es «sin cambios» y no baja nada. Cuando sí, los datos van comprimidos.
// Las claves del formulario de pedidos solo las reciben Líder y Editor.
function versionPara(c, conClaves) {
  const k = conClaves ? "c" : "s";
  if (!c.variantes[k]) {
    let texto = c.json;
    if (!conClaves && c.payload.config) {
      const { clavePedidos, clavesPedidos, ...config } = c.payload.config;
      texto = JSON.stringify({ ...c.payload, config });
    }
    let gz = null;
    c.variantes[k] = { texto, gz: () => gz || (gz = zlib.gzipSync(texto)), huella: `"${k}-${c.huella}"` };
  }
  return c.variantes[k];
}
// ¿La huella que manda la página es de la versión guardada ahora?
const huellaVigente = (h, c) => String(h || "").replace(/^W\//, "").replace(/"/g, "").replace(/^[cs]-/, "") === c.huella;
app.get("/api/data", verificarToken, async (req, res) => {
  try {
    const v = versionPara(await estadoData(), puedeClave(req.usuario));
    res.set("Vary", "Accept-Encoding, Authorization");
    mandarComprimido(req, res, v, "application/json; charset=utf-8", v.huella);
  }
  catch { res.status(500).json({ error: "Error leyendo datos" }); }
});
// ════════════════════════
//  RESPALDO DIARIO
// ════════════════════════
// Una copia de los datos por día, tomada antes del primer cambio del día (y al despertar el servidor).
// Se guardan los últimos 30 días. Solo el Líder los ve y los descarga. No incluye contraseñas ni adjuntos.
const RespaldoModel = mongoose.models.AppRespaldo || mongoose.model("AppRespaldo",
  new mongoose.Schema({ _id: String, creado: Date, payload: mongoose.Schema.Types.Mixed }));
const RESP_DIAS = 30, RESP_DIR = path.join(DIR_DATOS, "backups"), RESP_RE = /^respaldo-(\d{4}-\d{2}-\d{2})\.json$/;
let respaldoHecho = "";
async function respaldoDiario(actual) {
  const dia = hoyPanama();
  if (respaldoHecho === dia) return;
  respaldoHecho = dia;
  try {
    if (MONGO_URI) {
      if (!(await RespaldoModel.exists({ _id: dia }))) {
        await RespaldoModel.create({ _id: dia, creado: new Date(), payload: actual || await leerData() });
        const viejos = await RespaldoModel.find({}, { _id: 1 }).sort({ _id: -1 }).skip(RESP_DIAS).lean();
        if (viejos.length) await RespaldoModel.deleteMany({ _id: { $in: viejos.map(v => v._id) } });
      }
    } else {
      fs.mkdirSync(RESP_DIR, { recursive: true });
      const f = path.join(RESP_DIR, `respaldo-${dia}.json`);
      if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(actual || await leerData()));
      fs.readdirSync(RESP_DIR).filter(n => RESP_RE.test(n)).sort().reverse().slice(RESP_DIAS)
        .forEach(n => fs.unlinkSync(path.join(RESP_DIR, n)));
    }
  } catch (e) { respaldoHecho = ""; console.warn("No se pudo hacer el respaldo diario:", e.message); }
}
function mandarRespaldo(res, nombre, datos) {
  res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}"` });
  res.send(JSON.stringify(datos, null, 1));
}
app.get("/api/respaldos", verificarToken, soloLider, async (req, res) => {
  try {
    let lista;
    if (MONGO_URI) lista = (await RespaldoModel.find({}, { _id: 1, creado: 1 }).sort({ _id: -1 }).lean()).map(r => ({ fecha: r._id, creado: r.creado }));
    else lista = fs.existsSync(RESP_DIR) ? fs.readdirSync(RESP_DIR).filter(n => RESP_RE.test(n)).sort().reverse()
      .map(n => ({ fecha: n.match(RESP_RE)[1], creado: fs.statSync(path.join(RESP_DIR, n)).mtime })) : [];
    res.json(lista);
  } catch { res.status(500).json({ error: "No se pudo leer la lista de respaldos" }); }
});
app.get("/api/respaldos/actual", verificarToken, soloLider, async (req, res) => {
  try { mandarRespaldo(res, `respaldo-cacco-${hoyPanama()}-ahora.json`, await leerData()); }
  catch { res.status(500).json({ error: "No se pudo generar el respaldo" }); }
});
app.get("/api/respaldos/:fecha", verificarToken, soloLider, async (req, res) => {
  const fecha = String(req.params.fecha);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: "Fecha no válida" });
  try {
    let datos = null;
    if (MONGO_URI) datos = (await RespaldoModel.findById(fecha).lean())?.payload;
    else { const f = path.join(RESP_DIR, `respaldo-${fecha}.json`); if (fs.existsSync(f)) datos = JSON.parse(fs.readFileSync(f, "utf8")); }
    if (!datos) return res.status(404).json({ error: "No hay respaldo de ese día" });
    mandarRespaldo(res, `respaldo-cacco-${fecha}.json`, datos);
  } catch { res.status(500).json({ error: "No se pudo leer el respaldo" }); }
});

// Guardar: la página manda todos los datos con la huella de la versión que tenía (If-Match). Si otra persona
// guardó en medio, se responde 409 y la página vuelve a traer lo último, junta sus cambios y reintenta.
// Las reglas de cada nivel (reglas.js) se aplican aquí aunque alguien salte la interfaz.
app.post("/api/data", verificarToken, async (req, res) => {
  try {
    if (req.usuario.nivel === "lector") return res.status(403).json({ error: "Solo lectura" });
    const error = validarDatos(req.body);
    if (error) return res.status(400).json({ error });
    marcarActivo(req.usuario.id);
    const regreso = await regresoSiAusente(req.usuario.id, req.usuario.nivel);
    if (regreso) return res.status(403).json({ error: msgAusente(regreso) });
    await enCola(async () => {
      const c = await estadoData();
      if (req.headers["if-match"] && !huellaVigente(req.headers["if-match"], c))
        return res.status(409).json({ error: "Otra persona guardó cambios. Se juntan y se vuelve a guardar.", conflicto: true });
      const actual = JSON.parse(c.json);
      await respaldoDiario(actual);
      const enviado = JSON.stringify(req.body);
      const nuevo = aplicarReglasRol(req.body, actual, req.usuario);
      const errorNombre = validarNombres(nuevo, actual);
      if (errorNombre) return res.status(400).json({ error: errorNombre });
      if (actual.config) nuevo.config = actual.config; else delete nuevo.config;   // las claves solo cambian por su ruta
      const { config: _a, ...sinConfig } = nuevo, { config: _b, ...enviadoSin } = JSON.parse(enviado);
      const guardado = await escribirData(nuevo);
      // «ajustado»: el servidor deshizo algo que ese nivel no puede hacer; la página vuelve a cargar lo guardado
      res.json({ ok: true, huella: versionPara(guardado, puedeClave(req.usuario)).huella, ajustado: JSON.stringify(sinConfig) !== JSON.stringify(enviadoSin) });
    });
  }
  catch { res.status(500).json({ error: "No se pudo guardar" }); }
});

// ════════════════════════
//  ADJUNTOS
// ════════════════════════
// Archivos del equipo (logos, plantillas, formularios, documentos). Van en MongoDB (GridFS), aparte del
// documento de datos para no inflarlo; sin MongoDB, en la carpeta adjuntos/ y adjuntos.json.
// No entran en el respaldo de /api/data. Lo pesado (videos, álbumes) se guarda como enlace a Drive.
const ADJ_MAX = 10 * 1024 * 1024, ADJ_TOTAL = 400 * 1024 * 1024;
const ADJ_CATS = ["Marca y logos", "Plantillas", "Formularios", "Documentos", "Fotos", "Otros"];
const ADJ_TIPOS = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", svg: "image/svg+xml", ai: "application/postscript", eps: "application/postscript", psd: "image/vnd.adobe.photoshop",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", zip: "application/zip", mp3: "audio/mpeg", m4a: "audio/mp4",
};
const ADJ_EN_LINEA = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif"]);   // se abren en el navegador; el resto se descarga
const AdjuntoSchema = new mongoose.Schema({ _id: String, meta: mongoose.Schema.Types.Mixed, fileId: mongoose.Schema.Types.ObjectId });
const AdjuntoModel = mongoose.models.AppAdjunto || mongoose.model("AppAdjunto", AdjuntoSchema);
const ADJ_DIR = path.join(DIR_DATOS, "adjuntos"), ADJ_FILE = path.join(DIR_DATOS, "adjuntos.json");
const bucketAdj = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "adjuntos" });

async function listarAdj() {
  if (!MONGO_URI) return leerJSONLocal(ADJ_FILE, []);
  return (await AdjuntoModel.find({}).lean()).map(d => d.meta);
}
async function guardarAdj(meta, buf) {
  if (!MONGO_URI) {
    if (buf) { fs.mkdirSync(ADJ_DIR, { recursive: true }); fs.writeFileSync(path.join(ADJ_DIR, meta.id), buf); }
    const arr = leerJSONLocal(ADJ_FILE, []).filter(a => a.id !== meta.id);
    fs.writeFileSync(ADJ_FILE, JSON.stringify([meta, ...arr], null, 2)); return;
  }
  if (!buf) { await AdjuntoModel.updateOne({ _id: meta.id }, { meta }, { upsert: true }); return; }
  const sube = bucketAdj().openUploadStream(meta.id, { metadata: { adjunto: meta.id } });
  await new Promise((ok, mal) => sube.once("finish", ok).once("error", mal).end(buf));
  await AdjuntoModel.create({ _id: meta.id, meta, fileId: sube.id });
}
async function borrarAdj(id) {
  if (!MONGO_URI) {
    fs.rmSync(path.join(ADJ_DIR, id), { force: true });
    fs.writeFileSync(ADJ_FILE, JSON.stringify(leerJSONLocal(ADJ_FILE, []).filter(a => a.id !== id), null, 2)); return;
  }
  const doc = await AdjuntoModel.findById(id).lean();
  if (doc?.fileId) await bucketAdj().delete(doc.fileId).catch(() => {});
  await AdjuntoModel.deleteOne({ _id: id });
}
async function leerArchivoAdj(id) {
  if (!MONGO_URI) { const f = path.join(ADJ_DIR, id); return fs.existsSync(f) ? fs.createReadStream(f) : null; }
  const doc = await AdjuntoModel.findById(id).lean();
  return doc?.fileId ? bucketAdj().openDownloadStream(doc.fileId) : null;
}

const textoAdj = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
function metaEditable(b) {
  const categoria = ADJ_CATS.includes(b.categoria) ? b.categoria : "Otros";
  return { nombre: textoAdj(b.nombre, 120), categoria, tareaId: textoAdj(b.tareaId, 40), nota: textoAdj(b.nota, 300) };
}
// Quien sube puede editar o borrar lo suyo; Líder y Editor, cualquier adjunto.
const puedeTocarAdj = (u, a) => ["lider", "editor"].includes(u?.nivel) || a?.subidoPorId === u?.id;
async function escritorAdj(req, res) {
  if (req.usuario?.nivel === "lector") { res.status(403).json({ error: "Solo lectura" }); return null; }
  const regreso = await regresoSiAusente(req.usuario?.id, req.usuario?.nivel);
  if (regreso) { res.status(403).json({ error: msgAusente(regreso) }); return null; }
  const data = await leerData();
  return (data.equipo || []).find(p => p.id === req.usuario?.id)?.nombre || req.usuario?.email || "—";
}
// Cada archivo se abre con un enlace firmado de pocas horas: así sirve en <img>, en otra pestaña o en el celular sin enviar la sesión.
const conEnlaceAdj = a => a.enlace ? a : { ...a, url: `/api/adjuntos/${encodeURIComponent(a.id)}/archivo?t=${jwt.sign({ adj: a.id, typ: "adj" }, JWT_SECRET, { expiresIn: "12h" })}` };

app.get("/api/adjuntos", verificarToken, async (req, res) => {
  try {
    const lista = await listarAdj();
    res.json({ adjuntos: lista.map(conEnlaceAdj), usado: lista.reduce((s, a) => s + (a.tamano || 0), 0), limite: ADJ_TOTAL, maximo: ADJ_MAX, categorias: ADJ_CATS });
  } catch { res.status(500).json({ error: "No se pudieron leer los adjuntos" }); }
});
const cuerpoArchivo = (req, res, next) => express.raw({ type: () => true, limit: ADJ_MAX })(req, res, err =>
  err ? res.status(err.type === "entity.too.large" ? 413 : 400).json({ error: err.type === "entity.too.large" ? "El archivo pasa de 10 MB. Súbelo a Drive y agrega el enlace." : "No se pudo leer el archivo." }) : next());
app.post("/api/adjuntos/archivo", verificarToken, cuerpoArchivo, async (req, res) => {
  try {
    const autor = await escritorAdj(req, res); if (!autor) return;
    const archivo = textoAdj(req.query.archivo, 160), ext = path.extname(archivo).slice(1).toLowerCase();
    if (!ADJ_TIPOS[ext]) return res.status(400).json({ error: `No se aceptan archivos .${ext || "sin extensión"}. Usa PDF, imágenes, Word, Excel, PowerPoint, Illustrator, Photoshop, ZIP o audio.` });
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return res.status(400).json({ error: "El archivo está vacío." });
    const lista = await listarAdj(), usado = lista.reduce((s, a) => s + (a.tamano || 0), 0);
    if (usado + buf.length > ADJ_TOTAL) return res.status(413).json({ error: "Se llenó el espacio de adjuntos (400 MB). Borra archivos que ya no se usan o guarda los grandes en Drive como enlace." });
    const m = metaEditable({ ...req.query, nombre: req.query.nombre || archivo.replace(/\.[^.]+$/, "") });
    const meta = { id: nuevoId(4), ...m, nombre: m.nombre || archivo,
      archivo, ext, tamano: buf.length, subidoPor: autor, subidoPorId: req.usuario.id, subidoEn: hoyPanama() };
    await guardarAdj(meta, buf);
    res.json({ ok: true, adjunto: conEnlaceAdj(meta) });
  } catch { res.status(500).json({ error: "No se pudo guardar el archivo. Intenta de nuevo." }); }
});
app.post("/api/adjuntos/enlace", verificarToken, async (req, res) => {
  try {
    const autor = await escritorAdj(req, res); if (!autor) return;
    const enlace = textoAdj(req.body?.enlace, 600);
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(enlace)) return res.status(400).json({ error: "Pega un enlace completo, que empiece con https://" });
    const m = metaEditable(req.body || {});
    if (!m.nombre) return res.status(400).json({ error: "Escribe un nombre para el enlace." });
    const meta = { id: nuevoId(4), ...m, enlace,
      subidoPor: autor, subidoPorId: req.usuario.id, subidoEn: hoyPanama() };
    await guardarAdj(meta);
    res.json({ ok: true, adjunto: meta });
  } catch { res.status(500).json({ error: "No se pudo guardar el enlace." }); }
});
app.patch("/api/adjuntos/:id", verificarToken, async (req, res) => {
  try {
    if (!await escritorAdj(req, res)) return;
    const a = (await listarAdj()).find(x => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "Ese adjunto ya no existe." });
    if (!puedeTocarAdj(req.usuario, a)) return res.status(403).json({ error: "Solo quien lo subió, el Editor o el Líder pueden cambiarlo." });
    const m = metaEditable({ ...a, ...req.body });
    if (!m.nombre) return res.status(400).json({ error: "Escribe un nombre." });
    const meta = { ...a, ...m };
    if (a.enlace && req.body?.enlace !== undefined) {
      const enlace = textoAdj(req.body.enlace, 600);
      if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(enlace)) return res.status(400).json({ error: "Pega un enlace completo, que empiece con https://" });
      meta.enlace = enlace;
    }
    await guardarAdj(meta);
    res.json({ ok: true, adjunto: conEnlaceAdj(meta) });
  } catch { res.status(500).json({ error: "No se pudo guardar el cambio." }); }
});
app.delete("/api/adjuntos/:id", verificarToken, async (req, res) => {
  try {
    if (!await escritorAdj(req, res)) return;
    const a = (await listarAdj()).find(x => x.id === req.params.id);
    if (!a) return res.json({ ok: true });
    if (!puedeTocarAdj(req.usuario, a)) return res.status(403).json({ error: "Solo quien lo subió, el Editor o el Líder pueden borrarlo." });
    await borrarAdj(a.id);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "No se pudo borrar." }); }
});
app.get("/api/adjuntos/:id/archivo", async (req, res) => {
  try {
    let ok = false;
    try { const p = jwt.verify(String(req.query.t || ""), JWT_SECRET); ok = !!p.adj && p.adj === req.params.id; } catch {}
    if (!ok) return res.status(401).send("Este enlace venció. Vuelve a abrir el archivo desde el dashboard.");
    const a = (await listarAdj()).find(x => x.id === req.params.id && !x.enlace);
    const flujo = a && await leerArchivoAdj(a.id);
    if (!flujo) return res.status(404).send("Ese archivo ya no existe.");
    const ascii = a.archivo.normalize("NFD").replace(/[^\w.\- ]/g, "_");
    res.set({
      "Content-Type": ADJ_TIPOS[a.ext] || "application/octet-stream",
      "Content-Disposition": `${ADJ_EN_LINEA.has(a.ext) ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.archivo)}`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600",
    });
    if (a.tamano) res.set("Content-Length", String(a.tamano));
    flujo.on("error", () => res.destroy()).pipe(res);
  } catch { res.status(500).send("No se pudo abrir el archivo."); }
});

// ════════════════════════
//  GESTIÓN DE USUARIOS
// ════════════════════════
app.post("/api/users", verificarToken, soloLider, async (req, res) => {
  const { id, password } = req.body || {}, email = String(req.body?.email || "").toLowerCase().trim(), nivel = req.body?.nivel;
  if (!id || !email || !nivel) return res.status(400).json({ error: "id, email y nivel requeridos" });
  if (!NIVELES.includes(nivel)) return res.status(400).json({ error: "Nivel no válido" });
  try {
    const users = await leerUsers();
    const existe = users.find(u => u.id === id);
    if (users.some(u => u.email === email && u.id !== id)) return res.status(400).json({ error: "Ese correo ya lo usa otra persona." });
    if (!existe && !password) return res.status(400).json({ error: "Contraseña requerida para usuario nuevo" });
    if (password && String(password).length < 8) return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
    // Si el Líder pone una contraseña nueva, las sesiones abiertas de esa persona se cierran
    const cambio = password ? { password: await bcrypt.hash(String(password), 10), claveCambiada: new Date() } : { password: existe.password };
    await escribirUser({ id, email, nivel, ...cambio });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Error guardando usuario" }); }
});

app.delete("/api/users/:id", verificarToken, soloLider, async (req, res) => {
  if (req.params.id === req.usuario.id) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });
  try { await eliminarUser(req.params.id); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "Error eliminando usuario" }); }
});

// Al cambiar la contraseña se cierran las demás sesiones de esa persona; esta recibe una sesión nueva
app.post("/api/change-password", verificarToken, async (req, res) => {
  const passwordActual = String(req.body?.passwordActual || ""), passwordNueva = String(req.body?.passwordNueva || "");
  if (!passwordActual || !passwordNueva) return res.status(400).json({ error: "Ambas contraseñas requeridas" });
  if (passwordNueva.length < 8) return res.status(400).json({ error: "Mínimo 8 caracteres" });
  if (fallosCambioClave.lleno(req.usuario.id)) return res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos." });
  try {
    const user = (await leerUsers()).find(u => u.id === req.usuario.id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!await bcrypt.compare(passwordActual, user.password)) { fallosCambioClave.sumar(user.id); return res.status(401).json({ error: "Contraseña actual incorrecta" }); }
    fallosCambioClave.limpiar(user.id);
    const claveCambiada = new Date(Math.floor(Date.now() / 1000) * 1000);
    await escribirUser({ ...user, password: await bcrypt.hash(passwordNueva, 10), claveCambiada });
    res.json({ ok: true, token: firmarSesion(user, req.sesionLarga) });
  } catch { res.status(500).json({ error: "Error cambiando contraseña" }); }
});

// Cualquier otra ruta de /api/ no existe
app.use("/api", (req, res) => res.status(404).json({ error: "No existe" }));

// ════════════════════════
//  INICIAR SERVIDOR
// ════════════════════════
async function iniciar() {
  if (MONGO_URI) {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB Atlas");
  } else {
    console.log("⚠️  Sin MONGODB_URI — usando archivos locales en", DIR_DATOS);
  }
  app.listen(PORT, () => console.log(`✅ Servidor CACCO corriendo en http://localhost:${PORT}`));
  respaldoDiario();
  setInterval(() => respaldoDiario(), 3600e3);
}
// Las pruebas (test/) cargan la app sin arrancar el servidor
if (require.main === module) iniciar().catch(e => { console.error("Error al iniciar:", e); process.exit(1); });
module.exports = app;
