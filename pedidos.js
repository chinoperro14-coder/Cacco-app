// Formulario de pedidos de otras áreas (página pública /pedido).
// Convierte un pedido en un borrador de tarea. Lo usa el servidor (app.js) y también la página de prueba,
// por eso no depende de Node ni del navegador.
(function (raiz) {
  // Este archivo es la única fuente de las oficinas, servicios, preguntas y largos del formulario:
  // lo usan el servidor, la página /pedido y el tablero (se publica en /pedidos.js).

  // Comunicaciones no aparece: es el equipo que recibe los pedidos. «clave»: inicio de la clave de acceso de cada oficina.
  const AREAS = ["Administración", "Dirección", "Desarrollo Social", "Coordinación de Arte y Cultura", "Educación Artística y Cultural", "Otra"];
  const PREFIJO_CLAVE = { "Administración": "adm", "Dirección": "dir", "Desarrollo Social": "dsoc", "Coordinación de Arte y Cultura": "arte",
    "Educación Artística y Cultural": "educ", "Otra": "otra" };
  // lbl: en el formulario y la nota · corto: en el tablero · secs: secciones de la tarea que se abren
  const SERVICIOS = {
    cobertura: { ico: "📸", lbl: "Cobertura de fotos y video", corto: "Fotos y video", secs: ["Audiovisual"] },
    diseno:    { ico: "🎨", lbl: "Diseño de una pieza (afiche, arte, invitación)", corto: "Diseño", secs: ["Diseño"] },
    prensa:    { ico: "📰", lbl: "Prensa, radio o TV", corto: "Prensa", secs: ["Medios"] },
    protocolo: { ico: "🎤", lbl: "Protocolo (maestro de ceremonia, logística)", corto: "Protocolo", secs: ["Protocolo"] },
  };
  // «difusion» ya no se pide por el formulario (depende de la situación con las redes); queda para pedidos viejos
  const SERVICIOS_VIEJOS = { difusion: { ico: "📱", lbl: "Difusión en redes", corto: "Redes", secs: [] } };

  // Preguntas que salen al marcar cada servicio.
  // c: clave · nota: cómo aparece en la nota de la tarea · max: largo máximo (el formulario no deja escribir más)
  // tipo: text, area (varias líneas), time, uno (elegir una opción), varios (marcar varias), entrega (fecha del diseño)
  const PREGUNTAS = {
    cobertura: [
      { c: "llegada", nota: "Llegada del equipo", max: 5, pregunta: "¿A qué hora debe llegar el equipo?", tipo: "time" },
      { c: "momentos", nota: "Momentos clave", max: 300, pregunta: "Momentos clave que no se pueden perder", tipo: "text", ayuda: "ej. palabras de la directora, entrega de certificados" },
      { c: "invitados", nota: "Invitados importantes", max: 300, pregunta: "Invitados importantes", tipo: "text", ayuda: "ej. ministra, alcalde, embajador" },
    ],
    diseno: [
      { c: "nombre", nota: "Nombre de la pieza", max: 120, pregunta: "Nombre de la pieza", tipo: "text", ayuda: "ej. Afiche Gala de Danza" },
      { c: "tipo", nota: "Tipo", max: 60, pregunta: "Tipo de pieza", tipo: "uno",
        opciones: ["Afiche", "Invitación", "Post para redes", "Historia", "Banner o lona", "Certificado", "Video corto", "Otro"] },
      { c: "formato", nota: "Formatos", max: 300, pregunta: "Formatos (marca los que necesites)", tipo: "varios",
        opciones: ["Redes cuadrado (1080×1080)", "Redes vertical (1080×1350)", "Historia o reel (1080×1920)", "Impreso tamaño carta", "Impreso 11×17", "Pantalla horizontal (16:9)", "Otro (explícalo en Textos)"] },
      { c: "entrega", pregunta: "¿Para cuándo necesitas el diseño?", tipo: "entrega" },
      { c: "textos", nota: "Textos", max: 1000, pregunta: "Textos que deben aparecer", tipo: "area", ayuda: "Título, fecha, hora, lugar, organizadores…" },
    ],
    prensa: [
      { c: "vocero", nota: "Vocero", max: 120, pregunta: "Vocero o persona a entrevistar", tipo: "text", ayuda: "Nombre y cargo" },
      { c: "voceroContacto", nota: "Contacto del vocero", max: 120, pregunta: "Contacto del vocero", tipo: "text", ayuda: "Teléfono o correo" },
    ],
    protocolo: [
      { c: "programa", nota: "Programa", max: 1000, pregunta: "Programa o guion de la actividad", tipo: "area", ayuda: "Orden del acto, quién habla y cuándo" },
      { c: "invitados", nota: "Invitados a mencionar", max: 300, pregunta: "Invitados especiales a mencionar", tipo: "text", ayuda: "Nombres y cargos" },
    ],
  };
  // Largo máximo de cada campo del formulario (por el id del campo en /pedido)
  const LARGOS = { areaOtra: 60, nombre: 80, contacto: 120, actividad: 140, lugar: 120, descripcion: 1500, material: 300,
    pfNombre: 80, pfCargo: 80, pfTel: 40, pfCorreo: 120, corrT: 800, corrN: 80, clave: 40, cClave: 40 };
  const infoServicio = k => SERVICIOS[k] || SERVICIOS_VIEJOS[k] || { ico: "•", lbl: k, corto: k, secs: [] };

  // Horario laboral: lunes a viernes de 8:00 a 16:00. Lo de fuera se cubre con horas extra (tiempo compensatorio).
  const INI_LAB = 8 * 60, FIN_LAB = 16 * 60, DURACION_SUP = 120;
  const minutos = h => { const [a, m] = String(h).split(":").map(Number); return a * 60 + m; };
  const finDeSemana = f => [0, 6].includes(new Date(f + "T12:00:00Z").getUTCDay());
  // Rango en minutos de una actividad; sin hora de fin se suponen 2 horas (y si termina «antes» de empezar, cruza la medianoche)
  function rango(hora, horaFin) {
    if (!esHora(hora)) return null;
    const i = minutos(hora); let f = esHora(horaFin) ? minutos(horaFin) : i + DURACION_SUP;
    if (f <= i) f += 24 * 60;
    return [i, f];
  }
  // ¿Cae fuera del horario laboral? Devuelve null o el motivo
  function fueraDeHorario(fecha, hora, horaFin) {
    if (!esFecha(fecha)) return null;
    if (finDeSemana(fecha)) return "fin de semana";
    const r = rango(hora, horaFin); if (!r) return null;
    if (r[0] < INI_LAB) return "antes de las 8:00 a. m.";
    if (r[1] > FIN_LAB) return "después de las 4:00 p. m.";
    return null;
  }
  // Actividades del equipo que chocan con ese horario, solo dentro del horario laboral de un día de semana.
  // No cuenta los borradores marcados «No cubrir». Devuelve rangos [ini, fin] en «HH:MM» (nunca títulos).
  function choquesHorario(tareas, fecha, hora, horaFin) {
    if (!esFecha(fecha) || finDeSemana(fecha)) return [];
    const r = rango(hora, horaFin); if (!r) return [];
    const a = Math.max(r[0], INI_LAB), b = Math.min(r[1], FIN_LAB);
    if (a >= b) return [];
    const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    return (tareas || []).filter(t => t && t.fecha === fecha && !(t.borrador && /No cubrir/i.test(t.notas || "")))
      .map(t => rango(t.hora, t.horaFin)).filter(x => x && x[0] < b && x[1] > a)
      .sort((x, y) => x[0] - y[0]).map(x => [hhmm(x[0]), hhmm(x[1])]);
  }

  // Lo que llega del formulario público se muestra luego dentro del dashboard: se quitan los caracteres
  // que permitirían inyectar HTML o cortar atributos, y se limita el largo de cada campo.
  function limpiar(v, max, multilinea) {
    let s = String(v == null ? "" : v)
      .replace(/\r\n?/g, "\n")
      .replace(multilinea ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ")
      .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "’")
      .replace(/\s*&\s*/g, " y ").replace(/\\/g, "/");
    s = multilinea ? s.split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
                   : s.replace(/\s+/g, " ").trim();
    return s.slice(0, max);
  }
  // Enlace al material (Drive, Dropbox…): se guarda tal cual solo si es un http(s) sin caracteres peligrosos
  const limpiarUrl = v => { const u = String(v == null ? "" : v).trim(); return /^https?:\/\/[^\s<>"'`\\]{3,300}$/i.test(u) ? u : null; };
  const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + "T12:00:00Z"));
  const esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const fechaLarga = f => {
    const M = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [a, m, d] = f.split("-").map(Number); return `${d} de ${M[m - 1]} de ${a}`;
  };

  // body: lo que envió el formulario. ctx: {hoy:'AAAA-MM-DD', id:()=>string, folio:'P-0001'}
  // Devuelve {error} o {tarea, registro}
  function pedidoATarea(body, ctx) {
    const b = body && typeof body === "object" ? body : {};
    if (b.web) return { error: "No se pudo enviar el pedido." };              // campo trampa para robots
    const area = AREAS.includes(b.area) ? b.area : null;
    const L = LARGOS;
    const areaOtra = limpiar(b.areaOtra, L.areaOtra);
    const nombre = limpiar(b.nombre, L.nombre), contacto = limpiar(b.contacto, L.contacto);
    const titulo = limpiar(b.actividad, L.actividad), lugar = limpiar(b.lugar, L.lugar);
    const descripcion = limpiar(b.descripcion, L.descripcion, true);
    const servicios = (Array.isArray(b.servicios) ? b.servicios : []).filter(k => SERVICIOS[k]);
    const fecha = String(b.fecha || ""), hora = String(b.hora || ""), horaFin = String(b.horaFin || "");
    const entrega = String(b.entrega || "");
    const materialTxt = String(b.material || "").trim(), material = materialTxt ? limpiarUrl(materialTxt) : "";
    if (!area) return { error: "Elige la oficina que hace el pedido." };
    if (area === "Otra" && !areaOtra) return { error: "Escribe el nombre de tu oficina." };
    if (!nombre) return { error: "Escribe tu nombre." };
    if (!contacto) return { error: "Escribe un teléfono o correo para contactarte." };
    if (!titulo) return { error: "Escribe el nombre de la actividad." };
    if (!servicios.length) return { error: "Marca al menos una cosa que necesitas." };
    if (!esFecha(fecha)) return { error: "Elige la fecha de la actividad." };
    if (fecha < ctx.hoy) return { error: "La fecha de la actividad ya pasó." };
    if (hora && !esHora(hora)) return { error: "La hora de inicio no es válida." };
    if (horaFin && !esHora(horaFin)) return { error: "La hora de fin no es válida." };
    if (entrega && (!esFecha(entrega) || entrega < ctx.hoy)) return { error: "La fecha de entrega del diseño no es válida." };
    if (material === null) return { error: "El enlace al material no es válido: cópialo completo, empezando por https://" };
    const pf = b.puntoFocal && typeof b.puntoFocal === "object" ? b.puntoFocal : {};
    const focal = { nombre: limpiar(pf.nombre, L.pfNombre), cargo: limpiar(pf.cargo, L.pfCargo), telefono: limpiar(pf.telefono, L.pfTel), correo: limpiar(pf.correo, L.pfCorreo) };
    if (!focal.nombre) return { error: "Escribe el nombre del punto focal de la actividad." };
    if (!focal.telefono) return { error: "Escribe el teléfono del punto focal." };
    // Respuestas de cada servicio marcado
    const det = b.detalles && typeof b.detalles === "object" ? b.detalles : {};
    const detalles = {};
    servicios.forEach(k => {
      const r = {};
      (PREGUNTAS[k] || []).filter(q => q.max).forEach(q => { const v = limpiar(det[k] && det[k][q.c], q.max, q.tipo === "area"); if (v) r[q.c] = v; });
      if (r.llegada && !esHora(r.llegada)) delete r.llegada;
      if (Object.keys(r).length) detalles[k] = r;
    });
    // El horario solo importa cuando el equipo tiene que estar en la actividad (cobertura); un diseño no depende de él
    const fuera = servicios.includes("cobertura") ? fueraDeHorario(fecha, hora, horaFin) : null;

    const nomArea = area === "Otra" ? areaOtra : area;
    const secciones = {};
    servicios.forEach(k => SERVICIOS[k].secs.forEach(s => {
      secciones[s] = { responsables: [], estado: "Pendiente", completadoPor: null, completadoEn: null, fecha: null, hora: null };
    }));
    if (secciones["Diseño"] && entrega) secciones["Diseño"].fecha = entrega;
    const bloques = servicios.filter(k => detalles[k]).map(k =>
      `${SERVICIOS[k].ico} ${SERVICIOS[k].lbl}:\n` + PREGUNTAS[k].filter(q => detalles[k][q.c]).map(q => `   • ${q.nota}: ${detalles[k][q.c].replace(/\n/g, "\n     ")}`).join("\n"));
    const notas = [
      `📨 Pedido ${ctx.folio} de ${nomArea}, recibido el ${fechaLarga(ctx.hoy)} por el formulario de pedidos.`,
      `👤 Lo pide: ${nombre} · ${contacto}`,
      `📍 Punto focal: ${focal.nombre}${focal.cargo ? ` (${focal.cargo})` : ""} · ${focal.telefono}${focal.correo ? ` · ${focal.correo}` : ""}`,
      `🧰 Necesita: ${servicios.map(k => SERVICIOS[k].lbl).join("; ")}.`,
      fuera ? `🌙 Fuera del horario laboral (${fuera}): se cubre con horas extra (tiempo compensatorio).` : "",
      entrega ? `🎨 Diseño para el ${fechaLarga(entrega)}.` : "",
      material ? `🔗 Material: ${material}` : "",
      bloques.length ? `\n${bloques.join("\n")}` : "",
      descripcion ? `\n${descripcion}` : "",
    ].filter(Boolean).join("\n");
    const pedido = { folio: ctx.folio, area: nomArea, solicitante: nombre, contacto, servicios, recibido: ctx.hoy, puntoFocal: focal,
      ...(Object.keys(detalles).length ? { detalles } : {}), ...(fuera ? { fueraHorario: fuera } : {}),
      ...(material ? { material } : {}), ...(entrega ? { entrega } : {}) };
    const tarea = {
      id: ctx.id(), titulo, borrador: true, etiquetas: [], prioridad: "Media", fecha, hora, horaFin, lugar, notas,
      recurrencia: "ninguna", secciones, entregables: [], creadaEn: ctx.hoy, creadaPor: "Formulario de pedidos", creadoPorId: "pedidos", pedido,
    };
    // El registro de pedidos no se borra al descartar el borrador: sirve para medir cuánto pide cada área
    // Guarda el pedido tal como llegó, para el historial aunque la tarea se edite, se una a otra o se descarte
    const registro = { id: tarea.id, tareaId: tarea.id, folio: ctx.folio, area: nomArea, claveDe: area, titulo, fecha, servicios, recibido: ctx.hoy, solicitante: nombre,
      contacto, puntoFocal: focal, ...(hora ? { hora } : {}), ...(horaFin ? { horaFin } : {}), ...(lugar ? { lugar } : {}), nota: notas };
    return { tarea, registro, notaPedido: notas };
  }

  // ── Duplicados: la misma actividad puede venir ya del Calendario CACCO Logístico o de otro pedido ──
  const VACIAS = new Set("para por con del las los una uno unos unas que como entre sobre desde hasta este esta estos estas cacco evento actividad".split(" "));
  const palabras = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(w => w.length >= 4 && !VACIAS.has(w));
  function parecidos(a, b) {
    const A = new Set(palabras(a)), B = new Set(palabras(b));
    if (!A.size || !B.size) return false;
    let comunes = 0; A.forEach(w => { if (B.has(w)) comunes++; });
    // Conservador: la mitad o más de todas las palabras en común (con «Imposición de cinta …» no basta)
    return comunes >= Math.min(2, A.size, B.size) && comunes / (A.size + B.size - comunes) >= 0.5;
  }
  // Devuelve la tarea existente del mismo día con nombre parecido (o null)
  function buscarDuplicado(tareas, nueva) {
    return (tareas || []).find(t => t && t.id !== nueva.id && t.fecha === nueva.fecha && parecidos(t.titulo, nueva.titulo)) || null;
  }
  // Ya no se une solo: el servidor solo avisa del parecido y una persona decide desde la bandeja

  // ── Estado que ve la oficina al consultar su folio ──
  const ESTADO_SEC = { Completada: "Lista", "En Progreso": "En curso", "No cumplida": "No se pudo", Cerrada: "Cerrada", Pendiente: "Por hacer" };
  // Corrección que pide la oficina si se equivocó al llenar el formulario: {campos, texto, nombre}
  const CAMPOS_CORR = ["Fecha", "Hora", "Lugar", "Nombre de la actividad", "Punto focal", "Lo que se necesita", "Otro"];
  function nuevaCorreccion(body, ctx) {
    const b = body && typeof body === "object" ? body : {};
    const campos = (Array.isArray(b.campos) ? b.campos : []).filter(c => CAMPOS_CORR.includes(c));
    const texto = limpiar(b.texto, LARGOS.corrT, true), nombre = limpiar(b.nombre, LARGOS.corrN);
    if (!campos.length) return { error: "Marca qué hay que corregir." };
    if (!texto) return { error: "Escribe cuál es el dato correcto." };
    if (!nombre) return { error: "Escribe tu nombre." };
    return { correccion: { id: ctx.id(), en: ctx.hoy, hora: ctx.hora, campos, texto, nombre, estado: "Pendiente" } };
  }
  function estadoPedido(reg, tareas, equipo) {
    const base = { folio: reg.folio, actividad: reg.titulo, fecha: reg.fecha, oficina: reg.area, recibido: reg.recibido,
      correcciones: (reg.correcciones || []).map(c => ({ en: c.en, campos: c.campos, texto: c.texto, estado: c.estado })) };
    if (reg.rechazo) return { ...base, estado: "No se puede cubrir", motivo: reg.rechazo.motivo || "" };
    const t = (tareas || []).find(x => x && x.id === (reg.tareaId || reg.id));
    if (!t) return { ...base, estado: "No se puede cubrir", motivo: "" };
    if (t.cancelada) return { ...base, estado: "Cancelada", motivo: t.cancelada.motivo || "" };
    if (t.borrador) return { ...base, estado: "En revisión" };
    const nom = id => ((equipo || []).find(p => p && p.id === id) || {}).nombre;
    const secs = [...new Set((reg.servicios || []).flatMap(k => infoServicio(k).secs))];
    const detalle = secs.filter(s => t.secciones && t.secciones[s]).map(s => {
      const sv = t.secciones[s];
      return { seccion: s, estado: ESTADO_SEC[sv.estado] || sv.estado || "Por hacer", responsables: (sv.responsables || []).map(nom).filter(Boolean) };
    });
    const listo = detalle.length && detalle.every(d => ["Lista", "Cerrada", "No se pudo"].includes(d.estado));
    return { ...base, estado: listo ? "Atendido" : "Aceptado", detalle };
  }
  // Acepta «P-0003», «p3» o «3»
  const normFolio = f => { const n = String(f || "").match(/\d+/); return n ? "P-" + String(parseInt(n[0], 10)).padStart(4, "0") : ""; };
  const siguienteFolio = registros => "P-" + String((registros || []).length + 1).padStart(4, "0");

  const api = { AREAS, PREFIJO_CLAVE, SERVICIOS, PREGUNTAS, LARGOS, infoServicio, fueraDeHorario, choquesHorario, limpiar, pedidoATarea, siguienteFolio, buscarDuplicado, estadoPedido, normFolio, CAMPOS_CORR, nuevaCorreccion };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.CaccoPedidos = api;
})(this);
