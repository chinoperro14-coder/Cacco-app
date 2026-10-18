// Reglas que el servidor hace cumplir en cada guardado, aunque alguien salte la interfaz.
// La página manda todos los datos de una vez; aquí se compara con lo guardado y se deshace lo que ese nivel no puede hacer.
// El Líder no tiene restricciones (salvo que las solicitudes de permiso nunca se borran).
const { errorNombre, renombrar } = require("./nombres");

// Listas que la página guarda como [{id, ...}]
const LISTAS = ["tareas", "equipo", "publicaciones", "horasExtra", "permisos", "bitacora", "historico", "asigVarias",
  "notifs", "medios", "notasPrensa", "pedidos", "informesSem"];
const NIVELES = ["lider", "editor", "colaborador", "lector"];
const BITACORA_MAX = 300;

// ¿Tiene forma de datos del tablero? Devuelve el error o null.
function validarDatos(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "Los datos no tienen el formato esperado.";
  if (!Array.isArray(d.tareas) || !Array.isArray(d.equipo)) return "Faltan las tareas o el equipo: no se guardó nada.";
  for (const k of LISTAS) {
    if (d[k] === undefined) continue;
    if (!Array.isArray(d[k])) return `«${k}» debe ser una lista.`;
    if (d[k].some(x => !x || typeof x !== "object" || Array.isArray(x) || typeof x.id !== "string" || !x.id))
      return `Hay un elemento sin identificador en «${k}».`;
  }
  if (d.etiquetas !== undefined && (!Array.isArray(d.etiquetas) || d.etiquetas.some(e => typeof e !== "string")))
    return "Las etiquetas deben ser una lista de textos.";
  if (d.asigAuto !== undefined && (!d.asigAuto || typeof d.asigAuto !== "object" || Array.isArray(d.asigAuto) ||
      Object.values(d.asigAuto).some(v => !Array.isArray(v) || v.some(x => typeof x !== "string"))))
    return "La asignación por área no tiene el formato esperado.";
  return null;
}

const porId = lista => new Map((Array.isArray(lista) ? lista : []).filter(x => x && x.id).map(x => [x.id, x]));
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const revisado = r => ["Aprobado", "Rechazado"].includes(r && r.aprobacion);

// Vuelve a poner lo que faltó y no se podía borrar, en su lugar original si se puede
function reponer(nueva, previa, puedeBorrar) {
  if (!Array.isArray(previa)) return nueva;
  const ids = new Set(nueva.map(x => x && x.id));
  const faltan = previa.filter(x => x && x.id && !ids.has(x.id) && !puedeBorrar(x));
  return faltan.length ? [...nueva, ...faltan] : nueva;
}

// Nombre con el que aparece la persona en horas y permisos: el guardado, no el que manda la página (solo el Líder lo cambia)
function nombresDe(usuario, actual) {
  const n = new Set();
  (actual && Array.isArray(actual.equipo) ? actual.equipo : []).forEach(p => { if (p && p.id === usuario.id && p.nombre) n.add(p.nombre); });
  return n;
}

// nuevo: lo que manda la página; actual: lo guardado; usuario: {id, nivel}. Devuelve los datos ya corregidos.
function aplicarReglasRol(nuevo, actual, usuario) {
  actual = actual || {};
  const nivel = usuario && usuario.nivel;
  if (!nuevo || typeof nuevo !== "object") return nuevo;
  if (nivel === "lider") return conservarPermisos(renombrarCambiados(nuevo, actual), actual);
  const yo = nombresDe(usuario, actual), esMio = r => r && yo.has(r.miembro);
  const colab = nivel !== "editor";   // colaborador (y cualquier nivel desconocido) tiene las reglas más estrictas

  // Una lista que no vino no se borra: queda como está guardada
  [...LISTAS, "etiquetas"].forEach(k => { if (!Array.isArray(nuevo[k]) && Array.isArray(actual[k])) nuevo[k] = actual[k]; });
  // Solo el Líder quita etiquetas de la lista
  if (Array.isArray(actual.etiquetas)) nuevo.etiquetas = [...new Set([...nuevo.etiquetas, ...actual.etiquetas])];

  // Equipo: solo se cambia el propio perfil, nunca nombre, nivel, correo de acceso, categorías ni secciones; no se agrega ni se quita a nadie
  if (Array.isArray(nuevo.equipo)) {
    const prev = porId(actual.equipo);
    const FIJOS = ["id", "nombre", "email", "nivel", "cats", "secciones", "ingreso"];
    nuevo.equipo = [
      ...nuevo.equipo.filter(p => prev.has(p.id)).map(p => {
        const a = prev.get(p.id);
        if (p.id !== usuario.id) return a;
        const out = { ...p };
        FIJOS.forEach(k => { if (a[k] === undefined) delete out[k]; else out[k] = a[k]; });
        return out;
      }),
      ...[...prev.values()].filter(p => !nuevo.equipo.some(q => q.id === p.id)),
    ];
  }

  // Tareas: una tarea publicada no vuelve a borrador (vuelve la guardada); el Editor solo quita borradores
  // (descartar, no cubrir, unir pedido); el Colaborador no quita ninguna
  if (Array.isArray(nuevo.tareas)) {
    const prev = porId(actual.tareas);
    nuevo.tareas = nuevo.tareas.map(t => { const a = prev.get(t.id); return a && !a.borrador && t.borrador ? a : t; });
    nuevo.tareas = reponer(nuevo.tareas, actual.tareas, t => !colab && t.borrador);
  }

  // Horas extra y compensatorio
  if (Array.isArray(nuevo.horasExtra)) {
    const prev = porId(actual.horasExtra);
    if (colab) nuevo.horasExtra = nuevo.horasExtra.map(r => {
      const a = prev.get(r.id);
      if (!a) return revisado(r) ? { ...r, aprobacion: "Pendiente", aprobadoPor: undefined, fechaAprob: undefined } : r;
      if (!esMio(a) || a.aprobacion !== "Pendiente") return a;   // lo ajeno y lo ya revisado no se toca
      return revisado(r) ? { ...r, aprobacion: a.aprobacion, aprobadoPor: a.aprobadoPor, fechaAprob: a.fechaAprob } : r;
    });
    // Solo el Líder elimina registros revisados o de otra persona; cada quien retira lo suyo pendiente
    nuevo.horasExtra = reponer(nuevo.horasExtra, actual.horasExtra, r => esMio(r) && r.aprobacion === "Pendiente");
  }

  // Permisos: nunca se borran (se anulan). El Colaborador solo cambia los suyos pendientes y no los aprueba.
  if (colab && Array.isArray(nuevo.permisos)) {
    const prev = porId(actual.permisos);
    nuevo.permisos = nuevo.permisos.map(r => {
      const a = prev.get(r.id);
      if (!a) return revisado(r) ? { ...r, aprobacion: "Pendiente", aprobadoPor: undefined, fechaAprob: undefined } : r;
      if (!esMio(a) || a.aprobacion !== "Pendiente") return a;
      return revisado(r) ? { ...r, aprobacion: a.aprobacion, aprobadoPor: a.aprobadoPor, fechaAprob: a.fechaAprob } : r;
    });
  }

  // Publicaciones: el Colaborador no aprueba y solo quita las que él creó y aún no están aprobadas
  if (colab && Array.isArray(nuevo.publicaciones)) {
    const prev = porId(actual.publicaciones);
    const APROB = ["aprobado", "publicado"];
    nuevo.publicaciones = nuevo.publicaciones.map(p => {
      const a = prev.get(p.id);
      if (!a) return APROB.includes(p.estado) ? { ...p, estado: "aprobacion" } : p;
      if (APROB.includes(p.estado) && !APROB.includes(a.estado)) return { ...p, estado: a.estado };
      return p;
    });
    nuevo.publicaciones = reponer(nuevo.publicaciones, actual.publicaciones, p => yo.has(p.creadoPor) && !APROB.includes(p.estado));
  }

  // Pedidos de oficinas e histórico de reportes: solo el Líder los quita
  ["pedidos", "historico"].forEach(k => { if (Array.isArray(nuevo[k])) nuevo[k] = reponer(nuevo[k], actual[k], () => false); });

  // Directorio de medios y notas de prensa: solo Líder y Editor los quitan. Tareas recurrentes: también quien la creó.
  // Informe semanal: solo lo escriben Líder y Editor.
  if (colab) {
    const quita = { medios: () => false, notasPrensa: () => false, asigVarias: a => a.creadoPorId === usuario.id };
    for (const k in quita) if (Array.isArray(nuevo[k])) nuevo[k] = reponer(nuevo[k], actual[k], quita[k]);
    if (actual.informesSem === undefined) delete nuevo.informesSem; else nuevo.informesSem = actual.informesSem;
  }

  // Asignación automática por área: solo la cambia el Líder
  if (actual.asigAuto === undefined) delete nuevo.asigAuto; else nuevo.asigAuto = actual.asigAuto;

  // Bitácora: solo se agregan entradas; las que ya estaban no se cambian ni se borran
  if (Array.isArray(nuevo.bitacora)) {
    const prev = porId(actual.bitacora);
    const nuevas = nuevo.bitacora.filter(b => !prev.has(b.id));
    nuevo.bitacora = [...nuevas, ...(actual.bitacora || [])].slice(0, BITACORA_MAX);
  }

  return conservarPermisos(nuevo, actual);
}

// Si el Líder cambió el nombre de alguien, el nombre nuevo pasa a todos los registros que guardan el viejo
function renombrarCambiados(nuevo, actual) {
  const prev = porId(actual && actual.equipo);
  const cambios = (Array.isArray(nuevo.equipo) ? nuevo.equipo : []).filter(p => p && prev.has(p.id) && prev.get(p.id).nombre !== p.nombre)
    .map(p => ({ id: p.id, viejo: prev.get(p.id).nombre, nuevo: p.nombre }));
  return renombrar(nuevo, cambios);
}

// Nombres nuevos o cambiados: sin < > " ', de 80 caracteres o menos y sin repetir el de otra persona. Devuelve el error o null.
function validarNombres(nuevo, actual) {
  const prev = porId(actual && actual.equipo), equipo = nuevo && Array.isArray(nuevo.equipo) ? nuevo.equipo : [];
  for (const p of equipo) {
    if (prev.has(p.id) && prev.get(p.id).nombre === p.nombre) continue;
    const error = errorNombre(p.nombre, equipo, p.id);
    if (error) return error;
  }
  return null;
}

// Las solicitudes de permiso no se borran: si un guardado omite alguna que ya existe, se conserva.
function conservarPermisos(nuevo, actual) {
  if (!nuevo || typeof nuevo !== "object") return nuevo;
  const previos = Array.isArray(actual && actual.permisos) ? actual.permisos : [];
  if (!previos.length) return nuevo;
  nuevo.permisos = reponer(Array.isArray(nuevo.permisos) ? nuevo.permisos : [], previos, () => false);
  return nuevo;
}

// Lo que recibe cada nivel. Líder y Editor, todo. Colaborador y Lector no reciben bitácora, reportes archivados ni el
// informe semanal; del resto del equipo, solo nombre, cargo, nivel, foto y áreas; de horas y compensatorio ajenos, solo
// quién sale por compensatorio y en qué fechas; ni los avisos de horas, compensatorio o permisos de otra persona.
// El Colaborador recibe completos sus horas, permisos y avisos; el Lector, ninguno.
const FICHA_VISIBLE = ["id", "nombre", "cargo", "nivel", "foto", "cats", "secciones", "seccion"];
const COMP_VISIBLE = ["id", "miembro", "tipo", "aprobacion", "horas", "fecha", "fechaFin", "regreso"];
const veTodo = u => ["lider", "editor"].includes(u && u.nivel);
const tomar = (o, ks) => ks.reduce((r, k) => { if (o[k] !== undefined) r[k] = o[k]; return r; }, {});
const esSistema = p => p.sistema === true || (p.sistema === undefined && /^ia@/i.test(p.email || ""));
const fueraPorComp = h => h.tipo === "compensatorio" && h.aprobacion === "Aprobado" && parseFloat(h.horas || 0) >= 8 - 1e-9;
// Avisos sobre horas, compensatorio o permisos de alguien: llevan «miembro»; los de antes se reconocen por el texto
const AVISO_PERSONAL = /^(Solicitud de (horas|compensatorio|permiso)|Nueva solicitud de permiso|(Horas|Compensatorio|Permiso) (aprobado|rechazado|anulado))\b|horas extra por aprobar/;
const avisoPersonal = n => !!n.miembro || AVISO_PERSONAL.test(String(n.txt || ""));
const RECORTE = {
  equipo: p => ({ ...tomar(p, FICHA_VISIBLE), sistema: esSistema(p) }),
  horasExtra: h => fueraPorComp(h) ? tomar(h, COMP_VISIBLE) : null,
};
// Por lista: ¿este registro le llega completo?
function completoPara(usuario, data) {
  const yo = nombresDe(usuario, data), mio = r => usuario.nivel === "colaborador" && yo.has(r.miembro), nada = () => false;
  return { equipo: p => p.id === usuario.id, horasExtra: mio, permisos: mio, bitacora: nada, historico: nada, informesSem: nada,
    notifs: n => !avisoPersonal(n) || mio(n) };
}
function versionNivel(data, usuario) {
  if (veTodo(usuario) || !data || typeof data !== "object") return data;
  const completo = completoPara(usuario, data), out = { ...data };
  for (const k in completo) if (Array.isArray(data[k]))
    out[k] = data[k].map(x => !x || completo[k](x) ? x : RECORTE[k] ? RECORTE[k](x) : null).filter(Boolean);
  return out;
}
// Al guardar, lo que ese nivel no recibió completo vuelve tal como está guardado y en su lugar, para que su guardado no lo borre.
// Un registro repetido en lo que manda la página cuenta una sola vez (si no, se duplicarían horas y permisos).
function reponerOculto(nuevo, actual, usuario) {
  if (veTodo(usuario) || !nuevo || typeof nuevo !== "object" || !actual) return nuevo;
  const completo = completoPara(usuario, actual), out = { ...nuevo };
  LISTAS.forEach(k => { if (Array.isArray(out[k])) out[k] = sinRepetidos(out[k]); });
  for (const k in completo) if (Array.isArray(actual[k]))
    out[k] = Array.isArray(out[k]) ? juntarOcultos(out[k], actual[k], x => !completo[k](x)) : actual[k];
  return out;
}
const sinRepetidos = l => { const vistos = new Set(); return l.filter(x => !x || !x.id || (!vistos.has(x.id) && vistos.add(x.id))); };
// Cada registro oculto que no vino se inserta (una sola vez) antes del registro que lo seguía; si vino recortado, se cambia por el guardado
function juntarOcultos(enviada, previa, oculto) {
  const prev = sinRepetidos(previa.filter(x => x && x.id)), ocultos = porId(prev.filter(oculto));
  if (!ocultos.size) return enviada;
  const ids = new Set(enviada.map(x => x && x.id)), antes = new Map();
  for (let i = prev.length - 1, sig = null; i >= 0; i--) {
    const x = prev[i];
    if (ids.has(x.id)) sig = x.id;
    else if (ocultos.has(x.id)) antes.set(sig, [x, ...(antes.get(sig) || [])]);
  }
  const out = [];
  enviada.forEach(x => { if (x && antes.has(x.id)) out.push(...antes.get(x.id)); out.push(x && ocultos.has(x.id) ? ocultos.get(x.id) : x); });
  return [...out, ...(antes.get(null) || [])];
}

// Límite de intentos por clave (conexión, cuenta…): n intentos en una ventana de ms
function limitador(n, ms) {
  const m = new Map();
  const vigentes = k => (m.get(k) || []).filter(t => Date.now() - t < ms);
  return {
    lleno: k => vigentes(k).length >= n,
    sumar: k => { const v = vigentes(k); v.push(Date.now()); m.set(k, v); if (m.size > 5000) m.delete(m.keys().next().value); },
    limpiar: k => m.delete(k),
  };
}

module.exports = { LISTAS, NIVELES, validarDatos, validarNombres, aplicarReglasRol, conservarPermisos, versionNivel, reponerOculto, veTodo, limitador, igual };
