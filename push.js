// Avisos al celular (notificaciones push). Cada persona los activa en Mi perfil, en cada celular o computadora.
// Llegan: cuando te asignan una actividad, la víspera (4:00 p. m.) y una hora antes de cada actividad tuya;
// al Líder y al Editor, lo que queda por aprobar y los pedidos de las oficinas; a cada quien, la respuesta a sus
// horas, compensatorio o permisos. Las claves del servicio (VAPID) se crean solas la primera vez y se guardan
// en la base, nunca en el código (el repositorio es público).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webpush = require("web-push");

const HECHA = ["Completada", "Cerrada", "No cumplida"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const HORA_VISPERA = 16 * 60;   // 4:00 p. m., al cerrar la jornada

// ── Lógica pura (se prueba en test/push.test.js) ──
const fechaCorta = f => { const d = new Date(f + "T12:00:00Z"); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
function horaTxt(h) {
  if (!/^\d{1,2}:\d{2}$/.test(h || "")) return "";
  let [H, M] = h.split(":").map(Number); const pm = H >= 12; H = H % 12 || 12;
  return `${H}:${String(M).padStart(2, "0")} ${pm ? "p. m." : "a. m."}`;
}
const minutos = h => /^\d{1,2}:\d{2}$/.test(h || "") ? h.split(":").reduce((a, b) => a * 60 + Number(b)) : null;
const activa = t => t && !t.borrador && !t.cancelada;
// ¿La actividad tiene lugar ese día? (un día, varios seguidos hasta «Hasta», u otras fechas sueltas)
const ocurre = (t, f) => t.fecha === f || (t.fechaFin && t.fecha <= f && f <= t.fechaFin) || (t.otrasFechas || []).includes(f);
// Quienes tienen algo pendiente en la actividad, con sus áreas
function pendientes(t) {
  const por = new Map();
  Object.entries(t.secciones || {}).forEach(([sec, sv]) => {
    if (!sv || HECHA.includes(sv.estado)) return;
    (sv.responsables || []).forEach(id => por.set(id, [...(por.get(id) || []), sec]));
  });
  return por;
}
const cuando = t => [fechaCorta(t.fecha), horaTxt(t.hora)].filter(Boolean).join(" · ");

// Personas que quedan asignadas en una actividad ya aprobada (no en borradores). Quien guardó no se avisa a sí mismo.
function asignaciones(antes, despues, autorId, hoy) {
  const prev = new Map((antes?.tareas || []).filter(Boolean).map(t => [t.id, t]));
  const out = [];
  (despues?.tareas || []).forEach(t => {
    if (!activa(t) || (t.fechaFin || t.fecha || "") < hoy) return;
    const p = prev.get(t.id), antesP = p && activa(p) ? pendientes(p) : new Map();
    pendientes(t).forEach((secs, id) => {
      const nuevas = secs.filter(s => !(antesP.get(id) || []).includes(s));
      if (!nuevas.length || id === autorId) return;
      out.push({ para: [id], titulo: "📌 Te asignaron una actividad", cuerpo: `${t.titulo || "(Sin título)"} · ${nuevas.join(", ")} · ${cuando(t)}`,
        url: `/#t=${t.id}`, tag: `asig-${t.id}` });
    });
  });
  return out;
}

// Avisos nuevos del equipo que piden algo a alguien
const POR_APROBAR = /por aprobar|^Solicitud de|^Nueva solicitud|^Pedido P-|^Corrección pedida/;
const RESPUESTA = /^(Horas|Compensatorio|Permiso) (aprobado|rechazado|anulado)/;
function avisosNuevos(antes, despues, autorId, users, equipo) {
  const vistos = new Set((antes?.notifs || []).map(n => n && n.id));
  const jefes = users.filter(u => u.nivel === "lider" || u.nivel === "editor").map(u => u.id);
  const porNombre = nombre => (equipo || []).filter(p => p && p.nombre === nombre).map(p => p.id);
  const out = [];
  (despues?.notifs || []).forEach(n => {
    if (!n || vistos.has(n.id)) return;
    let para = [];
    if (RESPUESTA.test(n.txt || "") && n.miembro) para = porNombre(n.miembro);
    else if (POR_APROBAR.test(n.txt || "")) para = jefes;
    para = para.filter(id => id !== autorId);
    if (para.length) out.push({ para, titulo: `${n.ico || "🔔"} ${n.txt}`, cuerpo: n.sub || "", url: "/", tag: `n-${n.id}` });
  });
  return out;
}

// Recordatorios según la hora de Panamá: la víspera a las 4:00 p. m. (un resumen por persona) y una hora antes.
// «clave» evita mandar dos veces el mismo recordatorio.
function recordatorios(data, hoy, manana, ahoraMin) {
  const tareas = (data?.tareas || []).filter(activa), out = [];
  if (ahoraMin >= HORA_VISPERA && ahoraMin < 22 * 60) {
    const porPersona = new Map();
    tareas.filter(t => ocurre(t, manana)).forEach(t => pendientes(t).forEach((secs, id) =>
      porPersona.set(id, [...(porPersona.get(id) || []), t])));
    porPersona.forEach((ts, id) => {
      ts.sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
      out.push({ clave: `v:${id}:${manana}`, para: [id], titulo: `🗓️ Mañana tienes ${ts.length === 1 ? "1 actividad" : ts.length + " actividades"}`,
        cuerpo: ts.slice(0, 4).map(t => `${horaTxt(t.hora) || "Sin hora"} · ${t.titulo || "(Sin título)"}`).join("\n") + (ts.length > 4 ? `\ny ${ts.length - 4} más` : ""),
        url: "/", tag: `v-${manana}` });
    });
  }
  tareas.filter(t => ocurre(t, hoy)).forEach(t => {
    const ini = minutos(t.hora);
    if (ini === null || ini - ahoraMin <= 0 || ini - ahoraMin > 60) return;
    pendientes(t).forEach((secs, id) => out.push({ clave: `h:${t.id}:${hoy}:${id}`, para: [id], titulo: `⏰ En una hora: ${t.titulo || "(Sin título)"}`,
      cuerpo: [horaTxt(t.hora), t.lugar ? "📍 " + t.lugar : "", secs.join(", ")].filter(Boolean).join(" · "), url: `/#t=${t.id}`, tag: `h-${t.id}` }));
  });
  return out;
}

// Fecha y minutos del día en Panamá (UTC−5 todo el año)
function relojPanama(ms = Date.now()) {
  const d = new Date(ms - 5 * 3600e3), f = x => x.toISOString().slice(0, 10);
  return { hoy: f(d), manana: f(new Date(d.getTime() + 864e5)), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// ── Servicio: claves, suscripciones y envío ──
function crearPush({ mongoose, MONGO_URI, DIR_DATOS, leerData, leerUsers }) {
  const Modelo = (nombre, def) => mongoose.models[nombre] || mongoose.model(nombre, new mongoose.Schema(def));
  const Clave = Modelo("AppClave", { _id: String, valor: mongoose.Schema.Types.Mixed });
  const Sus = Modelo("AppSuscripcion", { _id: String, userId: String, sub: mongoose.Schema.Types.Mixed, creado: Date });
  const Enviado = Modelo("AppAvisoEnviado", { _id: String, creado: { type: Date, expires: 3 * 864e2 } });
  const archivo = n => path.join(DIR_DATOS, n);
  const leerLocal = (n, def) => { try { return JSON.parse(fs.readFileSync(archivo(n), "utf8")); } catch { return def; } };
  const escribirLocal = (n, v) => fs.writeFileSync(archivo(n), JSON.stringify(v, null, 2));
  const idSus = endpoint => crypto.createHash("sha1").update(endpoint).digest("base64url");

  let claves = null;
  async function vapid() {
    if (claves) return claves;
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
      claves = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    else if (!MONGO_URI) {
      claves = leerLocal("vapid.json", null);
      if (!claves) { claves = webpush.generateVAPIDKeys(); escribirLocal("vapid.json", claves); }
    } else {
      const doc = await Clave.findById("vapid").lean();
      if (doc) claves = doc.valor;
      else { claves = webpush.generateVAPIDKeys(); await Clave.updateOne({ _id: "vapid" }, { $setOnInsert: { valor: claves } }, { upsert: true }); claves = (await Clave.findById("vapid").lean()).valor; }
    }
    webpush.setVapidDetails("https://cacco-app.onrender.com", claves.publicKey, claves.privateKey);
    return claves;
  }

  const susDe = async ids => MONGO_URI ? await Sus.find({ userId: { $in: ids } }).lean() : leerLocal("suscripciones.json", []).filter(s => ids.includes(s.userId));
  async function guardarSus(userId, sub) {
    const _id = idSus(sub.endpoint), doc = { _id, userId, sub, creado: new Date() };
    if (MONGO_URI) return Sus.updateOne({ _id }, doc, { upsert: true });
    escribirLocal("suscripciones.json", [...leerLocal("suscripciones.json", []).filter(s => s._id !== _id), doc]);
  }
  async function quitarSus(endpoint, userId) {
    const _id = idSus(endpoint);
    if (MONGO_URI) return Sus.deleteOne(userId ? { _id, userId } : { _id });
    escribirLocal("suscripciones.json", leerLocal("suscripciones.json", []).filter(s => !(s._id === _id && (!userId || s.userId === userId))));
  }
  const enviadosLocal = new Set();
  async function marcarEnviado(clave) {   // true solo la primera vez
    if (!MONGO_URI) { if (enviadosLocal.has(clave)) return false; enviadosLocal.add(clave); return true; }
    try { await Enviado.create({ _id: clave, creado: new Date() }); return true; } catch { return false; }
  }

  let envio = (sub, cuerpo) => webpush.sendNotification(sub, cuerpo, { TTL: 6 * 3600 });
  async function enviar(avisos) {
    if (!avisos.length) return 0;
    await vapid();
    let n = 0;
    for (const a of avisos) for (const s of await susDe(a.para)) {
      try { await envio(s.sub, JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo, url: a.url, tag: a.tag })); n++; }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await quitarSus(s.sub.endpoint); }
    }
    return n;
  }
  const seguro = p => Promise.resolve(p).catch(e => console.warn("Avisos al celular:", e && e.message));

  return {
    _usarEnvio(fn) { envio = fn; },   // pruebas
    // Después de cada guardado: asignaciones nuevas y avisos que piden algo
    avisarCambios(antes, despues, autorId) {
      return seguro((async () => {
        const users = await leerUsers();
        return enviar([...asignaciones(antes, despues, autorId, relojPanama().hoy), ...avisosNuevos(antes, despues, autorId, users, despues.equipo)]);
      })());
    },
    // Cada minuto: recordatorios que tocan ahora y no se han mandado
    revisarRecordatorios(ms) {
      return seguro((async () => {
        const r = relojPanama(ms), lista = [];
        for (const a of recordatorios(await leerData(), r.hoy, r.manana, r.min)) if (await marcarEnviado(a.clave)) lista.push(a);
        return enviar(lista);
      })());
    },
    rutas(app, verificarToken) {
      app.get("/api/push/clave", verificarToken, async (req, res) => {
        try { res.json({ clave: (await vapid()).publicKey }); } catch { res.status(500).json({ error: "Los avisos no están disponibles" }); }
      });
      app.post("/api/push/suscribir", verificarToken, async (req, res) => {
        const sub = req.body?.sub;
        if (req.usuario.nivel === "lector") return res.status(403).json({ error: "Solo lectura" });
        if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth)
          return res.status(400).json({ error: "Suscripción no válida" });
        try { await guardarSus(req.usuario.id, { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }); res.json({ ok: true }); }
        catch { res.status(500).json({ error: "No se pudo activar" }); }
      });
      app.post("/api/push/quitar", verificarToken, async (req, res) => {
        try { if (typeof req.body?.endpoint === "string") await quitarSus(req.body.endpoint, req.usuario.id); res.json({ ok: true }); }
        catch { res.status(500).json({ error: "No se pudo desactivar" }); }
      });
      app.post("/api/push/prueba", verificarToken, async (req, res) => {
        try { const n = await enviar([{ para: [req.usuario.id], titulo: "🔔 Avisos activados", cuerpo: "Así te llegarán los avisos del Tablero.", url: "/", tag: "prueba" }]); res.json({ ok: true, enviados: n }); }
        catch { res.status(500).json({ error: "No se pudo enviar la prueba" }); }
      });
    },
  };
}

module.exports = { crearPush, asignaciones, avisosNuevos, recordatorios, relojPanama, ocurre };
