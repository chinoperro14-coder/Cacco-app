// Reglas que el servidor hace cumplir en cada guardado, aunque alguien salte la interfaz.
// La página manda todos los datos de una vez; aquí se compara con lo guardado y se deshace lo que ese nivel no puede hacer.
// El Líder no tiene restricciones (salvo que las solicitudes de permiso nunca se borran).

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
  const ids = new Set(nueva.map(x => x && x.id));
  const faltan = (previa || []).filter(x => x && x.id && !ids.has(x.id) && !puedeBorrar(x));
  return faltan.length ? [...nueva, ...faltan] : nueva;
}

// Nombres con los que aparece la persona en horas y permisos (puede haber cambiado su nombre en Mi perfil)
function nombresDe(usuario, actual, nuevo) {
  const n = new Set();
  [actual, nuevo].forEach(d => (d && Array.isArray(d.equipo) ? d.equipo : []).forEach(p => { if (p && p.id === usuario.id && p.nombre) n.add(p.nombre); }));
  return n;
}

// nuevo: lo que manda la página; actual: lo guardado; usuario: {id, nivel}. Devuelve los datos ya corregidos.
function aplicarReglasRol(nuevo, actual, usuario) {
  actual = actual || {};
  const nivel = usuario && usuario.nivel;
  if (!nuevo || typeof nuevo !== "object") return nuevo;
  if (nivel === "lider") return conservarPermisos(nuevo, actual);
  const yo = nombresDe(usuario, actual, nuevo), esMio = r => r && yo.has(r.miembro);
  const colab = nivel !== "editor";   // colaborador (y cualquier nivel desconocido) tiene las reglas más estrictas

  // Equipo: solo se cambia el propio perfil, nunca nivel, correo de acceso, categorías ni secciones; no se agrega ni se quita a nadie
  if (Array.isArray(nuevo.equipo)) {
    const prev = porId(actual.equipo);
    const FIJOS = ["id", "email", "nivel", "cats", "secciones", "ingreso"];
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

  // Tareas: el Editor solo quita borradores (descartar, no cubrir, unir pedido); el Colaborador no quita ninguna
  if (Array.isArray(nuevo.tareas))
    nuevo.tareas = reponer(nuevo.tareas, actual.tareas, t => !colab && t.borrador);

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

// Las solicitudes de permiso no se borran: si un guardado omite alguna que ya existe, se conserva.
function conservarPermisos(nuevo, actual) {
  if (!nuevo || typeof nuevo !== "object") return nuevo;
  const previos = Array.isArray(actual && actual.permisos) ? actual.permisos : [];
  if (!previos.length) return nuevo;
  nuevo.permisos = reponer(Array.isArray(nuevo.permisos) ? nuevo.permisos : [], previos, () => false);
  return nuevo;
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

module.exports = { LISTAS, NIVELES, validarDatos, aplicarReglasRol, conservarPermisos, limitador, igual };
